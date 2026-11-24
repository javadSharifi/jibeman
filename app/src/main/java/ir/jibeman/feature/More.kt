package ir.jibeman.feature

import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.jibeman.MainActivity
import ir.jibeman.app
import ir.jibeman.authenticate
import ir.jibeman.core.Backup
import ir.jibeman.core.BackupCipher
import ir.jibeman.core.Jalali
import ir.jibeman.core.Money
import ir.jibeman.core.db.Category
import ir.jibeman.ui.BottomSpace
import ir.jibeman.ui.C
import ir.jibeman.ui.CatIcon
import ir.jibeman.ui.Confirm
import ir.jibeman.ui.Divider
import ir.jibeman.ui.Field
import ir.jibeman.ui.GhostButton
import ir.jibeman.ui.Group
import ir.jibeman.ui.Ic
import ir.jibeman.ui.Ico
import ir.jibeman.ui.Label
import ir.jibeman.ui.LimeButton
import ir.jibeman.ui.Segmented
import ir.jibeman.ui.T
import ir.jibeman.ui.ThemeMode
import ir.jibeman.ui.Tile
import ir.jibeman.ui.TopBar
import ir.jibeman.ui.glowBg
import ir.jibeman.authenticate
import ir.jibeman.ui.PinDots
import ir.jibeman.ui.PinKeypad
import ir.jibeman.ui.short
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val DAY = 86_400_000L

fun backupAge(last: Long): String = if (last == 0L) "هنوز پشتیبان نگرفته‌ای" else {
    val d = ((System.currentTimeMillis() - last) / DAY).toInt()
    if (d == 0) "آخرین پشتیبان: امروز" else "آخرین پشتیبان: ${Money.fa(d.toString())} روز پیش"
}

