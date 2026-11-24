package ir.jibeman.core

import kotlin.math.abs
import kotlin.math.roundToLong

/** Amounts are stored as rial in a Long; the UI shows toman. Never use Float/Double for stored money. */
object Money {
    private const val FA = "۰۱۲۳۴۵۶۷۸۹"
    private const val AR = "٠١٢٣٤٥٦٧٨٩"
    private const val LRI = '⁦'
    private const val PDI = '⁩'
    const val HIDDEN = "••••••"

    fun fa(s: String) = buildString { s.forEach { append(if (it in '0'..'9') FA[it - '0'] else it) } }

    /** Persian/Arabic digits to ASCII; drops thousands separators. */
    fun ascii(s: String) = buildString {
        s.forEach { c ->
            val i = FA.indexOf(c).takeIf { it >= 0 } ?: AR.indexOf(c)
            when {
                i >= 0 -> append('0' + i)
                c == ',' || c == '٬' -> {}
                else -> append(c)
            }
        }
    }

    fun normalizeAmountInput(s: String, maxDigits: Int = 13, allowNegative: Boolean = false): String? {
        val raw = ascii(s).filterNot(Char::isWhitespace).replace('٫', '.').replace('−', '-')
        val unsigned = if (allowNegative) raw.removePrefix("-") else raw
        return raw.takeIf { AMOUNT_EDIT.matches(unsigned) && unsigned.substringBefore('.').length <= maxDigits }
    }

    fun formatAmountInput(raw: String): String {
        val whole = raw.substringBefore('.')
        val digits = whole.removePrefix("-")
        val grouped = digits.reversed().chunked(3).joinToString(",").reversed()
        return (if (whole.startsWith('-')) "-" else "") + grouped + raw.drop(whole.length)
    }

    /** Converts toman to integer rial, including one optional fractional digit. */
    fun parseToman(s: String, allowNegative: Boolean = false): Long? {
        val raw = normalizeAmountInput(s, allowNegative = allowNegative) ?: return null
        if (!COMPLETE_AMOUNT.matches(raw)) return null
        val magnitude = raw.removePrefix("-")
        val whole = magnitude.substringBefore('.').toLongOrNull() ?: 0
        val remainder = magnitude.substringAfter('.', "0").toLong()
        val rial = whole * 10 + remainder
        return if (raw.startsWith('-')) -rial else rial
    }

    /** Format stored integer rial as an editable amount in toman without rounding. */
    fun tomanInput(rial: Long): String {
        val whole = abs(rial / 10)
        val remainder = abs(rial % 10)
        return (if (rial < 0) "-" else "") + whole + (if (remainder == 0L) "" else ".$remainder")
    }

    fun amountWords(rial: Long): String {
        val whole = words(abs(rial / 10))
        val remainder = abs(rial % 10)
        return (if (rial < 0) "منفی " else "") + "$whole تومان" +
            (if (remainder == 0L) "" else " و ${words(remainder)} ریال")
    }

    private val AMOUNT_EDIT = Regex("""[0-9]*(?:\.[0-9]?)?""")
    private val COMPLETE_AMOUNT = Regex("""-?(?:[0-9]+|[0-9]*\.[0-9])""")

    fun group(n: Long): String {
        val s = abs(n).toString()
        val sb = StringBuilder()
        s.forEachIndexed { i, c ->
            if (i > 0 && (s.length - i) % 3 == 0) sb.append('٬')
            sb.append(c)
        }
        return fa(sb.toString())
    }

    /** rial -> "۱۸۵٬۰۰۰" toman, isolated LTR so the sign stays on the left inside RTL text. */
    fun toman(rial: Long, plus: Boolean = false): String {
        val sign = when {
            rial < 0 -> "−"
            plus && rial > 0 -> "+"
            else -> ""
        }
        val whole = group(rial / 10)
        val remainder = abs(rial % 10)
        val fraction = if (remainder == 0L) "" else "٫${fa(remainder.toString())}"
        return "$LRI$sign$whole$fraction$PDI"
    }

    /** rial -> "۳۲٫۵ میلیون" / "۸۵۰ هزار" (toman, rounded to one decimal). */
    fun short(rial: Long): String {
        val t = abs(rial / 10)
        val body = when {
            t >= 1_000_000_000 -> one(t, 1_000_000_000) + " میلیارد"
            t >= 1_000_000 -> one(t, 1_000_000) + " میلیون"
            t >= 1_000 -> one(t, 1_000) + " هزار"
            else -> group(t)
        }
        return if (rial < 0) "$LRI−$PDI$body" else body
    }

    private fun one(t: Long, unit: Long): String {
        val tenths = (t * 10.0 / unit).roundToLong()
        val s = if (tenths % 10 == 0L) (tenths / 10).toString() else "${tenths / 10}٫${tenths % 10}"
        return fa(s)
    }

    private val ONES = arrayOf("", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه")
    private val TEENS = arrayOf("ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده")
    private val TENS = arrayOf("", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود")
    private val HUNDREDS = arrayOf("", "صد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد")
    private val SCALES = arrayOf("", "هزار", "میلیون", "میلیارد", "هزار میلیارد")

    /** 185000 -> "صد و هشتاد و پنج هزار". Supports up to 10^15. */
    fun words(n: Long): String {
        if (n == 0L) return "صفر"
        if (n < 0) return "منفی " + words(-n)
        require(n < 1_000_000_000_000_000L)
        val parts = ArrayList<String>()
        var x = n
        var i = 0
        while (x > 0) {
            val g = (x % 1000).toInt()
            if (g > 0) {
                val w = three(g)
                parts.add(0, if (i == 0) w else if (i == 1 && g == 1) "هزار" else "$w ${SCALES[i]}")
            }
            x /= 1000
            i++
        }
        return parts.joinToString(" و ")
    }

    private fun three(n: Int): String {
        val p = ArrayList<String>()
        if (n / 100 > 0) p += HUNDREDS[n / 100]
        val r = n % 100
        if (r in 10..19) p += TEENS[r - 10] else {
            if (r / 10 > 0) p += TENS[r / 10]
            if (r % 10 > 0) p += ONES[r % 10]
        }
        return p.joinToString(" و ")
    }
}
