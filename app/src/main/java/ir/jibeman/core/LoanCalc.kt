package ir.jibeman.core

import kotlin.math.pow
import kotlin.math.roundToLong

/**
 * Offline loan math, matching credino.net's calculators (checked against its API on 1405/08/10).
 * All money is rial. Doubles only inside the formulas; every stored result is rounded to a whole rial.
 */
object LoanCalc {
    data class Result(val payments: List<Long>) {
        val total get() = payments.sum()
        fun interest(principal: Long) = total - principal
        /** The most common payment: what the user pays "every month". */
        val typical get() = payments.groupingBy { it }.eachCount().maxByOrNull { it.value }?.key ?: 0
    }

    /** Equal installments (annuity). Rate per period = annual% × intervalMonths / 12. */
    fun annuity(principal: Long, annualRate: Double, n: Int, intervalMonths: Int = 1): Result {
        require(n > 0 && principal >= 0)
        val r = annualRate / 100 * intervalMonths / 12
        val a = if (r <= 0) principal.toDouble() / n else principal * r * (1 + r).pow(n) / ((1 + r).pow(n) - 1)
        return Result(List(n) { a.roundToLong() })
    }

    /** Annual rate (%) that makes [payment] × n repay [principal]; bisection, 0..500%. */
    fun solveRate(principal: Long, payment: Long, n: Int, intervalMonths: Int = 1): Double? {
        if (principal <= 0 || payment <= 0 || n <= 0 || payment.toDouble() * n < principal) return null
        fun pay(rate: Double): Double {
            val r = rate / 100 * intervalMonths / 12
            return if (r <= 0) principal.toDouble() / n else principal * r * (1 + r).pow(n) / ((1 + r).pow(n) - 1)
        }
        var lo = 0.0
        var hi = 500.0
        if (pay(hi) < payment) return null
        repeat(100) {
            val mid = (lo + hi) / 2
            if (pay(mid) < payment) lo = mid else hi = mid
        }
        return (lo + hi) / 2
    }

    /** What's left to pay off now: present value of the remaining installments at the loan's own rate. */
    fun earlySettlement(principal: Long, payment: Long, paid: Int, n: Int, intervalMonths: Int = 1): Long? {
        if (paid !in 0..n) return null
        val rate = solveRate(principal, payment, n, intervalMonths) ?: return null
        val r = rate / 100 * intervalMonths / 12
        val left = n - paid
        val pv = if (r <= 1e-12) payment.toDouble() * left else payment * (1 - (1 + r).pow(-left)) / r
        return pv.roundToLong()
    }

    /**
     * Fee-based (کارمزد) loans, monthly: at the start of each loan year one installment is only the fee
     * (remaining principal × fee%), the other installments repay principal in equal parts; the last absorbs rounding.
     * Fee installments = whole years in the term (at least one). With 0% the whole term repays principal.
     */
    fun wage(principal: Long, wagePercent: Double, n: Int): Result {
        require(n > 0 && principal >= 0)
        if (wagePercent <= 0) return equalPrincipal(principal, n)
        val years = maxOf(1, n / 12)
        val feeAt = (0 until years).map { it * 12 }.toSet()
        val principalCount = n - years
        if (principalCount <= 0) return equalPrincipal(principal, n)
        val part = (principal.toDouble() / principalCount).roundToLong()
        var remaining = principal
        var paidParts = 0
        val out = ArrayList<Long>(n)
        for (k in 0 until n) {
            if (k in feeAt) out += (remaining * wagePercent / 100).roundToLong()
            else {
                paidParts++
                val p = if (paidParts == principalCount) remaining else part
                out += p
                remaining -= p
            }
        }
        return Result(out)
    }

    private fun equalPrincipal(principal: Long, n: Int): Result {
        val part = principal / n
        return Result(List(n) { if (it == n - 1) principal - part * (n - 1) else part })
    }
}

/** Bank loan plans as published by credino.net (snapshot 1405/08/10). Terms change: the user can always edit. */
object BankPlans {
    enum class Kind { WAGE, INTEREST }

    data class Plan(
        val bank: String, // Banks code
        val name: String,
        val kind: Kind,
        val rates: List<Int>,
        val months: List<Int>,
        val maxMillion: Int?,
        val minMillion: Int? = null,
        val roundUpRial: Long = 1, // some banks round each installment up (Sepino: to 100 toman)
    ) {
        val bankName get() = Banks.of(bank)?.name ?: bank
        val title get() = "$name ${if (bank == "mehr") "بانک مهر" else "بانک $bankName"}"
        val rateLabel get() = if (kind == Kind.WAGE) "کارمزد" else "سود"
    }

    val all = listOf(
        Plan("melli", "اعتبار ملی", Kind.INTEREST, listOf(14, 18, 23), listOf(12, 24, 36, 48, 60), 700),
        Plan("melli", "مهربانی", Kind.WAGE, listOf(0, 2, 4), listOf(12, 18, 24, 30, 36, 42, 48, 54, 60), 300),
        Plan("resalat", "قرض‌الحسنه", Kind.WAGE, listOf(0), (10..60).toList(), 500),
        Plan("mehr", "نیلوفر", Kind.WAGE, listOf(0, 2, 3, 4), (24..60 step 2).toList(), 500),
        Plan("sepah", "نگین امید", Kind.WAGE, listOf(2), listOf(12, 24, 36, 48, 60), 300),
        Plan("sepah", "امید زرین", Kind.WAGE, listOf(0, 2, 4), listOf(12, 24, 36, 48, 60), 300),
        Plan("mellat", "نیک‌وام", Kind.WAGE, listOf(4), listOf(12, 24, 36, 48, 60), 300),
        Plan("tejarat", "ممتاز (باجت)", Kind.WAGE, listOf(4, 14, 23), listOf(12, 18, 24, 36, 48, 60), 700),
        Plan("saderat", "سپینو", Kind.INTEREST, (15..23).toList(), (12..36).toList(), 600, minMillion = 10, roundUpRial = 1000),
    )

    fun calc(p: Plan, principal: Long, rate: Int, months: Int): LoanCalc.Result {
        val r = if (p.kind == Kind.WAGE) LoanCalc.wage(principal, rate.toDouble(), months) else LoanCalc.annuity(principal, rate.toDouble(), months)
        return if (p.roundUpRial <= 1) r else LoanCalc.Result(r.payments.map { (it + p.roundUpRial - 1) / p.roundUpRial * p.roundUpRial })
    }
}
