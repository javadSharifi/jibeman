package ir.jibeman.core

/**
 * Bank detection, Luhn card validation, IBAN (Sheba) ISO 7064 checksum,
 * and formatting utilities based on the `iran-bankit` engine.
 */
object BankKit {

    /**
     * Converts Persian (۰-۹) and Arabic-Indic (٠-٩) numerals to ASCII digits.
     */
    fun normalizeDigits(str: String?): String {
        if (str.isNullOrEmpty()) return ""
        val sb = StringBuilder(str.length)
        for (ch in str) {
            when (ch) {
                in '۰'..'۹' -> sb.append((ch.code - 0x06F0).toChar() + '0'.code)
                in '٠'..'٩' -> sb.append((ch.code - 0x0660).toChar() + '0'.code)
                else -> sb.append(ch)
            }
        }
        return sb.toString()
    }

    /**
     * Extracts only ASCII digits from any string after normalizing Persian/Arabic digits.
     */
    fun cleanDigits(str: String?): String {
        return normalizeDigits(str).filter { it.isDigit() }
    }

    /**
     * Validates an Iranian 16-digit debit/credit card number using the Luhn algorithm.
     * Returns true only if it is exactly 16 digits and passes checksum.
     */
    fun validateCard(cardNumber: String?): Boolean {
        val digits = cleanDigits(cardNumber)
        if (digits.length != 16) return false
        var sum = 0
        for (i in 0 until 16) {
            var d = digits[i].digitToInt()
            if (i % 2 == 0) {
                d *= 2
                if (d > 9) d -= 9
            }
            sum += d
        }
        return sum % 10 == 0
    }

    /**
     * Validates an Iranian IBAN (Sheba) number using ISO 7064 mod-97 algorithm.
     * Accepts with or without "IR" prefix (24 or 26 chars).
     */
    fun validateIban(iban: String?): Boolean {
        var raw = normalizeDigits(iban).replace("\\s".toRegex(), "").uppercase()
        if (!raw.startsWith("IR")) raw = "IR$raw"
        if (raw.length != 26) return false

        // Check format: IR + 24 digits
        if (!raw.startsWith("IR") || !raw.substring(2).all { it.isDigit() }) return false

        // Move first 4 chars (IR + check digits) to end, then convert letters (I=18, R=27)
        val rearranged = raw.substring(4) + raw.substring(0, 4)
        val sb = StringBuilder()
        for (c in rearranged) {
            if (c in 'A'..'Z') {
                sb.append((c.code - 55).toString())
            } else if (c.isDigit()) {
                sb.append(c)
            } else {
                return false
            }
        }

        // Process in 9-digit blocks to avoid 64-bit integer overflow
        var remainder = sb.toString()
        while (remainder.length > 2) {
            val chunkLen = minOf(9, remainder.length)
            val block = remainder.substring(0, chunkLen)
            val num = block.toLongOrNull() ?: return false
            val mod = (num % 97).toString()
            remainder = mod + remainder.substring(chunkLen)
        }
        return (remainder.toLongOrNull() ?: 0L) % 97 == 1L
    }

    /**
     * Identifies a bank from a card number by matching prefixes.
     * Crucially matches longer prefixes (e.g. 8-digit Blu Bank "62198618") before shorter ones (Saman "621986").
     */
    fun detectByCard(cardNumber: String?): Bank? {
        val digits = cleanDigits(cardNumber)
        if (digits.length < 6) return null
        return Banks.findByCardPrefix(digits)
    }

    /**
     * Identifies a bank from an Iranian IBAN (Sheba) number.
     * Positions 4..6 after IR are the 3-digit bank code.
     */
    fun detectByIban(iban: String?): Bank? {
        var raw = normalizeDigits(iban).replace("\\s".toRegex(), "").uppercase()
        if (!raw.startsWith("IR")) raw = "IR$raw"
        if (raw.length < 7) return null
        val code = raw.substring(4, minOf(7, raw.length))
        return Banks.findByIbanCode(code)
    }

    /**
     * Formats a card number with spaces every 4 digits: `XXXX XXXX XXXX XXXX`.
     */
    fun formatCardNumber(value: String?): String {
        val digits = cleanDigits(value).take(16)
        if (digits.isEmpty()) return ""
        return digits.chunked(4).joinToString(" ")
    }

    /**
     * Formats an IBAN into standard grouped format: `IRXX XXXX XXXX XXXX XXXX XXXX XX`.
     */
    fun formatIban(value: String?): String {
        var raw = normalizeDigits(value).replace("\\s".toRegex(), "").uppercase()
        val hasIr = raw.startsWith("IR")
        val digits = cleanDigits(raw).take(24)
        if (digits.isEmpty()) return if (hasIr) "IR" else ""

        val parts = mutableListOf<String>()
        if (digits.length >= 2) parts.add(digits.substring(0, 2))
        else parts.add(digits)

        var idx = 2
        while (idx < digits.length) {
            val end = minOf(idx + 4, digits.length)
            parts.add(digits.substring(idx, end))
            idx = end
        }

        val formattedDigits = parts.joinToString(" ")
        return "IR $formattedDigits".trim()
    }

    /**
     * Formats expiration date as `MM / YY` (e.g. 05 / 08).
     */
    fun formatExpiry(value: String?): String {
        val digits = cleanDigits(value).take(4)
        return when {
            digits.length <= 2 -> digits
            else -> "${digits.substring(0, 2)} / ${digits.substring(2)}"
        }
    }

    /**
     * Validates card expiry month (01..12).
     */
    fun isExpiryValid(value: String?): Boolean {
        val digits = cleanDigits(value)
        if (digits.length < 2) return true
        val month = digits.take(2).toIntOrNull() ?: return false
        return month in 1..12
    }
}
