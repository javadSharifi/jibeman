package ir.jibeman.core

import ir.jibeman.core.db.Account
import ir.jibeman.core.db.SavingsCommitment
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SavingsCommitmentTest {

    @Test
    fun `acceptance criteria - withdraw 1 million toman and return 400k toman`() {
        val savingsAccount = Account(
            id = 1L,
            name = "حساب پس‌انداز بلو",
            type = "BANK",
            initialBalance = 50_000_000L, // 5 million toman
            isSavings = true,
        )

        // 1. Withdraw 1,000,000 Toman (10,000,000 Rial) with return commitment checked
        val withdrawalAmountRial = 10_000_000L
        val commitment = SavingsCommitment(
            id = 100L,
            accountId = savingsAccount.id,
            txnId = 501L,
            amount = withdrawalAmountRial,
            paidAmount = 0L,
            note = "برداشت از پس‌انداز برای خرید اضطراری",
            createdAt = System.currentTimeMillis(),
        )

        assertEquals(10_000_000L, commitment.amount - commitment.paidAmount)

        // 2. Return 400,000 Toman (4,000,000 Rial)
        val returnAmountRial = 4_000_000L
        val afterFirstReturn = commitment.copy(paidAmount = commitment.paidAmount + returnAmountRial)
        val remainingAfterFirstReturn = afterFirstReturn.amount - afterFirstReturn.paidAmount

        // Criteria check: remaining must be exactly 600,000 Toman (6,000,000 Rial)
        assertEquals(6_000_000L, remainingAfterFirstReturn)
        assertEquals(4_000_000L, afterFirstReturn.paidAmount)

        // 3. Return remaining 600,000 Toman (6,000,000 Rial)
        val secondReturnAmountRial = 6_000_000L
        val fullySettled = afterFirstReturn.copy(paidAmount = afterFirstReturn.paidAmount + secondReturnAmountRial)
        val finalRemaining = fullySettled.amount - fullySettled.paidAmount

        assertEquals(0L, finalRemaining)
        assertEquals(10_000_000L, fullySettled.paidAmount)
    }

    @Test
    fun `dashboard separation between spendable and savings balance`() {
        val everydayCard = Account(id = 1L, name = "کارت روزمره", type = "BANK", initialBalance = 20_000_000L, isSavings = false)
        val cashWallet = Account(id = 2L, name = "کیف پول نقد", type = "CASH", initialBalance = 5_000_000L, isSavings = false)
        val savingsVault = Account(id = 3L, name = "صندوق پس‌انداز", type = "BANK", initialBalance = 80_000_000L, isSavings = true)

        val accounts = listOf(everydayCard, cashWallet, savingsVault)

        val spendableTotal = accounts.filter { !it.isSavings }.sumOf { it.initialBalance }
        val savingsTotal = accounts.filter { it.isSavings }.sumOf { it.initialBalance }

        assertEquals(25_000_000L, spendableTotal) // 2.5 million toman
        assertEquals(80_000_000L, savingsTotal)   // 8.0 million toman
    }

    @Test
    fun `toggle isSavings preserves account initial balance and properties`() {
        val original = Account(
            id = 1L,
            name = "حساب حقوق",
            type = "BANK",
            initialBalance = 15_000_000L,
            cardNumber = "6037991234567890",
            isSavings = false,
        )

        val toggled = original.copy(isSavings = true)

        assertEquals(original.id, toggled.id)
        assertEquals(original.name, toggled.name)
        assertEquals(original.initialBalance, toggled.initialBalance)
        assertEquals(original.cardNumber, toggled.cardNumber)
        assertTrue(toggled.isSavings)
    }
}
