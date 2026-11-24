package ir.jibeman.core.db

import android.content.Context
import androidx.room.AutoMigration
import androidx.room.ColumnInfo
import androidx.room.migration.AutoMigrationSpec
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Delete
import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Transaction
import androidx.room.Upsert
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.flow.Flow
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory

// All money columns are rial (Long). All times are epoch millis.

object TxType {
    const val EXPENSE = "EXPENSE"
    const val INCOME = "INCOME"
    const val TRANSFER = "TRANSFER"
    const val ADJUST = "ADJUST" // signed amount; corrects a balance to what the bank says
    const val DEBT = "DEBT" // signed; money lent/borrowed/repaid: moves the balance but is not income or expense
    val all = setOf(EXPENSE, INCOME, TRANSFER, ADJUST, DEBT)
}

object AccType {
    const val BANK = "BANK"
    const val CASH = "CASH"
    const val WALLET = "WALLET"
    val all = setOf(BANK, CASH, WALLET)
}

@Entity(tableName = "account")
data class Account(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val type: String,
    val bankCode: String? = null,
    val accountNo: String? = null,
    val initialBalance: Long = 0,
    val style: Int = 0, // card gradient variant 0..2
    val archived: Boolean = false,
    val sortOrder: Int = 0,
    @ColumnInfo(defaultValue = "NULL") val cardNumber: String? = null,
    @ColumnInfo(defaultValue = "NULL") val cardExpiry: String? = null,
    @ColumnInfo(defaultValue = "NULL") val cardCvv2: String? = null,
    @ColumnInfo(defaultValue = "NULL") val iban: String? = null,
    @ColumnInfo(defaultValue = "NULL") val cardColor: Long? = null,
    @ColumnInfo(defaultValue = "0") val isSavings: Boolean = false,
)

@Entity(
    tableName = "card",
    foreignKeys = [ForeignKey(entity = Account::class, parentColumns = ["id"], childColumns = ["accountId"], onDelete = ForeignKey.CASCADE)],
    indices = [Index("accountId"), Index("last4")],
)
data class Card(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val accountId: Long,
    val last4: String,
)

@Entity(tableName = "category")
data class Category(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val kind: String, // EXPENSE / INCOME
    val icon: String,
    val color: Int, // index into C.cat
    val sortOrder: Int = 0,
)

@Entity(
    tableName = "txn",
    foreignKeys = [
        ForeignKey(entity = Account::class, parentColumns = ["id"], childColumns = ["accountId"], onDelete = ForeignKey.CASCADE),
        ForeignKey(entity = Account::class, parentColumns = ["id"], childColumns = ["toAccountId"], onDelete = ForeignKey.CASCADE),
        ForeignKey(entity = Category::class, parentColumns = ["id"], childColumns = ["categoryId"], onDelete = ForeignKey.SET_NULL),
    ],
    indices = [Index("accountId"), Index("toAccountId"), Index("categoryId"), Index("occurredAt")],
)
data class Txn(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val type: String,
    val amount: Long,
    val accountId: Long,
    val toAccountId: Long? = null,
    val categoryId: Long? = null,
    val title: String? = null,
    val note: String? = null,
    val refNo: String? = null,
    val balanceAfter: Long? = null, // balance reported by the bank SMS (phase 2)
    val occurredAt: Long,
    val source: String = "MANUAL", // MANUAL / SMS / NOTIF / IMPORT
    val createdAt: Long = System.currentTimeMillis(),
)

/** A bank SMS that parsed as a transaction. Body is kept only while PENDING, then cleared. */
@Entity(tableName = "raw_message", indices = [Index(value = ["hash"], unique = true), Index("status")])
data class RawMessage(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val bank: String,
    val sender: String,
    val body: String,
    val hash: String,
    val receivedAt: Long,
    val occurredAt: Long,
    val type: String,
    val amount: Long,
    val balance: Long?,
    val card4: String?,
    val accountNo: String?,
    val description: String?,
    val accountId: Long?,
    val categoryId: Long?,
    val confidence: Int,
    val status: String, // PENDING / ACCEPTED / REJECTED
    val txnId: Long? = null,
)

/** All set conditions must hold (AND). Action: set category, or ignore the SMS. See [Rules.matches]. */
@Entity(
    tableName = "rule",
    foreignKeys = [ForeignKey(entity = Category::class, parentColumns = ["id"], childColumns = ["categoryId"], onDelete = ForeignKey.CASCADE)],
    indices = [Index("categoryId")],
)
data class Rule(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val contains: String, // "" = any text
    val categoryId: Long?,
    @ColumnInfo(defaultValue = "") val bank: String = "", // "" = any bank
    @ColumnInfo(defaultValue = "") val type: String = "", // "" / INCOME / EXPENSE
    val minAmount: Long? = null, // rial, inclusive
    val maxAmount: Long? = null,
    @ColumnInfo(defaultValue = "0") val ignore: Boolean = false,
    @ColumnInfo(defaultValue = "1") val enabled: Boolean = true,
)

/** A loan repaid in fixed installments (amounts as printed by the bank; we don't guess interest). */
@Entity(
    tableName = "loan",
    foreignKeys = [
        ForeignKey(entity = Account::class, parentColumns = ["id"], childColumns = ["accountId"], onDelete = ForeignKey.SET_NULL),
        ForeignKey(entity = Account::class, parentColumns = ["id"], childColumns = ["receiveAccountId"], onDelete = ForeignKey.SET_NULL),
    ],
    indices = [Index("accountId"), Index("receiveAccountId")],
)
data class Loan(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val lender: String?,
    val principal: Long,
    val installment: Long,
    val count: Int,
    val firstDueAt: Long,
    val accountId: Long?, // default account installments are paid from
    val note: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val receiveAccountId: Long? = null,
) {
    fun suggestedPaymentAccount(availableIds: Collection<Long>): Long? =
        accountId?.takeIf { it in availableIds } ?: receiveAccountId?.takeIf { it in availableIds }
}

/** Paid exactly when [paidTxnId] is set; deleting that transaction un-pays it (FK SET_NULL). */
@Entity(
    tableName = "installment",
    foreignKeys = [
        ForeignKey(entity = Loan::class, parentColumns = ["id"], childColumns = ["loanId"], onDelete = ForeignKey.CASCADE),
        ForeignKey(entity = Txn::class, parentColumns = ["id"], childColumns = ["paidTxnId"], onDelete = ForeignKey.SET_NULL),
    ],
    indices = [Index("loanId"), Index("dueAt"), Index("paidTxnId")],
)
data class Installment(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val loanId: Long,
    val n: Int,
    val dueAt: Long,
    val amount: Long,
    val paidTxnId: Long? = null,
    val paidAt: Long? = null,
)