@Composable
fun MoreScreen(go: (Route) -> Unit) {
    val app = app()
    val prefs = app.prefs
    var editName by remember { mutableStateOf(false) }
    val pending by remember { app.dao.pendingCount() }.collectAsStateWithLifecycle(0)
    val loans by remember { app.dao.loans() }.collectAsStateWithLifecycle(emptyList())
    val goals by remember { app.dao.goals(0) }.collectAsStateWithLifecycle(emptyList())
    val groups by remember { app.dao.groups() }.collectAsStateWithLifecycle(emptyList())
    val owed by remember { app.dao.debts(ir.jibeman.core.db.DebtDir.OWED_TO_ME) }.collectAsStateWithLifecycle(emptyList())
    val owe by remember { app.dao.debts(ir.jibeman.core.db.DebtDir.I_OWE) }.collectAsStateWithLifecycle(emptyList())
    val ctx = LocalContext.current
    val notifPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        prefs.remindersEnabled = ok
        if (ok) ir.jibeman.core.Reminders.schedule(ctx) else ir.jibeman.core.Reminders.cancel(ctx)
    }
    val stale = prefs.lastBackupAt == 0L || System.currentTimeMillis() - prefs.lastBackupAt > 7 * DAY
    Column(Modifier.fillMaxSize().glowBg().verticalScroll(rememberScrollState()).padding(BottomSpace)) {
        T("بیشتر", 22, 800, modifier = Modifier.statusBarsPadding().padding(start = 16.dp, top = 10.dp))
        Row(
            Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(C.surface)
                .border(1.dp, C.line, RoundedCornerShape(20.dp)).padding(12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(42.dp).clip(RoundedCornerShape(14.dp)).background(C.lime).clickable { editName = true }, contentAlignment = Alignment.Center) {
                if (prefs.name.isBlank()) Ico(Ic.user, 20.dp, C.onLime) else T(prefs.name.take(1), 16, 800, C.onLime)
            }
            Column(Modifier.weight(1f).clickable { editName = true }) {
                T(prefs.name.ifBlank { "نامت را وارد کن" }, 14, 700, if (prefs.name.isBlank()) C.t2 else C.ink, maxLines = 1)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (stale) Ico(Ic.alert, 13.dp, C.warn)
                    T(backupAge(prefs.lastBackupAt), 11, color = if (stale) C.warn else C.muted, maxLines = 1)
                }
            }
            LimeButton("پشتیبان‌گیری", height = 38.dp) { go(Route.Backup) }
        }

        Row(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Feature("وام و اقساط", Ic.bank, C.cat[0], loans.firstOrNull { it.nextDue != null }?.let { "قسط بعد ${dueText(it.nextDue!!)}" } ?: "${Money.fa(loans.size.toString())} وام", Modifier.weight(1f)) { go(Route.Loans) }
            Feature("بدهی و طلب", Ic.receipt, C.cat[3], "طلب ${short(owed.sumOf { it.remaining }, prefs.hideAmounts)} · بدهی ${short(owe.sumOf { it.remaining }, prefs.hideAmounts)}", Modifier.weight(1f)) { go(Route.Debts) }
        }
        Row(Modifier.padding(start = 16.dp, end = 16.dp, top = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Feature("اهداف پس‌انداز", Ic.target, C.cat[4], if (goals.isEmpty()) "هدفی نیست" else "${Money.fa(goals.count { !it.goal.closed }.toString())} هدف · ${Money.fa((goals.sumOf { it.saved } * 100 / maxOf(1, goals.sumOf { it.goal.target })).toString())}٪", Modifier.weight(1f)) { go(Route.Goals) }
            Feature("دنگ", Ic.split, C.cat[1], if (groups.isEmpty()) "گروهی نیست" else "${Money.fa(groups.count { !it.g.closed }.toString())} گروه", Modifier.weight(1f)) { go(Route.Splits) }
        }

        Group(Modifier.padding(top = 12.dp)) {
            MenuRow("اشخاص", Ic.users, C.violet) { go(Route.People) }
            Divider()
            MenuRow("پیامک‌های بانک", Ic.msg, C.cat[4], if (pending > 0) "${Money.fa(pending.toString())} در انتظار" else null) { go(Route.SmsReview) }
            Divider()
            MenuRow("قوانین هوشمند", Ic.zap, C.cat[4]) { go(Route.Rules) }
            Divider()
            MenuRow("دسته‌بندی‌ها", Ic.tag, C.cat[2]) { go(Route.Categories) }
            Divider()
            MenuRow("پشتیبان‌گیری و بازیابی", Ic.save, C.cat[0]) { go(Route.Backup) }
            Divider()
            Column(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    CatIcon(if (prefs.theme == ThemeMode.LIGHT) Ic.sun else Ic.moon, C.cat[5], 34.dp)
                    Column(Modifier.weight(1f)) {
                        T("پوسته", 13, 600)
                        T("پیش‌فرض: هماهنگ با تم گوشی", 10.5f, color = C.muted)
                    }
                }
                Segmented(listOf(ThemeMode.SYSTEM to "سیستم", ThemeMode.LIGHT to "روشن", ThemeMode.DARK to "تیره"), prefs.theme) { prefs.theme = it }
            }
            Divider()
            MenuRow("امنیت و قفل", Ic.shield, C.cat[7], if (prefs.lockEnabled && prefs.hasPin) "روشن" else "خاموش") { go(Route.Security) }
            Divider()
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CatIcon(Ic.cal, C.cat[6], 34.dp)
                Column(Modifier.weight(1f)) {
                    T("یادآور سررسید", 13, 600)
                    T("هر روز حدود ساعت ۹، اقساط و بدهی‌های ۲ روز آینده", 10.5f, color = C.muted)
                }
                Switch(prefs.remindersEnabled, { on ->
                    if (!on) { prefs.remindersEnabled = false; ir.jibeman.core.Reminders.cancel(ctx) }
                    else if (android.os.Build.VERSION.SDK_INT >= 33) notifPerm.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                    else { prefs.remindersEnabled = true; ir.jibeman.core.Reminders.schedule(ctx) }
                }, colors = SwitchDefaults.colors(checkedTrackColor = C.lime, checkedThumbColor = C.onLime))
            }
        }
        T("جیب من · نسخه ۰٫۱ · کاملاً آفلاین", 11, color = C.muted, modifier = Modifier.padding(start = 22.dp, top = 14.dp))
    }
    if (editName) NameDialog(prefs.name, { prefs.name = it.trim().take(30) }) { editName = false }
}

@Composable
private fun Feature(title: String, icon: ImageVector, color: Color, sub: String, modifier: Modifier, onClick: () -> Unit) = Column(
    modifier.height(112.dp).clip(RoundedCornerShape(20.dp)).background(C.surface).border(1.dp, C.line, RoundedCornerShape(20.dp))
        .clickable(onClick = onClick).padding(12.dp),
) {
    CatIcon(icon, color)
    Box(Modifier.weight(1f))
    T(title, 13, 700)
    T(sub, 10.5f, color = C.muted, maxLines = 1)
}

