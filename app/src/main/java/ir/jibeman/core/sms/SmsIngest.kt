package ir.jibeman.core.sms

import ir.jibeman.core.Rules
import ir.jibeman.core.db.AccType
import ir.jibeman.core.db.JDao
import ir.jibeman.core.db.RawMessage
import java.security.MessageDigest

/** Parses bank SMS text and queues it for review (never writes a transaction by itself). */
class SmsIngest(private val dao: JDao, private val templates: List<Template>) {
    enum class Result { ADDED, DUPLICATE, IGNORED }

    /** Cheap pre-filter so non-bank SMS cost nothing: no DB access unless a template matches. */
    fun isBank(sender: String, body: String) = SmsParser.detect(templates, sender, SmsParser.normalize(body)) != null

    suspend fun ingest(sender: String, body: String, receivedAt: Long): Result {
        val norm = SmsParser.normalize(body)
        val (t, bySender) = SmsParser.detect(templates, sender, norm) ?: return Result.IGNORED
        val p = SmsParser.parse(t, norm, bySender) ?: return Result.IGNORED
        return queueParsed(norm, body, p, sender, receivedAt)
    }

    /** Parses user-pasted bank SMS text without requiring SMS device permissions. */
    suspend fun ingestPasted(body: String, receivedAt: Long = System.currentTimeMillis()): Result {
        val norm = SmsParser.normalize(body)
        val p = SmsParser.parsePasted(templates, body) ?: return Result.IGNORED
        return queueParsed(norm, body, p, sender = "PASTE", receivedAt = receivedAt)
    }

    private suspend fun queueParsed(norm: String, body: String, p: Parsed, sender: String, receivedAt: Long): Result {
        // which account: card -> account number -> the only account of that bank
        val bankAccounts = dao.allAccounts().filter { !it.archived && it.type == AccType.BANK && it.bankCode == p.bank }
        var accountId: Long? = p.card4?.let { dao.accountByCard(it, p.bank) }
        var score = if (accountId != null) 25 else 0
        if (accountId == null && p.accountNo != null) {
            bankAccounts.firstOrNull { a -> a.accountNo != null && (a.accountNo.endsWith(p.accountNo) || p.accountNo.endsWith(a.accountNo)) }
                ?.let { accountId = it.id; score = 25 }
        }
        if (accountId == null && bankAccounts.size == 1) {
            accountId = bankAccounts[0].id
            score = if (p.card4 == null && p.accountNo == null) 20 else 12 // weaker if the SMS named a card we don't know
        }
        val rule = Rules.first(dao.rules(), p.bank, p.type, p.amount, p.description)
        if (rule?.ignore == true) return Result.IGNORED
        val categoryId = rule?.categoryId
        val confidence = (60 + score + (if (p.occurredAt != null) 5 else 0) + (if (p.balance != null) 5 else 0) + (if (p.bySender) 5 else 0)).coerceAtMost(99)

        val id = dao.insertRaw(
            RawMessage(
                bank = p.bank, sender = sender, body = body.trim(), hash = hash(p.bank, norm), receivedAt = receivedAt,
                occurredAt = p.occurredAt ?: receivedAt, type = p.type, amount = p.amount, balance = p.balance,
                card4 = p.card4, accountNo = p.accountNo, description = p.description, accountId = accountId,
                categoryId = categoryId, confidence = confidence, status = "PENDING",
            )
        )
        return if (id == -1L) Result.DUPLICATE else Result.ADDED
    }

    companion object {
        /** Same bank + same text = same message. Two real equal withdrawals differ in balance, so they never collide. */
        fun hash(bank: String, norm: String): String =
            MessageDigest.getInstance("SHA-256").digest("$bank\n$norm".toByteArray()).joinToString("") { "%02x".format(it) }
    }
}
