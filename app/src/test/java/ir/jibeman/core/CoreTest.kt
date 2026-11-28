package ir.jibeman.core

import org.junit.Assert.assertEquals
import org.junit.Test

class JalaliTest {
    private fun j(y: Int, m: Int, d: Int) = Jalali.JDate(y, m, d)

    @Test fun knownDates() {
        assertEquals(j(1405, 8, 10), Jalali.g2j(2026, 11, 1))
        assertEquals(j(1405, 1, 1), Jalali.g2j(2026, 3, 21))
        assertEquals(j(1404, 1, 1), Jalali.g2j(2025, 3, 21))
        assertEquals(j(1403, 1, 1), Jalali.g2j(2024, 3, 20))
        assertEquals(j(1403, 12, 30), Jalali.g2j(2025, 3, 20)) // 1403 is a leap year
        assertEquals(j(1399, 12, 30), Jalali.g2j(2021, 3, 20))
    }

    @Test fun roundTripEveryDay2000to2040() {
        val c = java.util.GregorianCalendar(2000, 0, 1)
        while (c[java.util.Calendar.YEAR] < 2040) {
            val g = intArrayOf(c[java.util.Calendar.YEAR], c[java.util.Calendar.MONTH] + 1, c[java.util.Calendar.DAY_OF_MONTH])
            val jd = Jalali.g2j(g[0], g[1], g[2])
            assertEquals(g.toList(), Jalali.j2g(jd.y, jd.m, jd.d).toList())
            c.add(java.util.Calendar.DAY_OF_MONTH, 1)
        }
    }

    @Test fun monthDays() {
        assertEquals(31, Jalali.monthDays(1405, 1))
        assertEquals(30, Jalali.monthDays(1405, 8))
        assertEquals(30, Jalali.monthDays(1403, 12))
        assertEquals(29, Jalali.monthDays(1404, 12))
    }
}

class MoneyTest {
    @Test fun words() {
        assertEquals("صفر", Money.words(0))
        assertEquals("دوازده", Money.words(12))
        assertEquals("هزار", Money.words(1000))
        assertEquals("هزار و یک", Money.words(1001))
        assertEquals("صد و هشتاد و پنج هزار", Money.words(185_000))
        assertEquals("دو میلیون و سیصد و پنجاه هزار", Money.words(2_350_000))
        assertEquals("یک میلیارد و پانصد میلیون", Money.words(1_500_000_000))
    }

    @Test fun format() {
        assertEquals("۱٬۲۳۴٬۵۶۷", Money.group(1_234_567))
        assertEquals("⁦−۱۸۵٬۰۰۰⁩", Money.toman(-1_850_000))
        assertEquals("⁦+۳۲٬۵۰۰٬۰۰۰⁩", Money.toman(325_000_000, plus = true))
        assertEquals("۳۲٫۵ میلیون", Money.short(325_000_000))
        assertEquals("۱۸٫۷ میلیون", Money.short(187_400_000))
        assertEquals("۸۵۰ هزار", Money.short(8_500_000))
        assertEquals("۹۹۹", Money.short(9_990))
    }

    @Test fun parse() {
        assertEquals(1_250_000L, Money.parseToman("۱۲۵٬۰۰۰"))
        assertEquals(1_250_000L, Money.parseToman("125,000"))
        assertEquals(null, Money.parseToman("12a"))
        assertEquals(null, Money.parseToman(""))
    }
}

class PlansTest {
    private val r = ir.jibeman.core.db.Rule(contains = "خرید شارژ", categoryId = 5)

    @Test fun ruleConditionsAreAnded() {
        assertEquals(true, Rules.matches(r, "blu", "EXPENSE", 2_000_000, "خرید شارژ"))
        assertEquals(false, Rules.matches(r, "blu", "EXPENSE", 2_000_000, "برداشت"))
        val strict = r.copy(bank = "blu", type = "EXPENSE", minAmount = 1_000_000, maxAmount = 5_000_000)
        assertEquals(true, Rules.matches(strict, "blu", "EXPENSE", 2_000_000, "x خرید شارژ x"))
        assertEquals(false, Rules.matches(strict, "keshavarzi", "EXPENSE", 2_000_000, "خرید شارژ"))
        assertEquals(false, Rules.matches(strict, "blu", "INCOME", 2_000_000, "خرید شارژ"))
        assertEquals(false, Rules.matches(strict, "blu", "EXPENSE", 6_000_000, "خرید شارژ"))
        assertEquals(false, Rules.matches(r.copy(enabled = false), "blu", "EXPENSE", 1, "خرید شارژ"))
        assertEquals(false, Rules.matches(ir.jibeman.core.db.Rule(contains = "", categoryId = 1), "blu", "EXPENSE", 1, "x")) // no condition
    }

    @Test fun ignoreRulesWinBecauseTheyComeFirst() {
        val ign = ir.jibeman.core.db.Rule(contains = "", categoryId = null, bank = "blu", maxAmount = 10, ignore = true)
        assertEquals(ign, Rules.first(listOf(ign, r), "blu", "EXPENSE", 10, "خرید شارژ"))
    }

