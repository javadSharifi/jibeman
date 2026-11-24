package ir.jibeman.feature

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.jibeman.app
import ir.jibeman.core.Jalali
import ir.jibeman.core.Loans
import ir.jibeman.core.Money
import ir.jibeman.core.db.Installment
import ir.jibeman.core.db.InstallmentRow
import ir.jibeman.core.db.Loan
import ir.jibeman.ui.BottomSpace
import ir.jibeman.ui.C
import ir.jibeman.ui.CatIcon
import ir.jibeman.ui.CircleBtn
import ir.jibeman.ui.Confirm
import ir.jibeman.ui.Divider
import ir.jibeman.ui.Empty
import ir.jibeman.ui.AmountField
import ir.jibeman.ui.Field
import ir.jibeman.ui.GhostButton
import ir.jibeman.ui.GlassCard
import ir.jibeman.ui.Group
import ir.jibeman.ui.Ic
import ir.jibeman.ui.Ico
import ir.jibeman.ui.JDateDialog
import ir.jibeman.ui.Label
import ir.jibeman.ui.LimeButton
import ir.jibeman.ui.PickField
import ir.jibeman.ui.Segments
import ir.jibeman.ui.Segmented
import ir.jibeman.ui.T
import ir.jibeman.ui.Tile
import ir.jibeman.ui.TopBar
import ir.jibeman.ui.amount
import ir.jibeman.ui.glass
import ir.jibeman.ui.glowBg
import kotlinx.coroutines.launch

private fun daysLeft(at: Long): Int = ((Jalali.dayStart(at) - Jalali.dayStart(System.currentTimeMillis())) / 86_400_000L).toInt()

fun dueText(at: Long): String {
    val d = daysLeft(at)
    return when {
        d < 0 -> "${Money.fa((-d).toString())} روز گذشته"
        d == 0 -> "امروز"
        d == 1 -> "فردا"
        else -> "${Money.fa(d.toString())} روز دیگر"
    }
}

fun dueColor(at: Long) = daysLeft(at).let { if (it < 0) C.bad else if (it <= 3) C.warn else C.muted }

@Composable
fun LoansScreen(back: () -> Unit, go: (Route) -> Unit) {
    val app = app()
    val hide = app.prefs.hideAmounts
    val loans by remember { app.dao.loans() }.collectAsStateWithLifecycle(emptyList())
    LazyColumn(Modifier.fillMaxSize().glowBg(), contentPadding = PaddingValues(bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { TopBar("وام و اقساط", back, action = Ic.plus) { go(Route.EditLoan(0)) } }
        if (loans.isNotEmpty()) item {
            val left = loans.sumOf { (it.loan.count - it.paidCount) * it.loan.installment }
            val monthly = loans.filter { it.nextDue != null }.sumOf { it.loan.installment }
            Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Tile(Modifier.weight(1f)) { T("مانده کل اقساط", 12, color = C.t2); T(amount(left, hide), 17, 800, modifier = Modifier.padding(top = 6.dp)); T("تومان", 10.5f, color = C.muted) }
                Tile(Modifier.weight(1f)) { T("قسط ماهانه", 12, color = C.t2); T(amount(monthly, hide), 17, 800, modifier = Modifier.padding(top = 6.dp)); T("تومان", 10.5f, color = C.muted) }
            }
        }
        if (loans.isEmpty()) item { Empty("وامی ثبت نشده. مبلغ و تعداد اقساط را از جدول بانک وارد کن تا سررسیدها یادآوری شوند.", "افزودن وام") { go(Route.EditLoan(0)) } }
        items(loans, key = { it.loan.id }) { l ->
            Column(
                Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(C.surface)
                    .border(1.dp, C.line, RoundedCornerShape(22.dp)).clickable { go(Route.LoanDetail(l.loan.id)) }.padding(14.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CatIcon(Ic.bank, C.cat[0])
                    Column(Modifier.weight(1f)) {
                        T(l.loan.title, 14, 700, maxLines = 1)
                        T("${Money.fa(l.paidCount.toString())} از ${Money.fa(l.loan.count.toString())} قسط پرداخت شده", 11, color = C.muted)
                    }
                    Ico(Ic.chevLeft, 16.dp, C.muted)
                }
                Segments(l.loan.count, l.paidCount, Modifier.padding(top = 12.dp))
                if (l.nextDue != null) Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    T("قسط بعد: ${Jalali.longDate(l.nextDue)}", 12, color = C.t2, modifier = Modifier.weight(1f))
                    T(dueText(l.nextDue), 12, 700, dueColor(l.nextDue))
                } else T("تسویه شد", 12, 700, C.ok, Modifier.padding(top = 10.dp))
            }
        }
    }
}

