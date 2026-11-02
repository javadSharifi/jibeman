package ir.jibeman.feature

import android.Manifest
import android.content.pm.PackageManager
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.jibeman.App
import ir.jibeman.app
import ir.jibeman.core.Banks
import ir.jibeman.core.Jalali
import ir.jibeman.core.Money
import ir.jibeman.core.db.AccType
import ir.jibeman.core.db.BalanceCheck
import ir.jibeman.core.db.Category
import ir.jibeman.core.db.RawRow
import ir.jibeman.core.db.Rule
import ir.jibeman.core.db.TxType
import ir.jibeman.core.db.Txn
import ir.jibeman.core.sms.scanInbox
import ir.jibeman.ui.C
import ir.jibeman.ui.CatIcon
import ir.jibeman.ui.Empty
import ir.jibeman.ui.GhostButton
import ir.jibeman.ui.Ic
import ir.jibeman.ui.Ico
import ir.jibeman.ui.LimeButton
import ir.jibeman.ui.Mono
import ir.jibeman.ui.T
import ir.jibeman.ui.Tile
import ir.jibeman.ui.TopBar
import ir.jibeman.ui.glowBg
import kotlinx.coroutines.launch

private const val READY = 90
private const val SCAN_DAYS = 90L

private fun hasSms(ctx: android.content.Context) =
    ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED &&
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED

@Composable
fun SmsReviewScreen(back: () -> Unit, add: (AddReq) -> Unit) {
    val app = app()
    val dao = app.dao
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var granted by remember { mutableStateOf(hasSms(ctx)) }
    var scanning by remember { mutableStateOf<String?>(null) }
    val pending by remember { dao.pending() }.collectAsStateWithLifecycle(emptyList())
    val checks by remember { dao.balanceChecks() }.collectAsStateWithLifecycle(emptyList())
    val accounts by remember { dao.balances() }.collectAsStateWithLifecycle(emptyList())
    val expenseCats by remember { dao.categories("EXPENSE") }.collectAsStateWithLifecycle(emptyList())
    val incomeCats by remember { dao.categories("INCOME") }.collectAsStateWithLifecycle(emptyList())
    val makeRule = remember { mutableStateMapOf<Long, Boolean>() } // per message, default on
    val gaps = checks.filter { it.bank != it.app }
    val ready = pending.filter { it.raw.confidence >= READY && it.raw.accountId != null && it.accountName != null }
    fun toast(s: String) = Toast.makeText(ctx, s, Toast.LENGTH_SHORT).show()

    suspend fun accept(r: RawRow): Long? {
        val accId = r.raw.accountId?.takeIf { r.accountName != null } ?: run { toast("اول حساب را انتخاب کن"); return null }
        val id = dao.acceptRaw(r.raw, accId, r.raw.categoryId)
        val desc = r.raw.description
        if (desc != null && r.raw.categoryId != null && makeRule[r.raw.id] != false) {
            if (!dao.simpleRuleExists(desc)) dao.upsertRule(Rule(contains = desc, categoryId = r.raw.categoryId))
            dao.applyRuleToPending(desc, r.raw.categoryId)
        }
        return id
    }

    val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        granted = hasSms(ctx)
        if (granted) app.prefs.smsEnabled = true
    }

    LazyColumn(Modifier.fillMaxSize().glowBg(), contentPadding = PaddingValues(bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { TopBar("پیامک‌های بانک", back) }

        if (!granted) item {
            Tile(Modifier.padding(horizontal = 16.dp).fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CatIcon(Ic.msg, C.accent)
                    T("ثبت خودکار از پیامک بانک", 14, 700, modifier = Modifier.weight(1f))
                }
                T(
                    "جیب من پیامک‌های کشاورزی و بلو را می‌خواند و تراکنش را برای تأیید تو آماده می‌کند. " +
                        "پیامک‌ها از گوشی بیرون نمی‌روند (برنامه اجازه اینترنت ندارد) و پیامک‌های غیربانکی اصلاً پردازش نمی‌شوند.",
                    12.5f, color = C.t2, modifier = Modifier.padding(top = 10.dp, bottom = 12.dp),
                )
                LimeButton("اجازه خواندن پیامک", Modifier.fillMaxWidth(), Ic.check) {
                    permLauncher.launch(arrayOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS))
                }
            }
        } else item {
            Tile(Modifier.padding(horizontal = 16.dp).fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CatIcon(Ic.msg, C.accent, 36.dp)
                    Column(Modifier.weight(1f)) {
                        T("دریافت خودکار پیامک", 13.5f, 700)
                        T(Banks.all.filter { it.code == "keshavarzi" || it.code == "blu" }.joinToString("، ") { it.name }, 11, color = C.muted)
                    }
                    Switch(app.prefs.smsEnabled, { app.prefs.smsEnabled = it }, colors = SwitchDefaults.colors(checkedTrackColor = C.lime, checkedThumbColor = C.onLime))
                }
                GhostButton(scanning ?: "خواندن پیامک‌های ۳ ماه اخیر", Modifier.padding(top = 10.dp).fillMaxWidth(), Ic.search) {
                    if (scanning != null) return@GhostButton
                    scanning = "در حال خواندن…"
                    scope.launch {
                        val (added, dup) = scanInbox(ctx, (ctx.applicationContext as App).smsIngest, System.currentTimeMillis() - SCAN_DAYS * 86_400_000L) { i, n ->
                            scanning = "در حال خواندن… ${Money.fa(i.toString())} از ${Money.fa(n.toString())}"
                        }
                        scanning = null
                        toast(if (added == 0) "پیامک بانکی جدیدی پیدا نشد" else "${Money.fa(added.toString())} پیامک بانکی پیدا شد" + if (dup > 0) " (${Money.fa(dup.toString())} تکراری)" else "")
                    }
                }
            }
        }

        items(gaps, key = { "gap" + it.accountId }) { g -> GapNotice(g, app.prefs.hideAmounts) { scope.launch { dao.upsertTxn(Txn(type = TxType.ADJUST, amount = g.bank - g.app, accountId = g.accountId, title = "تعدیل با پیامک بانک", occurredAt = g.at)) } } }

        if (ready.isNotEmpty()) item {
            Row(
                Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(C.surface)
                    .border(1.dp, C.line, RoundedCornerShape(18.dp)).padding(start = 12.dp, end = 10.dp, top = 10.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Column(Modifier.weight(1f)) {
                    T("${Money.fa(ready.size.toString())} مورد آماده تأیید", 13, 700)
                    T("اطمینان بالا و حساب مشخص", 10.5f, color = C.muted)
                }
                LimeButton("تأیید همه", height = 38.dp) { scope.launch { ready.forEach { accept(it) } } }
            }
        }

        if (pending.isEmpty()) item { Empty(if (granted) "پیامکی در انتظار بررسی نیست." else "بعد از دادن اجازه، پیامک‌های بانک این‌جا می‌آیند.") }

        items(pending, key = { it.raw.id }) { r ->
            ReviewCard(
                r, accounts.map { it.account }.filter { it.type == AccType.BANK && it.bankCode == r.raw.bank }.ifEmpty { accounts.map { it.account } },
                if (r.raw.type == TxType.INCOME) incomeCats else expenseCats, makeRule[r.raw.id] != false,
                onAccount = { scope.launch { dao.setRawAccount(r.raw.id, it) } },
                onCategory = { scope.launch { dao.setRawCategory(r.raw.id, it) } },
                onRule = { makeRule[r.raw.id] = it },
                onAccept = { scope.launch { accept(r) } },
                onEdit = { scope.launch { accept(r)?.let { add(AddReq(txnId = it)) } } },
                onReject = { scope.launch { dao.rejectRaw(r.raw.id) } },
            )
        }
    }
}

