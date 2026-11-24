package ir.jibeman.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class BackupCipherTest {
    private val password = "عبارت عبور نمونه 2026"
    private val source = """{"cardNumber":"4000000000000069","cardCvv2":"8196"}"""

    @Test fun encryptedFileHidesCardDataAndUsesFreshRandomness() {
        val first = BackupCipher.encrypt(source, password)
        val second = BackupCipher.encrypt(source, password)
        assertFalse(first.contains("4000000000000069"))
        assertFalse(first.contains("cardCvv2"))
        assertNotEquals(first, second)
        assertEquals(source, BackupCipher.decrypt(first, password))
    }

    @Test fun wrongPasswordAndTamperingFailAuthentication() {
        val encrypted = BackupCipher.encrypt(source, password)
        assertThrows(BackupCipher.BadPassword::class.java) { BackupCipher.decrypt(encrypted, "wrong backup passphrase") }
        val envelope = org.json.JSONObject(encrypted)
        val payload = envelope.getString("payload")
        val index = payload.indexOf('.') + 1
        val replacement = if (payload[index] == 'A') 'B' else 'A'
        envelope.put("payload", payload.replaceRange(index, index + 1, replacement.toString()))
        assertThrows(BackupCipher.BadPassword::class.java) { BackupCipher.decrypt(envelope.toString(), password) }
    }
}