@Composable
private fun MenuRow(title: String, icon: ImageVector, color: Color, end: String? = null, onClick: () -> Unit) = Row(
    Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 10.dp),
    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
) {
    CatIcon(icon, color, 34.dp)
    T(title, 13, 600, modifier = Modifier.weight(1f))
    if (end != null) T(end, 11, color = C.muted)
    Ico(Ic.chevLeft, 15.dp, C.muted)
}

@Composable
private fun NameDialog(current: String, onSave: (String) -> Unit, onDismiss: () -> Unit) {
    var v by remember { mutableStateOf(current) }
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = C.sheet,
        title = { T("نام تو", 17, 800) },
        text = { Field(v, { v = it }, "مثلاً محمدجواد") },
        confirmButton = { TextButton({ onSave(v); onDismiss() }) { T("ذخیره", 14, 800, C.accent) } },
        dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
    )
}

// ---------- categories ----------

@Composable
fun CategoriesScreen(back: () -> Unit) {
    val dao = app().dao
    var kind by remember { mutableStateOf("EXPENSE") }
    val cats by remember(kind) { dao.categories(kind) }.collectAsStateWithLifecycle(emptyList())
    var editing by remember { mutableStateOf<Category?>(null) }
    Column(Modifier.fillMaxSize().glowBg()) {
        TopBar("دسته‌بندی‌ها", back, action = Ic.plus) { editing = Category(name = "", kind = kind, icon = "tag", color = 0, sortOrder = cats.size) }
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
            Segmented(listOf("EXPENSE" to "هزینه", "INCOME" to "درآمد"), kind) { kind = it }
        }
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 40.dp)) {
            Group(Modifier.padding(top = 4.dp)) {
                cats.forEachIndexed { i, c ->
                    if (i > 0) Divider()
                    Row(
                        Modifier.fillMaxWidth().clickable { editing = c }.padding(vertical = 9.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        CatIcon(Ic.category(c.icon), C.cat[c.color.mod(C.cat.size)], 38.dp)
                        T(c.name, 13.5f, 600, modifier = Modifier.weight(1f))
                        Ico(Ic.pen, 15.dp, C.muted)
                    }
                }
            }
        }
    }
    editing?.let { CategoryDialog(it) { editing = null } }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CategoryDialog(c: Category, onDismiss: () -> Unit) {
    val dao = app().dao
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(c.name) }
    var icon by remember { mutableStateOf(c.icon) }
    var color by remember { mutableIntStateOf(c.color) }
    var confirm by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = C.sheet,
        title = { T(if (c.id == 0L) "دسته جدید" else "ویرایش دسته", 17, 800) },
        text = {
            Column {
                Field(name, { name = it }, "نام دسته")
                Label("آیکون")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Ic.categoryKeys.forEach { k ->
                        Box(
                            Modifier.clip(RoundedCornerShape(14.dp)).border(2.dp, if (k == icon) C.lime else Color.Transparent, RoundedCornerShape(14.dp))
                                .clickable { icon = k }.padding(2.dp),
                        ) { CatIcon(Ic.category(k), C.cat[color], 38.dp) }
                    }
                }
                Label("رنگ")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    C.cat.forEachIndexed { i, col ->
                        Box(Modifier.size(26.dp).clip(CircleShape).background(col).border(if (i == color) 3.dp else 0.dp, C.ink, CircleShape).clickable { color = i })
                    }
                }
                if (c.id != 0L) T("حذف", 13, 700, C.bad, Modifier.padding(top = 16.dp).clickable { confirm = true })
            }
        },
        confirmButton = {
            TextButton({
                if (name.isNotBlank()) { scope.launch { dao.upsertCategory(c.copy(name = name.trim().take(60), icon = icon, color = color)) }; onDismiss() }
            }) { T("ذخیره", 14, 800, if (name.isBlank()) C.muted else C.accent) }
        },
        dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
    )
    if (confirm) Confirm("حذف دسته", "«${c.name}» حذف شود؟ تراکنش‌هایش «بدون دسته» می‌شوند.", "حذف", danger = true,
        onOk = { scope.launch { dao.deleteCategory(c) }; onDismiss() }, onDismiss = { confirm = false })
}

// ---------- backup ----------

