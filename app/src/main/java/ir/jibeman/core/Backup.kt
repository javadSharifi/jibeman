package ir.jibeman.core

import ir.jibeman.core.db.AccType
import ir.jibeman.core.db.Account
import ir.jibeman.core.db.Card
import ir.jibeman.core.db.Category
import ir.jibeman.core.db.JDao
import ir.jibeman.core.db.Rule
import ir.jibeman.core.db.Debt
import ir.jibeman.core.db.DebtDir
import ir.jibeman.core.db.DebtPayment
import ir.jibeman.core.db.Installment
import ir.jibeman.core.db.Loan
import ir.jibeman.core.db.Goal
import ir.jibeman.core.db.GoalEntry
import ir.jibeman.core.db.Person
import ir.jibeman.core.db.Phase4
import ir.jibeman.core.db.SplitExpense
import ir.jibeman.core.db.SplitGroup
import ir.jibeman.core.db.SplitMember
import ir.jibeman.core.db.SplitShare
import ir.jibeman.core.db.TxType
import ir.jibeman.core.db.Txn
import org.json.JSONArray
import org.json.JSONObject

/**
 * Plain JSON backup of everything. Import is a trust boundary: every field is validated and the
 * replace runs in one DB transaction, so a bad file never leaves half-imported data.
 */
object Backup {
    private const val APP = "jibeman"
    private const val VERSION = 5 // 2: + rules, 3: + rule conditions, loans, debts, 4: + people, goals, split, 5: + card details

    suspend fun export(dao: JDao): String = JSONObject()
        .put("app", APP).put("version", VERSION).put("exportedAt", System.currentTimeMillis())
        .put("accounts", JSONArray(dao.allAccounts().map {
            JSONObject().put("id", it.id).put("name", it.name).put("type", it.type).put("bankCode", it.bankCode)
                .put("accountNo", it.accountNo).put("initialBalance", it.initialBalance).put("style", it.style)
                .put("archived", it.archived).put("sortOrder", it.sortOrder)
                .put("cardNumber", it.cardNumber).put("cardExpiry", it.cardExpiry)
                .put("cardCvv2", it.cardCvv2).put("iban", it.iban).put("cardColor", it.cardColor)
        }))
        .put("cards", JSONArray(dao.allCards().map { JSONObject().put("id", it.id).put("accountId", it.accountId).put("last4", it.last4) }))
        .put("categories", JSONArray(dao.allCategories().map {
            JSONObject().put("id", it.id).put("name", it.name).put("kind", it.kind).put("icon", it.icon).put("color", it.color).put("sortOrder", it.sortOrder)
        }))
        .put("txns", JSONArray(dao.allTxns().map {
            JSONObject().put("id", it.id).put("type", it.type).put("amount", it.amount).put("accountId", it.accountId)
                .put("toAccountId", it.toAccountId).put("categoryId", it.categoryId).put("title", it.title).put("note", it.note)
                .put("refNo", it.refNo).put("balanceAfter", it.balanceAfter).put("occurredAt", it.occurredAt)
                .put("source", it.source).put("createdAt", it.createdAt)
        }))
        .put("rules", JSONArray(dao.allRules().map {
            JSONObject().put("id", it.id).put("contains", it.contains).put("categoryId", it.categoryId).put("bank", it.bank).put("type", it.type)
                .put("minAmount", it.minAmount).put("maxAmount", it.maxAmount).put("ignore", it.ignore).put("enabled", it.enabled)
        }))
        .put("loans", JSONArray(dao.allLoans().map {
            JSONObject().put("id", it.id).put("title", it.title).put("lender", it.lender).put("principal", it.principal).put("installment", it.installment)
                .put("count", it.count).put("firstDueAt", it.firstDueAt).put("accountId", it.accountId).put("note", it.note).put("createdAt", it.createdAt)
        }))
        .put("installments", JSONArray(dao.allInstallments().map {
            JSONObject().put("id", it.id).put("loanId", it.loanId).put("n", it.n).put("dueAt", it.dueAt).put("amount", it.amount).put("paidTxnId", it.paidTxnId)
        }))
        .put("debts", JSONArray(dao.allDebts().map {
            JSONObject().put("id", it.id).put("direction", it.direction).put("person", it.person).put("amount", it.amount).put("dueAt", it.dueAt)
                .put("note", it.note).put("createdAt", it.createdAt).put("personId", it.personId)
        }))
        .put("persons", JSONArray(dao.allPersons().map {
            JSONObject().put("id", it.id).put("name", it.name).put("phone", it.phone).put("cardNo", it.cardNo).put("note", it.note).put("createdAt", it.createdAt)
        }))
        .put("goals", JSONArray(dao.allGoals().map {
            JSONObject().put("id", it.id).put("title", it.title).put("target", it.target).put("dueAt", it.dueAt).put("icon", it.icon)
                .put("color", it.color).put("closed", it.closed).put("createdAt", it.createdAt)
        }))
        .put("goalEntries", JSONArray(dao.allGoalEntries().map { JSONObject().put("id", it.id).put("goalId", it.goalId).put("amount", it.amount).put("at", it.at) }))
        .put("splitGroups", JSONArray(dao.allGroups().map { JSONObject().put("id", it.id).put("title", it.title).put("closed", it.closed).put("createdAt", it.createdAt) }))
        .put("splitMembers", JSONArray(dao.allMembers().map { JSONObject().put("id", it.id).put("groupId", it.groupId).put("personId", it.personId) }))
        .put("splitExpenses", JSONArray(dao.allSplitExpenses().map {
            JSONObject().put("id", it.id).put("groupId", it.groupId).put("title", it.title).put("amount", it.amount).put("payerId", it.payerId)
                .put("at", it.at).put("settlement", it.settlement)
        }))
        .put("splitShares", JSONArray(dao.allShares().map { JSONObject().put("id", it.id).put("expenseId", it.expenseId).put("memberId", it.memberId).put("amount", it.amount) }))
        .put("debtPayments", JSONArray(dao.allPayments().map {
            JSONObject().put("id", it.id).put("debtId", it.debtId).put("amount", it.amount).put("at", it.at).put("txnId", it.txnId)
        }))
        .toString()

