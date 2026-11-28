package ir.jibeman.feature

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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.jibeman.app
import ir.jibeman.core.Jalali
import ir.jibeman.core.Money
import ir.jibeman.core.db.Totals
import ir.jibeman.core.db.TxType
import ir.jibeman.ui.ActionPill
import ir.jibeman.ui.BankMini
import ir.jibeman.ui.Bar
import ir.jibeman.ui.BottomSpace
import ir.jibeman.ui.C
import ir.jibeman.ui.CircleBtn
import ir.jibeman.ui.Empty
import ir.jibeman.ui.GlassCard
import ir.jibeman.ui.Ic
import ir.jibeman.ui.Ico
import ir.jibeman.ui.SectionHeader
import ir.jibeman.ui.T
import ir.jibeman.ui.Tile
import ir.jibeman.ui.TxnGroup
import ir.jibeman.ui.WhiteDot
import ir.jibeman.ui.amount
import ir.jibeman.ui.glass
import ir.jibeman.ui.heroBg
import ir.jibeman.ui.short

private val ZERO = Totals(0, 0, 0)

@Composable
fun HomeScreen(go: (Route) -> Unit, add: (AddReq) -> Unit) {
    val app = app()
    val dao = app.dao
    val hide = app.prefs.hideAmounts
    val now = remember { System.currentTimeMillis() }
    val j = remember { Jalali.of(now) }
    val month = remember { Jalali.monthRange(j.y, j.m) }
    val day = remember { Jalali.dayRange(now) }
    val accounts by remember { dao.balances() }.collectAsStateWithLifecycle(emptyList())
    val m by remember { dao.totals(month.first, month.second, 0) }.collectAsStateWithLifecycle(ZERO)
    val today by remember { dao.totals(day.first, day.second, 0) }.collectAsStateWithLifecycle(ZERO)
    val recent by remember { dao.recent(0, 5) }.collectAsStateWithLifecycle(emptyList())
    val pending by remember { dao.pendingCount() }.collectAsStateWithLifecycle(0)
    val nextInst by remember { dao.nextInstallment() }.collectAsStateWithLifecycle(null)
    val nextDebt by remember { dao.nextDebt() }.collectAsStateWithLifecycle(null)
    val loans by remember { dao.loans() }.collectAsStateWithLifecycle(emptyList())
    val spendableTotal = accounts.filter { !it.account.isSavings }.sumOf { it.balance }
    val savingsTotal = accounts.filter { it.account.isSavings }.sumOf { it.balance }

    LazyColumn(Modifier.fillMaxSize().background(C.bg), contentPadding = BottomSpace) {
        item {
            Column(Modifier.fillMaxWidth().heroBg().statusBarsPadding().padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 18.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(42.dp).clip(RoundedCornerShape(14.dp)).background(C.lime), contentAlignment = Alignment.Center) {
                        if (app.prefs.name.isBlank()) Ico(Ic.user, 20.dp, C.onLime) else T(app.prefs.name.take(1), 16, 800, C.onLime)
                    }
                    Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                        T(if (app.prefs.name.isBlank()) "سلام" else "سلام، ${app.prefs.name}", 15, 700, maxLines = 1)
                        T(Jalali.longDate(now), 11, color = C.t2)
                    }
                    CircleBtn(Ic.pieChart) { go(Route.MonthlyReport(0L)) }
                    Spacer(Modifier.width(8.dp))
                    CircleBtn(if (hide) Ic.eyeOff else Ic.eye) { app.prefs.hideAmounts = !hide }
                    Box(Modifier.padding(start = 8.dp)) {
                        CircleBtn(Ic.msg) { go(Route.SmsReview) }
                        if (pending > 0) T(
                            Money.fa(pending.toString()), 10, 800, C.onLime,
                            Modifier.align(Alignment.TopStart).offset((-4).dp, (-4).dp).clip(CircleShape).background(C.lime).padding(horizontal = 5.dp),
                        )
                    }
                }
                T("موجودی قابل خرج", 12, color = C.t2, modifier = Modifier.padding(top = 18.dp))
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    T(amount(spendableTotal, hide), 34, 800, maxLines = 1)
                    T("تومان", 14, color = C.ink.copy(alpha = 0.55f), modifier = Modifier.padding(bottom = 8.dp))
                }
                val net = m.income - m.expense
                Row(
                    Modifier.padding(top = 6.dp).height(26.dp).clip(CircleShape)
                        .background((if (net >= 0) C.lime else C.bad).copy(alpha = 0.14f)).padding(horizontal = 10.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    val c = if (net >= 0) C.accent else C.bad
                    Ico(if (net >= 0) Ic.trend else Ic.trendDown, 15.dp, c)
                    T("خالص ${Jalali.MONTHS[j.m - 1]} ${if (hide) Money.HIDDEN else (if (net > 0) "⁦+⁩" else "") + Money.short(net)} تومان", 11, 600, c)
                }

                Row(
                    Modifier.padding(top = 10.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp))
                        .background(C.surface.copy(alpha = 0.65f)).border(1.dp, C.line, RoundedCornerShape(14.dp))
                        .clickable { go(Route.Accounts) }.padding(horizontal = 14.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Ico(Ic.target, 17.dp, C.accent)
                        Column {
                            T("کل پس‌انداز", 12.5f, 700)
                            T("تفکیک‌شده از موجودی قابل‌خرج", 10, color = C.t2)
                        }
                    }
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        T(amount(savingsTotal, hide), 16, 800, color = C.accent)
                        T("تومان", 11, color = C.t2, modifier = Modifier.padding(bottom = 2.dp))
                    }
                }

                Row(Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ActionPill("ثبت هزینه", Ic.out, Modifier.weight(1f)) { add(AddReq(TxType.EXPENSE)) }
                    ActionPill("ثبت درآمد", Ic.inn, Modifier.weight(1f)) { add(AddReq(TxType.INCOME)) }
                }
            }
        }

        if (pending > 0) item {
            Row(
                Modifier.padding(start = 16.dp, end = 16.dp, top = 4.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(C.lime.copy(alpha = 0.1f))
                    .border(1.dp, C.lime.copy(alpha = 0.25f), RoundedCornerShape(18.dp)).clickable { go(Route.SmsReview) }.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Ico(Ic.msg, 18.dp, C.accent)
                T("${Money.fa(pending.toString())} پیامک بانکی در انتظار تأیید", 13, 700, C.accent, Modifier.weight(1f))
                Ico(Ic.chevLeft, 16.dp, C.accent)
            }
        }

        item {
            SectionHeader("حساب‌ها", "همه") { go(Route.Accounts) }
            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(accounts, key = { it.account.id }) { ab ->
                    BankMini(ab.account, ab.balance, ab.last4, hide, Modifier.size(146.dp, 136.dp)) { go(Route.AccountDetail(ab.account.id)) }
                }
                item {
                    Column(
                        Modifier.size(if (accounts.isEmpty()) 220.dp else 110.dp, 136.dp).clip(RoundedCornerShape(20.dp))
                            .border(1.dp, C.line, RoundedCornerShape(20.dp)).background(C.surface).clickable { go(Route.EditAccount(0)) },
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
                    ) {
                        Box(Modifier.size(40.dp).clip(RoundedCornerShape(13.dp)).background(C.lime), contentAlignment = Alignment.Center) { Ico(Ic.plus, 20.dp, C.onLime) }
                        T(if (accounts.isEmpty()) "افزودن اولین حساب" else "حساب جدید", 12, 600, C.t2, Modifier.padding(top = 8.dp))
                    }
                }
            }
        }

        // nearest commitment: an installment or a debt with a due date, whichever comes first
        val inst = nextInst
        val debt = nextDebt
        val useDebt = debt != null && (inst == null || debt.debt.dueAt!! < inst.i.dueAt)
        if (inst != null || debt != null) item {
            val at = if (useDebt) debt!!.debt.dueAt!! else inst!!.i.dueAt
            val days = ((Jalali.dayStart(at) - Jalali.dayStart(now)) / 86_400_000L).toInt()
            GlassCard(
                Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp).fillMaxWidth()
                    .clickable { if (useDebt) go(Route.DebtDetail(debt!!.debt.id)) else go(Route.LoanDetail(inst!!.i.loanId)) },
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Ico(Ic.cal, 15.dp)
                    T("نزدیک‌ترین تعهد", 12.5f, 600, modifier = Modifier.padding(start = 6.dp).weight(1f))
                    WhiteDot(Ic.go, 32.dp)
                }
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    T(if (days <= 0) (if (days == 0) "امروز" else "${Money.fa((-days).toString())} روز") else Money.fa(days.toString()), 32, 800)
                    T(if (days < 0) "گذشته" else if (days == 0) "" else "روز دیگر", 14, 600, modifier = Modifier.padding(bottom = 7.dp))
                }
                T(
                    if (useDebt) "${if (debt!!.debt.direction == ir.jibeman.core.db.DebtDir.I_OWE) "بدهی به" else "طلب از"} ${debt.debt.person} · ${short(debt.remaining, hide)} تومان"
                    else "قسط ${inst!!.loanTitle} · ${amount(inst.i.amount, hide)} تومان",
                    11, color = Color.White.copy(alpha = 0.9f), maxLines = 1,
                )
                if (!useDebt) loans.firstOrNull { it.loan.id == inst!!.i.loanId }?.let { l ->
                    ir.jibeman.ui.Segments(l.loan.count, l.paidCount, Modifier.padding(top = 10.dp), light = true)
                }
            }
        }

        item {
            // today's spending vs. the month's daily average, with one segment per day of the month
            val days = Jalali.monthDays(j.y, j.m)
            GlassCard(
                Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp).fillMaxWidth().clickable { go(Route.Txns()) },
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Ico(Ic.cal, 15.dp)
                    T("هزینه امروز", 12.5f, 600, modifier = Modifier.padding(start = 6.dp).weight(1f))
                    WhiteDot(Ic.go, 32.dp)
                }
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    T(short(today.expense, hide), 32, 800)
                    T("تومان", 13, 600, modifier = Modifier.padding(bottom = 7.dp))
                }
                T("میانگین روزانه ${Jalali.MONTHS[j.m - 1]}: ${short(m.expense / j.d, hide)} تومان", 11, color = Color.White.copy(alpha = 0.9f))
                Row(Modifier.padding(top = 10.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    repeat(days) { i ->
                        val c = when {
                            i + 1 < j.d -> C.lime
                            i + 1 == j.d -> Color.White
                            else -> Color.White.copy(alpha = 0.25f)
                        }
                        Box(Modifier.weight(1f).height(4.dp).clip(CircleShape).background(c))
                    }
                }
            }
        }

        item {
            Row(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Tile(Modifier.weight(1f).height(112.dp), blue = true) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        T("ورودی ${Jalali.MONTHS[j.m - 1]}", 12, modifier = Modifier.weight(1f))
                        WhiteDot(Ic.inn, 26.dp)
                    }
                    Spacer(Modifier.weight(1f))
                    T(short(m.income, hide), 20, 800, maxLines = 1)
                    T("تومان", 10.5f, color = Color.White.copy(alpha = 0.85f))
                }
                Tile(Modifier.weight(1f).height(112.dp).clip(RoundedCornerShape(20.dp)).clickable { go(Route.MonthlyReport(0L)) }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        T("خروجی ${Jalali.MONTHS[j.m - 1]}", 12, color = C.t2, modifier = Modifier.weight(1f))
                        WhiteDot(Ic.pieChart, 26.dp)
                    }
                    Spacer(Modifier.weight(1f))
                    T(short(m.expense, hide), 20, 800, maxLines = 1)
                    val f = if (m.income > 0) m.expense.toFloat() / m.income else 0f
                    Bar(f, Modifier.padding(top = 6.dp))
                    T(if (m.income > 0) "${Money.fa((f * 100).toInt().toString())}٪ از ورودی" else "مشاهده گزارش", 10.5f, color = C.t2, modifier = Modifier.padding(top = 3.dp))
                }
            }
        }

        item {
            SectionHeader("آخرین تراکنش‌ها", if (recent.isEmpty()) null else "همه") { go(Route.Txns()) }
            if (recent.isEmpty()) Empty(if (accounts.isEmpty()) "اول یک حساب بساز، بعد با دکمه + تراکنش ثبت کن." else "هنوز تراکنشی ثبت نشده. دکمه + را بزن.")
            else TxnGroup(recent, hide) { add(AddReq(txnId = it.txn.id)) }
            Spacer(Modifier.width(1.dp))
        }
    }
}
