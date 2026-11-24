package ir.jibeman.core

import ir.jibeman.core.db.Installment
import ir.jibeman.core.db.Loan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LoanActiveRepaymentTest {

    @Test
    fun testActiveLoanWith8PaidOf24() {
        val count = 24
        val installmentAmount = 2_500_000L * 10 // in rial
        val firstDue = Jalali.dayStart(System.currentTimeMillis() - 7 * 30 * 86_400_000L) // 7 months ago
        val schedule = Loans.schedule(firstDue, count, installmentAmount)

        // Mark first 8 installments as paid historically
        val paidCount = 8
        val installments = schedule.map { item ->
            val isPaid = item.n <= paidCount
            item.copy(paidAt = if (isPaid) item.dueAt else null)
        }

        val paidItems = installments.filter { it.paidAt != null || it.paidTxnId != null }
        val unpaidItems = installments.filter { it.paidAt == null && it.paidTxnId == null }

        assertEquals(8, paidItems.size)
        assertEquals(16, unpaidItems.size)

        val remainingBalance = unpaidItems.sumOf { it.amount }
        assertEquals(16 * installmentAmount, remainingBalance)
    }

    @Test
    fun testCustomPaidStatusWhenInstallment3UnpaidAndInstallment9Paid() {
        val count = 24
        val installmentAmount = 2_000_000L * 10
        val now = System.currentTimeMillis()
        val firstDue = Jalali.dayStart(now - 7 * 30 * 86_400_000L) // in the past
        val schedule = Loans.schedule(firstDue, count, installmentAmount)

        // User initially has 8 paid, but unchecks #3 (overdue) and checks #9 (paid in advance)
        val installments = schedule.map { item ->
            val isPaid = when (item.n) {
                3 -> false
                in 1..8 -> true
                9 -> true
                else -> false
            }
            item.copy(paidAt = if (isPaid) item.dueAt else null)
        }

        val paidItems = installments.filter { it.paidAt != null || it.paidTxnId != null }
        val unpaidItems = installments.filter { it.paidAt == null && it.paidTxnId == null }

        assertEquals(8, paidItems.size)
        assertEquals(16, unpaidItems.size)

        // Overdue count: unpaid with due date in the past
        val todayStart = Jalali.dayStart(now)
        val overdueItems = unpaidItems.filter { it.dueAt < todayStart }
        assertEquals(1, overdueItems.size)
        assertEquals(3, overdueItems[0].n)

        // Next due is the earliest unpaid installment (which is #3)
        val nextDue = unpaidItems.minByOrNull { it.dueAt }
        assertEquals(3, nextDue?.n)
    }

    @Test
    fun testEditingFutureInstallmentsPreservesPastPayments() {
        val count = 24
        val oldAmount = 2_000_000L * 10
        val newAmount = 3_000_000L * 10
        val firstDue = Jalali.dayStart(System.currentTimeMillis())
        val initialSchedule = Loans.schedule(firstDue, count, oldAmount)

        // Simulate 8 installments paid
        val paidInstallments = initialSchedule.take(8).map {
            it.copy(paidAt = it.dueAt)
        }
        val unpaidInitial = initialSchedule.drop(8)

        // Now edit future installments with newAmount
        val updatedSchedule = paidInstallments + unpaidInitial.map {
            it.copy(amount = newAmount)
        }

        // Check that past 8 installments retained their oldAmount and paid status
        for (i in 0 until 8) {
            assertTrue(updatedSchedule[i].paidAt != null)
            assertEquals(oldAmount, updatedSchedule[i].amount)
        }

        // Check that future 16 installments have newAmount and remain unpaid
        for (i in 8 until 24) {
            assertFalse(updatedSchedule[i].paidAt != null)
            assertEquals(newAmount, updatedSchedule[i].amount)
        }

        val remainingBalance = updatedSchedule.filter { it.paidAt == null }.sumOf { it.amount }
        assertEquals(16 * newAmount, remainingBalance)
    }
}
