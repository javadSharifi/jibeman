package ir.jibeman.core

import ir.jibeman.core.db.Installment
import ir.jibeman.core.db.Rule
import kotlin.math.ceil
import kotlin.math.pow

object Rules {
    /** True when every condition the rule sets holds. A rule with no condition never matches. */
    fun matches(r: Rule, bank: String?, type: String, amount: Long, text: String?): Boolean {
        val hasCondition = r.contains.isNotBlank() || r.bank.isNotEmpty() || r.type.isNotEmpty() || r.minAmount != null || r.maxAmount != null
        return r.enabled && hasCondition &&
            (r.contains.isBlank() || text?.contains(r.contains.trim(), ignoreCase = true) == true) &&
            (r.bank.isEmpty() || r.bank == bank) &&
            (r.type.isEmpty() || r.type == type) &&
            (r.minAmount == null || amount >= r.minAmount) &&
            (r.maxAmount == null || amount <= r.maxAmount)
    }

    /** Rules come ordered: ignore rules first, then most specific text. */
    fun first(rules: List<Rule>, bank: String?, type: String, amount: Long, text: String?) = rules.firstOrNull { matches(it, bank, type, amount, text) }
}

object Loans {
    /** Monthly on the same Jalali day; day 31 becomes the month's last day in shorter months. */
    fun schedule(firstDueAt: Long, count: Int, amount: Long): List<Installment> {
        val j = Jalali.of(firstDueAt)
        return (0 until count).map { k ->
            val y = j.y + (j.m - 1 + k) / 12
            val m = (j.m - 1 + k) % 12 + 1
            Installment(loanId = 0, n = k + 1, dueAt = Jalali.millis(y, m, minOf(j.d, Jalali.monthDays(y, m))), amount = amount)
        }
    }

    /**
     * Suggested monthly installment (rial) for an annuity loan, rounded up to a whole toman.
     * Only a suggestion the user can overwrite: the bank's own table is the truth. Double is fine here, nothing is stored from it unchecked.
     */
    fun suggest(principal: Long, yearlyRatePercent: Double, months: Int): Long {
        if (months <= 0 || principal <= 0) return 0
        val r = yearlyRatePercent / 1200.0
        val raw = if (r <= 0) principal.toDouble() / months else principal * r * (1 + r).pow(months) / ((1 + r).pow(months) - 1)
        return ceil(raw / 10).toLong() * 10
    }
}

object Split {
    /** Equal split in whole tomans; leftover tomans/rials go to the first members so the sum is exact. */
    fun equalShares(amount: Long, members: List<Long>): Map<Long, Long> {
        if (members.isEmpty()) return emptyMap()
        val n = members.size
        val toman = amount / 10
        val base = toman / n
        val rem = toman % n
        return members.mapIndexed { i, m -> m to ((base + if (i < rem) 1 else 0) * 10 + if (i == 0) amount % 10 else 0) }.toMap()
    }

    /** Net per member: what they paid minus their shares. Positive = the group owes them. */
    fun balances(members: List<Long>, payments: List<Pair<Long, Long>>, shares: List<Pair<Long, Long>>): Map<Long, Long> {
        val net = members.associateWith { 0L }.toMutableMap()
        payments.forEach { (m, a) -> net[m] = (net[m] ?: 0) + a }
        shares.forEach { (m, a) -> net[m] = (net[m] ?: 0) - a }
        return net
    }

    data class Transfer(val from: Long, val to: Long, val amount: Long)

    /** Greedy: largest debtor pays largest creditor. At most n-1 transfers, and it always settles to zero. */
    fun settle(net: Map<Long, Long>): List<Transfer> {
        val cred = net.filter { it.value > 0 }.map { it.key to it.value }.sortedByDescending { it.second }.toMutableList()
        val debt = net.filter { it.value < 0 }.map { it.key to -it.value }.sortedByDescending { it.second }.toMutableList()
        val out = ArrayList<Transfer>()
        var i = 0
        var j = 0
        while (i < debt.size && j < cred.size) {
            val x = minOf(debt[i].second, cred[j].second)
            out += Transfer(debt[i].first, cred[j].first, x)
            debt[i] = debt[i].first to debt[i].second - x
            cred[j] = cred[j].first to cred[j].second - x
            if (debt[i].second == 0L) i++
            if (cred[j].second == 0L) j++
        }
        return out
    }
}

object Goals {
    /** Months still needed at the recent pace (net set aside over the last 3 months / 3), or null if no pace yet. */
    fun etaMonths(remaining: Long, recent90: Long): Int? = if (remaining <= 0) 0 else if (recent90 <= 0) null else ceil(remaining * 3.0 / recent90).toInt()

    /** Monthly amount needed to reach the target by [dueAt] (at least one month). */
    fun perMonth(remaining: Long, now: Long, dueAt: Long): Long {
        val months = maxOf(1L, ceil((dueAt - now) / (30.44 * 86_400_000)).toLong())
        return ceil(remaining.toDouble() / months / 10).toLong() * 10
    }
}
