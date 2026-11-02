package ir.jibeman.feature

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
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
import ir.jibeman.core.Jalali
import ir.jibeman.core.Money
import ir.jibeman.core.Split
import ir.jibeman.core.db.MemberRow
import ir.jibeman.core.db.SplitExpense
import ir.jibeman.ui.C
import ir.jibeman.ui.CatIcon
import ir.jibeman.ui.Chip
import ir.jibeman.ui.Confirm
import ir.jibeman.ui.Divider
import ir.jibeman.ui.Empty
import ir.jibeman.ui.Field
import ir.jibeman.ui.GhostButton
import ir.jibeman.ui.Group
import ir.jibeman.ui.Ic
import ir.jibeman.ui.Ico
import ir.jibeman.ui.Label
import ir.jibeman.ui.LimeButton
import ir.jibeman.ui.T
import ir.jibeman.ui.TopBar
import ir.jibeman.ui.amount
import ir.jibeman.ui.glowBg
import kotlinx.coroutines.launch

private fun MemberRow.label() = name ?: "من"

@Composable
fun SplitsScreen(back: () -> Unit, go: (Route) -> Unit) {
    val app = app()
    val hide = app.prefs.hideAmounts
    val groups by remember { app.dao.groups() }.collectAsStateWithLifecycle(emptyList())
    var adding by remember { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize().glowBg(), contentPadding = PaddingValues(bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { TopBar("دنگ", back, action = Ic.plus) { adding = true } }
        if (groups.isEmpty()) item { Empty("گروهی نساخته‌ای. مثلاً «سفر شمال» یا «خانه مشترک».", "گروه جدید") { adding = true } }
        items(groups, key = { it.g.id }) { r ->
            Row(
                Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(C.surface)
                    .border(1.dp, C.line, RoundedCornerShape(20.dp)).clickable { go(Route.SplitDetail(r.g.id)) }.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                CatIcon(Ic.split, C.cat[1])
                Column(Modifier.weight(1f)) {
                    T(r.g.title, 14, 700, if (r.g.closed) C.muted else C.ink, maxLines = 1)
                    T("${Money.fa(r.members.toString())} نفر · جمع ${amount(r.total, hide)} تومان", 11, color = C.muted)
                }
                Ico(Ic.chevLeft, 16.dp, C.muted)
            }
        }
    }
    if (adding) NewGroupDialog({ adding = false }) { go(Route.SplitDetail(it)) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun NewGroupDialog(onDismiss: () -> Unit, onCreated: (Long) -> Unit) {
    val dao = app().dao
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val people by remember { dao.people() }.collectAsStateWithLifecycle(emptyList())
    var title by remember { mutableStateOf("") }
    val picked = remember { mutableStateListOf<Long>() }
    val newNames = remember { mutableStateListOf<String>() }
    var newName by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = C.sheet,
        title = { T("گروه دنگ جدید", 17, 800) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Field(title, { title = it }, "نام گروه، مثلاً سفر شمال")
                Label("اعضا (تو خودکار عضوی)")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    people.forEach { p -> Chip(p.p.name, p.p.id in picked) { if (p.p.id in picked) picked.remove(p.p.id) else picked.add(p.p.id) } }
                    newNames.forEach { n -> Chip(n, true, Ic.x) { newNames.remove(n) } }
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field(newName, { newName = it }, "نفر جدید", Modifier.weight(1f), leading = Ic.user)
                    Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(C.surface).clickable {
                        val n = newName.trim()
                        if (n.isNotEmpty() && n !in newNames && people.none { it.p.name == n }) newNames.add(n)
                        newName = ""
                    }, contentAlignment = Alignment.Center) { Ico(Ic.plus) }
                }
            }
        },
        confirmButton = {
            TextButton({
                if (title.isBlank() || (picked.isEmpty() && newNames.isEmpty())) { Toast.makeText(ctx, "نام گروه و حداقل یک نفر لازم است", Toast.LENGTH_SHORT).show(); return@TextButton }
                scope.launch {
                    val ids = picked.toList() + newNames.map { dao.personFor(it) }
                    val id = dao.createGroup(title.trim().take(60), ids)
                    onDismiss(); onCreated(id)
                }
            }) { T("ساخت", 14, 800, C.accent) }
        },
        dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
    )
}

