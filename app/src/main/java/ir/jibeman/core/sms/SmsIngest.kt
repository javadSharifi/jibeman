package ir.jibeman.core.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import ir.jibeman.App
import ir.jibeman.core.db.AccType
import ir.jibeman.core.db.JDao
import ir.jibeman.core.db.RawMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.security.MessageDigest

/** Parses a bank SMS and queues it for review (never writes a transaction by itself). */
class SmsIngest(private val dao: JDao, private val templates: List<Template>) {
    enum class Result { ADDED, DUPLICATE, IGNORED }

    /** Cheap pre-filter so non-bank SMS cost nothing: no DB access unless a template matches. */
    fun isBank(sender: String, body: String) = SmsParser.detect(templates, sender, SmsParser.normalize(body)) != null

    suspend fun ingest(sender: String, body: String, receivedAt: Long): Result {
        val norm = SmsParser.normalize(body)
        val (t, bySender) = SmsParser.detect(templates, sender, norm) ?: return Result.IGNORED
        val p = SmsParser.parse(t, norm, bySender) ?: return Result.IGNORED

        // which account: card -> account number -> the only account of that bank
        val bankAccounts = dao.allAccounts().filter { !it.archived && it.type == AccType.BANK && it.bankCode == t.bank }
        var accountId: Long? = p.card4?.let { dao.accountByCard(it, t.bank) }
        var score = if (accountId != null) 25 else 0
        if (accountId == null && p.accountNo != null) {
            bankAccounts.firstOrNull { a -> a.accountNo != null && (a.accountNo.endsWith(p.accountNo) || p.accountNo.endsWith(a.accountNo)) }
                ?.let { accountId = it.id; score = 25 }
        }
        if (accountId == null && bankAccounts.size == 1) {
            accountId = bankAccounts[0].id
            score = if (p.card4 == null && p.accountNo == null) 20 else 12 // weaker if the SMS named a card we don't know
        }
        val rule = ir.jibeman.core.Rules.first(dao.rules(), t.bank, p.type, p.amount, p.description)
        if (rule?.ignore == true) return Result.IGNORED
        val categoryId = rule?.categoryId
        val confidence = (60 + score + (if (p.occurredAt != null) 5 else 0) + (if (p.balance != null) 5 else 0) + (if (p.bySender) 5 else 0)).coerceAtMost(99)

        val id = dao.insertRaw(
            RawMessage(
                bank = t.bank, sender = sender, body = body.trim(), hash = hash(t.bank, norm), receivedAt = receivedAt,
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

/** Wakes only when an SMS arrives; no service, no polling. */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val app = context.applicationContext as App
        if (!app.prefs.smsEnabled) return
        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        // multi-part SMS arrive as several PDUs from the same sender
        val messages = parts.groupBy { it.originatingAddress.orEmpty() }.map { (sender, ps) -> Triple(sender, ps.joinToString("") { it.messageBody.orEmpty() }, ps.first().timestampMillis) }
        val bank = messages.filter { app.smsIngest.isBank(it.first, it.second) }
        if (bank.isEmpty()) return
        val pending = goAsync()
        scope.launch {
            try {
                bank.forEach { (sender, body, at) -> app.smsIngest.ingest(sender, body, at) }
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    }
}

/** One-off import of old bank SMS from the inbox. Oldest first so balances chain in order. */
suspend fun scanInbox(ctx: Context, ingest: SmsIngest, sinceMs: Long, onProgress: (Int, Int) -> Unit): Pair<Int, Int> {
    var added = 0
    var dup = 0
    val cols = arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE)
    ctx.contentResolver.query(Telephony.Sms.Inbox.CONTENT_URI, cols, "${Telephony.Sms.DATE} > ?", arrayOf(sinceMs.toString()), "${Telephony.Sms.DATE} ASC")?.use { c ->
        val total = c.count
        var i = 0
        while (c.moveToNext()) {
            val sender = c.getString(0).orEmpty()
            val body = c.getString(1).orEmpty()
            if (ingest.isBank(sender, body)) when (ingest.ingest(sender, body, c.getLong(2))) {
                SmsIngest.Result.ADDED -> added++
                SmsIngest.Result.DUPLICATE -> dup++
                else -> {}
            }
            if (++i % 50 == 0) onProgress(i, total)
        }
        onProgress(total, total)
    }
    return added to dup
}
