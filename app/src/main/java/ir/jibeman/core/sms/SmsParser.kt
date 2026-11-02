package ir.jibeman.core.sms

import ir.jibeman.core.Jalali
import org.json.JSONObject

/** One bank's field-based template, loaded from assets/banks/<bank>.json (format: docs/BANK-FORMATS.md). */
class Template(
    val bank: String,
    val senders: Set<String>,
    val signature: Regex?,
    val kinds: List<Pair<Regex, String>>,
    val fields: Map<String, Regex>,
    val date: DateSpec?,
    val toman: Boolean,
)

class DateSpec(val regex: Regex, val order: String, val yearBase: Int)

data class Parsed(
    val bank: String,
    val type: String,
    val amount: Long, // rial
    val balance: Long?,
    val occurredAt: Long?,
    val card4: String?,
    val accountNo: String?,
    val description: String?,
    val bySender: Boolean,
)

object SmsParser {
    private const val FA = "۰۱۲۳۴۵۶۷۸۹"
    private const val AR = "٠١٢٣٤٥٦٧٨٩"
    private val SEP = Regex("(?<=\\d)[,٬](?=\\d)")

    /** Digits to ASCII, Arabic ي/ك to Persian, ZWNJ to space, no thousands separators, trimmed lines. */
    fun normalize(s: String): String {
        val sb = StringBuilder(s.length)
        for (c in s) {
            val i = FA.indexOf(c).takeIf { it >= 0 } ?: AR.indexOf(c)
            sb.append(
                when {
                    i >= 0 -> '0' + i
                    c == 'ي' -> 'ی'
                    c == 'ك' -> 'ک'
                    c == '‌' -> ' '
                    else -> c
                }
            )
        }
        return SEP.replace(sb, "").lines().joinToString("\n") { it.trim() }.trim()
    }

    /** "+989999987641" / "09999987641" / "9999987641" -> "9999987641"; names -> upper case. */
    fun senderKey(address: String): String {
        val digits = address.filter(Char::isDigit)
        return if (address.none(Char::isLetter) && digits.length >= 10) digits.takeLast(10) else address.trim().uppercase()
    }

    private fun rx(p: String) = Regex(p, RegexOption.MULTILINE)

    fun load(json: String): Template {
        val o = JSONObject(json)
        val detect = o.getJSONObject("detect")
        val senders = detect.optJSONArray("senders")?.let { a -> (0 until a.length()).map { senderKey(a.getString(it)) } }.orEmpty().toSet()
        val kinds = o.getJSONArray("kinds").let { a -> (0 until a.length()).map { a.getJSONObject(it).let { k -> rx(k.getString("pattern")) to k.getString("type") } } }
        val f = o.getJSONObject("fields")
        val fields = f.keys().asSequence().filter { f.opt(it) is String }.associateWith { rx(f.getString(it)) }
        val date = f.optJSONObject("datetime")?.let { DateSpec(rx(it.getString("pattern")), it.getString("order"), it.optInt("yearBase", 0)) }
        return Template(o.getString("bank"), senders, detect.optString("signature").takeIf { it.isNotEmpty() }?.let(::rx), kinds, fields, date, o.optString("unit") == "TOMAN")
    }

    /** Sender match first (cheap, exact); content signature only as a fallback. */
    fun detect(templates: List<Template>, sender: String, norm: String): Pair<Template, Boolean>? {
        val key = senderKey(sender)
        templates.firstOrNull { key in it.senders }?.let { return it to true }
        return templates.firstOrNull { it.signature?.containsMatchIn(norm) == true }?.let { it to false }
    }

    /** Null when it isn't a transaction (OTP, ads, unknown format): such messages are never stored. */
    fun parse(t: Template, norm: String, bySender: Boolean): Parsed? {
        val type = t.kinds.firstOrNull { it.first.containsMatchIn(norm) }?.second ?: return null
        fun g(k: String) = t.fields[k]?.find(norm)?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotEmpty() }
        fun money(v: String?) = v?.toLongOrNull()?.let { if (t.toman) it * 10 else it }
        val amount = money(g("amount"))?.takeIf { it > 0 } ?: return null
        return Parsed(
            bank = t.bank, type = type, amount = amount, balance = money(g("balance")), occurredAt = t.date?.let { date(it, norm) },
            card4 = g("card4"), accountNo = g("account"), description = g("description"), bySender = bySender,
        )
    }

    private fun date(spec: DateSpec, norm: String): Long? {
        val m = spec.regex.find(norm) ?: return null
        val v = HashMap<Char, Int>()
        spec.order.forEachIndexed { i, c -> v[c] = m.groupValues.getOrNull(i + 1)?.toIntOrNull() ?: return null }
        val y = (v['y'] ?: return null).let { if (it < 100) spec.yearBase + it else it }
        val mo = v['M'] ?: return null
        val d = v['d'] ?: return null
        val h = v['H'] ?: 0
        val mi = v['m'] ?: 0
        if (y !in 1300..1500 || mo !in 1..12 || d !in 1..31 || h !in 0..23 || mi !in 0..59) return null
        return Jalali.millis(y, mo, d, h, mi)
    }
}
