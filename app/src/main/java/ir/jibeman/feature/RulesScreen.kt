package ir.jibeman.feature

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.jibeman.app
import ir.jibeman.core.Banks
import ir.jibeman.core.Money
import ir.jibeman.core.Rules
import ir.jibeman.core.db.Category
import ir.jibeman.core.db.Rule
import ir.jibeman.core.db.TxType
import ir.jibeman.ui.C
import ir.jibeman.ui.CatIcon
import ir.jibeman.ui.Chip
import ir.jibeman.ui.Confirm
import ir.jibeman.ui.Empty
import ir.jibeman.ui.Field
import ir.jibeman.ui.GhostButton
import ir.jibeman.ui.Ic
import ir.jibeman.ui.Label
import ir.jibeman.ui.T
import ir.jibeman.ui.TopBar
import ir.jibeman.ui.glowBg
import kotlinx.coroutines.launch

private val SMS_BANKS = listOf("" to "همه بانک‌ها", "keshavarzi" to "کشاورزی", "blu" to "بلو")

private fun summary(r: Rule): String = listOfNotNull(
    r.contains.takeIf { it.isNotBlank() }?.let { "متن شامل «$it»" },
    r.bank.takeIf { it.isNotEmpty() }?.let { "بانک ${Banks.of(it)?.name ?: it}" },
    when (r.type) { TxType.INCOME -> "واریز"; TxType.EXPENSE -> "برداشت"; else -> null },
    r.minAmount?.let { "حداقل ${Money.toman(it)}" },
    r.maxAmount?.let { "حداکثر ${Money.toman(it)}" },
).joinToString(" و ")