object DebtDir {
    const val OWED_TO_ME = "OWED_TO_ME" // طلب
    const val I_OWE = "I_OWE" // بدهی
}

@Entity(tableName = "person")
data class Person(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val phone: String? = null,
    val cardNo: String? = null,
    val note: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
)

@Entity(
    tableName = "debt",
    foreignKeys = [ForeignKey(entity = Person::class, parentColumns = ["id"], childColumns = ["personId"], onDelete = ForeignKey.SET_NULL)],
    indices = [Index("personId")],
)
data class Debt(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val direction: String,
    val person: String, // display name, kept even if the person is deleted
    val amount: Long,
    val dueAt: Long?,
    val note: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val personId: Long? = null,
)

/** A savings goal is an envelope: money stays in the accounts, entries only track what's set aside. */
@Entity(tableName = "goal")
data class Goal(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val target: Long,
    val dueAt: Long?,
    val icon: String = "target",
    val color: Int = 4,
    val closed: Boolean = false,
    val createdAt: Long = System.currentTimeMillis(),
)

@Entity(
    tableName = "goal_entry",
    foreignKeys = [ForeignKey(entity = Goal::class, parentColumns = ["id"], childColumns = ["goalId"], onDelete = ForeignKey.CASCADE)],
    indices = [Index("goalId")],
)
data class GoalEntry(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val goalId: Long,
    val amount: Long, // signed: + set aside, - taken out
    val at: Long,
)

data class GoalRow(@Embedded val goal: Goal, val saved: Long, val recent: Long) // recent = net set aside in the last 90 days

@Entity(tableName = "split_group")
data class SplitGroup(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val closed: Boolean = false,
    val createdAt: Long = System.currentTimeMillis(),
)

/** personId null = me. */
@Entity(
    tableName = "split_member",
    foreignKeys = [
        ForeignKey(entity = SplitGroup::class, parentColumns = ["id"], childColumns = ["groupId"], onDelete = ForeignKey.CASCADE),
        ForeignKey(entity = Person::class, parentColumns = ["id"], childColumns = ["personId"], onDelete = ForeignKey.CASCADE),
    ],
    indices = [Index("groupId"), Index("personId")],
)
data class SplitMember(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val groupId: Long,
    val personId: Long?,
)

@Entity(
    tableName = "split_expense",
    foreignKeys = [
        ForeignKey(entity = SplitGroup::class, parentColumns = ["id"], childColumns = ["groupId"], onDelete = ForeignKey.CASCADE),
        ForeignKey(entity = SplitMember::class, parentColumns = ["id"], childColumns = ["payerId"], onDelete = ForeignKey.CASCADE),
    ],
    indices = [Index("groupId"), Index("payerId")],
)
data class SplitExpense(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val groupId: Long,
    val title: String,
    val amount: Long,
    val payerId: Long,
    val at: Long,
    val settlement: Boolean = false, // a repayment between members, not a shared cost
)

@Entity(
    tableName = "split_share",
    foreignKeys = [
        ForeignKey(entity = SplitExpense::class, parentColumns = ["id"], childColumns = ["expenseId"], onDelete = ForeignKey.CASCADE),
        ForeignKey(entity = SplitMember::class, parentColumns = ["id"], childColumns = ["memberId"], onDelete = ForeignKey.CASCADE),
    ],
    indices = [Index("expenseId"), Index("memberId")],
)
data class SplitShare(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val expenseId: Long,
    val memberId: Long,
    val amount: Long,
)

data class MemberRow(@Embedded val m: SplitMember, val name: String?)

data class GroupRow(@Embedded val g: SplitGroup, val members: Int, val total: Long)

data class PersonRow(@Embedded val p: Person, val owedToMe: Long, val iOwe: Long)

@Entity(
    tableName = "debt_payment",
    foreignKeys = [
        ForeignKey(entity = Debt::class, parentColumns = ["id"], childColumns = ["debtId"], onDelete = ForeignKey.CASCADE),
        ForeignKey(entity = Txn::class, parentColumns = ["id"], childColumns = ["txnId"], onDelete = ForeignKey.SET_NULL),
    ],
    indices = [Index("debtId"), Index("txnId")],
)
data class DebtPayment(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val debtId: Long,
    val amount: Long,
    val at: Long,
    val txnId: Long?,
)

@Entity(
    tableName = "savings_commitment",
    foreignKeys = [
        ForeignKey(entity = Account::class, parentColumns = ["id"], childColumns = ["accountId"], onDelete = ForeignKey.CASCADE),
        ForeignKey(entity = Txn::class, parentColumns = ["id"], childColumns = ["txnId"], onDelete = ForeignKey.CASCADE),
    ],
    indices = [Index("accountId"), Index("txnId")],
)
data class SavingsCommitment(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val accountId: Long,
    val txnId: Long? = null,
    val amount: Long,
    @ColumnInfo(defaultValue = "0") val paidAmount: Long = 0,
    val note: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
)

@Entity(
    tableName = "savings_payment",
    foreignKeys = [
        ForeignKey(entity = SavingsCommitment::class, parentColumns = ["id"], childColumns = ["commitmentId"], onDelete = ForeignKey.CASCADE),
        ForeignKey(entity = Txn::class, parentColumns = ["id"], childColumns = ["txnId"], onDelete = ForeignKey.SET_NULL),
    ],
    indices = [Index("commitmentId"), Index("txnId")],
)
data class SavingsPayment(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val commitmentId: Long,
    val amount: Long,
    val at: Long,
    val txnId: Long? = null,
)

data class LoanRow(
    @Embedded val loan: Loan,
    val paidCount: Int,
    val nextDue: Long?,
    val nextAmount: Long?,
)

data class InstallmentRow(
    @Embedded val i: Installment,
    val txnPaidAt: Long?,
    val loanTitle: String,
) {
    val paidAt: Long? get() = txnPaidAt ?: i.paidAt
    val isPaid: Boolean get() = i.paidTxnId != null || i.paidAt != null
}

data class DebtRow(@Embedded val debt: Debt, val remaining: Long)

