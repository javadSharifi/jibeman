package ir.jibeman.feature

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.jibeman.app
import ir.jibeman.core.Jalali
import ir.jibeman.core.Money
import ir.jibeman.core.db.AccountBalance
import ir.jibeman.core.db.Totals
import ir.jibeman.core.db.TxType
import ir.jibeman.core.db.TxnRow
import ir.jibeman.ui.Bar
import ir.jibeman.ui.C
import ir.jibeman.ui.CatIcon
import ir.jibeman.ui.Chip
import ir.jibeman.ui.CircleBtn
import ir.jibeman.ui.Divider
import ir.jibeman.ui.Empty
import ir.jibeman.ui.GhostButton
import ir.jibeman.ui.Group
import ir.jibeman.ui.Ic
import ir.jibeman.ui.Ico
import ir.jibeman.ui.Mono
import ir.jibeman.ui.SectionHeader
import ir.jibeman.ui.T
import ir.jibeman.ui.Tile
import ir.jibeman.ui.TopBar
import ir.jibeman.ui.TxnRowView
import ir.jibeman.ui.amount
import ir.jibeman.ui.glowBg
import ir.jibeman.ui.short
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/** Pure aggregation helpers for monthly spending reports (all cards or single card). */
object MonthlyReports {
    data class CategorySpend(
        val key: String,
        val categoryId: Long?,
        val name: String,
        val icon: String,
        val colorIdx: Int,
        val totalAmount: Long,
        val count: Int,
        val percent: Float,
        val txns: List<TxnRow>,
    )

    data class AccountShare(
        val accountId: Long,
        val name: String,
        val bankCode: String?,
        val type: String,
        val last4: String?,
        val totalAmount: Long,
        val count: Int,
        val percent: Float,
    )

    data class Summary(
        val totalExpense: Long,
        val totalIncome: Long,
        val expenseCount: Int,
        val prevMonthExpense: Long,
        val deltaPercent: Int?,
        val dailyAverage: Long,
        val categories: List<CategorySpend>,
        val accountShares: List<AccountShare>,
    )

    fun prevMonth(y: Int, m: Int): Pair<Int, Int> = if (m <= 1) (y - 1) to 12 else y to (m - 1)

    fun nextMonth(y: Int, m: Int): Pair<Int, Int> = if (m >= 12) (y + 1) to 1 else y to (m + 1)

    fun formatPercent(pct: Float): String = when {
        pct <= 0f -> "۰٪"
        pct < 1f -> "کمتر از ۱٪"
        else -> "${Money.fa(pct.roundToInt().toString())}٪"
    }