@Composable
fun RulesScreen(back: () -> Unit) {
    val dao = app().dao
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val rules by remember { dao.allRulesFlow() }.collectAsStateWithLifecycle(emptyList())
    val exp by remember { dao.categories("EXPENSE") }.collectAsStateWithLifecycle(emptyList())
    val inc by remember { dao.categories("INCOME") }.collectAsStateWithLifecycle(emptyList())
    val cats = (exp + inc).associateBy { it.id }
    var editing by remember { mutableStateOf<Rule?>(null) }
    LazyColumn(Modifier.fillMaxSize().glowBg(), contentPadding = PaddingValues(bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { TopBar("قوانین هوشمند", back, action = Ic.plus) { editing = Rule(contains = "", categoryId = null) } }
        item {
            T("قانون‌ها روی پیامک‌های بانک اجرا می‌شوند: دسته را خودکار می‌زنند یا پیامک را نادیده می‌گیرند. همه شرط‌های یک قانون باید برقرار باشد.",
                12, color = C.muted, modifier = Modifier.padding(horizontal = 20.dp))
        }
        if (rules.isNotEmpty()) item {
            GhostButton("اعمال روی تراکنش‌های بدون دسته", Modifier.padding(horizontal = 16.dp).fillMaxWidth(), Ic.tag) {
                scope.launch {
                    val active = dao.rules().filter { !it.ignore && it.categoryId != null }
                    val hits = dao.uncategorized().mapNotNull { t -> Rules.first(active, null, t.type, t.amount, t.title)?.let { t.id to it.categoryId!! } }
                    hits.groupBy({ it.second }, { it.first }).forEach { (cat, ids) -> dao.setCategory(ids, cat) }
                    Toast.makeText(ctx, if (hits.isEmpty()) "تراکنش منطبقی پیدا نشد" else "${Money.fa(hits.size.toString())} تراکنش دسته‌بندی شد", Toast.LENGTH_SHORT).show()
                }
            }
        }
        if (rules.isEmpty()) item { Empty("هنوز قانونی نساخته‌ای. موقع تأیید پیامک‌ها هم خودکار ساخته می‌شوند.") }
        items(rules, key = { it.id }) { r ->
            val cat = r.categoryId?.let { cats[it] }
            Row(
                Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(C.surface)
                    .border(1.dp, C.line, RoundedCornerShape(20.dp)).clickable { editing = r }.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (r.ignore) CatIcon(Ic.x, C.bad, 38.dp) else CatIcon(Ic.category(cat?.icon), C.cat[(cat?.color ?: 0).mod(C.cat.size)], 38.dp)
                Column(Modifier.weight(1f)) {
                    T(if (r.ignore) "نادیده بگیر" else "دسته: ${cat?.name ?: "—"}", 13.5f, 700, if (r.enabled) C.ink else C.muted)
                    T("اگر ${summary(r)}", 11, color = C.muted, maxLines = 2)
                }
                Switch(r.enabled, { on -> scope.launch { dao.upsertRule(r.copy(enabled = on)) } }, colors = SwitchDefaults.colors(checkedTrackColor = C.lime, checkedThumbColor = C.onLime))
            }
        }
    }
    editing?.let { RuleDialog(it, exp, inc) { editing = null } }
}

@Composable
private fun RuleDialog(r: Rule, exp: List<Category>, inc: List<Category>, onDismiss: () -> Unit) {
    val dao = app().dao
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var contains by remember { mutableStateOf(r.contains) }
    var bank by remember { mutableStateOf(r.bank) }
    var type by remember { mutableStateOf(r.type) }
    var min by remember { mutableStateOf(r.minAmount?.let { (it / 10).toString() }.orEmpty()) }
    var max by remember { mutableStateOf(r.maxAmount?.let { (it / 10).toString() }.orEmpty()) }
    var ignore by remember { mutableStateOf(r.ignore) }
    var cat by remember { mutableStateOf(r.categoryId) }
    var confirm by remember { mutableStateOf(false) }
    val cats = if (type == TxType.INCOME) inc else if (type == TxType.EXPENSE) exp else exp + inc
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = C.sheet,
        title = { T(if (r.id == 0L) "قانون جدید" else "ویرایش قانون", 17, 800) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                T("اگر…", 13, 700, C.accent)
                Label("متن پیامک شامل")
                Field(contains, { contains = it }, "مثلاً خرید شارژ (خالی = هر متنی)")
                Label("بانک")
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) { SMS_BANKS.forEach { (k, l) -> Chip(l, bank == k) { bank = k } } }
                Label("نوع")
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("" to "هر دو", TxType.EXPENSE to "برداشت", TxType.INCOME to "واریز").forEach { (k, l) -> Chip(l, type == k) { type = k } }
                }
                Label("مبلغ (تومان)")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field(min, { min = it }, "حداقل", Modifier.weight(1f), number = true)
                    Field(max, { max = it }, "حداکثر", Modifier.weight(1f), number = true)
                }
                T("آن‌گاه…", 13, 700, C.accent, Modifier.padding(top = 16.dp))
                Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Chip("دسته بزن", !ignore) { ignore = false }
                    Chip("نادیده بگیر", ignore) { ignore = true }
                }
                if (!ignore) Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    cats.forEach { c ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (c.id == cat) C.lime.copy(alpha = 0.14f) else androidx.compose.ui.graphics.Color.Transparent)
                                .clickable { cat = c.id }.padding(6.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            CatIcon(Ic.category(c.icon), C.cat[c.color.mod(C.cat.size)], 30.dp)
                            T(c.name, 13, if (c.id == cat) 700 else 500, if (c.id == cat) C.accent else C.ink)
                        }
                    }
                }
                if (r.id != 0L) T("حذف قانون", 13, 700, C.bad, Modifier.padding(top = 16.dp).clickable { confirm = true })
            }
        },
        confirmButton = {
            TextButton({
                val mn = if (min.isBlank()) null else Money.parseToman(min)
                val mx = if (max.isBlank()) null else Money.parseToman(max)
                val rule = r.copy(contains = contains.trim(), bank = bank, type = type, minAmount = mn, maxAmount = mx, ignore = ignore, categoryId = if (ignore) null else cat)
                val noCond = rule.contains.isBlank() && rule.bank.isEmpty() && rule.type.isEmpty() && mn == null && mx == null
                val err = when {
                    (min.isNotBlank() && mn == null) || (max.isNotBlank() && mx == null) -> "مبلغ فقط عدد"
                    noCond -> "حداقل یک شرط لازم است"
                    !ignore && cat == null -> "دسته را انتخاب کن"
                    else -> null
                }
                if (err != null) Toast.makeText(ctx, err, Toast.LENGTH_SHORT).show()
                else { scope.launch { dao.upsertRule(rule) }; onDismiss() }
            }) { T("ذخیره", 14, 800, C.accent) }
        },
        dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
    )
    if (confirm) Confirm("حذف قانون", "این قانون حذف شود؟", "حذف", danger = true, onOk = { scope.launch { dao.deleteRule(r) }; onDismiss() }, onDismiss = { confirm = false })
}
