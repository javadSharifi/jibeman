package ir.jibeman.feature

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.jibeman.app
import ir.jibeman.core.Jalali
import ir.jibeman.core.Money
import ir.jibeman.core.db.Totals
import ir.jibeman.core.db.TxType
import ir.jibeman.ui.BottomSpace
import ir.jibeman.ui.C
import ir.jibeman.ui.Chip
import ir.jibeman.ui.CircleBtn
import ir.jibeman.ui.Empty
import ir.jibeman.ui.Field
import ir.jibeman.ui.Ic
import ir.jibeman.ui.T
import ir.jibeman.ui.TopBar
import ir.jibeman.ui.TxnGroup
import ir.jibeman.ui.amount
import ir.jibeman.ui.glowBg

/** One Jalali month at a time, so the list never holds more than a month of rows in memory. */
@Composable
fun TxnsScreen(accountId: Long, back: (() -> Unit)?, add: (AddReq) -> Unit) {
    val app = app()
    val dao = app.dao
    val hide = app.prefs.hideAmounts
    val now = remember { Jalali.of(System.currentTimeMillis()) }
    var y by rememberSaveable { mutableIntStateOf(now.y) }
    var m by rememberSaveable { mutableIntStateOf(now.m) }
    var type by rememberSaveable { mutableStateOf("") }
    var acc by rememberSaveable { mutableLongStateOf(accountId) }
    var q by rememberSaveable { mutableStateOf("") }
    var accMenu by remember { mutableStateOf(false) }

    val range = remember(y, m) { Jalali.monthRange(y, m) }
    val query = remember(q) { Money.ascii(q).trim() }
    val accounts by remember { dao.balances() }.collectAsStateWithLifecycle(emptyList())
    val rows by remember(range, type, acc, query) { dao.rows(range.first, range.second, type, acc, query) }.collectAsStateWithLifecycle(emptyList())
    val totals by remember(range, acc) { dao.totals(range.first, range.second, acc) }.collectAsStateWithLifecycle(Totals(0, 0, 0))
    val days = remember(rows) { rows.groupBy { Jalali.dayStart(it.txn.occurredAt) }.toList() }
    val accName = accounts.firstOrNull { it.account.id == acc }?.account?.name

    LazyColumn(Modifier.fillMaxSize().glowBg(), contentPadding = if (back == null) BottomSpace else PaddingValues(bottom = 40.dp)) {
        item {
            if (back != null) TopBar("گردش ${accName ?: "حساب"}", back)
            else Row(Modifier.statusBarsPadding().padding(start = 16.dp, end = 16.dp, top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                T("تراکنش‌ها", 22, 800, modifier = Modifier.weight(1f))
            }
            // month switcher: in RTL the right arrow goes back in time
            Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                CircleBtn(Ic.chevRight, dark = true) { if (m == 1) { m = 12; y-- } else m-- }
                T(Jalali.monthTitle(y, m), 15, 700, modifier = Modifier.weight(1f), align = androidx.compose.ui.text.style.TextAlign.Center)
                CircleBtn(Ic.chevLeft, dark = true) { if (m == 12) { m = 1; y++ } else m++ }
            }
            Field(q, { q = it }, "جستجوی عنوان، دسته یا مبلغ", Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp), leading = Ic.search)
            Row(
                Modifier.horizontalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                listOf("" to "همه", TxType.EXPENSE to "هزینه", TxType.INCOME to "درآمد", TxType.TRANSFER to "انتقال").forEach { (k, l) ->
                    Chip(l, type == k) { type = k }
                }
                if (back == null) Box {
                    Chip(accName ?: "همه حساب‌ها", acc != 0L, Ic.chevDown) { accMenu = true }
                    DropdownMenu(accMenu, { accMenu = false }, containerColor = C.sheet) {
                        DropdownMenuItem({ T("همه حساب‌ها") }, { acc = 0; accMenu = false })
                        accounts.forEach { a -> DropdownMenuItem({ T(a.account.name) }, { acc = a.account.id; accMenu = false }) }
                    }
                }
            }
            Column(
                Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp))
                    .background(Brush.linearGradient(listOf(C.surface2, C.surface))).border(1.dp, C.line, RoundedCornerShape(20.dp))
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        T(Jalali.monthTitle(y, m), 11, color = C.muted)
                        T("${Money.fa(totals.count.toString())} تراکنش", 15, 700)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        T(amount(totals.income, hide, plus = true), 13, 700, C.ok)
                        T(amount(-totals.expense, hide), 13, 700)
                    }
                }
                val sum = totals.income + totals.expense
                if (sum > 0) Row(Modifier.padding(top = 10.dp).fillMaxWidth().height(5.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    if (totals.income > 0) Box(Modifier.weight(totals.income.toFloat()).height(5.dp).clip(CircleShape).background(C.ok))
                    if (totals.expense > 0) Box(Modifier.weight(totals.expense.toFloat()).height(5.dp).clip(CircleShape).background(C.ink.copy(alpha = 0.8f)))
                }
            }
        }
        if (days.isEmpty()) item { Empty(if (q.isBlank()) "در ${Jalali.monthTitle(y, m)} تراکنشی نیست." else "چیزی پیدا نشد.") }
        days.forEach { (day, list) ->
            item(key = day) {
                val net = list.sumOf { if (it.txn.type == TxType.INCOME) it.txn.amount else if (it.txn.type == TxType.EXPENSE) -it.txn.amount else 0 }
                Row(Modifier.fillMaxWidth().padding(start = 22.dp, end = 22.dp, top = 16.dp, bottom = 8.dp)) {
                    T(Jalali.dayLabel(day), 12, color = C.muted, modifier = Modifier.weight(1f))
                    T(amount(net, hide, plus = true), 12, color = if (net > 0) C.ok else C.muted)
                }
                TxnGroup(list, hide) { add(AddReq(txnId = it.txn.id)) }
            }
        }
    }
}
