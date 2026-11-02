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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.jibeman.app
import ir.jibeman.core.Jalali
import ir.jibeman.core.Money
import ir.jibeman.core.db.Debt
import ir.jibeman.core.db.DebtDir
import ir.jibeman.core.db.DebtRow
import ir.jibeman.ui.Bar
import ir.jibeman.ui.C
import ir.jibeman.ui.CatIcon
import ir.jibeman.ui.Confirm
import ir.jibeman.ui.Divider
import ir.jibeman.ui.Empty
import ir.jibeman.ui.Field
import ir.jibeman.ui.GhostButton
import ir.jibeman.ui.Group
import ir.jibeman.ui.Ic
import ir.jibeman.ui.Ico
import ir.jibeman.ui.JDateDialog
import ir.jibeman.ui.LimeButton
import ir.jibeman.ui.PickField
import ir.jibeman.ui.Segmented
import ir.jibeman.ui.T
import ir.jibeman.ui.Tile
import ir.jibeman.ui.TopBar
import ir.jibeman.ui.amount
import ir.jibeman.ui.glowBg
import kotlinx.coroutines.launch

private fun dirColor(d: String) = if (d == DebtDir.OWED_TO_ME) C.ok else C.bad

@Composable
fun DebtsScreen(back: () -> Unit, go: (Route) -> Unit) {
    val app = app()
    val hide = app.prefs.hideAmounts
    var dir by rememberSaveable { mutableStateOf(DebtDir.OWED_TO_ME) }
    val owed by remember { app.dao.debts(DebtDir.OWED_TO_ME) }.collectAsStateWithLifecycle(emptyList())
    val owe by remember { app.dao.debts(DebtDir.I_OWE) }.collectAsStateWithLifecycle(emptyList())
    var adding by remember { mutableStateOf(false) }
    val list = if (dir == DebtDir.OWED_TO_ME) owed else owe
    LazyColumn(Modifier.fillMaxSize().glowBg(), contentPadding = PaddingValues(bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { TopBar("بدهی و طلب", back, action = Ic.plus) { adding = true } }
        item {
            Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Tile(Modifier.weight(1f)) { T("طلب دارم", 12, color = C.t2); T(amount(owed.sumOf { it.remaining }, hide), 17, 800, C.ok, Modifier.padding(top = 6.dp)); T("تومان", 10.5f, color = C.muted) }
                Tile(Modifier.weight(1f)) { T("بدهکارم", 12, color = C.t2); T(amount(owe.sumOf { it.remaining }, hide), 17, 800, C.bad, Modifier.padding(top = 6.dp)); T("تومان", 10.5f, color = C.muted) }
            }
        }
        item { Box(Modifier.padding(horizontal = 16.dp)) { Segmented(listOf(DebtDir.OWED_TO_ME to "طلب‌ها", DebtDir.I_OWE to "بدهی‌ها"), dir) { dir = it } } }
        if (list.isEmpty()) item { Empty(if (dir == DebtDir.OWED_TO_ME) "از کسی طلب نداری." else "به کسی بدهکار نیستی.", "افزودن") { adding = true } }
        items(list, key = { it.debt.id }) { d -> DebtCard(d, hide) { go(Route.DebtDetail(d.debt.id)) } }
    }
    if (adding) NewDebtDialog(dir) { adding = false }
}

@Composable
private fun DebtCard(d: DebtRow, hide: Boolean, onClick: () -> Unit) {
    val done = d.remaining <= 0
    Row(
        Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(C.surface)
            .border(1.dp, C.line, RoundedCornerShape(20.dp)).clickable(onClick = onClick).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(13.dp)).background(dirColor(d.debt.direction).copy(alpha = 0.13f)), contentAlignment = Alignment.Center) {
            T(d.debt.person.take(1), 16, 800, dirColor(d.debt.direction))
        }
        Column(Modifier.weight(1f)) {
            T(d.debt.person, 14, 700, maxLines = 1)
            T(
                when {
                    done -> "تسویه شد"
                    d.debt.dueAt != null -> "سررسید ${dueText(d.debt.dueAt)}"
                    else -> d.debt.note ?: "بدون سررسید"
                }, 11, color = if (done) C.ok else d.debt.dueAt?.let { dueColor(it) } ?: C.muted, maxLines = 1,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            T(amount(d.remaining, hide), 14, 800, if (done) C.muted else C.ink)
            if (d.remaining != d.debt.amount && !done) T("از ${amount(d.debt.amount, hide)}", 10.5f, color = C.muted)
        }
    }
}

