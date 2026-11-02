package ir.jibeman.feature

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import ir.jibeman.core.BankPlans
import ir.jibeman.core.Money
import ir.jibeman.ui.C
import ir.jibeman.ui.Chip
import ir.jibeman.ui.Divider
import ir.jibeman.ui.T

/**
 * Pick bank plan + rate + term from the published table and read the installment off it,
 * instead of typing the bank's numbers by hand.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BankPlanDialog(principal: Long, months: Int, onDismiss: () -> Unit, onPick: (rate: Int, months: Int, installment: Long, plan: BankPlans.Plan) -> Unit) {
    var plan by remember { mutableStateOf(BankPlans.all.first()) }
    var rate by remember { mutableIntStateOf(plan.rates.first()) }
    var term by remember { mutableIntStateOf(plan.months.minByOrNull { kotlin.math.abs(it - months) } ?: plan.months.first()) }
    fun choose(p: BankPlans.Plan) {
        plan = p
        rate = p.rates.first()
        term = p.months.minByOrNull { kotlin.math.abs(it - months) } ?: p.months.first()
    }
    val max = plan.maxMillion?.times(10_000_000L) // million toman -> rial
    val min = plan.minMillion?.times(10_000_000L) ?: 0L
    val result = if (principal in min..(max ?: Long.MAX_VALUE) && principal > 0) BankPlans.calc(plan, principal, rate, term) else null

    AlertDialog(
        onDismissRequest = onDismiss, containerColor = C.sheet,
        title = { T("جدول اقساط بانکی", 17, 800) },
        text = {
            Column(Modifier.heightIn(max = 460.dp).verticalScroll(rememberScrollState())) {
                T("طرح", 12, color = C.muted, modifier = Modifier.padding(bottom = 6.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    BankPlans.all.forEach { p -> Chip(p.name, p === plan) { choose(p) } }
                }
                Divider()
                T("${plan.title} · ${plan.rateLabel}", 12, color = C.muted, modifier = Modifier.padding(top = 10.dp, bottom = 6.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    plan.rates.forEach { r -> Chip("${Money.fa(r.toString())}٪", r == rate) { rate = r } }
                }
                T("تعداد اقساط", 12, color = C.muted, modifier = Modifier.padding(top = 10.dp, bottom = 6.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    plan.months.forEach { m -> Chip(Money.fa(m.toString()), m == term) { term = m } }
                }
                if (principal <= 0) T("اول مبلغ وام را بزن.", 12.5f, color = C.warn, modifier = Modifier.padding(top = 12.dp))
                else if (result == null) T(
                    "این طرح از ${Money.short(min)} تا ${Money.short(max ?: 0)} تومان است.",
                    12.5f, color = C.warn, modifier = Modifier.padding(top = 12.dp),
                )
                else {
                    Divider()
                    Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        T("قسط", 12, color = C.muted)
                        T("${Money.toman(result.typical)} تومان", 15, 800)
                    }
                    Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        T("جمع بازپرداخت", 12, color = C.muted)
                        T("${Money.toman(result.total)} تومان", 12.5f, 700, C.t2)
                    }
                    Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        T(if (plan.kind == BankPlans.Kind.WAGE) "کارمزد کل" else "سود کل", 12, color = C.muted)
                        T("${Money.toman(result.interest(principal))} تومان", 12.5f, 700, C.t2)
                    }
                    if (result.payments.distinct().size > 1) T(
                        "اقساط این طرح یکسان نیست؛ «قسط» رایج‌ترین مبلغ است.",
                        11, color = C.muted, modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        },
        confirmButton = {
            TextButton({ result?.let { onPick(rate, term, it.typical, plan); onDismiss() } }) { T("استفاده", 14, 800, C.accent) }
        },
        dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
    )
}

/** Compact row that opens the plan table; shows the chosen plan's name once used. */
@Composable
fun PlanPickRow(text: String, onClick: () -> Unit) = Row(
    Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp)).background(C.surface)
        .border(1.dp, C.line, RoundedCornerShape(15.dp)).clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 14.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
) {
    T(text, 13, 600, C.ink)
    T("انتخاب", 12, 700, C.accent)
}