data class RawRow(
    @Embedded val raw: RawMessage,
    val accountName: String?,
    val categoryName: String?,
    val categoryIcon: String?,
    val categoryColor: Int?,
)

/** Latest bank-reported balance of an account vs. what the app computes at that moment. */
data class BalanceCheck(val accountId: Long, val accountName: String, val at: Long, val bank: Long, val app: Long)

data class AccountBalance(
    @Embedded val account: Account,
    val balance: Long,
    val last4: String?,
)

data class Totals(val income: Long, val expense: Long, val count: Int)

data class TxnRow(
    @Embedded val txn: Txn,
    val accountName: String,
    val toAccountName: String?,
    val categoryName: String?,
    val categoryIcon: String?,
    val categoryColor: Int?,
)

private const val ROWS = """SELECT t.*, a.name AS accountName, ta.name AS toAccountName,
    c.name AS categoryName, c.icon AS categoryIcon, c.color AS categoryColor
    FROM txn t JOIN account a ON a.id = t.accountId
    LEFT JOIN account ta ON ta.id = t.toAccountId
    LEFT JOIN category c ON c.id = t.categoryId"""

// Balance is never stored: initial + signed sum of its transactions, so it can't drift.
private const val BALANCES = """SELECT a.*,
    a.initialBalance
    + COALESCE((SELECT SUM(CASE t.type WHEN 'INCOME' THEN t.amount WHEN 'ADJUST' THEN t.amount WHEN 'DEBT' THEN t.amount ELSE -t.amount END)
                FROM txn t WHERE t.accountId = a.id), 0)
    + COALESCE((SELECT SUM(t.amount) FROM txn t WHERE t.toAccountId = a.id AND t.type = 'TRANSFER'), 0) AS balance,
    (SELECT last4 FROM card WHERE accountId = a.id ORDER BY id LIMIT 1) AS last4
    FROM account a WHERE a.archived = 0 ORDER BY a.sortOrder, a.id"""

@Dao
interface JDao {
    @Query(BALANCES) fun balances(): Flow<List<AccountBalance>>
    @Query("SELECT * FROM account WHERE id = :id") suspend fun account(id: Long): Account?
    @Query("SELECT * FROM card WHERE accountId = :id ORDER BY id") suspend fun cards(id: Long): List<Card>
    @Upsert suspend fun upsertAccount(a: Account): Long
    @Delete suspend fun deleteAccount(a: Account)
    @Query("DELETE FROM card WHERE accountId = :id") suspend fun deleteCards(id: Long)
    @Insert suspend fun insertCards(c: List<Card>)

    @Transaction
    suspend fun saveAccount(a: Account, last4s: List<String>): Long {
        val r = upsertAccount(a)
        val id = if (a.id == 0L) r else a.id
        deleteCards(id)
        val allLast4s = last4s.toMutableList()
        a.cardNumber?.let {
            val d = it.filter(Char::isDigit)
            if (d.length >= 4) {
                val l4 = d.takeLast(4)
                if (l4 !in allLast4s) allLast4s.add(0, l4)
            }
        }
        insertCards(allLast4s.distinct().map { Card(accountId = id, last4 = it) })
        return id
    }

    @Query("SELECT * FROM category WHERE kind = :kind ORDER BY sortOrder, id") fun categories(kind: String): Flow<List<Category>>
    @Upsert suspend fun upsertCategory(c: Category)
    @Delete suspend fun deleteCategory(c: Category)

    @Upsert suspend fun upsertTxn(t: Txn)
    @Insert suspend fun insertTxn(t: Txn): Long
    @Query("DELETE FROM txn WHERE id = :id") suspend fun deleteTxn(id: Long)
    @Query("SELECT * FROM txn WHERE id = :id") suspend fun txn(id: Long): Txn?

    @Query(
        "$ROWS WHERE t.occurredAt >= :from AND t.occurredAt < :to AND (:type = '' OR t.type = :type) " +
            "AND (:accountId = 0 OR t.accountId = :accountId OR t.toAccountId = :accountId) " +
            "AND (:q = '' OR t.title LIKE '%' || :q || '%' OR t.note LIKE '%' || :q || '%' OR c.name LIKE '%' || :q || '%' " +
            "OR CAST(ABS(t.amount) / 10 AS TEXT) LIKE '%' || :q || '%') ORDER BY t.occurredAt DESC, t.id DESC"
    )
    fun rows(from: Long, to: Long, type: String, accountId: Long, q: String): Flow<List<TxnRow>>

    @Query("$ROWS WHERE (:accountId = 0 OR t.accountId = :accountId OR t.toAccountId = :accountId) ORDER BY t.occurredAt DESC, t.id DESC LIMIT :limit")
    fun recent(accountId: Long, limit: Int): Flow<List<TxnRow>>

    @Query(
        "SELECT COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) AS income, " +
            "COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS expense, COUNT(*) AS count " +
            "FROM txn WHERE occurredAt >= :from AND occurredAt < :to AND (:accountId = 0 OR accountId = :accountId)"
    )
    fun totals(from: Long, to: Long, accountId: Long): Flow<Totals>

    // ---- bank SMS ----
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun insertRaw(r: RawMessage): Long
    @Query("SELECT * FROM raw_message WHERE id = :id") suspend fun raw(id: Long): RawMessage?
    @Query(
        "SELECT r.*, a.name AS accountName, c.name AS categoryName, c.icon AS categoryIcon, c.color AS categoryColor " +
            "FROM raw_message r LEFT JOIN account a ON a.id = r.accountId LEFT JOIN category c ON c.id = r.categoryId " +
            "WHERE r.status = 'PENDING' ORDER BY r.occurredAt DESC"
    )
    fun pending(): Flow<List<RawRow>>
    @Query("SELECT COUNT(*) FROM raw_message WHERE status = 'PENDING'") fun pendingCount(): Flow<Int>
    @Query("UPDATE raw_message SET accountId = :accountId WHERE id = :id") suspend fun setRawAccount(id: Long, accountId: Long)
    @Query("UPDATE raw_message SET categoryId = :categoryId WHERE id = :id") suspend fun setRawCategory(id: Long, categoryId: Long?)
    @Query("UPDATE raw_message SET status = 'REJECTED', body = '' WHERE id = :id") suspend fun rejectRaw(id: Long)
    @Query("UPDATE raw_message SET status = 'ACCEPTED', body = '', txnId = :txnId WHERE id = :id") suspend fun markAccepted(id: Long, txnId: Long)
    @Query(
        "SELECT c.accountId FROM card c JOIN account a ON a.id = c.accountId " +
            "WHERE c.last4 = :last4 AND a.bankCode = :bank AND a.archived = 0 ORDER BY c.id LIMIT 1"
    )
    suspend fun accountByCard(last4: String, bank: String): Long?

