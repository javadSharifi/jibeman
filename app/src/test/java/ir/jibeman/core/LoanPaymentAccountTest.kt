package ir.jibeman.core

import ir.jibeman.core.db.Loan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LoanPaymentAccountTest {
    private val loan = Loan(
        title = "وام", lender = null, principal = 20000, installment = 10000,
        count = 2, firstDueAt = 0, accountId = 2,
    )

    @Test fun keepsLegacyPaymentAccount() {
        assertEquals(2L, loan.suggestedPaymentAccount(listOf(1L, 2L)))
    }

    @Test fun fallsBackToAvailableReceivingAccount() {
        val withReceivingAccount = loan.copy(receiveAccountId = 1)
        assertEquals(1L, withReceivingAccount.suggestedPaymentAccount(listOf(1L)))
    }

    @Test fun requiresExplicitChoiceWhenNeitherLoanAccountIsAvailable() {
        assertNull(loan.suggestedPaymentAccount(listOf(1L)))
    }
}