@Composable
fun LoanDetailScreen(id: Long, back: () -> Unit, go: (Route) -> Unit) {
    val ctx = LocalContext.current
    val app = app()
    val dao = app.dao
    val hide = app.prefs.hideAmounts
    val scope = rememberCoroutineScope()
    val loans by remember { dao.loans() }.collectAsStateWithLifecycle(null)
    val rows by remember { dao.installments(id) }.collectAsStateWithLifecycle(emptyList())
    var paying by remember { mutableStateOf<InstallmentRow?>(null) }
    var undo by remember { mutableStateOf<InstallmentRow?>(null) }
    val l = loans?.firstOrNull { it.loan.id == id }
    if (loans != null && l == null) { LaunchedEffect(Unit) { back() }; return }
    if (l == null) return

    LazyColumn(Modifier.fillMaxSize().glowBg(), contentPadding = PaddingValues(bottom = 40.dp)) {
        item {
            TopBar(l.loan.title, back, action = Ic.pen) { go(Route.EditLoan(id)) }
            GlassCard(Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth(), contentPadding = PaddingValues(16.dp)) {
                T(l.loan.lender?.let { "وام از $it" } ?: "وام", 12, color = Color.White.copy(alpha = 0.9f))
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    T(amount((l.loan.count - l.paidCount) * l.loan.installment, hide), 28, 800)
                    T("تومان مانده", 12, modifier = Modifier.padding(bottom = 6.dp))
                }
                T("قسط ${amount(l.loan.installment, hide)} تومان · ${Money.fa(l.paidCount.toString())} از ${Money.fa(l.loan.count.toString())}", 11.5f, color = Color.White.copy(alpha = 0.9f))
                Segments(l.loan.count, l.paidCount, Modifier.padding(top = 12.dp), light = true)
            }
            T("روی هر قسط بزن تا پرداختش ثبت شود؛ مبلغ از حساب کم و تراکنش «قسط و وام» ساخته می‌شود.", 11.5f, color = C.muted, modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp))
        }
        item {
            Group {
                rows.forEachIndexed { idx, r ->
                    if (idx > 0) Divider()
                    val paid = r.isPaid
                    Row(
                        Modifier.fillMaxWidth().clickable { if (paid) undo = r else paying = r }.padding(vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(
                            Modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(if (paid) C.ok.copy(alpha = 0.14f) else C.ink.copy(alpha = 0.05f)),
                            contentAlignment = Alignment.Center,
                        ) { if (paid) Ico(Ic.check, 17.dp, C.ok) else T(Money.fa(r.i.n.toString()), 12, 700, C.t2) }
                        Column(Modifier.weight(1f)) {
                            T(Jalali.longDate(r.i.dueAt), 13, 600)
                            T(if (paid) "پرداخت شد ${r.paidAt?.let { Jalali.shortDateTime(it) } ?: ""}" else dueText(r.i.dueAt), 11, color = if (paid) C.ok else dueColor(r.i.dueAt))
                        }
                        T(amount(r.i.amount, hide), 13, 700, if (paid) C.muted else C.ink)
                    }
                }
            }
        }
    }

    paying?.let { r ->
        PayDialog("پرداخت قسط ${Money.fa(r.i.n.toString())}", r.i.amount, l.loan, onDismiss = { paying = null }) { acc, at ->
            scope.launch {
                val paid = dao.payInstallment(r.i.id, acc, at, "قسط ${Money.fa(r.i.n.toString())} · ${l.loan.title}")
                if (paid == null) Toast.makeText(ctx, "قسط یا حساب پرداخت در دسترس نیست.", Toast.LENGTH_SHORT).show()
            }
        }
    }
    undo?.let { r ->
        val msg = if (r.i.paidTxnId != null) {
            "تراکنش پرداخت این قسط حذف و مبلغ به حساب برمی‌گردد."
        } else {
            "این قسط به عنوان پرداخت‌نشده علامت‌گذاری می‌شود و تغییری در حساب‌ها ایجاد نمی‌شود."
        }
        Confirm("لغو پرداخت", msg, "لغو پرداخت", danger = true,
            onOk = {
                scope.launch {
                    if (r.i.paidTxnId != null) {
                        dao.deleteTxn(r.i.paidTxnId)
                    } else {
                        dao.unmarkInstallmentPaid(r.i.id)
                    }
                }
            }, onDismiss = { undo = null })
    }
}

