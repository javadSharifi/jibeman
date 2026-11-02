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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.jibeman.app
import ir.jibeman.core.Money
import ir.jibeman.core.db.DebtDir
import ir.jibeman.core.db.Person
import ir.jibeman.ui.C
import ir.jibeman.ui.Confirm
import ir.jibeman.ui.Empty
import ir.jibeman.ui.Field
import ir.jibeman.ui.GhostButton
import ir.jibeman.ui.Ic
import ir.jibeman.ui.Ico
import ir.jibeman.ui.T
import ir.jibeman.ui.Tile
import ir.jibeman.ui.TopBar
import ir.jibeman.ui.amount
import ir.jibeman.ui.glowBg
import kotlinx.coroutines.launch

@Composable
fun Avatar(name: String, color: Color = C.violet, size: Int = 40) = Box(
    Modifier.size(size.dp).clip(RoundedCornerShape((size / 3).dp)).background(color.copy(alpha = 0.14f)), contentAlignment = Alignment.Center,
) { T(name.take(1), size * 0.4f, 800, color) }

@Composable
fun PeopleScreen(back: () -> Unit, go: (Route) -> Unit) {
    val app = app()
    val hide = app.prefs.hideAmounts
    val people by remember { app.dao.people() }.collectAsStateWithLifecycle(emptyList())
    var adding by remember { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize().glowBg(), contentPadding = PaddingValues(bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { TopBar("اشخاص", back, action = Ic.plus) { adding = true } }
        if (people.isEmpty()) item { Empty("کسی را اضافه نکرده‌ای. اشخاص در بدهی، طلب و دنگ استفاده می‌شوند.", "افزودن شخص") { adding = true } }
        items(people, key = { it.p.id }) { r ->
            val net = r.owedToMe - r.iOwe
            Row(
                Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(C.surface)
                    .border(1.dp, C.line, RoundedCornerShape(18.dp)).clickable { go(Route.PersonDetail(r.p.id)) }.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Avatar(r.p.name)
                Column(Modifier.weight(1f)) {
                    T(r.p.name, 14, 700, maxLines = 1)
                    T(r.p.phone?.let { Money.fa(it) } ?: "بدون شماره", 11, color = C.muted)
                }
                Column(horizontalAlignment = Alignment.End) {
                    T(if (net == 0L) "تسویه" else amount(kotlin.math.abs(net), hide), 13, 800, if (net > 0) C.ok else if (net < 0) C.bad else C.muted)
                    if (net != 0L) T(if (net > 0) "طلب داری" else "بدهکاری", 10.5f, color = C.muted)
                }
            }
        }
    }
    if (adding) PersonDialog(Person(name = "")) { adding = false }
}

@Composable
fun PersonDialog(p: Person, onDismiss: () -> Unit) {
    val dao = app().dao
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(p.name) }
    var phone by remember { mutableStateOf(p.phone.orEmpty()) }
    var card by remember { mutableStateOf(p.cardNo.orEmpty()) }
    var note by remember { mutableStateOf(p.note.orEmpty()) }
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = C.sheet,
        title = { T(if (p.id == 0L) "شخص جدید" else "ویرایش", 17, 800) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Field(name, { name = it }, "نام", leading = Ic.user)
                Field(phone, { phone = it }, "شماره موبایل (اختیاری)", number = true, ltr = true)
                Field(card, { card = it }, "شماره کارت (اختیاری)", number = true, ltr = true, leading = Ic.card)
                Field(note, { note = it }, "توضیح (اختیاری)", leading = Ic.pen)
            }
        },
        confirmButton = {
            TextButton({
                val n = name.trim().take(60)
                if (n.isBlank()) { Toast.makeText(ctx, "نام را وارد کن", Toast.LENGTH_SHORT).show(); return@TextButton }
                scope.launch {
                    if (p.id == 0L && dao.personByName(n) != null) { Toast.makeText(ctx, "این نام قبلاً ثبت شده", Toast.LENGTH_SHORT).show(); return@launch }
                    dao.upsertPerson(p.copy(name = n, phone = Money.ascii(phone).trim().ifBlank { null }, cardNo = Money.ascii(card).trim().ifBlank { null }, note = note.trim().ifBlank { null }))
                    if (p.id != 0L) dao.renameInDebts(p.id, n)
                    onDismiss()
                }
            }) { T("ذخیره", 14, 800, C.accent) }
        },
        dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
    )
}