    /** Turns a pending SMS into a real transaction, atomically. */
    @Transaction
    suspend fun acceptRaw(r: RawMessage, accountId: Long, categoryId: Long?): Long {
        val id = insertTxn(
            Txn(
                type = r.type, amount = r.amount, accountId = accountId, categoryId = categoryId, title = r.description,
                refNo = r.accountNo, balanceAfter = r.balance, occurredAt = r.occurredAt, source = "SMS",
            )
        )
        markAccepted(r.id, id)
        return id
    }

    @Query("SELECT * FROM rule WHERE enabled = 1 ORDER BY ignore DESC, length(contains) DESC, id") suspend fun rules(): List<Rule>
    @Query("SELECT * FROM rule ORDER BY id DESC") fun allRulesFlow(): Flow<List<Rule>>
    @Upsert suspend fun upsertRule(r: Rule)
    @Delete suspend fun deleteRule(r: Rule)
    @Query("SELECT EXISTS(SELECT 1 FROM rule WHERE contains = :contains AND bank = '' AND type = '' AND minAmount IS NULL AND maxAmount IS NULL)")
    suspend fun simpleRuleExists(contains: String): Boolean
    @Query("SELECT * FROM txn WHERE categoryId IS NULL AND type IN ('INCOME', 'EXPENSE')") suspend fun uncategorized(): List<Txn>
    @Query("UPDATE txn SET categoryId = :categoryId WHERE id IN (:ids)") suspend fun setCategory(ids: List<Long>, categoryId: Long)
    @Query(
        "UPDATE raw_message SET categoryId = :categoryId WHERE status = 'PENDING' AND categoryId IS NULL " +
            "AND description LIKE '%' || :contains || '%'"
    )
    suspend fun applyRuleToPending(contains: String, categoryId: Long)

    @Query(
        """SELECT a.id AS accountId, a.name AS accountName, t.occurredAt AS at, t.balanceAfter AS bank,
        a.initialBalance
        + COALESCE((SELECT SUM(CASE x.type WHEN 'INCOME' THEN x.amount WHEN 'ADJUST' THEN x.amount WHEN 'DEBT' THEN x.amount ELSE -x.amount END)
                    FROM txn x WHERE x.accountId = a.id AND x.occurredAt <= t.occurredAt), 0)
        + COALESCE((SELECT SUM(x.amount) FROM txn x WHERE x.toAccountId = a.id AND x.type = 'TRANSFER' AND x.occurredAt <= t.occurredAt), 0) AS app
        FROM account a JOIN txn t ON t.id = (SELECT y.id FROM txn y WHERE y.accountId = a.id AND y.balanceAfter IS NOT NULL
                                             ORDER BY y.occurredAt DESC, y.id DESC LIMIT 1)
        WHERE a.archived = 0"""
    )
    fun balanceChecks(): Flow<List<BalanceCheck>>

    // ---- loans ----
    @Query(
        "SELECT l.*, " +
            "(SELECT COUNT(*) FROM installment i WHERE i.loanId = l.id AND (i.paidTxnId IS NOT NULL OR i.paidAt IS NOT NULL)) AS paidCount, " +
            "(SELECT MIN(i.dueAt) FROM installment i WHERE i.loanId = l.id AND i.paidTxnId IS NULL AND i.paidAt IS NULL) AS nextDue, " +
            "(SELECT i.amount FROM installment i WHERE i.loanId = l.id AND i.paidTxnId IS NULL AND i.paidAt IS NULL ORDER BY i.dueAt LIMIT 1) AS nextAmount " +
            "FROM loan l ORDER BY nextDue IS NULL, nextDue"
    )
    fun loans(): Flow<List<LoanRow>>
    @Query("SELECT * FROM loan WHERE id = :id") suspend fun loan(id: Long): Loan?
    @Query("SELECT i.*, t.occurredAt AS txnPaidAt, l.title AS loanTitle FROM installment i JOIN loan l ON l.id = i.loanId LEFT JOIN txn t ON t.id = i.paidTxnId WHERE i.loanId = :loanId ORDER BY i.n")
    fun installments(loanId: Long): Flow<List<InstallmentRow>>
    @Query("SELECT i.*, NULL AS txnPaidAt, l.title AS loanTitle FROM installment i JOIN loan l ON l.id = i.loanId WHERE i.paidTxnId IS NULL AND i.paidAt IS NULL ORDER BY i.dueAt LIMIT 1")
    fun nextInstallment(): Flow<InstallmentRow?>
    @Query("SELECT i.*, NULL AS txnPaidAt, l.title AS loanTitle FROM installment i JOIN loan l ON l.id = i.loanId WHERE i.paidTxnId IS NULL AND i.paidAt IS NULL AND i.dueAt < :until ORDER BY i.dueAt")
    suspend fun installmentsDueBefore(until: Long): List<InstallmentRow>
    @Insert suspend fun insertLoan(l: Loan): Long
    @Upsert suspend fun upsertLoan(l: Loan)
    @Delete suspend fun deleteLoan(l: Loan)
    @Insert suspend fun insertInstallments(i: List<Installment>)
    @Query("DELETE FROM installment WHERE loanId = :loanId AND paidTxnId IS NULL AND paidAt IS NULL") suspend fun deleteUnpaidInstallments(loanId: Long)
    @Query("SELECT * FROM installment WHERE loanId = :loanId ORDER BY n") suspend fun loanInstallments(loanId: Long): List<Installment>
    @Query("SELECT * FROM installment WHERE id = :id") suspend fun installment(id: Long): Installment?
    @Query("UPDATE installment SET paidTxnId = :txnId WHERE id = :id") suspend fun setInstallmentPaid(id: Long, txnId: Long)
    @Query("UPDATE installment SET paidAt = NULL WHERE id = :id AND paidTxnId IS NULL") suspend fun unmarkInstallmentPaid(id: Long)
    @Query("SELECT id FROM category WHERE kind = 'EXPENSE' AND icon = 'bank' ORDER BY id LIMIT 1") suspend fun loanCategory(): Long?

