package ir.jibeman.core

import java.util.Calendar

/** Jalali (Shamsi) calendar. Conversion is the standard 33-year-cycle algorithm (jdf), valid for 1300–1500. */
object Jalali {
    val MONTHS = arrayOf("فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند")
    // indexed by Calendar.DAY_OF_WEEK - 1 (Sunday = 0)
    private val WEEKDAYS = arrayOf("یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه")

    data class JDate(val y: Int, val m: Int, val d: Int)

    fun g2j(gy: Int, gm: Int, gd: Int): JDate {
        val gdm = intArrayOf(0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334)
        val gy2 = if (gm > 2) gy + 1 else gy
        var days = 355666 + 365 * gy + (gy2 + 3) / 4 - (gy2 + 99) / 100 + (gy2 + 399) / 400 + gd + gdm[gm - 1]
        var jy = -1595 + 33 * (days / 12053)
        days %= 12053
        jy += 4 * (days / 1461)
        days %= 1461
        if (days > 365) {
            jy += (days - 1) / 365
            days = (days - 1) % 365
        }
        return if (days < 186) JDate(jy, 1 + days / 31, 1 + days % 31)
        else JDate(jy, 7 + (days - 186) / 30, 1 + (days - 186) % 30)
    }

    fun j2g(jy: Int, jm: Int, jd: Int): IntArray {
        val jy2 = jy + 1595
        var days = -355668 + 365 * jy2 + (jy2 / 33) * 8 + ((jy2 % 33) + 3) / 4 + jd +
            if (jm < 7) (jm - 1) * 31 else (jm - 7) * 30 + 186
        var gy = 400 * (days / 146097)
        days %= 146097
        if (days > 36524) {
            days--
            gy += 100 * (days / 36524)
            days %= 36524
            if (days >= 365) days++
        }
        gy += 4 * (days / 1461)
        days %= 1461
        if (days > 365) {
            gy += (days - 1) / 365
            days = (days - 1) % 365
        }
        var gd = days + 1
        val leap = (gy % 4 == 0 && gy % 100 != 0) || gy % 400 == 0
        val sal = intArrayOf(0, 31, if (leap) 29 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
        var gm = 0
        while (gm < 13 && gd > sal[gm]) {
            gd -= sal[gm]
            gm++
        }
        return intArrayOf(gy, gm, gd)
    }

    fun of(ms: Long): JDate {
        val c = Calendar.getInstance().apply { timeInMillis = ms }
        return g2j(c[Calendar.YEAR], c[Calendar.MONTH] + 1, c[Calendar.DAY_OF_MONTH])
    }

    fun millis(y: Int, m: Int, d: Int, hour: Int = 0, minute: Int = 0): Long {
        val g = j2g(y, m, d)
        return Calendar.getInstance().apply { clear(); set(g[0], g[1] - 1, g[2], hour, minute, 0) }.timeInMillis
    }

    /** [start, end) of a Jalali month in local time. */
    fun monthRange(y: Int, m: Int): Pair<Long, Long> =
        millis(y, m, 1) to (if (m == 12) millis(y + 1, 1, 1) else millis(y, m + 1, 1))

    fun dayStart(ms: Long): Long = Calendar.getInstance().apply {
        timeInMillis = ms; set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    fun dayRange(ms: Long): Pair<Long, Long> {
        val s = dayStart(ms)
        return s to Calendar.getInstance().apply { timeInMillis = s; add(Calendar.DAY_OF_MONTH, 1) }.timeInMillis
    }

    fun addDays(ms: Long, n: Int): Long = Calendar.getInstance().apply { timeInMillis = ms; add(Calendar.DAY_OF_MONTH, n) }.timeInMillis

    fun monthDays(y: Int, m: Int): Int = when {
        m <= 6 -> 31
        m <= 11 -> 30
        // Esfand has 30 days only in leap years: 30 Esfand round-trips to itself instead of 1 Farvardin
        else -> j2g(y, 12, 30).let { if (g2j(it[0], it[1], it[2]).d == 30) 30 else 29 }
    }

    fun weekday(ms: Long): String = WEEKDAYS[Calendar.getInstance().apply { timeInMillis = ms }[Calendar.DAY_OF_WEEK] - 1]

    fun time(ms: Long): String {
        val c = Calendar.getInstance().apply { timeInMillis = ms }
        return Money.fa("%02d:%02d".format(c[Calendar.HOUR_OF_DAY], c[Calendar.MINUTE]))
    }

    fun monthTitle(y: Int, m: Int) = "${MONTHS[m - 1]} ${Money.fa(y.toString())}"

    /** "یکشنبه ۱۰ آبان" (+ year when not the current year). */
    fun longDate(ms: Long, now: Long = System.currentTimeMillis()): String {
        val j = of(ms)
        val year = if (j.y != of(now).y) " ${Money.fa(j.y.toString())}" else ""
        return "${weekday(ms)} ${Money.fa(j.d.toString())} ${MONTHS[j.m - 1]}$year"
    }

    /** "امروز · یکشنبه ۱۰ آبان", "دیروز · …", or just the long date. */
    fun dayLabel(ms: Long, now: Long = System.currentTimeMillis()): String {
        val d = dayStart(ms)
        val today = dayStart(now)
        return when (d) {
            today -> "امروز · ${longDate(ms, now)}"
            dayStart(addDays(today, -1)) -> "دیروز · ${longDate(ms, now)}"
            else -> longDate(ms, now)
        }
    }

    /** "امروز ۱۴:۲۲", "دیروز ۰۹:۱۰", "۸ آبان ۱۲:۰۰" */
    fun shortDateTime(ms: Long, now: Long = System.currentTimeMillis()): String {
        val d = dayStart(ms)
        val today = dayStart(now)
        val day = when (d) {
            today -> "امروز"
            dayStart(addDays(today, -1)) -> "دیروز"
            else -> of(ms).let { "${Money.fa(it.d.toString())} ${MONTHS[it.m - 1]}" }
        }
        return "$day · ${time(ms)}"
    }
}