/** Pick account + date for a payment of a fixed amount. */
@Composable
private fun PayDialog(title: String, rial: Long, loan: Loan, onDismiss: () -> Unit, onPay: (accountId: Long, at: Long) -> Unit) {
    val dao = app().dao
    val accounts by remember { dao.balances() }.collectAsStateWithLifecycle(emptyList())
    var manualAccount by remember { mutableStateOf<Long?>(null) }
    val availableIds = accounts.map { it.account.id }
    val acc = manualAccount ?: loan.suggestedPaymentAccount(availableIds) ?: 0L
    var at by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var pick by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = C.sheet,
        title = { T(title, 17, 800) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                T("${Money.toman(rial)} تومان", 22, 800)
                AccountPicker(accounts, acc, "برداشت از", Modifier.fillMaxWidth()) { manualAccount = it }
                PickField(Jalali.longDate(at), Ic.cal) { pick = true }
            }
        },
        confirmButton = {
            TextButton(onClick = { onPay(acc, at); onDismiss() }, enabled = acc in availableIds) {
                T("ثبت پرداخت", 14, 800, if (acc in availableIds) C.accent else C.muted)
            }
        },
        dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
    )
    // keep the time of day so today's payment sorts after earlier transactions
    if (pick) JDateDialog("تاریخ پرداخت", at, { at = it + (System.currentTimeMillis() - Jalali.dayStart(System.currentTimeMillis())) }) { pick = false }
}

data class FormScheduleItem(
    val n: Int,
    val dueAt: Long,
    val amount: Long,
    val isPaid: Boolean,
    val paidAt: Long? = null,
    val hasTxn: Boolean = false,
    val paidTxnId: Long? = null,
)

private fun computeFirstDueFromNext(nextDueAt: Long, paidCount: Int): Long {
    val j = Jalali.of(nextDueAt)
    val totalMonths = j.y * 12 + (j.m - 1) - paidCount
    val y = totalMonths / 12
    val m = (totalMonths % 12) + 1
    val maxD = Jalali.monthDays(y, m)
    return Jalali.millis(y, m, minOf(j.d, maxD))
}