    @Transaction
    suspend fun saveLoan(l: Loan, schedule: List<Installment>, receivedInto: Long?): Long {
        val id = if (l.id == 0L) insertLoan(l) else l.id.also { upsertLoan(l); deleteUnpaidInstallments(it) }
        val paidNs = if (l.id == 0L) emptySet() else allInstallments().filter { it.loanId == id && (it.paidTxnId != null || it.paidAt != null) }.map { it.n }.toSet()
        insertInstallments(schedule.filter { it.n !in paidNs }.map { it.copy(loanId = id) })
        if (receivedInto != null) insertTxn(Txn(type = TxType.DEBT, amount = l.principal, accountId = receivedInto, title = "دریافت وام · ${l.title}", occurredAt = System.currentTimeMillis()))
        return id
    }

    @Transaction
    suspend fun payInstallment(installmentId: Long, accountId: Long, at: Long, title: String): Long? {
        val i = installment(installmentId) ?: return null
        i.paidTxnId?.let { return it }
        if (account(accountId)?.archived != false) return null
        val id = insertTxn(Txn(type = TxType.EXPENSE, amount = i.amount, accountId = accountId, categoryId = loanCategory(), title = title, occurredAt = at))
        setInstallmentPaid(i.id, id)
        return id
    }

    // ---- debts ----
    @Query(
        "SELECT d.*, d.amount - COALESCE((SELECT SUM(p.amount) FROM debt_payment p WHERE p.debtId = d.id), 0) AS remaining " +
            "FROM debt d WHERE d.direction = :direction ORDER BY remaining = 0, d.dueAt IS NULL, d.dueAt, d.createdAt DESC"
    )
    fun debts(direction: String): Flow<List<DebtRow>>
    @Query("SELECT d.*, d.amount - COALESCE((SELECT SUM(p.amount) FROM debt_payment p WHERE p.debtId = d.id), 0) AS remaining FROM debt d WHERE d.id = :id")
    fun debt(id: Long): Flow<DebtRow?>
    @Query(
        "SELECT * FROM (SELECT d.*, d.amount - COALESCE((SELECT SUM(p.amount) FROM debt_payment p WHERE p.debtId = d.id), 0) AS remaining FROM debt d) " +
            "WHERE remaining > 0 AND dueAt IS NOT NULL AND dueAt < :until ORDER BY dueAt"
    )
    suspend fun debtsDueBefore(until: Long): List<DebtRow>
    @Query(
        "SELECT * FROM (SELECT d.*, d.amount - COALESCE((SELECT SUM(p.amount) FROM debt_payment p WHERE p.debtId = d.id), 0) AS remaining FROM debt d) " +
            "WHERE remaining > 0 AND dueAt IS NOT NULL ORDER BY dueAt LIMIT 1"
    )
    fun nextDebt(): Flow<DebtRow?>
    @Query("SELECT * FROM debt_payment WHERE debtId = :id ORDER BY at DESC") fun payments(id: Long): Flow<List<DebtPayment>>
    @Insert suspend fun insertDebt(d: Debt): Long
    @Upsert suspend fun upsertDebt(d: Debt)
    @Delete suspend fun deleteDebt(d: Debt)
    @Insert suspend fun insertPayment(p: DebtPayment): Long
    @Delete suspend fun deletePayment(p: DebtPayment)

    /** New debt; if an account is given, the money actually moved (lent out / borrowed in). */
    @Transaction
    suspend fun createDebt(d: Debt, accountId: Long?): Long {
        val id = insertDebt(d)
        if (accountId != null) {
            val out = d.direction == DebtDir.OWED_TO_ME
            insertTxn(Txn(type = TxType.DEBT, amount = if (out) -d.amount else d.amount, accountId = accountId,
                title = if (out) "قرض به ${d.person}" else "قرض از ${d.person}", occurredAt = System.currentTimeMillis()))
        }
        return id
    }

    @Transaction
    suspend fun addPayment(d: Debt, amount: Long, at: Long, accountId: Long?) {
        val incoming = d.direction == DebtDir.OWED_TO_ME
        val txnId = accountId?.let {
            insertTxn(Txn(type = TxType.DEBT, amount = if (incoming) amount else -amount, accountId = it,
                title = if (incoming) "دریافت طلب از ${d.person}" else "پرداخت بدهی به ${d.person}", occurredAt = at))
        }
        insertPayment(DebtPayment(debtId = d.id, amount = amount, at = at, txnId = txnId))
    }

    // ---- people ----
    @Query(
        "SELECT p.*, " +
            "COALESCE((SELECT SUM(d.amount - COALESCE((SELECT SUM(x.amount) FROM debt_payment x WHERE x.debtId = d.id), 0)) FROM debt d WHERE d.personId = p.id AND d.direction = 'OWED_TO_ME'), 0) AS owedToMe, " +
            "COALESCE((SELECT SUM(d.amount - COALESCE((SELECT SUM(x.amount) FROM debt_payment x WHERE x.debtId = d.id), 0)) FROM debt d WHERE d.personId = p.id AND d.direction = 'I_OWE'), 0) AS iOwe " +
            "FROM person p ORDER BY p.name"
    )
    fun people(): Flow<List<PersonRow>>
    @Query("SELECT * FROM person WHERE id = :id") fun person(id: Long): Flow<Person?>
    @Query("SELECT * FROM person WHERE name = :name COLLATE NOCASE LIMIT 1") suspend fun personByName(name: String): Person?
    @Insert suspend fun insertPerson(p: Person): Long
    @Upsert suspend fun upsertPerson(p: Person)
    @Delete suspend fun deletePerson(p: Person)
    @Query("UPDATE debt SET person = :name WHERE personId = :id") suspend fun renameInDebts(id: Long, name: String)
    @Query("SELECT EXISTS(SELECT 1 FROM split_member WHERE personId = :id)") suspend fun inGroups(id: Long): Boolean
    @Query(
        "SELECT d.*, d.amount - COALESCE((SELECT SUM(p.amount) FROM debt_payment p WHERE p.debtId = d.id), 0) AS remaining " +
            "FROM debt d WHERE d.personId = :personId ORDER BY remaining = 0, d.createdAt DESC"
    )
    fun debtsOf(personId: Long): Flow<List<DebtRow>>

    @Transaction
    suspend fun personFor(name: String): Long = personByName(name.trim())?.id ?: insertPerson(Person(name = name.trim()))