@Composable
fun NewDebtDialog(initialDir: String, initialPerson: String = "", onDismiss: () -> Unit) {
    val dao = app().dao
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val accounts by remember { dao.balances() }.collectAsStateWithLifecycle(emptyList())
    var dir by remember { mutableStateOf(initialDir) }
    var person by remember { mutableStateOf(initialPerson) }
    var amountText by remember { mutableStateOf("") }
    var due by remember { mutableStateOf<Long?>(null) }
    var note by remember { mutableStateOf("") }
    var moved by remember { mutableStateOf(false) }
    var acc by remember { mutableLongStateOf(0) }
    if (acc == 0L && accounts.isNotEmpty()) acc = accounts.first().account.id
    var pick by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = C.sheet,
        title = { T("بدهی یا طلب جدید", 17, 800) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Segmented(listOf(DebtDir.OWED_TO_ME to "طلب دارم", DebtDir.I_OWE to "بدهکارم"), dir) { dir = it }
                Field(person, { person = it }, "اسم شخص", leading = Ic.user)
                Field(amountText, { amountText = it }, "مبلغ (تومان)", number = true)
                Money.parseToman(amountText)?.takeIf { it > 0 }?.let { T(Money.words(it / 10) + " تومان", 11, color = C.muted) }
                PickField(due?.let { "سررسید: ${Jalali.longDate(it)}" } ?: "سررسید (اختیاری)", Ic.cal, muted = due == null) { pick = true }
                Field(note, { note = it }, "توضیح (اختیاری)", leading = Ic.pen)
                Row(Modifier.clickable { moved = !moved }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(
                        Modifier.size(20.dp).clip(RoundedCornerShape(6.dp)).background(if (moved) C.lime else Color.Transparent).border(1.5.dp, if (moved) C.lime else C.muted, RoundedCornerShape(6.dp)),
                        contentAlignment = Alignment.Center,
                    ) { if (moved) Ico(Ic.check, 14.dp, C.onLime) }
                    T(if (dir == DebtDir.OWED_TO_ME) "پول از حسابم رفت" else "پول به حسابم آمد", 12, color = C.t2)
                }
                if (moved) AccountPicker(accounts, acc, null, Modifier.fillMaxWidth()) { acc = it }
            }
        },
        confirmButton = {
            TextButton({
                val a = Money.parseToman(amountText)
                when {
                    person.isBlank() -> Toast.makeText(ctx, "اسم را وارد کن", Toast.LENGTH_SHORT).show()
                    a == null || a <= 0 -> Toast.makeText(ctx, "مبلغ را وارد کن", Toast.LENGTH_SHORT).show()
                    else -> {
                        scope.launch {
                            val name = person.trim().take(60)
                            dao.createDebt(Debt(direction = dir, person = name, amount = a, dueAt = due, note = note.trim().ifBlank { null }, personId = dao.personFor(name)), acc.takeIf { moved && it != 0L })
                        }
                        onDismiss()
                    }
                }
            }) { T("ثبت", 14, 800, C.accent) }
        },
        dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
    )
    if (pick) JDateDialog("سررسید", due ?: Jalali.addDays(System.currentTimeMillis(), 7), { due = it }) { pick = false }
}

