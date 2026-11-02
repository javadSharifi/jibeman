package ir.jibeman

import android.app.Application
import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.LocalContext
import ir.jibeman.core.DbKey
import ir.jibeman.core.db.AppDb
import ir.jibeman.core.sms.SmsIngest
import ir.jibeman.core.sms.SmsParser
import ir.jibeman.ui.ThemeMode
import java.security.MessageDigest
import java.security.SecureRandom
import android.util.Base64

/** Manual DI: the whole object graph is these three lazies. */
class App : Application() {
    override fun onCreate() {
        super.onCreate()
        if (prefs.remindersEnabled) ir.jibeman.core.Reminders.schedule(this) // idempotent: same PendingIntent replaces the alarm
    }

    val prefs by lazy { Prefs(this) }
    val db by lazy { AppDb.build(this, DbKey.get(this)) }
    val dao get() = db.dao()
    val smsIngest by lazy {
        SmsIngest(dao, assets.list("banks").orEmpty().map { f -> SmsParser.load(assets.open("banks/$f").bufferedReader().readText()) })
    }
}

@Composable
fun app(): App = LocalContext.current.applicationContext as App

/** Small settings in SharedPreferences, exposed as Compose state so the UI updates on change. */
class Prefs(ctx: Context) {
    private val sp = ctx.getSharedPreferences("prefs", Context.MODE_PRIVATE)

    private val nameS = mutableStateOf(sp.getString("name", "").orEmpty())
    var name: String
        get() = nameS.value
        set(v) { nameS.value = v; sp.edit().putString("name", v).apply() }

    private val hideS = mutableStateOf(sp.getBoolean("hide", false))
    var hideAmounts: Boolean
        get() = hideS.value
        set(v) { hideS.value = v; sp.edit().putBoolean("hide", v).apply() }

    private val lockS = mutableStateOf(sp.getBoolean("lock", false))
    var lockEnabled: Boolean
        get() = lockS.value
        set(v) { lockS.value = v; sp.edit().putBoolean("lock", v).apply() }

    private val pinHashS = mutableStateOf(sp.getString("pin_hash", "").orEmpty())
    private val pinSaltS = mutableStateOf(sp.getString("pin_salt", "").orEmpty())
    val hasPin: Boolean get() = pinHashS.value.isNotEmpty()

    private val biometricS = mutableStateOf(sp.getBoolean("biometric", false))
    var biometricEnabled: Boolean
        get() = biometricS.value
        set(v) { biometricS.value = v; sp.edit().putBoolean("biometric", v).apply() }

    private val lockTimeoutS = mutableStateOf(sp.getLong("lock_timeout", 30_000L))
    var lockTimeoutMs: Long
        get() = lockTimeoutS.value
        set(v) { lockTimeoutS.value = v; sp.edit().putLong("lock_timeout", v).apply() }

    fun setPin(pin: String) {
        val bytes = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val salt = Base64.encodeToString(bytes, Base64.NO_WRAP)
        val md = MessageDigest.getInstance("SHA-256")
        val hashBytes = md.digest("$salt:$pin:jibeman_salt".toByteArray(Charsets.UTF_8))
        val hash = Base64.encodeToString(hashBytes, Base64.NO_WRAP)
        sp.edit().putString("pin_salt", salt).putString("pin_hash", hash).putBoolean("lock", true).apply()
        pinSaltS.value = salt
        pinHashS.value = hash
        lockS.value = true
    }

    fun verifyPin(pin: String): Boolean {
        val salt = pinSaltS.value
        val hash = pinHashS.value
        if (salt.isEmpty() || hash.isEmpty()) return false
        val md = MessageDigest.getInstance("SHA-256")
        val hashBytes = md.digest("$salt:$pin:jibeman_salt".toByteArray(Charsets.UTF_8))
        val computed = Base64.encodeToString(hashBytes, Base64.NO_WRAP)
        return computed == hash
    }

    fun removePin() {
        sp.edit().remove("pin_salt").remove("pin_hash").putBoolean("lock", false).putBoolean("biometric", false).apply()
        pinSaltS.value = ""
        pinHashS.value = ""
        lockS.value = false
        biometricS.value = false
    }

    private val smsS = mutableStateOf(sp.getBoolean("sms", true))
    var smsEnabled: Boolean
        get() = smsS.value
        set(v) { smsS.value = v; sp.edit().putBoolean("sms", v).apply() }

    private val remindS = mutableStateOf(sp.getBoolean("remind", true))
    var remindersEnabled: Boolean
        get() = remindS.value
        set(v) { remindS.value = v; sp.edit().putBoolean("remind", v).apply() }

    private val themeS = mutableStateOf(
        sp.getString("theme", null)?.let { runCatching { ThemeMode.valueOf(it) }.getOrNull() } ?: ThemeMode.SYSTEM,
    )
    var theme: ThemeMode
        get() = themeS.value
        set(v) { themeS.value = v; sp.edit().putString("theme", v.name).apply() }

    private val backupS = mutableStateOf(sp.getLong("lastBackup", 0L))
    var lastBackupAt: Long
        get() = backupS.value
        set(v) { backupS.value = v; sp.edit().putLong("lastBackup", v).apply() }
}