    // ---- goals ----
    @Query(
        "SELECT g.*, COALESCE((SELECT SUM(e.amount) FROM goal_entry e WHERE e.goalId = g.id), 0) AS saved, " +
            "COALESCE((SELECT SUM(e.amount) FROM goal_entry e WHERE e.goalId = g.id AND e.at >= :since), 0) AS recent " +
            "FROM goal g ORDER BY g.closed, g.dueAt IS NULL, g.dueAt, g.createdAt"
    )
    fun goals(since: Long): Flow<List<GoalRow>>
    @Query("SELECT * FROM goal_entry WHERE goalId = :id ORDER BY at DESC, id DESC") fun goalEntries(id: Long): Flow<List<GoalEntry>>
    @Upsert suspend fun upsertGoal(g: Goal)
    @Delete suspend fun deleteGoal(g: Goal)
    @Insert suspend fun insertGoalEntry(e: GoalEntry)
    @Delete suspend fun deleteGoalEntry(e: GoalEntry)

    // ---- split ----
    @Query(
        "SELECT g.*, (SELECT COUNT(*) FROM split_member m WHERE m.groupId = g.id) AS members, " +
            "COALESCE((SELECT SUM(e.amount) FROM split_expense e WHERE e.groupId = g.id AND e.settlement = 0), 0) AS total " +
            "FROM split_group g ORDER BY g.closed, g.createdAt DESC"
    )
    fun groups(): Flow<List<GroupRow>>
    @Query("SELECT * FROM split_group WHERE id = :id") fun group(id: Long): Flow<SplitGroup?>
    @Query("SELECT m.*, p.name AS name FROM split_member m LEFT JOIN person p ON p.id = m.personId WHERE m.groupId = :id ORDER BY m.personId IS NOT NULL, m.id")
    fun members(id: Long): Flow<List<MemberRow>>
    @Query("SELECT * FROM split_expense WHERE groupId = :id ORDER BY at DESC, id DESC") fun expenses(id: Long): Flow<List<SplitExpense>>
    @Query("SELECT s.* FROM split_share s JOIN split_expense e ON e.id = s.expenseId WHERE e.groupId = :id") fun shares(id: Long): Flow<List<SplitShare>>
    @Insert suspend fun insertGroup(g: SplitGroup): Long
    @Upsert suspend fun upsertGroup(g: SplitGroup)
    @Delete suspend fun deleteGroup(g: SplitGroup)
    @Insert suspend fun insertMember(m: SplitMember): Long
    @Insert suspend fun insertSplitExpense(e: SplitExpense): Long
    @Insert suspend fun insertShares(s: List<SplitShare>)
    @Delete suspend fun deleteSplitExpense(e: SplitExpense)

    @Transaction
    suspend fun createGroup(title: String, personIds: List<Long>): Long {
        val id = insertGroup(SplitGroup(title = title))
        insertMember(SplitMember(groupId = id, personId = null))
        personIds.distinct().forEach { insertMember(SplitMember(groupId = id, personId = it)) }
        return id
    }

    /** Shared cost. If I paid from an account: my share is an expense, the rest is money lent (DEBT), so reports stay honest. */
    @Transaction
    suspend fun addSplitExpense(e: SplitExpense, shares: Map<Long, Long>, myShare: Long, accountId: Long?, categoryId: Long?) {
        val id = insertSplitExpense(e)
        insertShares(shares.map { (m, a) -> SplitShare(expenseId = id, memberId = m, amount = a) })
        if (accountId != null) {
            if (myShare > 0) insertTxn(Txn(type = TxType.EXPENSE, amount = myShare, accountId = accountId, categoryId = categoryId, title = e.title, occurredAt = e.at))
            if (e.amount - myShare > 0) insertTxn(Txn(type = TxType.DEBT, amount = -(e.amount - myShare), accountId = accountId, title = "سهم دیگران · ${e.title}", occurredAt = e.at))
        }
    }

    /** Settlement from -> to, recorded as a payment by `from` whose whole share belongs to `to`. */
    @Transaction
    suspend fun settle(groupId: Long, from: Long, to: Long, amount: Long, at: Long, accountId: Long?, meIsFrom: Boolean, meIsTo: Boolean, title: String) {
        val id = insertSplitExpense(SplitExpense(groupId = groupId, title = "تسویه", amount = amount, payerId = from, at = at, settlement = true))
        insertShares(listOf(SplitShare(expenseId = id, memberId = to, amount = amount)))
        // shortcut: paying my dues counts as expense, receiving counts as repaid loan; exact when settling only own shares
        if (accountId != null && meIsFrom) insertTxn(Txn(type = TxType.EXPENSE, amount = amount, accountId = accountId, title = title, occurredAt = at))
        if (accountId != null && meIsTo) insertTxn(Txn(type = TxType.DEBT, amount = amount, accountId = accountId, title = title, occurredAt = at))
    }

    // ---- savings commitments ----
    @Query("SELECT * FROM savings_commitment WHERE accountId = :accountId ORDER BY createdAt DESC, id DESC")
    fun savingsCommitments(accountId: Long): Flow<List<SavingsCommitment>>

    @Query("SELECT * FROM savings_commitment WHERE accountId = :accountId AND paidAmount < amount ORDER BY createdAt ASC, id ASC")
    suspend fun openSavingsCommitments(accountId: Long): List<SavingsCommitment>

    @Query("SELECT COALESCE(SUM(amount - paidAmount), 0) FROM savings_commitment WHERE accountId = :accountId")
    fun returnableBalance(accountId: Long): Flow<Long>

    @Query("SELECT * FROM savings_commitment WHERE id = :id")
    suspend fun savingsCommitment(id: Long): SavingsCommitment?

    @Insert suspend fun insertSavingsCommitment(c: SavingsCommitment): Long
    @Upsert suspend fun upsertSavingsCommitment(c: SavingsCommitment)
    @Delete suspend fun deleteSavingsCommitment(c: SavingsCommitment)
    @Query("DELETE FROM savings_commitment WHERE id = :id") suspend fun deleteSavingsCommitment(id: Long)

    @Query("SELECT * FROM savings_payment WHERE commitmentId = :commitmentId ORDER BY at DESC")
    fun savingsPayments(commitmentId: Long): Flow<List<SavingsPayment>>