@Composable
fun BackupScreen(activity: MainActivity, back: () -> Unit) {
    val app = app()
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var pendingImport by remember { mutableStateOf<String?>(null) }
    var encryptedImport by remember { mutableStateOf(false) }
    var showExport by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    fun toast(text: String) = Toast.makeText(ctx, text, Toast.LENGTH_LONG).show()

    val uri = activity.backupImport
    LaunchedEffect(uri) {
        if (uri != null) {
            busy = true
            try {
                val text = withContext(Dispatchers.IO) {
                    checkNotNull(ctx.contentResolver.openInputStream(uri)).use { file ->
                        val limit = 64 * 1024 * 1024
                        val output = java.io.ByteArrayOutputStream()
                        val buffer = ByteArray(8192)
                        var size = 0
                        while (true) {
                            val read = file.read(buffer)
                            if (read < 0) break
                            size += read
                            require(size <= limit)
                            output.write(buffer, 0, read)
                        }
                        output.toString("UTF-8")
                    }
                }
                encryptedImport = withContext(Dispatchers.Default) { Backup.isEncrypted(text) }
                pendingImport = text
            } catch (error: kotlinx.coroutines.CancellationException) {
                throw error
            } catch (_: Exception) {
                activity.dismissBackupImport()
                toast("فایل پشتیبان قابل خواندن نیست.")
            } finally {
                busy = false
            }
        }
    }

    Column(Modifier.fillMaxSize().glowBg()) {
        TopBar("پشتیبان‌گیری و بازیابی", back)
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Tile(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CatIcon(Ic.save, C.cat[0])
                    Column(Modifier.weight(1f)) {
                        T("پشتیبان رمزنگاری‌شدهٔ اطلاعات گوشی", 13.5f, 700)
                        T(backupAge(app.prefs.lastBackupAt), 11.5f, color = C.muted)
                    }
                }
                T("برای بازیابی به فایل و عبارت پشتیبان نیاز داری. عبارت را جدا از فایل نگه دار.",
                    12, color = C.t2, modifier = Modifier.padding(top = 10.dp))
            }
            LimeButton("ذخیره فایل پشتیبان", Modifier.fillMaxWidth(), Ic.save) { if (!busy) showExport = true }
            GhostButton("بازیابی از فایل", Modifier.fillMaxWidth(), Ic.upload) {
                if (!busy) activity.chooseBackupFile()
            }
        }
    }

    if (showExport || pendingImport != null) {
        BackupPasswordDialog(
            exporting = showExport,
            encrypted = encryptedImport,
            busy = busy,
            onDismiss = { showExport = false; pendingImport = null; activity.dismissBackupImport() },
        ) { password ->
            scope.launch {
                busy = true
                try {
                    if (showExport) {
                        val payload = Backup.export(app.dao, password)
                        showExport = false
                        val date = Jalali.of(System.currentTimeMillis())
                        activity.saveBackupFile("jibeman-${date.y}-${"%02d".format(date.m)}-${"%02d".format(date.d)}.json", payload)
                    } else {
                        val source = checkNotNull(pendingImport)
                        val count = Backup.import(app.dao, source, password)
                        pendingImport = null
                        activity.dismissBackupImport()
                        toast("بازیابی شد: ${Money.fa(count.toString())} تراکنش")
                    }
                    null
                } catch (error: Backup.BadFile) {
                    error.message ?: "فایل معتبر نیست."
                } catch (error: kotlinx.coroutines.CancellationException) {
                    throw error
                } catch (_: Exception) {
                    "عملیات پشتیبان‌گیری انجام نشد."
                } finally {
                    busy = false
                }?.let { toast(it) }
            }
        }
    }
}