    class BadFile(msg: String) : Exception(msg)

    /** Returns the number of transactions imported. Throws [BadFile] with a user-facing message. */
    suspend fun import(dao: JDao, json: String): Int {
        val o = try { JSONObject(json) } catch (e: Exception) { throw BadFile("فایل خراب است یا JSON نیست") }
        if (o.optString("app") != APP) throw BadFile("این فایل پشتیبان «جیب من» نیست")
        if (o.optInt("version", 0) !in 1..VERSION) throw BadFile("نسخه فایل با این برنامه سازگار نیست")
        try {
            val accounts = o.getJSONArray("accounts").objs().map {
                Account(
                    id = it.getLong("id"), name = it.getString("name").take(100), type = it.getString("type").also { t -> check(t in AccType.all) },
                    bankCode = it.str("bankCode"), accountNo = it.str("accountNo"), initialBalance = it.getLong("initialBalance"),
                    style = it.optInt("style", 0), archived = it.optBoolean("archived", false), sortOrder = it.optInt("sortOrder", 0),
                    cardNumber = it.str("cardNumber"), cardExpiry = it.str("cardExpiry"),
                    cardCvv2 = it.str("cardCvv2"), iban = it.str("iban"), cardColor = it.lng("cardColor"),
                )
            }
            val cards = o.getJSONArray("cards").objs().map {
                Card(it.getLong("id"), it.getLong("accountId"), it.getString("last4").also { l -> check(l.length == 4 && l.all(Char::isDigit)) })
            }
            val categories = o.getJSONArray("categories").objs().map {
                Category(
                    it.getLong("id"), it.getString("name").take(60), it.getString("kind").also { k -> check(k == "EXPENSE" || k == "INCOME") },
                    it.getString("icon"), it.getInt("color"), it.optInt("sortOrder", 0),
                )
            }
            val txns = o.getJSONArray("txns").objs().map {
                val type = it.getString("type").also { t -> check(t in TxType.all) }
                val amount = it.getLong("amount").also { a -> check(type == TxType.ADJUST || type == TxType.DEBT || a > 0) }
                Txn(
                    id = it.getLong("id"), type = type, amount = amount, accountId = it.getLong("accountId"),
                    toAccountId = it.lng("toAccountId"), categoryId = it.lng("categoryId"), title = it.str("title"), note = it.str("note"),
                    refNo = it.str("refNo"), balanceAfter = it.lng("balanceAfter"), occurredAt = it.getLong("occurredAt"),
                    source = it.optString("source", "IMPORT"), createdAt = it.optLong("createdAt", System.currentTimeMillis()),
                )
            }
            val rules = (o.optJSONArray("rules") ?: JSONArray()).objs().map {
                Rule(
                    it.getLong("id"), it.getString("contains").take(100), it.lng("categoryId"), it.optString("bank", ""),
                    it.optString("type", "").also { t -> check(t == "" || t == TxType.INCOME || t == TxType.EXPENSE) },
                    it.lng("minAmount"), it.lng("maxAmount"), it.optBoolean("ignore", false), it.optBoolean("enabled", true),
                ).also { r -> check(r.ignore || r.categoryId != null) }
            }
            val loans = (o.optJSONArray("loans") ?: JSONArray()).objs().map {
                Loan(
                    it.getLong("id"), it.getString("title").take(100), it.str("lender"), it.getLong("principal").also { a -> check(a >= 0) },
                    it.getLong("installment").also { a -> check(a > 0) }, it.getInt("count").also { c -> check(c in 1..600) },
                    it.getLong("firstDueAt"), it.lng("accountId"), it.str("note"), it.optLong("createdAt", System.currentTimeMillis()),
                )
            }
            val installments = (o.optJSONArray("installments") ?: JSONArray()).objs().map {
                Installment(it.getLong("id"), it.getLong("loanId"), it.getInt("n"), it.getLong("dueAt"), it.getLong("amount").also { a -> check(a > 0) }, it.lng("paidTxnId"))
            }
            val debts = (o.optJSONArray("debts") ?: JSONArray()).objs().map {
                Debt(
                    it.getLong("id"), it.getString("direction").also { d -> check(d == DebtDir.I_OWE || d == DebtDir.OWED_TO_ME) },
                    it.getString("person").take(60), it.getLong("amount").also { a -> check(a > 0) }, it.lng("dueAt"), it.str("note"),
                    it.optLong("createdAt", System.currentTimeMillis()), it.lng("personId"),
                )
            }
            fun arr(k: String) = (o.optJSONArray(k) ?: JSONArray()).objs()
            fun pos(o: JSONObject, k: String) = o.getLong(k).also { a -> check(a > 0) }
            val p4 = Phase4(
                persons = arr("persons").map { Person(it.getLong("id"), it.getString("name").take(60), it.str("phone"), it.str("cardNo"), it.str("note"), it.optLong("createdAt", 0)) },
                goals = arr("goals").map {
                    Goal(it.getLong("id"), it.getString("title").take(60), pos(it, "target"), it.lng("dueAt"), it.optString("icon", "target"), it.optInt("color", 4), it.optBoolean("closed", false), it.optLong("createdAt", 0))
                },
                goalEntries = arr("goalEntries").map { GoalEntry(it.getLong("id"), it.getLong("goalId"), it.getLong("amount"), it.getLong("at")) },
                groups = arr("splitGroups").map { SplitGroup(it.getLong("id"), it.getString("title").take(60), it.optBoolean("closed", false), it.optLong("createdAt", 0)) },
                members = arr("splitMembers").map { SplitMember(it.getLong("id"), it.getLong("groupId"), it.lng("personId")) },
                expenses = arr("splitExpenses").map {
                    SplitExpense(it.getLong("id"), it.getLong("groupId"), it.getString("title").take(60), pos(it, "amount"), it.getLong("payerId"), it.getLong("at"), it.optBoolean("settlement", false))
                },
                shares = arr("splitShares").map { SplitShare(it.getLong("id"), it.getLong("expenseId"), it.getLong("memberId"), it.getLong("amount").also { a -> check(a >= 0) }) },
            )
            val payments = (o.optJSONArray("debtPayments") ?: JSONArray()).objs().map {
                DebtPayment(it.getLong("id"), it.getLong("debtId"), it.getLong("amount").also { a -> check(a > 0) }, it.getLong("at"), it.lng("txnId"))
            }
            dao.replaceAll(accounts, cards, categories, txns, rules, loans, installments, debts, payments, p4) // FK violations throw here and roll back
            return txns.size
        } catch (e: BadFile) {
            throw e
        } catch (e: Exception) {
            throw BadFile("محتوای فایل معتبر نیست؛ چیزی تغییر نکرد")
        }
    }

    private fun JSONArray.objs() = (0 until length()).map { getJSONObject(it) }
    private fun JSONObject.str(k: String): String? = if (isNull(k)) null else getString(k)
    private fun JSONObject.lng(k: String): Long? = if (isNull(k)) null else getLong(k)
}