    fun build(
        y: Int,
        m: Int,
        accountId: Long,
        monthExpenses: List<TxnRow>,
        monthTotals: Totals,
        prevTotals: Totals,
        accounts: List<AccountBalance>,
        now: Long = System.currentTimeMillis(),
    ): Summary {
        val scopedExpenses = if (accountId == 0L) monthExpenses else monthExpenses.filter { it.txn.accountId == accountId }
        val totalExpense = scopedExpenses.sumOf { it.txn.amount }
        val expenseCount = scopedExpenses.size
        val prevExpense = prevTotals.expense
        val deltaPercent = if (prevExpense > 0L) {
            (((totalExpense - prevExpense).toDouble() / prevExpense.toDouble()) * 100.0).roundToInt()
        } else null

        val cur = Jalali.of(now)
        val elapsedDays = when {
            y == cur.y && m == cur.m -> maxOf(1, cur.d)
            y > cur.y || (y == cur.y && m > cur.m) -> 1
            else -> Jalali.monthDays(y, m)
        }
        val dailyAvg = if (totalExpense > 0L) (totalExpense.toDouble() / elapsedDays).roundToLong() else 0L

        val categories = scopedExpenses
            .groupBy { it.txn.categoryId }
            .map { (catId, rows) ->
                val first = rows.first()
                val sum = rows.sumOf { it.txn.amount }
                val hasCat = catId != null && first.categoryName != null
                CategorySpend(
                    key = if (hasCat) "cat-$catId" else "uncategorized",
                    categoryId = if (hasCat) catId else null,
                    name = first.categoryName ?: "بدون دسته",
                    icon = first.categoryIcon ?: "tag",
                    colorIdx = if (hasCat) (first.categoryColor ?: 0) else 6,
                    totalAmount = sum,
                    count = rows.size,
                    percent = if (totalExpense > 0L) (sum * 100f) / totalExpense else 0f,
                    txns = rows.sortedWith(compareByDescending<TxnRow> { it.txn.occurredAt }.thenByDescending { it.txn.id }),
                )
            }
            .sortedByDescending { it.totalAmount }

        val accMap = accounts.associateBy { it.account.id }
        val accountShares = if (accountId != 0L) emptyList() else {
            scopedExpenses
                .groupBy { it.txn.accountId }
                .map { (accId, rows) ->
                    val ab = accMap[accId]
                    val sum = rows.sumOf { it.txn.amount }
                    AccountShare(
                        accountId = accId,
                        name = ab?.account?.name ?: rows.first().accountName,
                        bankCode = ab?.account?.bankCode,
                        type = ab?.account?.type ?: "BANK",
                        last4 = ab?.last4,
                        totalAmount = sum,
                        count = rows.size,
                        percent = if (totalExpense > 0L) (sum * 100f) / totalExpense else 0f,
                    )
                }
                .sortedByDescending { it.totalAmount }
        }

        return Summary(
            totalExpense = totalExpense,
            totalIncome = monthTotals.income,
            expenseCount = expenseCount,
            prevMonthExpense = prevExpense,
            deltaPercent = deltaPercent,
            dailyAverage = dailyAvg,
            categories = categories,
            accountShares = accountShares,
        )
    }
}

