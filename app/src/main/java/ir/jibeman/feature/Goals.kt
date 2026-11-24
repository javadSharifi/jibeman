package ir.jibeman.feature

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.jibeman.app
import ir.jibeman.core.Goals
import ir.jibeman.core.Jalali
import ir.jibeman.core.Money
import ir.jibeman.core.db.Goal
import ir.jibeman.core.db.GoalEntry
import ir.jibeman.core.db.GoalRow
import ir.jibeman.ui.Bar
import ir.jibeman.ui.C
import ir.jibeman.ui.CatIcon
import ir.jibeman.ui.Confirm
import ir.jibeman.ui.Divider
import ir.jibeman.ui.Empty
import ir.jibeman.ui.AmountField
import ir.jibeman.ui.Field
import ir.jibeman.ui.GhostButton
import ir.jibeman.ui.Group
import ir.jibeman.ui.Ic
import ir.jibeman.ui.Ico
import ir.jibeman.ui.JDateDialog
import ir.jibeman.ui.Label
import ir.jibeman.ui.LimeButton
import ir.jibeman.ui.PickField
import ir.jibeman.ui.T
import ir.jibeman.ui.TopBar
import ir.jibeman.ui.amount
import ir.jibeman.ui.glowBg
import kotlinx.coroutines.launch

private const val D90 = 90 * 86_400_000L

/** One line about pace: done / months left / needed per month / behind. */
fun goalStatus(r: GoalRow, now: Long, hide: Boolean): Pair<String, Color> {
    val left = r.goal.target - r.saved
    if (left <= 0) return "به هدف رسیدی" to C.ok
    val eta = Goals.etaMonths(left, r.recent)
    val due = r.goal.dueAt
    if (due != null) {
        if (due < now) return "سررسید گذشته" to C.bad
        val need = Goals.perMonth(left, now, due)
        val pace = r.recent / 3
        return "ماهی ${amount(need, hide)} تومان تا ${Jalali.longDate(due)}" to if (r.recent > 0 && pace < need) C.warn else C.t2
    }
    return (if (eta == null) "هنوز پس‌اندازی نگذاشته‌ای" else "با این روند حدود ${Money.fa(eta.toString())} ماه دیگر") to C.t2
}