    @Test fun scheduleKeepsJalaliDayAndClampsMonthEnd() {
        val s = Loans.schedule(Jalali.millis(1405, 6, 31), 3, 100)
        assertEquals(listOf(Jalali.millis(1405, 6, 31), Jalali.millis(1405, 7, 30), Jalali.millis(1405, 8, 30)), s.map { it.dueAt })
        assertEquals(listOf(1, 2, 3), s.map { it.n })
        val y = Loans.schedule(Jalali.millis(1405, 11, 10), 3, 100)
        assertEquals(Jalali.millis(1406, 1, 10), y[2].dueAt)
    }

    @Test fun suggestedInstallment() {
        assertEquals(10_000_000L, Loans.suggest(120_000_000, 0.0, 12))
        // 100M toman at 23% over 36 months ≈ 3,870,9xx toman per month (standard annuity)
        val t = Loans.suggest(1_000_000_000, 23.0, 36) / 10
        assertEquals(true, t in 3_870_000..3_872_000)
        assertEquals(0L, Loans.suggest(0, 10.0, 12))
    }
}

class SplitTest {
    @Test fun equalSharesSumExactly() {
        val s = Split.equalShares(1_000_001, listOf(1, 2, 3))
        assertEquals(1_000_001L, s.values.sum())
        assertEquals(listOf(333_341L, 333_330L, 333_330L), listOf(s[1], s[2], s[3]))
    }

    @Test fun dinnerForFourPaidByMe() {
        val members = listOf(0L, 1L, 2L, 3L)
        val shares = Split.equalShares(12_000_000, members).map { it.key to it.value }
        val net = Split.balances(members, listOf(0L to 12_000_000L), shares)
        assertEquals(9_000_000L, net[0])
        val t = Split.settle(net)
        assertEquals(3, t.size)
        assertEquals(true, t.all { it.to == 0L && it.amount == 3_000_000L })
    }

    @Test fun settleAlwaysZeroesOut() {
        val net = mapOf(1L to 500L, 2L to -200L, 3L to -300L, 4L to 700L, 5L to -700L)
        val after = net.toMutableMap()
        Split.settle(net).forEach { after[it.from] = after[it.from]!! + it.amount; after[it.to] = after[it.to]!! - it.amount }
        assertEquals(true, after.values.all { it == 0L })
        assertEquals(true, Split.settle(net).size <= net.size - 1)
    }

    @Test fun goals() {
        assertEquals(4, Goals.etaMonths(10_000, 9_000)) // 3,000 a month -> 4 months
        assertEquals(null, Goals.etaMonths(10_000, 0))
        assertEquals(0, Goals.etaMonths(0, 0))
        val now = 0L
        assertEquals(1_000_000L, Goals.perMonth(10_000_000, now, (10 * 30.44 * 86_400_000).toLong()))
    }
}

/** Vectors from credino.net's API (toman there, ×10 here), 1405/08/10. */
class LoanCalcTest {
    private fun near(expected: Long, actual: Long, tol: Long = 10) = assertEquals("expected $expected got $actual", true, kotlin.math.abs(expected - actual) <= tol)

    @Test fun annuityMatchesSite() {
        near(38_709_722, LoanCalc.annuity(1_000_000_000, 23.0, 36).typical) // 3,870,972.16 toman
        near(117_647_673, LoanCalc.annuity(1_000_000_000, 23.0, 12, 3).typical) // every 3 months
        near(83_333_333, LoanCalc.annuity(1_000_000_000, 0.0, 12).typical)
        val sepino = BankPlans.all.first { it.name == "سپینو" }
        assertEquals(91_654_000L, BankPlans.calc(sepino, 1_750_000_000, 23, 24).typical) // 9,165,400 toman
        assertEquals(2_199_696_000L, BankPlans.calc(sepino, 1_750_000_000, 23, 24).total)
    }

    @Test fun rateAndEarlySettlement() {
        assertEquals(23.0, LoanCalc.solveRate(1_000_000_000, 38_709_730, 36)!!, 0.01)
        near(786_822_513, LoanCalc.earlySettlement(1_000_000_000, 38_709_730, 10, 36)!!, 50)
        assertEquals(null, LoanCalc.solveRate(1_000_000_000, 1, 36))
    }

    @Test fun wageScheduleMatchesSite() {
        val nik = BankPlans.all.first { it.name == "نیک‌وام" }
        near(90_909_090, BankPlans.calc(BankPlans.all.first { it.name == "مهربانی" }, 3_000_000_000, 4, 36).typical) // 9,090,909 toman
        near(90_909_090, BankPlans.calc(nik, 3_000_000_000, 4, 36).typical)
    }