@Composable
fun DebtDetailScreen(id: Long, back: () -> Unit) {
    val app = app()
    val dao = app.dao
    val hide = app.prefs.hideAmounts
    val scope = rememberCoroutineScope()
    val row by remember { dao.debt(id) }.collectAsStateWithLifecycle(null)
    val payments by remember { dao.payments(id) }.collectAsStateWithLifecycle(emptyList())
    var pay by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var loaded by remember { mutableStateOf(false) }
    LaunchedEffect(row) { if (row != null) loaded = true else if (loaded) back() }
    val r = row ?: return
    val d = r.debt
    val owed = d.direction == DebtDir.OWED_TO_ME
    LazyColumn(Modifier.fillMaxSize().glowBg(), contentPadding = PaddingValues(bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { TopBar(d.person, back, action = Ic.trash) { confirmDelete = true } }
        item {
            Tile(Modifier.padding(horizontal = 16.dp).fillMaxWidth()) {
                T(if (owed) "${d.person} به تو بدهکار است" else "تو به ${d.person} بدهکاری", 12, color = C.t2)
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    T(amount(r.remaining, hide), 28, 800, if (r.remaining <= 0) C.ok else dirColor(d.direction))
                    T("تومان مانده", 12, color = C.muted, modifier = Modifier.padding(bottom = 6.dp))
                }
                Bar(1f - r.remaining.toFloat() / d.amount, Modifier.padding(top = 8.dp))
                T("از ${amount(d.amount, hide)} تومان" + (d.dueAt?.let { " · سررسید ${Jalali.longDate(it)}" } ?: ""), 11.5f, color = C.muted, modifier = Modifier.padding(top = 6.dp))
                d.note?.let { T(it, 12, color = C.t2, modifier = Modifier.padding(top = 6.dp)) }
            }
        }
        if (r.remaining > 0) item {
            LimeButton(if (owed) "ثبت دریافت" else "ثبت پرداخت", Modifier.padding(horizontal = 16.dp).fillMaxWidth(), Ic.check) { pay = true }
        }
        if (payments.isNotEmpty()) item {
            T("پرداخت‌ها", 14, 700, modifier = Modifier.padding(start = 20.dp, top = 6.dp))
            Group(Modifier.padding(top = 8.dp)) {
                payments.forEachIndexed { i, p ->
                    if (i > 0) Divider()
                    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        CatIcon(Ic.receipt, dirColor(d.direction), 34.dp)
                        Column(Modifier.weight(1f)) {
                            T(Jalali.longDate(p.at), 13, 600)
                            T(if (p.txnId != null) "از حساب ثبت شد" else "بدون حساب", 11, color = C.muted)
                        }
                        T(amount(p.amount, hide), 13, 700)
                        Ico(Ic.x, 16.dp, C.muted, Modifier.clickable { scope.launch { p.txnId?.let { dao.deleteTxn(it) }; dao.deletePayment(p) } })
                    }
                }
            }
        }
    }
    if (pay) PartialPayDialog(owed, r.remaining, onDismiss = { pay = false }) { a, acc ->
        scope.launch { dao.addPayment(d, a, System.currentTimeMillis(), acc) }
    }
    if (confirmDelete) Confirm("حذف", "این ${if (owed) "طلب" else "بدهی"} و سابقه پرداخت‌هایش حذف شود؟ تراکنش‌های حساب سر جایشان می‌مانند.", "حذف", danger = true,
        onOk = { scope.launch { dao.deleteDebt(d) } }, onDismiss = { confirmDelete = false })
}

@Composable
private fun PartialPayDialog(incoming: Boolean, remaining: Long, onDismiss: () -> Unit, onOk: (Long, Long?) -> Unit) {
    val dao = app().dao
    val accounts by remember { dao.balances() }.collectAsStateWithLifecycle(emptyList())
    var text by remember { mutableStateOf((remaining / 10).toString()) }
    var acc by remember { mutableLongStateOf(0) }
    if (acc == 0L && accounts.isNotEmpty()) acc = accounts.first().account.id
    var noAccount by remember { mutableStateOf(false) }
    val a = Money.parseToman(text)?.takeIf { it in 1..remaining }
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = C.sheet,
        title = { T(if (incoming) "دریافت طلب" else "پرداخت بدهی", 17, 800) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Field(text, { text = it }, "مبلغ (تومان)", number = true)
                T(if (a == null) "حداکثر ${Money.toman(remaining)} تومان" else Money.words(a / 10) + " تومان", 11, color = if (a == null) C.warn else C.muted)
                if (!noAccount) AccountPicker(accounts, acc, if (incoming) "به" else "از", Modifier.fillMaxWidth()) { acc = it }
                GhostButton(if (noAccount) "ثبت روی حساب" else "بدون حساب (نقدی بیرون از برنامه)", Modifier.fillMaxWidth()) { noAccount = !noAccount }
            }
        },
        confirmButton = { TextButton({ if (a != null) { onOk(a, acc.takeIf { !noAccount && it != 0L }); onDismiss() } }) { T("ثبت", 14, 800, if (a != null) C.accent else C.muted) } },
        dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
    )
}