@Composable
private fun BackupPasswordDialog(
    exporting: Boolean, encrypted: Boolean, busy: Boolean, onDismiss: () -> Unit, onConfirm: (String) -> Unit,
) {
    var password by remember { mutableStateOf("") }
    var confirmation by remember { mutableStateOf("") }
    val canConfirm = when {
        exporting -> password.codePointCount(0, password.length) >= BackupCipher.MIN_PASSWORD_LENGTH && password == confirmation
        encrypted -> password.isNotEmpty()
        else -> true
    }
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        containerColor = C.sheet,
        title = { T(if (exporting) "رمزنگاری فایل پشتیبان" else "بازیابی فایل پشتیبان", 16, 800) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                T(when {
                    exporting -> "یک عبارت مستقل با حداقل ۱۲ کاراکتر انتخاب کن. بازیابی بدون این عبارت ممکن نیست."
                    encrypted -> "اطلاعات فعلی با محتوای فایل جایگزین می‌شود."
                    else -> "این فایل قدیمی خواناست. اطلاعات فعلی جایگزین می‌شود. بعد از بازیابی پشتیبان رمزنگاری‌شده بگیر."
                }, 12, color = C.t2)
                if (exporting || encrypted) {
                    Field(password, { password = it }, "عبارت پشتیبان", keyboardType = KeyboardType.Password,
                        visualTransformation = PasswordVisualTransformation())
                }
                if (exporting) {
                    Field(confirmation, { confirmation = it }, "تکرار عبارت پشتیبان", keyboardType = KeyboardType.Password,
                        visualTransformation = PasswordVisualTransformation())
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(password) }, enabled = canConfirm && !busy) {
                T(if (exporting) "ذخیره" else "بازیابی", 14, 700, if (canConfirm && !busy) C.accent else C.muted)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { T("انصراف", 14, color = C.t2) } },
    )
}

// ---------- security ----------

enum class PinDialogMode { SETUP, CHANGE, REMOVE }

@Composable
fun SecurityScreen(back: () -> Unit) {
    val app = app()
    val activity = LocalContext.current as FragmentActivity
    val canBiometric = remember {
        BiometricManager.from(activity).canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.BIOMETRIC_WEAK
        ) == BiometricManager.BIOMETRIC_SUCCESS
    }
    var pinDialogMode by remember { mutableStateOf<PinDialogMode?>(null) }

    Column(Modifier.fillMaxSize().glowBg()) {
        TopBar("امنیت و قفل", back)
        Column(
            Modifier
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // PIN Lock Tile
            Tile(Modifier.fillMaxWidth()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    CatIcon(Ic.lock, C.cat[7])
                    Column(Modifier.weight(1f)) {
                        T("قفل با رمز پین", 14, 700)
                        T("رمز ۴ رقمی برای ورود به برنامه", 11.5f, color = C.muted)
                    }
                    Switch(
                        checked = app.prefs.lockEnabled && app.prefs.hasPin,
                        onCheckedChange = { on ->
                            if (on) {
                                pinDialogMode = PinDialogMode.SETUP
                            } else {
                                pinDialogMode = PinDialogMode.REMOVE
                            }
                        },
                        colors = SwitchDefaults.colors(checkedTrackColor = C.lime, checkedThumbColor = C.onLime),
                    )
                }

                if (app.prefs.lockEnabled && app.prefs.hasPin) {
                    Divider()
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(top = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        T("رمز عبور ۴ رقمی فعال است", 11.5f, color = C.muted)
                        T(
                            "تغییر رمز پین", 12.5f, 700, C.sky,
                            modifier = Modifier.clickable { pinDialogMode = PinDialogMode.CHANGE }
                        )
                    }
                }
            }

            // Biometric Tile
            Tile(Modifier.fillMaxWidth()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    CatIcon(Ic.fingerprint, C.sky)
                    Column(Modifier.weight(1f)) {
                        T("ورود با اثر انگشت یا چهره", 14, 700)
                        T("استفاده از حسگر بیومتریک گوشی", 11.5f, color = C.muted)
                    }
                    Switch(
                        checked = app.prefs.biometricEnabled,
                        enabled = canBiometric && app.prefs.hasPin,
                        onCheckedChange = { on ->
                            if (on) {
                                activity.authenticate("فعال‌سازی اثر انگشت") {
                                    app.prefs.biometricEnabled = true
                                }
                            } else {
                                app.prefs.biometricEnabled = false
                            }
                        },
                        colors = SwitchDefaults.colors(checkedTrackColor = C.lime, checkedThumbColor = C.onLime),
                    )
                }
                if (!canBiometric) {
                    T("حسگر اثر انگشت یا قفل بیومتریک در این گوشی تعریف نشده یا در دسترس نیست.", 11.5f, color = C.warn, modifier = Modifier.padding(top = 10.dp))
                } else if (!app.prefs.hasPin) {
                    T("برای فعال‌کردن اثر انگشت، ابتدا رمز پین برنامه را فعال کنید.", 11.5f, color = C.muted, modifier = Modifier.padding(top = 10.dp))
                }
            }

            // Auto-lock Timeout Tile
            if (app.prefs.lockEnabled && app.prefs.hasPin) {
                Tile(Modifier.fillMaxWidth()) {
                    T("زمان قفل خودکار", 13.5f, 700)
                    T("مدت زمان بعد از بیرون‌رفتن از برنامه برای قفل شدن دوباره", 11.5f, color = C.muted, modifier = Modifier.padding(top = 2.dp, bottom = 10.dp))
                    val timeouts = listOf(
                        0L to "بلافاصله",
                        30_000L to "۳۰ ثانیه",
                        60_000L to "۱ دقیقه",
                        300_000L to "۵ دقیقه"
                    )
                    Segmented(timeouts, app.prefs.lockTimeoutMs) { app.prefs.lockTimeoutMs = it }
                }
            }

            // Info Tile
            Tile(Modifier.fillMaxWidth()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    CatIcon(Ic.shield, C.cat[3])
                    T("رمز پین به صورت هش‌شده با الگوریتم امن SHA-256 و کلید تصادفی (Salt) فقط در همین دستگاه نگهداری می‌شود و پایگاه داده با SQLCipher رمزنگاری شده است.", 12, color = C.t2, modifier = Modifier.weight(1f))
                }
            }
        }
    }

    pinDialogMode?.let { mode ->
        PinDialog(mode) { pinDialogMode = null }
    }
}