@Composable
fun EditLoanScreen(id: Long, back: () -> Unit) {
    val app = app()
    val dao = app.dao
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val accounts by remember { dao.balances() }.collectAsStateWithLifecycle(emptyList())
    var original by remember { mutableStateOf<Loan?>(null) }
    var loaded by remember { mutableStateOf(id == 0L) }
    var mode by remember { mutableStateOf("NEW") } // "NEW" or "ACTIVE"
    var title by remember { mutableStateOf("") }
    var lender by remember { mutableStateOf("") }
    var principal by remember { mutableStateOf("") }
    var installment by remember { mutableStateOf("") }
    var count by remember { mutableStateOf("") }
    var rate by remember { mutableStateOf("") }
    var paidCountInput by remember { mutableStateOf("0") }
    var dateTarget by remember { mutableStateOf("FIRST") } // "FIRST" or "NEXT"
    var baseDate by remember { mutableLongStateOf(Jalali.dayStart(Jalali.addDays(System.currentTimeMillis(), 30))) }
    var payAccount by remember { mutableLongStateOf(0) }
    var receiveAccount by remember { mutableLongStateOf(0) }
    var received by remember { mutableStateOf(false) }
    var pickDate by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var showPlans by remember { mutableStateOf(false) }
    var pickedPlan by remember { mutableStateOf<String?>(null) }
    var showSchedule by remember { mutableStateOf(false) }
    var scheduleItems by remember { mutableStateOf<List<FormScheduleItem>>(emptyList()) }

    LaunchedEffect(id) {
        if (id != 0L) dao.loan(id)?.let { l ->
            original = l
            title = l.title
            lender = l.lender.orEmpty()
            principal = Money.tomanInput(l.principal)
            installment = Money.tomanInput(l.installment)
            count = l.count.toString()
            baseDate = l.firstDueAt
            payAccount = l.accountId ?: 0
            receiveAccount = l.receiveAccountId ?: 0
            mode = "ACTIVE"

            val existingInsts = dao.loanInstallments(id)
            val items = existingInsts.map {
                val hasTxn = it.paidTxnId != null
                val isPaid = hasTxn || it.paidAt != null
                FormScheduleItem(
                    n = it.n,
                    dueAt = it.dueAt,
                    amount = it.amount,
                    isPaid = isPaid,
                    paidAt = it.paidAt,
                    hasTxn = hasTxn,
                    paidTxnId = it.paidTxnId,
                )
            }
            scheduleItems = items
            paidCountInput = items.count { it.isPaid }.toString()
        }
        loaded = true
    }
    if (!loaded) return
    fun toast(s: String) = Toast.makeText(ctx, s, Toast.LENGTH_SHORT).show()

    // Rebuild schedule whenever inputs change for new loans
    LaunchedEffect(mode, count, installment, baseDate, dateTarget, paidCountInput) {
        if (original == null) {
            val n = Money.ascii(count).toIntOrNull() ?: 0
            val inst = Money.parseToman(installment) ?: 0L
            val pCount = if (mode == "ACTIVE") (Money.ascii(paidCountInput).toIntOrNull() ?: 0).coerceAtLeast(0) else 0
            if (n in 1..600 && inst > 0L) {
                val firstDue = if (mode == "ACTIVE" && dateTarget == "NEXT") computeFirstDueFromNext(baseDate, pCount) else baseDate
                val defaultList = Loans.schedule(firstDue, n, inst)
                scheduleItems = defaultList.map { item ->
                    val paid = mode == "ACTIVE" && item.n <= pCount
                    FormScheduleItem(
                        n = item.n,
                        dueAt = item.dueAt,
                        amount = item.amount,
                        isPaid = paid,
                        paidAt = if (paid) item.dueAt else null,
                    )
                }
            }
        }
    }

    // Summary calculations
    val todayStart = Jalali.dayStart(System.currentTimeMillis())
    val totalRepayment = scheduleItems.sumOf { it.amount }
    val paidItems = scheduleItems.filter { it.isPaid }
    val unpaidItems = scheduleItems.filter { !it.isPaid }
    val paidCountVal = paidItems.size
    val paidAmount = paidItems.sumOf { it.amount }
    val remainingCountVal = unpaidItems.size
    val remainingAmount = unpaidItems.sumOf { it.amount }
    val overdueCount = unpaidItems.count { it.dueAt < todayStart }
    val nextDueItem = unpaidItems.minByOrNull { it.dueAt }

    Column(Modifier.fillMaxSize().glowBg()) {
        TopBar(if (id == 0L) "وام جدید" else "ویرایش وام", back)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).imePadding().padding(horizontal = 16.dp)) {
            // Mode selector (Fresh loan vs Already Active loan)
            if (id == 0L) {
                Segmented(listOf("NEW" to "وام تازه", "ACTIVE" to "در حال بازپرداخت"), mode) {
                    mode = it
                    if (it == "ACTIVE") {
                        received = false
                        if (paidCountInput == "0") paidCountInput = "1"
                    }
                }
                Spacer(Modifier.height(12.dp))
            }

            Label("عنوان")
            Field(title, { title = it }, "مثلاً وام خودرو")
            Label("وام‌دهنده (اختیاری)")
            Field(lender, { lender = it }, "مثلاً بانک ملت")
            Label(if (mode == "ACTIVE") "مبلغ کل وام (تومان · اختیاری)" else "مبلغ وام (تومان)")
            AmountField(principal, { principal = it }, "۰")
            Label("از جدول اقساط بانک (سریع‌تر)")
            PlanPickRow(pickedPlan ?: "طرح بانک را انتخاب کن تا قسط و سودش بیاید") { showPlans = true }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(Modifier.weight(1f)) { Label("تعداد کل اقساط"); Field(count, { count = it }, "مثلاً ۳۶", number = true) }
                if (mode == "ACTIVE" && id == 0L) {
                    Column(Modifier.weight(1f)) {
                        Label("اقساط پرداخت‌شده قبلی")
                        Field(paidCountInput, { input ->
                            val clean = Money.ascii(input).filter { it.isDigit() }
                            paidCountInput = clean
                            val pCount = clean.toIntOrNull() ?: 0
                            scheduleItems = scheduleItems.map { item ->
                                val paid = item.n <= pCount
                                item.copy(isPaid = paid, paidAt = if (paid) (item.paidAt ?: item.dueAt) else null)
                            }
                        }, "مثلاً ۸", number = true)
                    }
                } else {
                    Column(Modifier.weight(1f)) {
                        Label("سود سالانه ٪ (اختیاری)")
                        Field(rate, { rate = it }, "مثلاً ۲۳", number = true, keyboardType = KeyboardType.Decimal)
                    }
                }
            }
            Label("مبلغ هر قسط (تومان) · از جدول اقساط بانک")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                AmountField(installment, { installment = it }, "۰", Modifier.weight(1f))
                GhostButton("محاسبه", icon = Ic.scale) {
                    val p = Money.parseToman(principal) ?: 0
                    val n = Money.ascii(count).toIntOrNull() ?: 0
                    val r = Money.ascii(rate).replace('٫', '.').toDoubleOrNull() ?: 0.0
                    if (p <= 0 || n <= 0) toast("اول مبلغ وام و تعداد اقساط را بزن") else installment = Money.tomanInput(Loans.suggest(p, r, n))
                }
            }
            T("«محاسبه» فقط تخمین با فرمول اقساط مساوی است؛ عدد دقیق را از جدول بانک بزن.", 11, color = C.muted, modifier = Modifier.padding(top = 4.dp))

            if (mode == "ACTIVE" && id == 0L) {
                Label("مبنای تاریخ اقساط")
                Segmented(listOf("FIRST" to "سررسید قسط ۱", "NEXT" to "سررسید قسط بعدی"), dateTarget) { dateTarget = it }
                Spacer(Modifier.height(8.dp))
            }

            Label(if (mode == "ACTIVE" && dateTarget == "NEXT" && id == 0L) "سررسید قسط بعدی" else "سررسید اولین قسط")
            PickField(Jalali.longDate(baseDate), Ic.cal) { pickDate = true }
            Label("حساب دریافت وام")
            AccountPicker(accounts, receiveAccount, null, Modifier.fillMaxWidth(), emptyOption = "تعیین نشده") {
                receiveAccount = it
                if (it == 0L) received = false
            }
            Label("حساب پیش‌فرض پرداخت اقساط")
            AccountPicker(accounts, payAccount, null, Modifier.fillMaxWidth(), emptyOption = "حساب دریافت وام در صورت دسترسی") { payAccount = it }

            if (id == 0L && mode == "NEW" && accounts.any { it.account.id == receiveAccount }) Row(
                Modifier.padding(top = 12.dp).clickable { received = !received }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(
                    Modifier.size(20.dp).clip(RoundedCornerShape(6.dp)).background(if (received) C.lime else Color.Transparent).border(1.5.dp, if (received) C.lime else C.muted, RoundedCornerShape(6.dp)),
                    contentAlignment = Alignment.Center,
                ) { if (received) Ico(Ic.check, 14.dp, C.onLime) }
                T("مبلغ وام به همین حساب واریز شده (به موجودی اضافه شود)", 12, color = C.t2)
            }

            // Live Preview Summary Card
            if (scheduleItems.isNotEmpty()) {
                Spacer(Modifier.height(16.dp))
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(18.dp))
                        .background(C.surface)
                        .border(1.dp, C.line, RoundedCornerShape(18.dp))
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        T("پیش‌نمایش وضعیت بازپرداخت", 12, 700, C.ink)
                        T("${Money.fa(remainingCountVal.toString())} قسط مانده از ${Money.fa(scheduleItems.size.toString())}", 11, color = C.accent)
                    }
                    Divider()
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Column(Modifier.weight(1f)) {
                            T("مجموع بازپرداخت", 10.5f, color = C.muted)
                            T("${Money.toman(totalRepayment)} تومان", 12, 700, C.ink)
                        }
                        Column(Modifier.weight(1f)) {
                            T("مانده بازپرداخت", 10.5f, color = C.muted)
                            T("${Money.toman(remainingAmount)} تومان", 12, 700, C.accent)
                        }
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Column(Modifier.weight(1f)) {
                            T("پرداخت‌شده (${Money.fa(paidCountVal.toString())} قسط)", 10.5f, color = C.muted)
                            T("${Money.toman(paidAmount)} تومان", 12, 700, C.ok)
                        }
                        Column(Modifier.weight(1f)) {
                            T("اقساط معوق", 10.5f, color = C.muted)
                            T(if (overdueCount > 0) "${Money.fa(overdueCount.toString())} قسط معوق" else "ندارد", 12, 700, if (overdueCount > 0) C.bad else C.muted)
                        }
                    }
                    nextDueItem?.let { next ->
                        Divider()
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            T("سررسید قسط بعدی (${Money.fa(next.n.toString())})", 11, color = C.muted)
                            T(Jalali.longDate(next.dueAt), 11.5f, 700, C.ink)
                        }
                    }
                }
            }

            // Collapsible Schedule Table
            if (scheduleItems.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(C.surface)
                        .border(1.dp, C.line, RoundedCornerShape(14.dp))
                        .clickable { showSchedule = !showSchedule }
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    T("جدول اقساط (${Money.fa(scheduleItems.size.toString())} قسط)", 12, 600, C.t2)
                    Ico(if (showSchedule) Ic.chevUp else Ic.chevDown, 16.dp, C.muted)
                }

                if (showSchedule) {
                    Column(
                        Modifier
                            .padding(top = 8.dp)
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(C.sheet)
                            .border(1.dp, C.line, RoundedCornerShape(16.dp))
                            .padding(10.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        T("روی هر قسط بزن تا وضعیت پرداخت آن تغییر کند:", 10.5f, color = C.muted)
                        scheduleItems.forEach { item ->
                            val isOverdue = !item.isPaid && item.dueAt < todayStart
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(if (item.isPaid) C.ok.copy(alpha = 0.1f) else if (isOverdue) C.bad.copy(alpha = 0.1f) else C.surface)
                                    .border(1.dp, if (item.isPaid) C.ok.copy(alpha = 0.3f) else if (isOverdue) C.bad.copy(alpha = 0.3f) else C.line, RoundedCornerShape(10.dp))
                                    .clickable {
                                        if (item.hasTxn) {
                                            toast("این قسط دارای تراکنش ثبت‌شده است و تغییر دستی آن ممکن نیست.")
                                        } else {
                                            scheduleItems = scheduleItems.map {
                                                if (it.n == item.n) {
                                                    val nextPaid = !it.isPaid
                                                    it.copy(isPaid = nextPaid, paidAt = if (nextPaid) (it.paidAt ?: it.dueAt) else null)
                                                } else it
                                            }
                                        }
                                    }
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Box(
                                    Modifier
                                        .size(24.dp)
                                        .clip(RoundedCornerShape(7.dp))
                                        .background(if (item.isPaid) C.ok else if (isOverdue) C.bad.copy(alpha = 0.2f) else C.ink.copy(alpha = 0.08f)),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    if (item.isPaid) Ico(Ic.check, 14.dp, C.bg)
                                    else T(Money.fa(item.n.toString()), 10.5f, 700, if (isOverdue) C.bad else C.t2)
                                }
                                Column(Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                        T("قسط ${Money.fa(item.n.toString())}", 11.5f, 600, C.ink)
                                        if (item.isPaid) T("پرداخت‌شده", 9.5f, 700, C.ok)
                                        else if (isOverdue) T("معوق", 9.5f, 700, C.bad)
                                    }
                                    T(Jalali.longDate(item.dueAt), 10.5f, color = C.muted)
                                }
                                T("${Money.toman(item.amount)} تومان", 11.5f, 700, if (item.isPaid) C.muted else C.ink)
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
        }

        Row(Modifier.navigationBarsPadding().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (original != null) GhostButton("حذف", color = C.bad, icon = Ic.trash) { confirmDelete = true }
            LimeButton("ذخیره", Modifier.weight(1f), Ic.check) {
                val p = if (principal.isBlank()) 0L else Money.parseToman(principal)
                val inst = Money.parseToman(installment)
                val n = Money.ascii(count).trim().toIntOrNull()
                when {
                    title.isBlank() -> return@LimeButton toast("عنوان را وارد کن")
                    p == null -> return@LimeButton toast("مبلغ وام فقط عدد")
                    inst == null || inst <= 0 -> return@LimeButton toast("مبلغ قسط را وارد کن")
                    n == null || n !in 1..600 -> return@LimeButton toast("تعداد اقساط بین ۱ تا ۶۰۰")
                    received && mode == "NEW" && (p <= 0 || accounts.none { it.account.id == receiveAccount }) -> return@LimeButton toast("برای واریز، مبلغ وام و حساب لازم است")
                }

                val firstDue = if (mode == "ACTIVE" && dateTarget == "NEXT" && original == null) {
                    val pCount = (Money.ascii(paidCountInput).toIntOrNull() ?: 0).coerceAtLeast(0)
                    computeFirstDueFromNext(baseDate, pCount)
                } else baseDate

                val loan = (original ?: Loan(title = "", lender = null, principal = 0, installment = 0, count = 0, firstDueAt = 0, accountId = null)).copy(
                    title = title.trim(), lender = lender.trim().ifBlank { null }, principal = p ?: 0L, installment = inst ?: 0L, count = n ?: 0,
                    firstDueAt = firstDue, accountId = payAccount.takeIf { it != 0L },
                    receiveAccountId = receiveAccount.takeIf { it != 0L },
                )

                val finalSchedule = if (scheduleItems.isNotEmpty()) {
                    scheduleItems.map {
                        Installment(
                            loanId = id,
                            n = it.n,
                            dueAt = it.dueAt,
                            amount = it.amount,
                            paidTxnId = it.paidTxnId,
                            paidAt = if (it.isPaid) (it.paidAt ?: it.dueAt) else null,
                        )
                    }
                } else {
                    Loans.schedule(firstDue, n, inst)
                }

                scope.launch {
                    dao.saveLoan(loan, finalSchedule, if (received && mode == "NEW") receiveAccount else null)
                    back()
                }
            }
        }
    }
    if (pickDate) JDateDialog(if (mode == "ACTIVE" && dateTarget == "NEXT" && original == null) "سررسید قسط بعدی" else "سررسید اولین قسط", baseDate, { baseDate = it }) { pickDate = false }
    if (showPlans) BankPlanDialog(
        principal = Money.parseToman(principal) ?: 0L,
        months = Money.ascii(count).trim().toIntOrNull() ?: 12,
        onDismiss = { showPlans = false },
        onPick = { r, n, inst, p ->
            rate = r.toString()
            count = n.toString()
            installment = Money.tomanInput(inst)
            if (title.isBlank()) title = p.title
            if (lender.isBlank()) lender = p.bankName
            pickedPlan = "${p.title} · ${Money.fa(r.toString())}٪ · ${Money.fa(n.toString())} قسط"
        },
    )
    if (confirmDelete) Confirm("حذف وام", "«${original?.title}» و جدول اقساطش حذف می‌شود. تراکنش‌های پرداخت‌شده در تاریخچه می‌مانند.", "حذف", danger = true,
        onOk = { original?.let { l -> scope.launch { dao.deleteLoan(l); back() } } }, onDismiss = { confirmDelete = false })
}