@Composable
private fun GapNotice(g: BalanceCheck, hide: Boolean, onAdjust: () -> Unit) = Row(
    Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(C.warn.copy(alpha = 0.08f))
        .border(1.dp, C.warn.copy(alpha = 0.22f), RoundedCornerShape(18.dp)).padding(12.dp),
    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
) {
    Ico(Ic.alert, 20.dp, C.warn)
    Column(Modifier.weight(1f)) {
        T("${g.accountName}: موجودی با بانک جور نیست", 12.5f, 700)
        T("طبق بانک: ${if (hide) Money.HIDDEN else Money.toman(g.bank)} تومان", 11, color = C.t2)
        T("در برنامه: ${if (hide) Money.HIDDEN else Money.toman(g.app)} تومان", 11, color = C.t2)
    }
    Box(Modifier.height(34.dp).clip(RoundedCornerShape(12.dp)).background(C.warn.copy(alpha = 0.16f)).clickable(onClick = onAdjust).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
        T("ثبت تعدیل", 12, 800, C.warn)
    }
}

@Composable
private fun ReviewCard(
    r: RawRow, accounts: List<ir.jibeman.core.db.Account>, cats: List<Category>, rule: Boolean,
    onAccount: (Long) -> Unit, onCategory: (Long?) -> Unit, onRule: (Boolean) -> Unit,
    onAccept: () -> Unit, onEdit: () -> Unit, onReject: () -> Unit,
) {
    val m = r.raw
    val bank = Banks.of(m.bank)
    val hi = m.confidence >= READY && r.accountName != null
    var showRaw by remember { mutableStateOf(!hi) }
    var accMenu by remember { mutableStateOf(false) }
    var catMenu by remember { mutableStateOf(false) }
    Column(
        Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(C.surface)
            .border(1.dp, C.line, RoundedCornerShape(22.dp)).padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Mono(m.bank, AccType.BANK, 28.dp)
            Column(Modifier.weight(1f)) {
                T(bank?.name ?: m.bank, 13.5f, 700)
                T(Jalali.shortDateTime(m.occurredAt), 10.5f, color = C.muted)
            }
            val c = if (hi) C.ok else C.warn
            Row(
                Modifier.clip(RoundedCornerShape(9.dp)).background(c.copy(alpha = 0.13f)).padding(horizontal = 8.dp, vertical = 3.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Ico(if (hi) Ic.check else Ic.alert, 13.dp, c)
                T("${Money.fa(m.confidence.toString())}٪", 11, 700, c)
            }
        }
        Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.Bottom) {
            T(m.description ?: if (m.type == TxType.INCOME) "واریز" else "برداشت", 12, color = C.t2, modifier = Modifier.weight(1f), maxLines = 1)
            T(Money.toman(if (m.type == TxType.INCOME) m.amount else -m.amount, plus = true), 22, 800, if (m.type == TxType.INCOME) C.ok else C.ink)
            T("تومان", 11, color = C.muted, modifier = Modifier.padding(start = 4.dp, bottom = 4.dp))
        }
        Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.weight(1f)) {
                Cell("حساب", r.accountName ?: "انتخاب کنید", if (r.accountName == null) C.warn else C.ink, chevron = true) { accMenu = true }
                DropdownMenu(accMenu, { accMenu = false }, containerColor = C.sheet) {
                    accounts.forEach { a -> DropdownMenuItem({ T(a.name) }, { onAccount(a.id); accMenu = false }) }
                }
            }
            Box(Modifier.weight(1f)) {
                Cell("دسته", r.categoryName ?: "انتخاب کنید", if (r.categoryName == null) C.warn else C.ink, chevron = true) { catMenu = true }
                DropdownMenu(catMenu, { catMenu = false }, containerColor = C.sheet) {
                    DropdownMenuItem({ T("بدون دسته", color = C.muted) }, { onCategory(null); catMenu = false })
                    cats.forEach { c ->
                        DropdownMenuItem(
                            { Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { CatIcon(Ic.category(c.icon), C.cat[c.color.mod(C.cat.size)], 28.dp); T(c.name) } },
                            { onCategory(c.id); catMenu = false },
                        )
                    }
                }
            }
        }
        Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.weight(1f)) { Cell("مانده طبق بانک", m.balance?.let { Money.toman(it) } ?: "—", C.ink) {} }
            if (m.card4 != null || m.accountNo != null) Box(Modifier.weight(1f)) {
                Cell(if (m.card4 != null) "کارت" else "شماره حساب", m.card4?.let { "⁦•• ${Money.fa(it)}⁩" } ?: Money.fa(m.accountNo.orEmpty()), C.ink) {}
            }
        }
        if (m.description != null && m.categoryId != null) Row(
            Modifier.padding(top = 8.dp).clip(RoundedCornerShape(12.dp)).clickable { onRule(!rule) }.padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Box(
                Modifier.size(18.dp).clip(RoundedCornerShape(5.dp)).background(if (rule) C.lime else Color.Transparent).border(1.5.dp, if (rule) C.lime else C.muted, RoundedCornerShape(5.dp)),
                contentAlignment = Alignment.Center,
            ) { if (rule) Ico(Ic.check, 13.dp, C.onLime) }
            T("از این به بعد «${m.description}» را «${r.categoryName}» بزن", 11.5f, color = C.t2, maxLines = 1)
        }
        Row(Modifier.padding(top = 10.dp).clickable { showRaw = !showRaw }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Ico(Ic.msg, 14.dp, C.muted)
            T("متن پیامک", 11, color = C.muted)
            Ico(Ic.chevDown, 14.dp, C.muted)
        }
        if (showRaw) T(
            m.body, 11.5f, color = C.t2,
            modifier = Modifier.padding(top = 6.dp).fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(C.ink.copy(alpha = 0.035f)).padding(10.dp),
        )
        Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            LimeButton("تأیید", Modifier.weight(1f), Ic.check, height = 42.dp, onClick = onAccept)
            SmallBtn(Ic.pen, onEdit)
            SmallBtn(Ic.x, onReject)
        }
    }
}

@Composable
private fun Cell(label: String, value: String, color: Color, chevron: Boolean = false, onClick: () -> Unit) = Row(
    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(C.ink.copy(alpha = 0.035f)).clickable(onClick = onClick).padding(horizontal = 10.dp, vertical = 7.dp),
    verticalAlignment = Alignment.CenterVertically,
) {
    Column(Modifier.weight(1f)) {
        T(label, 10, color = C.muted)
        T(value, 12.5f, 700, color, maxLines = 1)
    }
    if (chevron) Ico(Ic.chevDown, 14.dp, C.muted)
}

@Composable
private fun SmallBtn(icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) = Box(
    Modifier.size(42.dp).clip(RoundedCornerShape(13.dp)).background(C.ink.copy(alpha = 0.06f)).border(1.dp, C.line, RoundedCornerShape(13.dp)).clickable(onClick = onClick),
    contentAlignment = Alignment.Center,
) { Ico(icon, 17.dp, C.t2) }