@Composable
fun PinDialog(
    mode: PinDialogMode,
    onDismiss: () -> Unit,
) {
    val app = app()
    var step by remember { mutableIntStateOf(if (mode == PinDialogMode.SETUP) 1 else 0) } // 0: old, 1: new, 2: confirm
    var oldPin by remember { mutableStateOf("") }
    var newPin by remember { mutableStateOf("") }
    var confirmPin by remember { mutableStateOf("") }
    var errorMsg by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val currentInput = when (step) {
        0 -> oldPin
        1 -> newPin
        else -> confirmPin
    }

    val title = when (mode) {
        PinDialogMode.SETUP -> "تنظیم رمز عبور پین"
        PinDialogMode.CHANGE -> "تغییر رمز عبور پین"
        PinDialogMode.REMOVE -> "غیرفعال‌سازی قفل"
    }

    val prompt = when (step) {
        0 -> "رمز فعلی را وارد کنید"
        1 -> "رمز ۴ رقمی جدید را وارد کنید"
        else -> "رمز جدید را دوباره تکرار کنید"
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = C.sheet,
        title = { T(title, 17, 800) },
        text = {
            Column(
                Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                T(prompt, 13, color = C.t2)
                errorMsg?.let { T(it, 11.5f, color = C.bad) }
                PinDots(
                    length = currentInput.length,
                    isError = errorMsg != null,
                    modifier = Modifier.padding(vertical = 4.dp)
                )
                PinKeypad(
                    onDigit = { d ->
                        if (currentInput.length < 4) {
                            val next = currentInput + d
                            errorMsg = null
                            when (step) {
                                0 -> {
                                    oldPin = next
                                    if (next.length == 4) {
                                        if (app.prefs.verifyPin(next)) {
                                            if (mode == PinDialogMode.REMOVE) {
                                                app.prefs.removePin()
                                                onDismiss()
                                            } else {
                                                step = 1
                                            }
                                        } else {
                                            errorMsg = "رمز فعلی اشتباه است"
                                            scope.launch {
                                                kotlinx.coroutines.delay(400)
                                                oldPin = ""
                                            }
                                        }
                                    }
                                }
                                1 -> {
                                    newPin = next
                                    if (next.length == 4) {
                                        step = 2
                                    }
                                }
                                2 -> {
                                    confirmPin = next
                                    if (next.length == 4) {
                                        if (next == newPin) {
                                            app.prefs.setPin(newPin)
                                            onDismiss()
                                        } else {
                                            errorMsg = "رمز و تکرار آن یکسان نیست"
                                            scope.launch {
                                                kotlinx.coroutines.delay(600)
                                                confirmPin = ""
                                                newPin = ""
                                                step = 1
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    onDelete = {
                        errorMsg = null
                        when (step) {
                            0 -> if (oldPin.isNotEmpty()) oldPin = oldPin.dropLast(1)
                            1 -> if (newPin.isNotEmpty()) newPin = newPin.dropLast(1)
                            2 -> if (confirmPin.isNotEmpty()) confirmPin = confirmPin.dropLast(1)
                        }
                    },
                    onBiometric = null,
                )
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) }
        }
    )
}
