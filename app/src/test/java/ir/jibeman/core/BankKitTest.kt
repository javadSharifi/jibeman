package ir.jibeman.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BankKitTest {

    @Test
    fun normalizeDigits_convertsPersianAndArabicNumerals() {
        assertEquals("0123456789", BankKit.normalizeDigits("۰۱۲۳۴۵۶۷۸۹"))
        assertEquals("0123456789", BankKit.normalizeDigits("٠١٢٣٤٥٦٧٨٩"))
        assertEquals("6104-3300-0000-0000", BankKit.normalizeDigits("۶۱۰۴-۳۳۰۰-۰۰۰۰-۰۰۰۰"))
    }

    @Test
    fun cleanDigits_removesNonDigits() {
        assertEquals("6104330000000000", BankKit.cleanDigits("۶۱۰۴-۳۳۰۰-۰۰۰۰-۰۰۰۰"))
        assertEquals("123456", BankKit.cleanDigits("IR 12 34 56"))
    }

    @Test
    fun detectByCard_matchesBluBeforeSaman() {
        // Blu Bank: 8-digit prefixes 62198618, 62198619
        val bluBank = BankKit.detectByCard("6219861800001234")
        assertNotNull(bluBank)
        assertEquals("blu", bluBank?.code)
        assertEquals("بلو", bluBank?.name)

        val bluBank2 = BankKit.detectByCard("6219861900005678")
        assertNotNull(bluBank2)
        assertEquals("blu", bluBank2?.code)

        // Saman Bank: 6-digit prefix 621986
        val samanBank = BankKit.detectByCard("6219860012345678")
        assertNotNull(samanBank)
        assertEquals("saman", samanBank?.code)
        assertEquals("سامان", samanBank?.name)
    }

    @Test
    fun detectByCard_majorIranianBanks() {
        // Mellat
        assertEquals("mellat", BankKit.detectByCard("6104331234567890")?.code)
        assertEquals("mellat", BankKit.detectByCard("۶۱۰۴-۳۳۰۰-۰۰۰۰-۰۰۰۰")?.code)

        // Keshavarzi
        assertEquals("keshavarzi", BankKit.detectByCard("6037701234567890")?.code)

        // Melli
        assertEquals("melli", BankKit.detectByCard("6037991234567890")?.code)

        // Saderat
        assertEquals("saderat", BankKit.detectByCard("6037691234567890")?.code)

        // Sepah
        assertEquals("sepah", BankKit.detectByCard("5892101234567890")?.code)

        // Tejarat
        assertEquals("tejarat", BankKit.detectByCard("5859831234567890")?.code)

        // Parsian
        assertEquals("parsian", BankKit.detectByCard("6221061234567890")?.code)

        // Pasargad
        assertEquals("pasargad", BankKit.detectByCard("5022291234567890")?.code)

        // Maskan
        assertEquals("maskan", BankKit.detectByCard("6280231234567890")?.code)

        // Refah
        assertEquals("refah", BankKit.detectByCard("5894631234567890")?.code)

        // Unknown
        assertNull(BankKit.detectByCard("1111222233334444"))
    }

    @Test
    fun validateCard_luhnAlgorithm() {
        // Known valid cards from test vectors
        assertTrue(BankKit.validateCard("6037990000000006"))
        assertFalse(BankKit.validateCard("6037990000000007"))

        // Persian numerals and separators
        assertTrue(BankKit.validateCard("۶۰۳۷۹۹۰۰۰۰۰۰۰۰۰۶"))
        assertTrue(BankKit.validateCard("6037-9900-0000-0006"))

        // Invalid length
        assertFalse(BankKit.validateCard("603799000000000"))
        assertFalse(BankKit.validateCard("60379900000000066"))
    }

    @Test
    fun detectByIban_matchesBankCodes() {
        // Melli: 017
        val melli = BankKit.detectByIban("IR240170000000000000000000")
        assertNotNull(melli)
        assertEquals("melli", melli?.code)

        // Dey: 066
        val dey = BankKit.detectByIban("IR240660000000000000000000")
        assertNotNull(dey)
        assertEquals("dey", dey?.code)

        // Without IR prefix
        val melliNoPrefix = BankKit.detectByIban("240170000000000000000000")
        assertNotNull(melliNoPrefix)
        assertEquals("melli", melliNoPrefix?.code)

        // Mellat: 012
        val mellat = BankKit.detectByIban("IR500120000000000000000000")
        assertNotNull(mellat)
        assertEquals("mellat", mellat?.code)
    }

    @Test
    fun validateIban_checksumMod97() {
        // Valid IBAN checksums
        assertTrue(BankKit.validateIban("IR820540102680020817909002"))
        assertTrue(BankKit.validateIban("820540102680020817909002")) // without IR

        // Invalid checksum
        assertFalse(BankKit.validateIban("IR820540102680020817909001"))
        assertFalse(BankKit.validateIban("IR820540102680020817909")) // wrong length
    }

    @Test
    fun formatCardNumber_groupsInFours() {
        assertEquals("6037 9900 0000 0006", BankKit.formatCardNumber("6037990000000006"))
        assertEquals("6037 9900", BankKit.formatCardNumber("60379900"))
        assertEquals("6104 3300", BankKit.formatCardNumber("۶۱۰۴۳۳۰۰"))
    }

    @Test
    fun formatIban_groupsStandardSheba() {
        val formatted = BankKit.formatIban("240170012345678901234567")
        assertEquals("IR 24 0170 0123 4567 8901 2345 67", formatted)
    }

    @Test
    fun formatExpiry_formatsMonthYear() {
        assertEquals("05 / 08", BankKit.formatExpiry("0508"))
        assertEquals("05", BankKit.formatExpiry("05"))
        assertTrue(BankKit.isExpiryValid("05 / 08"))
        assertTrue(BankKit.isExpiryValid("12 / 08"))
        assertFalse(BankKit.isExpiryValid("13 / 08"))
        assertFalse(BankKit.isExpiryValid("00 / 08"))
    }
}
