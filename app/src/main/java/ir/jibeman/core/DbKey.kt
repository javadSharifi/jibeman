package ir.jibeman.core

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Random 32-byte SQLCipher passphrase, stored wrapped (AES-GCM) by a non-exportable Android Keystore key.
 * The DB file alone is useless off the device; moving data goes through the app's backup file.
 */
object DbKey {
    private const val ALIAS = "jibeman_db_key"
    private const val PREF = "dbk"

    fun get(ctx: Context): ByteArray {
        val sp = ctx.getSharedPreferences("sec", Context.MODE_PRIVATE)
        sp.getString(PREF, null)?.let { stored ->
            val raw = Base64.decode(stored, Base64.NO_WRAP)
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, raw, 0, 12))
            return c.doFinal(raw, 12, raw.size - 12)
        }
        val secret = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key())
        val out = c.iv + c.doFinal(secret)
        // commit (not apply): losing this write means losing the database
        check(sp.edit().putString(PREF, Base64.encodeToString(out, Base64.NO_WRAP)).commit()) { "could not store db key" }
        return secret
    }

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as SecretKey?)?.let { return it }
        val g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        g.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return g.generateKey()
    }
}