    @Test fun wageScheduleShape() {
        val q = LoanCalc.wage(1_000_000_000, 4.0, 36) // qard-hasaneh 4%, 36 months
        near(40_000_000, q.payments[0]); near(30_303_030, q.payments[1]); near(26_666_667, q.payments[12]); near(13_333_333, q.payments[24])
        near(1_080_000_000, q.total)
        val nik = LoanCalc.wage(600_000_000, 4.0, 36) // Nik Vaam 60M toman
        near(24_000_000, nik.payments[0]); near(18_181_820, nik.payments[1]); near(16_000_000, nik.payments[12]); near(8_000_000, nik.payments[24])
        near(44_642_860, LoanCalc.wage(1_250_000_000, 4.0, 30).typical) // Mehrabani 30 months -> 28 principal parts
        near(19_090_910, LoanCalc.wage(630_000_000, 4.0, 36).typical) // Momtaz
        val zero = LoanCalc.wage(1_000_000_003, 0.0, 12)
        assertEquals(1_000_000_003L, zero.total)
    }
}

class SecurityTest {
    private fun hash(pin: String, salt: String): String {
        val md = java.security.MessageDigest.getInstance("SHA-256")
        val bytes = md.digest("$salt:$pin:jibeman_salt".toByteArray(Charsets.UTF_8))
        return java.util.Base64.getEncoder().encodeToString(bytes)
    }

    @Test fun pinVerification() {
        val salt = "test_salt_123"
        val correctPin = "1234"
        val storedHash = hash(correctPin, salt)

        assertEquals(storedHash, hash("1234", salt))
        assertEquals(false, storedHash == hash("0000", salt))
        assertEquals(false, storedHash == hash("1235", salt))
    }
}

class MonthlyReportsTest {
    @Test fun aggregatesCategoriesAndAccountsAndDelta() {
        val acc1 = ir.jibeman.core.db.AccountBalance(
            account = ir.jibeman.core.db.Account(id = 1L, name = "بلو", type = "BANK", bankCode = "blu"),
            balance = 5_000_000L,
            last4 = "1234",
        )
        val acc2 = ir.jibeman.core.db.AccountBalance(
            account = ir.jibeman.core.db.Account(id = 2L, name = "ملت", type = "BANK", bankCode = "mellat"),
            balance = 2_000_000L,
            last4 = "5678",
        )
        val t1 = ir.jibeman.core.db.TxnRow(
            txn = ir.jibeman.core.db.Txn(id = 10L, type = ir.jibeman.core.db.TxType.EXPENSE, amount = 600_000L, accountId = 1L, categoryId = 1L, occurredAt = 1000L),
            accountName = "بلو", toAccountName = null, categoryName = "خوراک", categoryIcon = "food", categoryColor = 1,
        )
        val t2 = ir.jibeman.core.db.TxnRow(
            txn = ir.jibeman.core.db.Txn(id = 11L, type = ir.jibeman.core.db.TxType.EXPENSE, amount = 300_000L, accountId = 2L, categoryId = 2L, occurredAt = 2000L),
            accountName = "ملت", toAccountName = null, categoryName = "حمل‌ونقل", categoryIcon = "car", categoryColor = 0,
        )
        val t3 = ir.jibeman.core.db.TxnRow(
            txn = ir.jibeman.core.db.Txn(id = 12L, type = ir.jibeman.core.db.TxType.EXPENSE, amount = 100_000L, accountId = 1L, categoryId = null, occurredAt = 3000L),
            accountName = "بلو", toAccountName = null, categoryName = null, categoryIcon = null, categoryColor = null,
        )

        val all = ir.jibeman.feature.MonthlyReports.build(
            y = 1405, m = 8, accountId = 0L,
            monthExpenses = listOf(t1, t2, t3),
            monthTotals = ir.jibeman.core.db.Totals(income = 2_000_000L, expense = 1_000_000L, count = 4),
            prevTotals = ir.jibeman.core.db.Totals(income = 0L, expense = 800_000L, count = 2),
            accounts = listOf(acc1, acc2),
            now = Jalali.millis(1405, 8, 10),
        )
        assertEquals(1_000_000L, all.totalExpense)
        assertEquals(3, all.expenseCount)
        assertEquals(25, all.deltaPercent)
        assertEquals(100_000L, all.dailyAverage)
        assertEquals(3, all.categories.size)
        assertEquals("خوراک", all.categories[0].name)
        assertEquals(60f, all.categories[0].percent, 0.01f)
        assertEquals("بدون دسته", all.categories[2].name)
        assertEquals(2, all.accountShares.size)
        assertEquals(700_000L, all.accountShares[0].totalAmount)

        val perCard = ir.jibeman.feature.MonthlyReports.build(
            y = 1405, m = 8, accountId = 1L,
            monthExpenses = listOf(t1, t2, t3),
            monthTotals = ir.jibeman.core.db.Totals(income = 0L, expense = 700_000L, count = 2),
            prevTotals = ir.jibeman.core.db.Totals(income = 0L, expense = 0L, count = 0),
            accounts = listOf(acc1, acc2),
            now = Jalali.millis(1405, 8, 10),
        )
        assertEquals(700_000L, perCard.totalExpense)
        assertEquals(2, perCard.expenseCount)
        assertEquals(null, perCard.deltaPercent)
        assertEquals(0, perCard.accountShares.size)
        assertEquals(2, perCard.categories.size)
    }
}
