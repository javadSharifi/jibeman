package ir.jibeman.feature

import ir.jibeman.core.db.TxType

sealed interface Route {
    data object Home : Route
    data class Txns(val accountId: Long = 0) : Route // accountId != 0 => pushed "account statement"
    data object Accounts : Route
    data object More : Route
    data class AccountDetail(val id: Long) : Route
    data class EditAccount(val id: Long) : Route // 0 = new
    data object Categories : Route
    data object Backup : Route
    data object Security : Route
    data object SmsReview : Route
    data object Loans : Route
    data class LoanDetail(val id: Long) : Route
    data class EditLoan(val id: Long) : Route
    data object Debts : Route
    data class DebtDetail(val id: Long) : Route
    data object Rules : Route
    data object Goals : Route
    data class GoalDetail(val id: Long) : Route
    data object People : Route
    data class PersonDetail(val id: Long) : Route
    data object Splits : Route
    data class SplitDetail(val id: Long) : Route
}

/** Index in the dock, or -1 for pushed screens. */
val Route.tab: Int
    get() = when (this) {
        Route.Home -> 0
        is Route.Txns -> if (accountId == 0L) 1 else -1
        Route.Accounts -> 2
        Route.More -> 3
        else -> -1
    }

/** Opens the quick-add sheet. txnId != 0 edits an existing transaction. */
data class AddReq(val type: String = TxType.EXPENSE, val txnId: Long = 0, val accountId: Long = 0)