private val ZERO_TOTALS = Totals(0, 0, 0)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MonthlyReportScreen(
    accountId: Long,
    back: () -> Unit,
    go: (Route) -> Unit,
    add: (AddReq) -> Unit,
) {
    val app = app()
    val dao = app.dao
    val hide = app.prefs.hideAmounts
    val now = remember { Jalali.of(System.currentTimeMillis()) }

    var y by rememberSaveable { mutableIntStateOf(now.y) }
    var m by rememberSaveable { mutableIntStateOf(now.m) }
    var selectedAcc by rememberSaveable(accountId) { mutableLongStateOf(accountId) }
    var expandedKey by remember { mutableStateOf<String?>(null) }

    val range = remember(y, m) { Jalali.monthRange(y, m) }
    val prev = remember(y, m) { MonthlyReports.prevMonth(y, m) }
    val prevRange = remember(prev) { Jalali.monthRange(prev.first, prev.second) }

    val accounts by remember { dao.balances() }.collectAsStateWithLifecycle(emptyList())
    val monthExpenses by remember(range, selectedAcc) {
        dao.rows(range.first, range.second, TxType.EXPENSE, selectedAcc, "")
    }.collectAsStateWithLifecycle(emptyList())
    val monthTotals by remember(range, selectedAcc) {
        dao.totals(range.first, range.second, selectedAcc)
    }.collectAsStateWithLifecycle(ZERO_TOTALS)
    val prevTotals by remember(prevRange, selectedAcc) {
        dao.totals(prevRange.first, prevRange.second, selectedAcc)
    }.collectAsStateWithLifecycle(ZERO_TOTALS)

    val summary = remember(y, m, selectedAcc, monthExpenses, monthTotals, prevTotals, accounts) {
        MonthlyReports.build(y, m, selectedAcc, monthExpenses, monthTotals, prevTotals, accounts)
    }
    val activeAcc = accounts.firstOrNull { it.account.id == selectedAcc }
    val prevMonthName = Jalali.MONTHS[prev.second - 1]

    LazyColumn(
        Modifier.fillMaxSize().glowBg(),
        contentPadding = PaddingValues(bottom = 40.dp),
    ) {
        item {
            TopBar("گزارش ماهانه هزینه‌ها", back, action = if (hide) Ic.eyeOff else Ic.eye) {
                app.prefs.hideAmounts = !hide
            }

            // Jalali month switcher
            Row(
                Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircleBtn(Ic.chevRight, dark = true) {
                    val p = MonthlyReports.prevMonth(y, m)
                    y = p.first; m = p.second; expandedKey = null
                }
                T(Jalali.monthTitle(y, m), 15, 700, modifier = Modifier.weight(1f), align = TextAlign.Center)
                CircleBtn(Ic.chevLeft, dark = true) {
                    val n = MonthlyReports.nextMonth(y, m)
                    y = n.first; m = n.second; expandedKey = null
                }
            }

            // Card / Account scope pills
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                item {
                    Chip("همه کارت‌ها", selectedAcc == 0L, Ic.pieChart) {
                        selectedAcc = 0L; expandedKey = null
                    }
                }
                items(accounts, key = { it.account.id }) { ab ->
                    val label = if (ab.last4 != null) "${ab.account.name} *${Money.fa(ab.last4)}" else ab.account.name
                    Chip(label, selectedAcc == ab.account.id) {
                        selectedAcc = ab.account.id; expandedKey = null
                    }
                }
            }

            // Summary Hero Tile
            Tile(Modifier.padding(horizontal = 16.dp).fillMaxWidth()) {
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column(Modifier.weight(1f)) {
                        T(
                            if (activeAcc != null) "خرج‌شده از ${activeAcc.account.name}" else "مجموع هزینه‌های همه کارت‌ها",
                            11.5f,
                            color = C.t2,
                            maxLines = 1,
                        )
                        Row(
                            verticalAlignment = Alignment.Bottom,
                            horizontalArrangement = Arrangement.spacedBy(5.dp),
                            modifier = Modifier.padding(top = 4.dp),
                        ) {
                            T(amount(summary.totalExpense, hide), 24, 800, maxLines = 1)
                            T("تومان", 11, color = C.muted, modifier = Modifier.padding(bottom = 3.dp))
                        }
                    }

                    summary.deltaPercent?.let { delta ->
                        val (bg, fg, txt) = when {
                            delta > 0 -> Triple(C.bad.copy(alpha = 0.14f), C.bad, "${Money.fa(delta.toString())}٪ بیشتر از $prevMonthName")
                            delta < 0 -> Triple(C.ok.copy(alpha = 0.14f), C.ok, "${Money.fa((-delta).toString())}٪ کمتر از $prevMonthName")
                            else -> Triple(C.ink.copy(alpha = 0.08f), C.muted, "برابر با $prevMonthName")
                        }
                        Box(
                            Modifier.clip(CircleShape).background(bg).padding(horizontal = 10.dp, vertical = 5.dp),
                        ) {
                            T(txt, 10.5f, 700, fg, maxLines = 1)
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))
                Divider()
                Spacer(Modifier.height(10.dp))

                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatMini("تراکنش هزینه", "${Money.fa(summary.expenseCount.toString())} مورد", C.ink, Modifier.weight(1f))
                    StatMini("میانگین روزانه", short(summary.dailyAverage, hide), C.sky, Modifier.weight(1f))
                    StatMini("درآمد ماه", short(summary.totalIncome, hide), C.ok, Modifier.weight(1f))
                }
            }
        }

        if (summary.categories.isEmpty()) {
            item {
                Empty(
                    if (activeAcc != null) "در ${Jalali.monthTitle(y, m)} برای «${activeAcc.account.name}» هزینه‌ای ثبت نشده است."
                    else "در ${Jalali.monthTitle(y, m)} هزینه‌ای ثبت نشده است.",
                )
            }
        } else {
            // Donut Chart Card
            item {
                Tile(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp).fillMaxWidth()) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        T("نمودار سهم دسته‌بندی‌ها", 13, 700)
                        T("برای جزئیات، دسته‌ای را لمس کن", 10.5f, color = C.muted)
                    }

                    val activeCat = summary.categories.firstOrNull { it.key == expandedKey }
                    Box(
                        Modifier.fillMaxWidth().padding(vertical = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        val trackColor = C.ink.copy(alpha = 0.07f)
                        val catColors = summary.categories.map { C.cat[it.colorIdx.mod(C.cat.size)] }
                        Canvas(Modifier.size(176.dp)) {
                            val strokeW = 24.dp.toPx()
                            drawArc(
                                color = trackColor,
                                startAngle = 0f,
                                sweepAngle = 360f,
                                useCenter = false,
                                style = Stroke(width = strokeW, cap = StrokeCap.Butt),
                            )
                            var startAngle = -90f
                            val gapDeg = if (summary.categories.size > 1) 2.2f else 0f
                            summary.categories.forEachIndexed { idx, cat ->
                                val rawSweep = if (summary.totalExpense > 0L) (cat.totalAmount.toFloat() / summary.totalExpense.toFloat()) * 360f else 0f
                                val drawSweep = (rawSweep - gapDeg).coerceAtLeast(0.5f)
                                val isSelected = expandedKey == cat.key
                                val isDimmed = expandedKey != null && !isSelected
                                val sliceColor = catColors[idx].copy(alpha = if (isDimmed) 0.3f else 1f)
                                drawArc(
                                    color = sliceColor,
                                    startAngle = startAngle,
                                    sweepAngle = drawSweep,
                                    useCenter = false,
                                    style = Stroke(width = if (isSelected) strokeW + 4.dp.toPx() else strokeW, cap = StrokeCap.Butt),
                                )
                                startAngle += rawSweep
                            }
                        }

                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(108.dp)) {
                            if (activeCat != null) {
                                val catColor = C.cat[activeCat.colorIdx.mod(C.cat.size)]
                                T(activeCat.name, 11.5f, 700, maxLines = 1, align = TextAlign.Center)
                                T(MonthlyReports.formatPercent(activeCat.percent), 18, 800, catColor)
                                T(if (hide) Money.HIDDEN else "${short(activeCat.totalAmount, false)} ت", 11, 600, C.t2, maxLines = 1)
                            } else {
                                T("جمع هزینه ماه", 10.5f, color = C.muted)
                                T(short(summary.totalExpense, hide), 18, 800, maxLines = 1)
                                T("تومان", 10, color = C.muted)
                            }
                        }
                    }

                    FlowRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        summary.categories.take(6).forEach { cat ->
                            val catColor = C.cat[cat.colorIdx.mod(C.cat.size)]
                            val selected = expandedKey == cat.key
                            Row(
                                Modifier
                                    .clip(CircleShape)
                                    .background(if (selected) C.ink.copy(alpha = 0.1f) else C.bg.copy(alpha = 0.45f))
                                    .border(1.dp, if (selected) catColor else C.line, CircleShape)
                                    .clickable { expandedKey = if (selected) null else cat.key }
                                    .padding(horizontal = 9.dp, vertical = 5.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(5.dp),
                            ) {
                                Box(Modifier.size(8.dp).clip(CircleShape).background(catColor))
                                T(cat.name, 11, if (selected) 700 else 500, maxLines = 1)
                                T(MonthlyReports.formatPercent(cat.percent), 10.5f, color = C.muted)
                            }
                        }
                    }
                }
            }

            // Expandable Category Breakdown List
            item {
                SectionHeader("چقدر و کجا مصرف شده؟", "${Money.fa(summary.categories.size.toString())} دسته")
                Group {
                    summary.categories.forEachIndexed { idx, cat ->
                        if (idx > 0) Divider()
                        val catColor = C.cat[cat.colorIdx.mod(C.cat.size)]
                        val isExpanded = expandedKey == cat.key

                        Column(Modifier.fillMaxWidth()) {
                            Column(
                                Modifier
                                    .fillMaxWidth()
                                    .clickable { expandedKey = if (isExpanded) null else cat.key }
                                    .padding(vertical = 12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    CatIcon(Ic.category(cat.icon), catColor)
                                    Column(Modifier.weight(1f)) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            T(cat.name, 13.5f, 700, maxLines = 1)
                                            Box(
                                                Modifier.clip(RoundedCornerShape(6.dp))
                                                    .background(catColor.copy(alpha = 0.14f))
                                                    .padding(horizontal = 6.dp, vertical = 1.dp),
                                            ) {
                                                T(MonthlyReports.formatPercent(cat.percent), 10, 700, catColor)
                                            }
                                        }
                                        T("${Money.fa(cat.count.toString())} تراکنش", 11, color = C.muted, modifier = Modifier.padding(top = 2.dp))
                                    }

                                    Column(horizontalAlignment = Alignment.End) {
                                        T(amount(cat.totalAmount, hide), 13.5f, 700, maxLines = 1)
                                        T("تومان", 10, color = C.muted)
                                    }

                                    Ico(if (isExpanded) Ic.chevUp else Ic.chevDown, 16.dp, if (isExpanded) C.accent else C.muted)
                                }

                                Box(Modifier.fillMaxWidth().height(5.dp).clip(CircleShape).background(C.ink.copy(alpha = 0.08f))) {
                                    Box(
                                        Modifier.fillMaxWidth((cat.percent / 100f).coerceIn(0.02f, 1f))
                                            .height(5.dp).clip(CircleShape).background(catColor),
                                    )
                                }
                            }

                            AnimatedVisibility(visible = isExpanded) {
                                Column(
                                    Modifier
                                        .fillMaxWidth()
                                        .padding(bottom = 10.dp)
                                        .clip(RoundedCornerShape(14.dp))
                                        .background(C.bg.copy(alpha = 0.55f))
                                        .padding(horizontal = 10.dp, vertical = 2.dp),
                                ) {
                                    cat.txns.forEachIndexed { tIdx, r ->
                                        if (tIdx > 0) Divider()
                                        TxnRowView(r, hide) { add(AddReq(txnId = r.txn.id)) }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Per-card Share Breakdown when viewing All Cards
            if (selectedAcc == 0L && summary.accountShares.isNotEmpty()) {
                item {
                    SectionHeader("سهم هر کارت از هزینه‌های ماه", "انتخاب کارت")
                    Group {
                        summary.accountShares.forEachIndexed { idx, share ->
                            if (idx > 0) Divider()
                            Column(
                                Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        selectedAcc = share.accountId
                                        expandedKey = null
                                    }
                                    .padding(vertical = 12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    Mono(share.bankCode, share.type, 34.dp)
                                    Column(Modifier.weight(1f)) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            T(share.name, 13, 700, maxLines = 1)
                                            if (share.last4 != null) {
                                                T("*${Money.fa(share.last4)}", 10.5f, color = C.muted)
                                            }
                                        }
                                        T(
                                            "${Money.fa(share.count.toString())} تراکنش · ${MonthlyReports.formatPercent(share.percent)}",
                                            11,
                                            color = C.muted,
                                        )
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        T(amount(share.totalAmount, hide), 13, 700, maxLines = 1)
                                        T("تومان", 10, color = C.muted)
                                    }
                                    Ico(Ic.chevLeft, 15.dp, C.muted)
                                }
                                Bar(share.percent / 100f)
                            }
                        }
                    }
                }
            }
        }

        // Quick link to filtered transactions
        item {
            Spacer(Modifier.height(16.dp))
            GhostButton(
                if (activeAcc != null) "مشاهده گردش حساب ${activeAcc.account.name}" else "مشاهده همه تراکنش‌ها",
                Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                icon = Ic.list,
                color = C.sky,
            ) {
                go(Route.Txns(selectedAcc))
            }
        }
    }
}

@Composable
private fun StatMini(label: String, value: String, valueColor: Color, modifier: Modifier = Modifier) = Column(
    modifier.clip(RoundedCornerShape(12.dp)).background(C.bg.copy(alpha = 0.45f)).padding(horizontal = 8.dp, vertical = 8.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(3.dp),
) {
    T(label, 10, color = C.muted, maxLines = 1)
    T(value, 12.5f, 800, valueColor, maxLines = 1)
}
