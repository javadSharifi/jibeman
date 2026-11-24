package ir.jibeman.core

import org.bouncycastle.crypto.digests.SHA256Digest
import org.bouncycastle.crypto.generators.PKCS5S2ParametersGenerator
import org.bouncycastle.crypto.params.KeyParameter
import org.bouncycastle.util.encoders.UrlBase64
import org.json.JSONObject
import java.security.SecureRandom
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

object BackupCipher {
    private const val FORMAT = "jibeman-encrypted-backup"
    private const val VERSION = 1
    private const val ITERATIONS = 600_000
    const val MIN_PASSWORD_LENGTH = 12
    private val context = "jibeman|backup|1".encodeToByteArray()
    private val random = SecureRandom()
    private val base64Url = Regex("[A-Za-z0-9_-]+")

    class BadPassword : Exception()

    fun isEncrypted(file: JSONObject) = file.optString("format") == FORMAT

    fun encrypt(text: String, password: String): String {
        require(password.codePointCount(0, password.length) >= MIN_PASSWORD_LENGTH)
        val salt = ByteArray(16).also(random::nextBytes)
        val iv = ByteArray(12).also(random::nextBytes)
        val encrypted = cipher(Cipher.ENCRYPT_MODE, password, salt, iv).doFinal(text.encodeToByteArray())
        return JSONObject()
            .put("format", FORMAT).put("version", VERSION).put("salt", encode(salt))
            .put("payload", "${encode(iv)}.${encode(encrypted)}").toString()
    }

    fun decrypt(text: String, password: String): String = decrypt(JSONObject(text), password)

    fun decrypt(file: JSONObject, password: String): String {
        require(isEncrypted(file) && file.getInt("version") == VERSION)
        val encodedSalt = file.getString("salt").also { require(it.length == 22) }
        val payload = file.getString("payload")
        val parts = payload.split('.', limit = 3)
        require(parts.size == 2 && parts[0].length == 16)
        val salt = decode(encodedSalt)
        val iv = decode(parts[0])
        val bytes = decode(parts[1])
        require(salt.size == 16 && iv.size == 12 && bytes.size >= 16)
        return try {
            cipher(Cipher.DECRYPT_MODE, password, salt, iv).doFinal(bytes).decodeToString(throwOnInvalidSequence = true)
        } catch (_: AEADBadTagException) {
            throw BadPassword()
        }
    }

    private fun cipher(mode: Int, password: String, salt: ByteArray, iv: ByteArray): Cipher {
        // Use the library KDF on every supported Android version, including API 24 and 25.
        val material = password.encodeToByteArray()
        val generator = PKCS5S2ParametersGenerator(SHA256Digest())
        val key = try {
            generator.init(material, salt, ITERATIONS)
            (generator.generateDerivedParameters(256) as KeyParameter).key
        } finally {
            material.fill(0)
        }
        return try {
            Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(mode, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
                updateAAD(context)
            }
        } finally {
            key.fill(0)
        }
    }

    private fun encode(bytes: ByteArray) = UrlBase64.encode(bytes).decodeToString().trimEnd('.')

    private fun decode(value: String): ByteArray {
        require(base64Url.matches(value))
        return UrlBase64.decode(value + ".".repeat((4 - value.length % 4) % 4))
    }
}