    @Insert suspend fun insertSavingsPayment(p: SavingsPayment): Long
    @Delete suspend fun deleteSavingsPayment(p: SavingsPayment)

    @Query("SELECT * FROM savings_commitment") suspend fun allSavingsCommitments(): List<SavingsCommitment>
    @Query("SELECT * FROM savings_payment") suspend fun allSavingsPayments(): List<SavingsPayment>
    @Query("DELETE FROM savings_commitment") suspend fun clearSavingsCommitments()
    @Query("DELETE FROM savings_payment") suspend fun clearSavingsPayments()
    @Insert suspend fun insertSavingsCommitments(c: List<SavingsCommitment>)
    @Insert suspend fun insertSavingsPayments(p: List<SavingsPayment>)

    @Transaction
    suspend fun returnSavings(commitmentId: Long?, savingsAccountId: Long, sourceAccountId: Long, returnRial: Long, note: String? = null): Long {
        val now = System.currentTimeMillis()
        val txnId = insertTxn(
            Txn(
                type = TxType.TRANSFER,
                amount = returnRial,
                accountId = sourceAccountId,
                toAccountId = savingsAccountId,
                title = note?.ifBlank { null } ?: "بازگرداندن به پس‌انداز",
                occurredAt = now,
                source = "MANUAL",
            )
        )
        if (commitmentId != null && commitmentId != 0L) {
            savingsCommitment(commitmentId)?.let { c ->
                val newPaid = c.paidAmount + returnRial
                upsertSavingsCommitment(c.copy(paidAmount = newPaid))
                insertSavingsPayment(SavingsPayment(commitmentId = c.id, amount = returnRial, at = now, txnId = txnId))
            }
        } else {
            var rem = returnRial
            val opens = openSavingsCommitments(savingsAccountId)
            for (c in opens) {
                if (rem <= 0L) break
                val needed = c.amount - c.paidAmount
                val pay = minOf(rem, needed)
                upsertSavingsCommitment(c.copy(paidAmount = c.paidAmount + pay))
                insertSavingsPayment(SavingsPayment(commitmentId = c.id, amount = pay, at = now, txnId = txnId))
                rem -= pay
            }
        }
        return txnId
    }

    // backup
    @Query("SELECT * FROM account") suspend fun allAccounts(): List<Account>
    @Query("SELECT * FROM card") suspend fun allCards(): List<Card>
    @Query("SELECT * FROM category") suspend fun allCategories(): List<Category>
    @Query("SELECT * FROM txn") suspend fun allTxns(): List<Txn>
    @Query("SELECT * FROM rule") suspend fun allRules(): List<Rule>
    @Query("SELECT * FROM loan") suspend fun allLoans(): List<Loan>
    @Query("SELECT * FROM installment") suspend fun allInstallments(): List<Installment>
    @Query("SELECT * FROM debt") suspend fun allDebts(): List<Debt>
    @Query("SELECT * FROM debt_payment") suspend fun allPayments(): List<DebtPayment>
    @Query("DELETE FROM loan") suspend fun clearLoans()
    @Query("SELECT * FROM person") suspend fun allPersons(): List<Person>
    @Query("SELECT * FROM goal") suspend fun allGoals(): List<Goal>
    @Query("SELECT * FROM goal_entry") suspend fun allGoalEntries(): List<GoalEntry>
    @Query("SELECT * FROM split_group") suspend fun allGroups(): List<SplitGroup>
    @Query("SELECT * FROM split_member") suspend fun allMembers(): List<SplitMember>
    @Query("SELECT * FROM split_expense") suspend fun allSplitExpenses(): List<SplitExpense>
    @Query("SELECT * FROM split_share") suspend fun allShares(): List<SplitShare>
    @Query("DELETE FROM person") suspend fun clearPersons()
    @Query("DELETE FROM goal") suspend fun clearGoals()
    @Query("DELETE FROM split_group") suspend fun clearGroups()
    @Insert suspend fun insertPersons(p: List<Person>)
    @Insert suspend fun insertGoals(g: List<Goal>)
    @Insert suspend fun insertGoalEntries(e: List<GoalEntry>)
    @Insert suspend fun insertGroups(g: List<SplitGroup>)
    @Insert suspend fun insertMembers(m: List<SplitMember>)
    @Insert suspend fun insertSplitExpenses(e: List<SplitExpense>)
    @Query("DELETE FROM debt") suspend fun clearDebts()
    @Insert suspend fun insertLoans(l: List<Loan>)
    @Insert suspend fun insertDebts(d: List<Debt>)
    @Insert suspend fun insertPayments(p: List<DebtPayment>)
    @Query("DELETE FROM rule") suspend fun clearRules()
    @Query("DELETE FROM raw_message") suspend fun clearRaw()
    @Insert suspend fun insertRules(r: List<Rule>)
    @Query("DELETE FROM txn") suspend fun clearTxns()
    @Query("DELETE FROM card") suspend fun clearCards()
    @Query("DELETE FROM account") suspend fun clearAccounts()
    @Query("DELETE FROM category") suspend fun clearCategories()
    @Insert suspend fun insertAccounts(a: List<Account>)
    @Insert suspend fun insertCategories(c: List<Category>)
    @Insert suspend fun insertTxns(t: List<Txn>)

    /** All-or-nothing: if any row is invalid the transaction rolls back and current data stays. */
    @Transaction
    suspend fun replaceAll(
        accounts: List<Account>, cards: List<Card>, categories: List<Category>, txns: List<Txn>, rules: List<Rule>,
        loans: List<Loan>, installments: List<Installment>, debts: List<Debt>, payments: List<DebtPayment>,
        p4: Phase4 = Phase4(),
    ) {
        clearLoans(); clearDebts() // cascades to installments and payments
        clearGroups(); clearGoals(); clearPersons(); clearSavingsCommitments() // cascades to members, expenses, shares, entries, payments
        clearRaw(); clearRules(); clearTxns(); clearCards(); clearAccounts(); clearCategories()
        insertCategories(categories); insertAccounts(accounts); insertCards(cards); insertTxns(txns); insertRules(rules)
        insertPersons(p4.persons); insertGoals(p4.goals); insertGoalEntries(p4.goalEntries)
        insertLoans(loans); insertInstallments(installments); insertDebts(debts); insertPayments(payments)
        insertGroups(p4.groups); insertMembers(p4.members); insertSplitExpenses(p4.expenses); insertShares(p4.shares)
        insertSavingsCommitments(p4.savingsCommitments); insertSavingsPayments(p4.savingsPayments)
    }
}