@Composable
fun SplitDetailScreen(id: Long, back: () -> Unit) {
    val app = app()
    val dao = app.dao
    val hide = app.prefs.hideAmounts
    val scope = rememberCoroutineScope()
    val group by remember { dao.group(id) }.collectAsStateWithLifecycle(null)
    val members by remember { dao.members(id) }.collectAsStateWithLifecycle(emptyList())
    val expenses by remember { dao.expenses(id) }.collectAsStateWithLifecycle(emptyList())
    val shares by remember { dao.shares(id) }.collectAsStateWithLifecycle(emptyList())
    var adding by remember { mutableStateOf(false) }
    var settling by remember { mutableStateOf<Split.Transfer?>(null) }
    var removing by remember { mutableStateOf<SplitExpense?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    var loaded by remember { mutableStateOf(false) }
    LaunchedEffect(group) { if (group != null) loaded = true else if (loaded) back() }
    val g = group ?: return
    val byId = members.associateBy { it.m.id }
    val net = Split.balances(members.map { it.m.id }, expenses.map { it.payerId to it.amount }, shares.map { it.memberId to it.amount })
    val transfers = Split.settle(net)
    val total = expenses.filter { !it.settlement }.sumOf { it.amount }

    LazyColumn(Modifier.fillMaxSize().glowBg(), contentPadding = PaddingValues(bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { TopBar(g.title, back, action = Ic.trash) { confirmDelete = true } }
        item {
            Column(Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(C.cat[1].copy(alpha = 0.1f)).border(1.dp, C.cat[1].copy(alpha = 0.25f), RoundedCornerShape(22.dp)).padding(16.dp)) {
                T("جمع هزینه‌های گروه", 12, color = C.t2)
                T("${amount(total, hide)} تومان", 22, 800)
                Row(Modifier.padding(top = 10.dp).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    members.forEach { m ->
                        val n = net[m.m.id] ?: 0
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Avatar(m.label(), if (m.name == null) C.accent else C.violet, 38)
                            T(m.label(), 11, 600, maxLines = 1)
                            T(if (n == 0L) "صاف" else amount(kotlin.math.abs(n), hide), 10.5f, 700, if (n > 0) C.ok else if (n < 0) C.bad else C.muted)
                        }
                    }
                }
            }
        }
        item { LimeButton("هزینه جدید", Modifier.padding(horizontal = 16.dp).fillMaxWidth(), Ic.plus) { adding = true } }
        if (transfers.isNotEmpty()) item {
            T("پیشنهاد تسویه (کمترین تعداد انتقال)", 13, 700, modifier = Modifier.padding(start = 20.dp, top = 6.dp, bottom = 6.dp))
            Group {
                transfers.forEachIndexed { i, t ->
                    if (i > 0) Divider()
                    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        T("${byId[t.from]?.label()} ← ${byId[t.to]?.label()}", 13, 600, modifier = Modifier.weight(1f), maxLines = 1)
                        T(amount(t.amount, hide), 13, 800)
                        Box(Modifier.height(32.dp).clip(RoundedCornerShape(10.dp)).background(C.lime.copy(alpha = 0.14f)).clickable { settling = t }.padding(horizontal = 10.dp), contentAlignment = Alignment.Center) {
                            T("تسویه شد", 11.5f, 800, C.accent)
                        }
                    }
                }
            }
        } else if (expenses.isNotEmpty()) item { T("همه با هم صاف‌اند.", 13, 700, C.ok, Modifier.padding(start = 20.dp)) }
        if (expenses.isNotEmpty()) item {
            T("هزینه‌ها", 13, 700, modifier = Modifier.padding(start = 20.dp, top = 6.dp, bottom = 6.dp))
            Group {
                expenses.forEachIndexed { i, e ->
                    if (i > 0) Divider()
                    Row(Modifier.fillMaxWidth().clickable { removing = e }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        CatIcon(if (e.settlement) Ic.swap else Ic.receipt, if (e.settlement) C.violet else C.cat[1], 36.dp)
                        Column(Modifier.weight(1f)) {
                            T(if (e.settlement) "تسویه: ${byId[e.payerId]?.label()} ← ${shares.firstOrNull { it.expenseId == e.id }?.let { byId[it.memberId]?.label() }}" else e.title, 13, 600, maxLines = 1)
                            T("${if (e.settlement) "" else "پرداخت: ${byId[e.payerId]?.label()} · "}${Jalali.longDate(e.at)}", 11, color = C.muted, maxLines = 1)
                        }
                        T(amount(e.amount, hide), 13, 700)
                    }
                }
            }
        }
    }
    if (adding) AddSplitExpenseDialog(id, members) { adding = false }
    settling?.let { t ->
        val meFrom = byId[t.from]?.name == null
        val meTo = byId[t.to]?.name == null
        SettleDialog(t, byId[t.from]?.label().orEmpty(), byId[t.to]?.label().orEmpty(), meFrom || meTo, { settling = null }) { acc ->
            scope.launch { dao.settle(id, t.from, t.to, t.amount, System.currentTimeMillis(), acc, meFrom, meTo, "تسویه دنگ · ${g.title}") }
        }
    }
    removing?.let { e ->
        Confirm("حذف از گروه", "«${if (e.settlement) "تسویه" else e.title}» از حساب‌وکتاب گروه حذف شود؟ تراکنش‌های حساب جداگانه‌اند و دست نمی‌خورند.", "حذف", danger = true,
            onOk = { scope.launch { dao.deleteSplitExpense(e) } }, onDismiss = { removing = null })
    }
    if (confirmDelete) Confirm("حذف گروه", "گروه «${g.title}» و همه هزینه‌هایش حذف شود؟", "حذف", danger = true,
        onOk = { scope.launch { dao.deleteGroup(g) } }, onDismiss = { confirmDelete = false })
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AddSplitExpenseDialog(groupId: Long, members: List<MemberRow>, onDismiss: () -> Unit) {
    val dao = app().dao
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val accounts by remember { dao.balances() }.collectAsStateWithLifecycle(emptyList())
    val cats by remember { dao.categories("EXPENSE") }.collectAsStateWithLifecycle(emptyList())
    val me = members.firstOrNull { it.name == null }
    var title by remember { mutableStateOf("") }
    var text by remember { mutableStateOf("") }
    var payer by remember { mutableLongStateOf(me?.m?.id ?: members.first().m.id) }
    val part = remember { mutableStateListOf<Long>().apply { addAll(members.map { it.m.id }) } }
    var useAccount by remember { mutableStateOf(true) }
    var acc by remember { mutableLongStateOf(0) }
    if (acc == 0L && accounts.isNotEmpty()) acc = accounts.first().account.id
    var cat by remember { mutableStateOf<Long?>(null) }
    val a = Money.parseToman(text)?.takeIf { it > 0 }
    val shares = if (a != null) Split.equalShares(a, members.map { it.m.id }.filter { it in part }) else emptyMap()
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = C.sheet,
        title = { T("هزینه گروهی", 17, 800) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Field(title, { title = it }, "برای چه؟ مثلاً شام")
                Field(text, { text = it }, "مبلغ کل (تومان)", number = true)
                Label("چه کسی پرداخت کرد؟")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { members.forEach { m -> Chip(m.label(), payer == m.m.id) { payer = m.m.id } } }
                Label("بین چه کسانی؟ (مساوی)")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    members.forEach { m -> Chip(m.label(), m.m.id in part, if (m.m.id in part) Ic.check else null) { if (m.m.id in part) part.remove(m.m.id) else part.add(m.m.id) } }
                }
                if (a != null && part.isNotEmpty()) T("سهم هر نفر حدود ${Money.toman(a / part.size)} تومان", 11.5f, color = C.muted)
                if (payer == me?.m?.id) {
                    Row(Modifier.clickable { useAccount = !useAccount }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(
                            Modifier.size(20.dp).clip(RoundedCornerShape(6.dp)).background(if (useAccount) C.lime else Color.Transparent).border(1.5.dp, if (useAccount) C.lime else C.muted, RoundedCornerShape(6.dp)),
                            contentAlignment = Alignment.Center,
                        ) { if (useAccount) Ico(Ic.check, 14.dp, C.onLime) }
                        T("از حسابم پرداخت شد", 12, color = C.t2)
                    }
                    if (useAccount) {
                        AccountPicker(accounts, acc, "از", Modifier.fillMaxWidth()) { acc = it }
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            cats.forEach { c -> Chip(c.name, cat == c.id) { cat = if (cat == c.id) null else c.id } }
                        }
                        T("فقط سهم خودت «هزینه» ثبت می‌شود؛ سهم بقیه قرضی است که بعداً برمی‌گردد.", 11, color = C.muted)
                    }
                }
            }
        },
        confirmButton = {
            TextButton({
                when {
                    title.isBlank() -> Toast.makeText(ctx, "عنوان را وارد کن", Toast.LENGTH_SHORT).show()
                    a == null -> Toast.makeText(ctx, "مبلغ را وارد کن", Toast.LENGTH_SHORT).show()
                    part.isEmpty() -> Toast.makeText(ctx, "حداقل یک نفر انتخاب کن", Toast.LENGTH_SHORT).show()
                    else -> {
                        val myShare = me?.m?.id?.let { shares[it] } ?: 0
                        val account = acc.takeIf { payer == me?.m?.id && useAccount && it != 0L }
                        scope.launch { dao.addSplitExpense(SplitExpense(groupId = groupId, title = title.trim().take(60), amount = a, payerId = payer, at = System.currentTimeMillis()), shares, myShare, account, cat) }
                        onDismiss()
                    }
                }
            }) { T("ثبت", 14, 800, C.accent) }
        },
        dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
    )
}

@Composable
private fun SettleDialog(t: Split.Transfer, from: String, to: String, involvesMe: Boolean, onDismiss: () -> Unit, onOk: (Long?) -> Unit) {
    val dao = app().dao
    val accounts by remember { dao.balances() }.collectAsStateWithLifecycle(emptyList())
    var useAccount by remember { mutableStateOf(involvesMe) }
    var acc by remember { mutableLongStateOf(0) }
    if (acc == 0L && accounts.isNotEmpty()) acc = accounts.first().account.id
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = C.sheet,
        title = { T("تسویه", 17, 800) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                T("$from ← $to", 14, 700)
                T("${Money.toman(t.amount)} تومان", 22, 800)
                if (involvesMe) {
                    GhostButton(if (useAccount) "ثبت روی حساب ✓" else "ثبت نکن روی حساب", Modifier.fillMaxWidth()) { useAccount = !useAccount }
                    if (useAccount) AccountPicker(accounts, acc, null, Modifier.fillMaxWidth()) { acc = it }
                }
            }
        },
        confirmButton = { TextButton({ onOk(acc.takeIf { useAccount && involvesMe && it != 0L }); onDismiss() }) { T("تسویه شد", 14, 800, C.accent) } },
        dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
    )
}