@Composable
fun PersonDetailScreen(id: Long, back: () -> Unit, go: (Route) -> Unit) {
    val app = app()
    val dao = app.dao
    val hide = app.prefs.hideAmounts
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    val person by remember { dao.person(id) }.collectAsStateWithLifecycle(null)
    val debts by remember { dao.debtsOf(id) }.collectAsStateWithLifecycle(emptyList())
    var edit by remember { mutableStateOf(false) }
    var newDebt by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var loaded by remember { mutableStateOf(false) }
    LaunchedEffect(person) { if (person != null) loaded = true else if (loaded) back() }
    val p = person ?: return
    val owed = debts.filter { it.debt.direction == DebtDir.OWED_TO_ME }.sumOf { it.remaining }
    val owe = debts.filter { it.debt.direction == DebtDir.I_OWE }.sumOf { it.remaining }
    LazyColumn(Modifier.fillMaxSize().glowBg(), contentPadding = PaddingValues(bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { TopBar(p.name, back, action = Ic.pen) { edit = true } }
        item {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Avatar(p.name, size = 64)
                p.phone?.let { T("⁦${Money.fa(it)}⁩", 13, color = C.t2, modifier = Modifier.padding(top = 8.dp)) }
                p.cardNo?.let { T("کارت ⁦${Money.fa(it)}⁩", 12, color = C.muted) }
                p.note?.let { T(it, 12, color = C.muted) }
            }
        }
        item {
            Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Tile(Modifier.weight(1f)) { T("از او طلب داری", 12, color = C.t2); T(amount(owed, hide), 17, 800, C.ok, Modifier.padding(top = 6.dp)) }
                Tile(Modifier.weight(1f)) { T("به او بدهکاری", 12, color = C.t2); T(amount(owe, hide), 17, 800, C.bad, Modifier.padding(top = 6.dp)) }
            }
        }
        item { GhostButton("بدهی یا طلب جدید با ${p.name}", Modifier.padding(horizontal = 16.dp).fillMaxWidth(), Ic.plus) { newDebt = true } }
        items(debts, key = { it.debt.id }) { d ->
            Row(
                Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(C.surface)
                    .border(1.dp, C.line, RoundedCornerShape(18.dp)).clickable { go(Route.DebtDetail(d.debt.id)) }.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Ico(Ic.receipt, 18.dp, if (d.debt.direction == DebtDir.OWED_TO_ME) C.ok else C.bad)
                T(if (d.debt.direction == DebtDir.OWED_TO_ME) "طلب" else "بدهی", 13, 600, modifier = Modifier.weight(1f))
                T(if (d.remaining <= 0) "تسویه شد" else "${amount(d.remaining, hide)} تومان", 13, 700, if (d.remaining <= 0) C.ok else C.ink)
            }
        }
        item { T("حذف شخص", 13, 700, C.bad, Modifier.padding(start = 22.dp, top = 8.dp).clickable { confirmDelete = true }) }
    }
    if (edit) PersonDialog(p) { edit = false }
    if (newDebt) NewDebtDialog(DebtDir.OWED_TO_ME, p.name) { newDebt = false }
    if (confirmDelete) Confirm("حذف شخص", "«${p.name}» حذف شود؟ بدهی‌ها و طلب‌ها با همان نام می‌مانند.", "حذف", danger = true,
        onOk = {
            scope.launch {
                if (dao.inGroups(p.id)) Toast.makeText(ctx, "اول گروه‌های دنگی که عضوش است را تسویه و حذف کن", Toast.LENGTH_LONG).show()
                else dao.deletePerson(p)
            }
        }, onDismiss = { confirmDelete = false })
}