@Database(
    entities = [
        Account::class, Card::class, Category::class, Txn::class, RawMessage::class, Rule::class,
        Loan::class, Installment::class, Debt::class, DebtPayment::class,
        Person::class, Goal::class, GoalEntry::class, SplitGroup::class, SplitMember::class, SplitExpense::class, SplitShare::class,
        SavingsCommitment::class, SavingsPayment::class,
    ],
    version = 8, exportSchema = true,
    autoMigrations = [
        AutoMigration(from = 1, to = 2), AutoMigration(from = 2, to = 3, spec = AppDb.V3::class), AutoMigration(from = 3, to = 4, spec = AppDb.V4::class),
        AutoMigration(from = 4, to = 5),
    ],
)
abstract class AppDb : RoomDatabase() {
    abstract fun dao(): JDao

    /** v3 adds loans: give existing users the installment category too. */
    /** v4 adds people: turn the names already typed in debts into people. */
    class V4 : AutoMigrationSpec {
        override fun onPostMigrate(db: SupportSQLiteDatabase) {
            db.execSQL("INSERT INTO person(name, createdAt) SELECT DISTINCT person, MIN(createdAt) FROM debt GROUP BY person")
            db.execSQL("UPDATE debt SET personId = (SELECT p.id FROM person p WHERE p.name = debt.person)")
        }
    }

    class V3 : AutoMigrationSpec {
        override fun onPostMigrate(db: SupportSQLiteDatabase) {
            db.execSQL("INSERT INTO category(name, kind, icon, color, sortOrder) SELECT 'قسط و وام', 'EXPENSE', 'bank', 0, 50 WHERE NOT EXISTS (SELECT 1 FROM category WHERE icon = 'bank')")
        }
    }

    companion object {
        private val migration5To6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                // Alter in place so the installment foreign key never sees its parent table dropped.
                db.execSQL("ALTER TABLE loan ADD COLUMN receiveAccountId INTEGER REFERENCES account(id) ON DELETE SET NULL")
                db.execSQL("CREATE INDEX index_loan_receiveAccountId ON loan(receiveAccountId)")
            }
        }

        private val migration6To7 = object : Migration(6, 7) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE installment ADD COLUMN paidAt INTEGER")
            }
        }

        private val migration7To8 = object : Migration(7, 8) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE account ADD COLUMN isSavings INTEGER NOT NULL DEFAULT 0")
                db.execSQL("""CREATE TABLE IF NOT EXISTS `savings_commitment` (
                    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    `accountId` INTEGER NOT NULL,
                    `txnId` INTEGER,
                    `amount` INTEGER NOT NULL,
                    `paidAmount` INTEGER NOT NULL DEFAULT 0,
                    `note` TEXT,
                    `createdAt` INTEGER NOT NULL,
                    FOREIGN KEY(`accountId`) REFERENCES `account`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
                    FOREIGN KEY(`txnId`) REFERENCES `txn`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
                )""")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_savings_commitment_accountId` ON `savings_commitment` (`accountId`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_savings_commitment_txnId` ON `savings_commitment` (`txnId`)")
                db.execSQL("""CREATE TABLE IF NOT EXISTS `savings_payment` (
                    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    `commitmentId` INTEGER NOT NULL,
                    `amount` INTEGER NOT NULL,
                    `at` INTEGER NOT NULL,
                    `txnId` INTEGER,
                    FOREIGN KEY(`commitmentId`) REFERENCES `savings_commitment`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
                    FOREIGN KEY(`txnId`) REFERENCES `txn`(`id`) ON UPDATE NO ACTION ON DELETE SET NULL
                )""")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_savings_payment_commitmentId` ON `savings_payment` (`commitmentId`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_savings_payment_txnId` ON `savings_payment` (`txnId`)")
            }
        }

        fun build(ctx: Context, key: ByteArray): AppDb {
            System.loadLibrary("sqlcipher")
            return Room.databaseBuilder(ctx, AppDb::class.java, "jibeman.db")
                .openHelperFactory(SupportOpenHelperFactory(key))
                .addMigrations(migration5To6, migration6To7, migration7To8)
                .addCallback(object : Callback() {
                    override fun onCreate(db: SupportSQLiteDatabase) = seed(db)
                })
                .build()
        }

        // name, kind, icon, color index
        private val DEFAULTS = listOf(
            arrayOf("خوراک", "EXPENSE", "food", 1),
            arrayOf("حمل‌ونقل", "EXPENSE", "car", 0),
            arrayOf("خرید", "EXPENSE", "bag", 2),
            arrayOf("قبض", "EXPENSE", "zap", 6),
            arrayOf("شارژ و اینترنت", "EXPENSE", "phone", 4),
            arrayOf("خانه", "EXPENSE", "home", 5),
            arrayOf("سلامت", "EXPENSE", "heart", 7),
            arrayOf("تفریح", "EXPENSE", "gift", 2),
            arrayOf("آموزش", "EXPENSE", "book", 0),
            arrayOf("قسط و وام", "EXPENSE", "bank", 0),
            arrayOf("سایر", "EXPENSE", "tag", 5),
            arrayOf("حقوق", "INCOME", "brief", 3),
            arrayOf("فروش", "INCOME", "bag", 3),
            arrayOf("هدیه", "INCOME", "gift", 4),
            arrayOf("سایر درآمد", "INCOME", "tag", 3),
        )

        private fun seed(db: SupportSQLiteDatabase) = DEFAULTS.forEachIndexed { i, c ->
            db.execSQL("INSERT INTO category(name, kind, icon, color, sortOrder) VALUES (?, ?, ?, ?, ?)", arrayOf(c[0], c[1], c[2], c[3], i))
        }
    }
}

/** Extra tables added in v4, grouped so the backup signature stays readable. */
data class Phase4(
    val persons: List<Person> = emptyList(),
    val goals: List<Goal> = emptyList(),
    val goalEntries: List<GoalEntry> = emptyList(),
    val groups: List<SplitGroup> = emptyList(),
    val members: List<SplitMember> = emptyList(),
    val expenses: List<SplitExpense> = emptyList(),
    val shares: List<SplitShare> = emptyList(),
    val savingsCommitments: List<SavingsCommitment> = emptyList(),
    val savingsPayments: List<SavingsPayment> = emptyList(),
)
