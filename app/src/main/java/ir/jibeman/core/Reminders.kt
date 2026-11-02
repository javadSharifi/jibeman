package ir.jibeman.core

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import ir.jibeman.App
import ir.jibeman.MainActivity
import ir.jibeman.R
import ir.jibeman.core.db.DebtDir
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.Calendar

/**
 * One inexact alarm a day (~9:00) checks due installments and debts. No service, no WorkManager:
 * the system batches inexact alarms with others, so it costs almost nothing.
 */
object Reminders {
    private const val CHANNEL = "due"
    private const val AHEAD_MS = 2 * 86_400_000L

    fun schedule(ctx: Context) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        val first = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 9); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0)
            if (timeInMillis <= System.currentTimeMillis()) add(Calendar.DAY_OF_MONTH, 1)
        }.timeInMillis
        am.setInexactRepeating(AlarmManager.RTC, first, AlarmManager.INTERVAL_DAY, pending(ctx))
    }

    fun cancel(ctx: Context) = ctx.getSystemService(AlarmManager::class.java)?.cancel(pending(ctx))

    private fun pending(ctx: Context) = PendingIntent.getBroadcast(
        ctx, 0, Intent(ctx, ReminderReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    suspend fun check(ctx: Context) {
        val app = ctx.applicationContext as App
        if (!app.prefs.remindersEnabled) return
        val until = Jalali.dayStart(System.currentTimeMillis()) + AHEAD_MS + 86_400_000L
        val lines = app.dao.installmentsDueBefore(until).map { "قسط ${it.loanTitle}: ${Money.toman(it.i.amount)} تومان · ${when2(it.i.dueAt)}" } +
            app.dao.debtsDueBefore(until).map {
                val verb = if (it.debt.direction == DebtDir.I_OWE) "بدهی به" else "طلب از"
                "$verb ${it.debt.person}: ${Money.toman(it.remaining)} تومان · ${when2(it.debt.dueAt!!)}"
            }
        if (lines.isEmpty()) return
        notify(ctx, if (lines.size == 1) "یک سررسید نزدیک است" else "${Money.fa(lines.size.toString())} سررسید نزدیک است", lines)
    }

    private fun when2(at: Long): String {
        val days = ((Jalali.dayStart(at) - Jalali.dayStart(System.currentTimeMillis())) / 86_400_000L).toInt()
        return when {
            days < 0 -> "${Money.fa((-days).toString())} روز گذشته"
            days == 0 -> "امروز"
            days == 1 -> "فردا"
            else -> "${Money.fa(days.toString())} روز دیگر"
        }
    }

    private fun notify(ctx: Context, title: String, lines: List<String>) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel(CHANNEL, "یادآور سررسید", NotificationManager.IMPORTANCE_DEFAULT))
        val open = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_notif).setContentTitle(title).setContentText(lines.first())
            .setStyle(NotificationCompat.InboxStyle().also { s -> lines.take(6).forEach { s.addLine(it) } })
            .setContentIntent(open).setAutoCancel(true).build()
        NotificationManagerCompat.from(ctx).notify(1, n)
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            // alarms don't survive a reboot
            if ((context.applicationContext as App).prefs.remindersEnabled) Reminders.schedule(context)
            return
        }
        val pending = goAsync()
        scope.launch { try { Reminders.check(context) } finally { pending.finish() } }
    }

    companion object {
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    }
}