@Composable
fun GoalsScreen(back: () -> Unit, go: (Route) -> Unit) {
    val app = app()
    val hide = app.prefs.hideAmounts
    val now = remember { System.currentTimeMillis() }
    val goals by remember { app.dao.goals(now - D90) }.collectAsStateWithLifecycle(emptyList())
    var editing by remember { mutableStateOf<Goal?>(null) }
    LazyColumn(Modifier.fillMaxSize().glowBg(), contentPadding = PaddingValues(bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { TopBar("اهداف پس‌انداز", back, action = Ic.plus) { editing = Goal(title = "", target = 0, dueAt = null) } }
        if (goals.isNotEmpty()) item {
            T("پول در حساب‌هایت می‌ماند؛ هدف فقط نشان می‌دهد چقدرش را برای چه کنار گذاشته‌ای.", 12, color = C.muted, modifier = Modifier.padding(horizontal = 20.dp))
        }
        if (goals.isEmpty()) item { Empty("هدفی نساخته‌ای. مثلاً «سفر» یا «لپ‌تاپ».", "هدف جدید") { editing = Goal(title = "", target = 0, dueAt = null) } }
        items(goals, key = { it.goal.id }) { r ->
            val color = C.cat[r.goal.color.mod(C.cat.size)]
            val (status, sc) = goalStatus(r, now, hide)
            Column(
                Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(C.surface)
                    .border(1.dp, C.line, RoundedCornerShape(22.dp)).clickable { go(Route.GoalDetail(r.goal.id)) }.padding(14.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CatIcon(Ic.category(r.goal.icon), color)
                    Column(Modifier.weight(1f)) {
                        T(r.goal.title, 14, 700, if (r.goal.closed) C.muted else C.ink, maxLines = 1)
                        T("${amount(r.saved, hide)} از ${amount(r.goal.target, hide)} تومان", 11, color = C.muted)
                    }
                    T("${Money.fa((r.saved * 100 / maxOf(1, r.goal.target)).coerceIn(0, 100).toString())}٪", 15, 800, color)
                }
                Bar(r.saved.toFloat() / maxOf(1, r.goal.target), Modifier.padding(top = 12.dp))
                T(status, 11.5f, color = sc, modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
    editing?.let { GoalDialog(it) { editing = null } }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GoalDialog(g: Goal, onDismiss: () -> Unit) {
    val dao = app().dao
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf(g.title) }
    var target by remember { mutableStateOf(if (g.target > 0) Money.tomanInput(g.target) else "") }
    var due by remember { mutableStateOf(g.dueAt) }
    var icon by remember { mutableStateOf(g.icon) }
    var color by remember { mutableIntStateOf(g.color) }
    var pick by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = C.sheet,
        title = { T(if (g.id == 0L) "هدف جدید" else "ویرایش هدف", 17, 800) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Field(title, { title = it }, "مثلاً سفر نوروز")
                AmountField(target, { target = it }, "مبلغ هدف (تومان)")
                PickField(due?.let { "تا ${Jalali.longDate(it)}" } ?: "تاریخ هدف (اختیاری)", Ic.cal, muted = due == null) { pick = true }
                Label("آیکون و رنگ")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("target", "plane", "home", "car", "gift", "book", "heart", "phone").forEach { k ->
                        Box(Modifier.clip(RoundedCornerShape(14.dp)).border(2.dp, if (k == icon) C.lime else Color.Transparent, RoundedCornerShape(14.dp)).clickable { icon = k }.padding(2.dp)) {
                            CatIcon(Ic.category(k), C.cat[color], 36.dp)
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    C.cat.forEachIndexed { i, col -> Box(Modifier.size(24.dp).clip(CircleShape).background(col).border(if (i == color) 3.dp else 0.dp, C.ink, CircleShape).clickable { color = i }) }
                }
            }
        },
        confirmButton = {
            TextButton({
                val t = Money.parseToman(target)
                if (title.isBlank() || t == null || t <= 0) Toast.makeText(ctx, "نام و مبلغ هدف را وارد کن", Toast.LENGTH_SHORT).show()
                else { scope.launch { dao.upsertGoal(g.copy(title = title.trim().take(60), target = t, dueAt = due, icon = icon, color = color)) }; onDismiss() }
            }) { T("ذخیره", 14, 800, C.accent) }
        },
        dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
    )
    if (pick) JDateDialog("تاریخ هدف", due ?: Jalali.addDays(System.currentTimeMillis(), 180), { due = it }) { pick = false }
}

@Composable
fun GoalDetailScreen(id: Long, back: () -> Unit) {
    val app = app()
    val dao = app.dao
    val hide = app.prefs.hideAmounts
    val scope = rememberCoroutineScope()
    val now = remember { System.currentTimeMillis() }
    val goals by remember { dao.goals(now - D90) }.collectAsStateWithLifecycle(null)
    val entries by remember { dao.goalEntries(id) }.collectAsStateWithLifecycle(emptyList())
    var move by remember { mutableStateOf<Int?>(null) } // +1 add, -1 take out
    var edit by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    val r = goals?.firstOrNull { it.goal.id == id }
    if (goals != null && r == null) { LaunchedEffect(Unit) { back() }; return }
    if (r == null) return
    val color = C.cat[r.goal.color.mod(C.cat.size)]
    val (status, sc) = goalStatus(r, now, hide)
    LazyColumn(Modifier.fillMaxSize().glowBg(), contentPadding = PaddingValues(bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { TopBar(r.goal.title, back, action = Ic.pen) { edit = true } }
        item {
            Column(Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(color.copy(alpha = 0.1f)).border(1.dp, color.copy(alpha = 0.25f), RoundedCornerShape(24.dp)).padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CatIcon(Ic.category(r.goal.icon), color, 44.dp)
                    Column(Modifier.weight(1f)) {
                        T("کنار گذاشته‌ای", 12, color = C.t2)
                        T("${amount(r.saved, hide)} تومان", 22, 800)
                    }
                }
                Bar(r.saved.toFloat() / maxOf(1, r.goal.target), Modifier.padding(top = 14.dp))
                T("هدف ${amount(r.goal.target, hide)} تومان · مانده ${amount(maxOf(0, r.goal.target - r.saved), hide)}", 11.5f, color = C.t2, modifier = Modifier.padding(top = 8.dp))
                T(status, 12, 600, sc, Modifier.padding(top = 4.dp))
            }
        }
        item {
            Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LimeButton("کنار گذاشتن", Modifier.weight(1f), Ic.plus) { move = 1 }
                GhostButton("برداشتن", Modifier.weight(1f), Ic.out) { move = -1 }
            }
        }
        if (entries.isNotEmpty()) item {
            Group {
                entries.forEachIndexed { i, e ->
                    if (i > 0) Divider()
                    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        CatIcon(if (e.amount > 0) Ic.inn else Ic.out, if (e.amount > 0) C.ok else C.warn, 34.dp)
                        T(Jalali.longDate(e.at), 13, 600, modifier = Modifier.weight(1f))
                        T(amount(e.amount, hide, plus = true), 13, 700, if (e.amount > 0) C.ok else C.warn)
                        Ico(Ic.x, 16.dp, C.muted, Modifier.clickable { scope.launch { dao.deleteGoalEntry(e) } })
                    }
                }
            }
        }
        item { T("حذف هدف", 13, 700, C.bad, Modifier.padding(start = 22.dp, top = 8.dp).clickable { confirmDelete = true }) }
    }
    move?.let { sign ->
        AmountDialog(if (sign > 0) "کنار گذاشتن برای «${r.goal.title}»" else "برداشتن از «${r.goal.title}»", if (sign < 0) r.saved else null, { move = null }) { a ->
            scope.launch { dao.insertGoalEntry(GoalEntry(goalId = id, amount = a * sign, at = System.currentTimeMillis())) }
        }
    }
    if (edit) GoalDialog(r.goal) { edit = false }
    if (confirmDelete) Confirm("حذف هدف", "هدف و سابقه‌اش حذف شود؟ موجودی حساب‌ها تغییری نمی‌کند.", "حذف", danger = true,
        onOk = { scope.launch { dao.deleteGoal(r.goal) } }, onDismiss = { confirmDelete = false })
}

/** Ask for a toman amount; [max] in rial caps it when set. */
@Composable
fun AmountDialog(title: String, max: Long?, onDismiss: () -> Unit, onOk: (Long) -> Unit) {
    var text by remember { mutableStateOf("") }
    val a = Money.parseToman(text)?.takeIf { it > 0 && (max == null || it <= max) }
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = C.sheet,
        title = { T(title, 16, 800) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                AmountField(text, { text = it }, "مبلغ (تومان)")
                if (a == null && max != null) T("حداکثر ${Money.toman(max)} تومان", 11, color = C.muted)
            }
        },
        confirmButton = { TextButton({ if (a != null) { onOk(a); onDismiss() } }) { T("ثبت", 14, 800, if (a != null) C.accent else C.muted) } },
        dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
    )
}
