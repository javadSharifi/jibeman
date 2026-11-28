package ir.jibeman.feature

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
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
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.jibeman.app
import ir.jibeman.core.ExpenseDraft
import ir.jibeman.core.Jalali
import ir.jibeman.core.MemberBalanceState
import ir.jibeman.core.Money
import ir.jibeman.core.OptimizedTransfer
import ir.jibeman.core.SettlementDraft
import ir.jibeman.core.SplitConst
import ir.jibeman.core.SplitEngine
import ir.jibeman.core.SplitExpenseInput
import ir.jibeman.core.SplitMemberInput
import ir.jibeman.core.SplitSettlementInput
import ir.jibeman.core.SplitShareInput
import ir.jibeman.core.SplitValidationException
import ir.jibeman.core.db.MemberRow
import ir.jibeman.core.db.SplitExpense
import ir.jibeman.core.db.SplitGroup
import ir.jibeman.core.db.SplitSettlement
import ir.jibeman.core.db.SplitShare
import ir.jibeman.ui.AmountField
import ir.jibeman.ui.C
import ir.jibeman.ui.CatIcon
import ir.jibeman.ui.Chip
import ir.jibeman.ui.Confirm
import ir.jibeman.ui.Divider
import ir.jibeman.ui.Empty
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
import ir.jibeman.ui.Segmented
import ir.jibeman.ui.T
import ir.jibeman.ui.Tile
import ir.jibeman.ui.TopBar
import ir.jibeman.ui.amount
import ir.jibeman.ui.glowBg
import java.util.UUID
import kotlinx.coroutines.launch

private fun MemberRow.label(): String =
    name?.takeIf { it.isNotBlank() }
        ?: m.displayName.takeIf { it.isNotBlank() }
        ?: if (m.role == SplitConst.ROLE_SELF || m.personId == null) "من" else "عضو"

private fun MemberRow.isSelf(): Boolean = m.role == SplitConst.ROLE_SELF || (m.personId == null && m.displayName == "من")
private fun MemberRow.isArchived(): Boolean = m.status == SplitConst.MEMBER_ARCHIVED

private enum class GroupListFilter { ALL, OPEN, CLOSED }
private enum class SplitDashTab { EXPENSES, MEMBERS, SETTLEMENTS, SUMMARY }

@Composable
fun SplitsScreen(back: () -> Unit, go: (Route) -> Unit) {
    val app = app()
    val hide = app.prefs.hideAmounts
    val groups by remember { app.dao.groups() }.collectAsStateWithLifecycle(emptyList())
    var filter by remember { mutableStateOf(GroupListFilter.ALL) }
    var adding by remember { mutableStateOf(false) }

    val filtered = remember(groups, filter) {
        when (filter) {
            GroupListFilter.ALL -> groups
            GroupListFilter.OPEN -> groups.filter { !it.g.closed && it.g.status != SplitConst.GROUP_CLOSED }
            GroupListFilter.CLOSED -> groups.filter { it.g.closed || it.g.status == SplitConst.GROUP_CLOSED }
        }
    }

    LazyColumn(
        Modifier.fillMaxSize().glowBg(),
        contentPadding = PaddingValues(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { TopBar("محاسبه دنگ", back, action = Ic.plus) { adding = true } }
        if (groups.isNotEmpty()) {
            item {
                Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Chip("همه", filter == GroupListFilter.ALL) { filter = GroupListFilter.ALL }
                    Chip("باز", filter == GroupListFilter.OPEN) { filter = GroupListFilter.OPEN }
                    Chip("بسته شده", filter == GroupListFilter.CLOSED) { filter = GroupListFilter.CLOSED }
                }
            }
        }
        if (groups.isEmpty()) {
            item {
                Empty("هنوز گروه دنگی نساخته‌ای. مثلاً «سفر شمال» یا «خانه مشترک».", "ساخت اولین گروه") {
                    adding = true
                }
            }
        } else if (filtered.isEmpty()) {
            item { Empty("گروهی در این وضعیت وجود ندارد.") }
        }
        items(filtered, key = { it.g.id }) { r ->
            val isClosed = r.g.closed || r.g.status == SplitConst.GROUP_CLOSED
            val evDate = if (r.g.eventDate > 0L) r.g.eventDate else r.g.createdAt
            Row(
                Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(C.surface)
                    .border(1.dp, C.line, RoundedCornerShape(20.dp)).clickable { go(Route.SplitDetail(r.g.id)) }.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                CatIcon(Ic.users, if (isClosed) C.muted else C.sky)
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        T(r.g.title, 14, 700, if (isClosed) C.muted else C.ink, maxLines = 1, modifier = Modifier.weight(1f, fill = false))
                        StatusPill(if (isClosed) "بسته" else "باز", if (isClosed) C.muted else C.sky)
                    }
                    T(
                        "${Jalali.longDate(evDate)} · ${Money.fa(maxOf(1, r.members).toString())} عضو",
                        11,
                        color = C.muted,
                        maxLines = 1,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    T("${amount(r.total, hide)} تومان", 12.5f, 800, C.ink)
                }
                Ico(Ic.chevLeft, 16.dp, C.muted)
            }
        }
    }
    if (adding) GroupFormDialog(editing = null, onDismiss = { adding = false }) { go(Route.SplitDetail(it)) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GroupFormDialog(
    editing: SplitGroup?,
    onDismiss: () -> Unit,
    onSaved: (Long) -> Unit,
) {
    val dao = app().dao
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val people by remember { dao.people() }.collectAsStateWithLifecycle(emptyList())

    var title by remember(editing) { mutableStateOf(editing?.title ?: "") }
    var description by remember(editing) { mutableStateOf(editing?.description ?: "") }
    var eventDate by remember(editing) {
        mutableLongStateOf(editing?.let { if (it.eventDate > 0L) it.eventDate else it.createdAt } ?: System.currentTimeMillis())
    }
    var pickingDate by remember { mutableStateOf(false) }

    val pickedContacts = remember(editing) { mutableStateListOf<Long>() }
    val customNames = remember(editing) { mutableStateListOf<String>() }
    var newName by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = C.sheet,
        title = { T(if (editing == null) "گروه دنگ جدید" else "ویرایش مشخصات گروه", 17, 800) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Field(title, { title = it }, "نام گروه، مثلاً سفر شمال")
                PickField(Jalali.longDate(eventDate), Ic.cal) { pickingDate = true }
                Field(description, { description = it }, "توضیحات (اختیاری)")

                if (editing == null) {
                    Label("اعضا (شما خودکار عضو هستید)")
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Chip("من (خودم)", true, Ic.check) {}
                        people.forEach { p ->
                            Chip(p.p.name, p.p.id in pickedContacts) {
                                if (p.p.id in pickedContacts) pickedContacts.remove(p.p.id) else pickedContacts.add(p.p.id)
                            }
                        }
                        customNames.forEach { n ->
                            Chip(n, true, Ic.x) { customNames.remove(n) }
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Field(newName, { newName = it }, "افزودن عضو با نام", Modifier.weight(1f), leading = Ic.user)
                        Box(
                            Modifier.size(46.dp).clip(RoundedCornerShape(14.dp)).background(C.surface).border(1.dp, C.line, RoundedCornerShape(14.dp)).clickable {
                                val n = newName.trim()
                                if (n.isNotEmpty() && n != "من") {
                                    val match = people.firstOrNull { it.p.name.trim() == n }
                                    if (match != null) {
                                        if (match.p.id !in pickedContacts) pickedContacts.add(match.p.id)
                                    } else if (n !in customNames) {
                                        customNames.add(n)
                                    }
                                }
                                newName = ""
                            },
                            contentAlignment = Alignment.Center,
                        ) { Ico(Ic.plus) }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !saving,
                onClick = {
                    val clean = title.trim()
                    if (clean.isEmpty()) {
                        Toast.makeText(ctx, "نام گروه الزامی است", Toast.LENGTH_SHORT).show()
                        return@TextButton
                    }
                    saving = true
                    scope.launch {
                        try {
                            if (editing == null) {
                                val contactPairs = people.filter { it.p.id in pickedContacts }.map { it.p.id to it.p.name }
                                val id = dao.createGroupV2(clean, description, eventDate, contactPairs, customNames.toList())
                                onDismiss()
                                onSaved(id)
                            } else {
                                dao.updateGroupV2(editing.id, clean, description, eventDate)
                                onDismiss()
                                onSaved(editing.id)
                            }
                        } catch (e: SplitValidationException) {
                            Toast.makeText(ctx, e.message, Toast.LENGTH_SHORT).show()
                        } finally {
                            saving = false
                        }
                    }
                },
            ) { T(if (editing == null) "ایجاد گروه" else "ذخیره", 14, 800, C.accent) }
        },
        dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
    )

    if (pickingDate) {
        JDateDialog("تاریخ رویداد", eventDate, { eventDate = it }) { pickingDate = false }
    }
}

@Composable
fun SplitDetailScreen(id: Long, back: () -> Unit) {
    val app = app()
    val dao = app.dao
    val hide = app.prefs.hideAmounts
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    val group by remember { dao.group(id) }.collectAsStateWithLifecycle(null)
    val members by remember { dao.members(id) }.collectAsStateWithLifecycle(emptyList())
    val expenses by remember { dao.expenses(id) }.collectAsStateWithLifecycle(emptyList())
    val shares by remember { dao.shares(id) }.collectAsStateWithLifecycle(emptyList())
    val settlements by remember { dao.settlements(id) }.collectAsStateWithLifecycle(emptyList())
    val auditLogs by remember { dao.auditLogs(id) }.collectAsStateWithLifecycle(emptyList())

    var loaded by remember { mutableStateOf(false) }
    LaunchedEffect(group) { if (group != null) loaded = true else if (loaded) back() }
    val g = group ?: return

    var tab by remember { mutableStateOf(SplitDashTab.EXPENSES) }
    var editingGroup by remember { mutableStateOf(false) }
    var addingExpense by remember { mutableStateOf(false) }
    var editingExpense by remember { mutableStateOf<SplitExpense?>(null) }
    var deletingExpense by remember { mutableStateOf<SplitExpense?>(null) }
    var settlementModalOpen by remember { mutableStateOf(false) }
    var settlementPrefill by remember { mutableStateOf<OptimizedTransfer?>(null) }
    var reversingSettlement by remember { mutableStateOf<SplitSettlement?>(null) }
    var confirmClose by remember { mutableStateOf(false) }

    val summary = remember(members, expenses, shares, settlements) {
        SplitEngine.calculateGroupSummary(
            members = members.map {
                SplitMemberInput(
                    id = it.m.id,
                    role = it.m.role.ifEmpty { if (it.isSelf()) SplitConst.ROLE_SELF else SplitConst.ROLE_MEMBER },
                    status = it.m.status.ifEmpty { SplitConst.MEMBER_ACTIVE },
                )
            },
            expenses = expenses.map {
                SplitExpenseInput(
                    id = it.id,
                    amount = it.amount,
                    payerId = it.payerId,
                    splitMethod = it.splitMethod.ifEmpty { SplitConst.METHOD_EQUAL },
                    integrityStatus = it.integrityStatus.ifEmpty { SplitConst.INTEGRITY_VALID },
                    isDeleted = it.isDeleted,
                )
            },
            shares = shares.map { SplitShareInput(it.expenseId, it.memberId, it.amount) },
            settlements = settlements.map { SplitSettlementInput(it.id, it.fromMemberId, it.toMemberId, it.amount, it.status) },
        )
    }

    val isClosed = g.closed || g.status == SplitConst.GROUP_CLOSED
    val byId = remember(members) { members.associateBy { it.m.id } }
    val selfMember = remember(members) { members.firstOrNull { it.isSelf() } }
    val selfBal = selfMember?.let { summary.balanceByMemberId[it.m.id] }
    val activeExpenses = remember(expenses) { expenses.filter { !it.isDeleted } }
    val sharesByExpense = remember(shares) { shares.groupBy { it.expenseId } }
    val activeSettlements = remember(settlements) { settlements.filter { it.status == SplitConst.SETTLEMENT_ACTIVE } }
    val evDate = if (g.eventDate > 0L) g.eventDate else g.createdAt
    val activeMemberCount = members.count { !it.isArchived() }

    LazyColumn(
        Modifier.fillMaxSize().glowBg(),
        contentPadding = PaddingValues(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { TopBar(g.title, back, action = Ic.pen) { editingGroup = true } }

        // Hero Glass Summary
        item {
            GlassCard(Modifier.padding(horizontal = 16.dp).fillMaxWidth()) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        T("${Jalali.longDate(evDate)} · ${Money.fa(activeMemberCount.toString())} عضو", 11, color = Color.White.copy(alpha = 0.8f))
                        if (!g.description.isNullOrBlank()) {
                            T(g.description, 11, color = Color.White.copy(alpha = 0.85f), maxLines = 1)
                        }
                    }
                    StatusPill(
                        if (isClosed) "بسته شده" else if (summary.isSettled) "تسویه کامل" else "در جریان",
                        if (isClosed) Color.White.copy(alpha = 0.7f) else if (summary.isSettled) C.ok else C.warn,
                    )
                }
                Spacer(Modifier.height(10.dp))
                T("کل هزینه‌های گروه", 11.5f, color = Color.White.copy(alpha = 0.8f))
                T("${amount(summary.totalExpenses, hide)} تومان", 22, 800, Color.White)
                if (summary.totalOutstandingDebt > 0L) {
                    T("مانده تسویه‌نشده: ${amount(summary.totalOutstandingDebt, hide)} تومان", 11.5f, 700, C.lime)
                }
                if (selfBal != null) {
                    Row(
                        Modifier.padding(top = 10.dp).fillMaxWidth().border(1.dp, Color.White.copy(alpha = 0.16f), RoundedCornerShape(14.dp)).padding(vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                    ) {
                        MiniMetric("پرداختی من", amount(selfBal.totalPaid, hide), Color.White)
                        MiniMetric("سهم من", amount(selfBal.totalShare, hide), Color.White)
                        MiniMetric(
                            "مانده من",
                            if (selfBal.netBalance == 0L) "۰ (صاف)" else amount(selfBal.netBalance, hide, plus = true),
                            if (selfBal.netBalance > 0L) C.ok else if (selfBal.netBalance < 0L) C.warn else Color.White,
                        )
                    }
                }
            }
        }

        if (summary.needsReviewCount > 0) {
            item {
                Row(
                    Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(C.warn.copy(alpha = 0.14f))
                        .border(1.dp, C.warn.copy(alpha = 0.35f), RoundedCornerShape(16.dp)).padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically,
                ) {
                    Ico(Ic.alert, 18.dp, C.warn)
                    T(
                        "${Money.fa(summary.needsReviewCount.toString())} هزینه قدیمی اطلاعات ناقص دارد و تا زمان تکمیل در محاسبه تسویه لحاظ نمی‌شود.",
                        11.5f,
                        color = C.warn,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }

        item {
            if (!isClosed) {
                LimeButton("ثبت هزینه جدید", Modifier.padding(horizontal = 16.dp).fillMaxWidth(), Ic.plus) {
                    editingExpense = null
                    addingExpense = true
                }
            } else {
                Row(
                    Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(C.surface)
                        .border(1.dp, C.line, RoundedCornerShape(16.dp)).padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Ico(Ic.lock, 16.dp, C.muted)
                    T("این گروه بسته شده و فقط خواندنی است.", 12, color = C.t2, modifier = Modifier.weight(1f))
                    TextButton({ scope.launch { dao.setGroupClosed(id, false) } }) {
                        T("بازگشایی", 12, 800, C.sky)
                    }
                }
            }
        }

        // 4-tab navigation
        item {
            Column(Modifier.padding(horizontal = 16.dp)) {
                Segmented(
                    listOf(
                        SplitDashTab.EXPENSES to "هزینه‌ها",
                        SplitDashTab.MEMBERS to "اعضا",
                        SplitDashTab.SETTLEMENTS to "تسویه",
                        SplitDashTab.SUMMARY to "گزارش",
                    ),
                    tab,
                ) { tab = it }
            }
        }

        when (tab) {
            SplitDashTab.EXPENSES -> {
                if (activeExpenses.isEmpty()) {
                    item { Empty("هنوز هزینه‌ای در این گروه ثبت نشده است.") }
                } else {
                    items(activeExpenses, key = { it.id }) { exp ->
                        val expShares = sharesByExpense[exp.id].orEmpty()
                        val payerName = byId[exp.payerId]?.label() ?: "نامشخص"
                        val myShare = selfMember?.let { sm -> expShares.firstOrNull { it.memberId == sm.m.id }?.amount ?: 0L } ?: 0L
                        val needsReview = exp.integrityStatus == SplitConst.INTEGRITY_NEEDS_REVIEW
                        Column(
                            Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp))
                                .background(if (needsReview) C.warn.copy(alpha = 0.08f) else C.surface)
                                .border(1.dp, if (needsReview) C.warn.copy(alpha = 0.35f) else C.line, RoundedCornerShape(18.dp))
                                .padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                CatIcon(if (needsReview) Ic.alert else Ic.receipt, if (needsReview) C.warn else C.cat[1], 36.dp)
                                Column(Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        T(exp.title, 13, 700, maxLines = 1, modifier = Modifier.weight(1f, fill = false))
                                        StatusPill(
                                            if (needsReview) "نیاز به بررسی" else if (exp.splitMethod == SplitConst.METHOD_EQUAL) "مساوی" else "دلخواه",
                                            if (needsReview) C.warn else C.muted,
                                        )
                                    }
                                    T(
                                        if (needsReview) "سهم یا پرداخت‌کننده نامشخص · ${Jalali.longDate(exp.at)}"
                                        else "پرداخت: $payerName · ${Money.fa(expShares.size.toString())} نفر · ${Jalali.longDate(exp.at)}",
                                        11,
                                        color = C.muted,
                                        maxLines = 1,
                                    )
                                    if (!exp.note.isNullOrBlank()) T(exp.note, 11, color = C.t2, maxLines = 1)
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    T("${amount(exp.amount, hide)} تومان", 12.5f, 800)
                                    if (!needsReview && selfMember != null) {
                                        T("سهم من: ${amount(myShare, hide)}", 10.5f, color = C.sky)
                                    }
                                }
                            }
                            if (!isClosed) {
                                Divider()
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                    TextButton({ editingExpense = exp; addingExpense = true }) {
                                        T(if (needsReview) "تکمیل و بررسی" else "ویرایش", 12, 700, C.sky)
                                    }
                                    TextButton({ deletingExpense = exp }) {
                                        T("حذف", 12, 700, C.bad)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            SplitDashTab.MEMBERS -> {
                item {
                    MembersTabContent(
                        groupId = id,
                        isClosed = isClosed,
                        hide = hide,
                        members = members,
                        summary = summary,
                    )
                }
            }

            SplitDashTab.SETTLEMENTS -> {
                item {
                    SettlementsTabContent(
                        isClosed = isClosed,
                        hide = hide,
                        byId = byId,
                        members = members,
                        settlements = settlements,
                        summary = summary,
                        onOpenRecord = { prefill ->
                            settlementPrefill = prefill
                            settlementModalOpen = true
                        },
                        onReverse = { reversingSettlement = it },
                    )
                }
            }

            SplitDashTab.SUMMARY -> {
                item {
                    SummaryTabContent(
                        group = g,
                        isClosed = isClosed,
                        hide = hide,
                        members = members,
                        summary = summary,
                        auditLogs = auditLogs,
                        onCopy = {
                            val lines = buildList {
                                add("گزارش گروه «${g.title}» (${Jalali.longDate(evDate)})")
                                add("جمع هزینه‌ها: ${Money.toman(summary.totalExpenses)} تومان (${Money.fa(summary.validExpenseCount.toString())} هزینه)")
                                add("")
                                add("وضعیت اعضا:")
                                members.forEach { m ->
                                    val b = summary.balanceByMemberId[m.m.id] ?: return@forEach
                                    val st = when {
                                        b.netBalance > 0 -> "طلبکار ${Money.toman(b.netBalance)} تومان"
                                        b.netBalance < 0 -> "بدهکار ${Money.toman(-b.netBalance)} تومان"
                                        else -> "تسویه"
                                    }
                                    add("- ${m.label()}: پرداخت ${Money.toman(b.totalPaid)} | سهم ${Money.toman(b.totalShare)} | $st")
                                }
                                add("")
                                if (summary.optimization.transfers.isEmpty()) {
                                    add("وضعیت: همه اعضا تسویه هستند.")
                                } else {
                                    add("پیشنهاد تسویه:")
                                    summary.optimization.transfers.forEach { t ->
                                        add("- ${byId[t.fromMemberId]?.label()} ← ${byId[t.toMemberId]?.label()}: ${Money.toman(t.amount)} تومان")
                                    }
                                }
                            }.joinToString("\n")
                            val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            cm.setPrimaryClip(ClipData.newPlainText("split_summary", lines))
                            Toast.makeText(ctx, "گزارش متنی کپی شد", Toast.LENGTH_SHORT).show()
                        },
                        onToggleClose = {
                            if (isClosed) {
                                scope.launch { dao.setGroupClosed(id, false) }
                            } else {
                                confirmClose = true
                            }
                        },
                    )
                }
            }
        }
    }

    if (editingGroup) {
        GroupFormDialog(editing = g, onDismiss = { editingGroup = false }) { }
    }

    if (addingExpense) {
        ExpenseFormDialog(
            groupId = id,
            members = members,
            hasActiveSettlements = activeSettlements.isNotEmpty(),
            editingExpense = editingExpense,
            editingShares = editingExpense?.let { sharesByExpense[it.id].orEmpty() }.orEmpty(),
            onDismiss = { addingExpense = false; editingExpense = null },
        )
    }

    if (settlementModalOpen) {
        SettlementFormDialog(
            groupId = id,
            members = members,
            activeSettlements = activeSettlements,
            prefill = settlementPrefill,
            onDismiss = { settlementModalOpen = false; settlementPrefill = null },
        )
    }

    deletingExpense?.let { exp ->
        Confirm(
            title = "حذف هزینه «${exp.title}»",
            text = if (activeSettlements.isNotEmpty()) {
                "در این گروه تسویه ثبت شده است. با حذف این هزینه، مانده اعضا بر اساس هزینه‌های باقی‌مانده و تسویه‌ها دوباره محاسبه می‌شود."
            } else {
                "این هزینه از محاسبه گروه حذف می‌شود و سابقه آن در تاریخچه ثبت می‌گردد."
            },
            ok = "حذف هزینه",
            danger = true,
            onOk = { scope.launch { dao.softDeleteSplitExpense(exp.id) } },
            onDismiss = { deletingExpense = null },
        )
    }

    reversingSettlement?.let { stl ->
        ReverseSettlementDialog(
            fromName = byId[stl.fromMemberId]?.label() ?: "عضو",
            toName = byId[stl.toMemberId]?.label() ?: "عضو",
            amountRial = stl.amount,
            onDismiss = { reversingSettlement = null },
            onConfirm = { reason ->
                scope.launch {
                    try {
                        dao.reverseSplitSettlement(stl.id, reason)
                    } catch (e: SplitValidationException) {
                        Toast.makeText(ctx, e.message, Toast.LENGTH_SHORT).show()
                    }
                }
            },
        )
    }

    if (confirmClose) {
        Confirm(
            title = "بستن گروه «${g.title}»",
            text = if (summary.isSettled) {
                "همه اعضای گروه تسویه هستند. با بستن گروه، ثبت و ویرایش قفل می‌شود و اعداد دست نمی‌خورند."
            } else {
                "هنوز ${Money.toman(summary.totalOutstandingDebt)} تومان مانده تسویه‌نشده وجود دارد. بستن گروه اعداد را تغییر نمی‌دهد و هر زمان قابل بازگشایی است."
            },
            ok = "بستن گروه",
            onOk = { scope.launch { dao.setGroupClosed(id, true) } },
            onDismiss = { confirmClose = false },
        )
    }
}

@Composable
private fun StatusPill(text: String, color: Color) = T(
    text,
    9.5f,
    700,
    color,
    Modifier.clip(RoundedCornerShape(8.dp)).background(color.copy(alpha = 0.14f)).padding(horizontal = 7.dp, vertical = 2.dp),
)

@Composable
private fun MiniMetric(label: String, value: String, color: Color) = Column(horizontalAlignment = Alignment.CenterHorizontally) {
    T(label, 10, color = Color.White.copy(alpha = 0.72f))
    T(value, 12, 800, color, maxLines = 1)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ExpenseFormDialog(
    groupId: Long,
    members: List<MemberRow>,
    hasActiveSettlements: Boolean,
    editingExpense: SplitExpense?,
    editingShares: List<SplitShare>,
    onDismiss: () -> Unit,
) {
    val dao = app().dao
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    val activeMembers = remember(members) { members.filter { !it.isArchived() } }
    val selectableMembers = remember(members, editingExpense, editingShares) {
        if (editingExpense == null) activeMembers else {
            val attached = buildSet {
                add(editingExpense.payerId)
                editingShares.forEach { add(it.memberId) }
            }
            members.filter { !it.isArchived() || it.m.id in attached }
        }
    }
    val selfMember = remember(activeMembers, members) { activeMembers.firstOrNull { it.isSelf() } ?: activeMembers.firstOrNull() ?: members.first() }
    val validIds = remember(selectableMembers) { selectableMembers.map { it.m.id }.toSet() }

    var title by remember(editingExpense) { mutableStateOf(editingExpense?.title ?: "") }
    var amountText by remember(editingExpense) { mutableStateOf(editingExpense?.let { Money.tomanInput(it.amount) } ?: "") }
    var occurredAt by remember(editingExpense) { mutableLongStateOf(editingExpense?.at ?: System.currentTimeMillis()) }
    var pickingDate by remember { mutableStateOf(false) }
    var note by remember(editingExpense) { mutableStateOf(editingExpense?.note ?: "") }
    var payerId by remember(editingExpense) {
        mutableLongStateOf(
            editingExpense?.payerId?.takeIf { it in validIds } ?: selfMember.m.id
        )
    }
    val beneficiaries = remember(editingExpense, editingShares, activeMembers) {
        mutableStateListOf<Long>().apply {
            val initial = if (editingExpense != null && editingShares.isNotEmpty()) {
                editingShares.map { it.memberId }.filter { it in validIds }.ifEmpty { activeMembers.map { it.m.id } }
            } else {
                activeMembers.map { it.m.id }
            }
            addAll(initial)
        }
    }
    var splitMethod by remember(editingExpense) {
        mutableStateOf(
            if (editingExpense == null || editingExpense.integrityStatus == SplitConst.INTEGRITY_NEEDS_REVIEW) {
                SplitConst.METHOD_EQUAL
            } else {
                editingExpense.splitMethod.ifEmpty { SplitConst.METHOD_EQUAL }
            }
        )
    }
    val customInputs = remember(editingExpense, editingShares) {
        mutableStateMapOf<Long, String>().apply {
            editingShares.forEach { put(it.memberId, Money.tomanInput(it.amount)) }
        }
    }
    var saving by remember { mutableStateOf(false) }

    val parsed = Money.parseToman(amountText)
    val invalidFraction = parsed != null && parsed > 0L && parsed % SplitConst.RIAL_PRECISION != 0L
    val validAmount = parsed?.takeIf { it > 0L && it % SplitConst.RIAL_PRECISION == 0L }
    val equalShares = remember(validAmount, beneficiaries.toList(), splitMethod) {
        if (splitMethod == SplitConst.METHOD_EQUAL && validAmount != null && beneficiaries.isNotEmpty()) {
            runCatching { SplitEngine.computeEqualShares(validAmount, beneficiaries.toList()) }.getOrDefault(emptyMap())
        } else emptyMap()
    }

    val customParsed = remember(beneficiaries.toList(), customInputs.toMap(), splitMethod) {
        if (splitMethod != SplitConst.METHOD_CUSTOM) emptyMap()
        else beneficiaries.associateWith { id ->
            val raw = customInputs[id]?.trim().orEmpty()
            if (raw.isEmpty()) 0L else Money.parseToman(raw) ?: -1L
        }
    }
    val customHasInvalid = customParsed.values.any { it < 0L || it % SplitConst.RIAL_PRECISION != 0L }
    val customAllocated = if (customHasInvalid) 0L else customParsed.values.sum()
    val customPositive = customParsed.values.count { it > 0L }
    val customExact = validAmount != null && !customHasInvalid && customPositive > 0 && customAllocated == validAmount

    val byId = remember(members) { members.associateBy { it.m.id } }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = C.sheet,
        title = {
            T(
                when {
                    editingExpense == null -> "ثبت هزینه جدید"
                    editingExpense.integrityStatus == SplitConst.INTEGRITY_NEEDS_REVIEW -> "تکمیل هزینه قدیمی"
                    else -> "ویرایش هزینه"
                },
                17,
                800,
            )
        },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (editingExpense != null && hasActiveSettlements) {
                    T("در این گروه تسویه ثبت شده؛ با ویرایش، مانده‌ها دوباره محاسبه می‌شوند.", 11, color = C.warn)
                }
                Field(title, { title = it }, "عنوان هزینه، مثلاً شام")
                AmountField(amountText, { amountText = it }, "مبلغ کل (تومان)")
                if (invalidFraction) T("اعشار تومانی مجاز نیست؛ مبلغ باید به تومان کامل باشد.", 11, color = C.bad)
                PickField(Jalali.longDate(occurredAt), Ic.cal) { pickingDate = true }

                Label("چه کسی پرداخت کرد؟")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    selectableMembers.forEach { m ->
                        Chip(m.label(), payerId == m.m.id) { payerId = m.m.id }
                    }
                }

                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Label("بین چه کسانی تقسیم شود؟")
                    Spacer(Modifier.weight(1f))
                    TextButton({
                        beneficiaries.clear()
                        beneficiaries.addAll(selectableMembers.map { it.m.id })
                    }) { T("انتخاب همه", 11, 700, C.sky) }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    selectableMembers.forEach { m ->
                        val on = m.m.id in beneficiaries
                        Chip(m.label(), on, if (on) Ic.check else null) {
                            if (on) beneficiaries.remove(m.m.id) else beneficiaries.add(m.m.id)
                        }
                    }
                }

                Label("روش تقسیم")
                Segmented(listOf(SplitConst.METHOD_EQUAL to "مساوی", SplitConst.METHOD_CUSTOM to "مبلغ دلخواه"), splitMethod) { next ->
                    if (next == SplitConst.METHOD_CUSTOM && validAmount != null && beneficiaries.isNotEmpty() && customInputs.isEmpty()) {
                        runCatching { SplitEngine.computeEqualShares(validAmount, beneficiaries.toList()) }
                            .getOrNull()?.forEach { (k, v) -> customInputs[k] = Money.tomanInput(v) }
                    }
                    splitMethod = next
                }

                if (splitMethod == SplitConst.METHOD_EQUAL && equalShares.isNotEmpty()) {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(C.surface).padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        T("پیش‌نمایش سهم هر نفر", 11, 700, C.t2)
                        equalShares.forEach { (mId, amt) ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                T(byId[mId]?.label().orEmpty(), 12)
                                T("${Money.toman(amt)} تومان", 12, 700)
                            }
                        }
                    }
                }

                if (splitMethod == SplitConst.METHOD_CUSTOM && beneficiaries.isNotEmpty()) {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(C.surface).padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (validAmount != null && !customHasInvalid) {
                            val rem = validAmount - customAllocated
                            T(
                                when {
                                    rem == 0L -> "تراز شد ✓"
                                    rem > 0L -> "باقی‌مانده برای تقسیم: ${Money.toman(rem)} تومان"
                                    else -> "مازاد: ${Money.toman(-rem)} تومان"
                                },
                                11.5f,
                                700,
                                if (rem == 0L) C.ok else if (rem > 0L) C.warn else C.bad,
                            )
                        }
                        beneficiaries.forEach { mId ->
                            T(byId[mId]?.label().orEmpty(), 11.5f, 700, C.t2)
                            AmountField(customInputs[mId] ?: "", { customInputs[mId] = it }, "سهم (تومان)")
                        }
                    }
                }

                Field(note, { note = it }, "یادداشت (اختیاری)")
            }
        },
        confirmButton = {
            TextButton(
                enabled = !saving,
                onClick = {
                    val amt = validAmount
                    if (title.isBlank() || amt == null || beneficiaries.isEmpty()) {
                        Toast.makeText(ctx, "عنوان، مبلغ معتبر و حداقل یک عضو لازم است", Toast.LENGTH_SHORT).show()
                        return@TextButton
                    }
                    if (splitMethod == SplitConst.METHOD_CUSTOM && !customExact) {
                        Toast.makeText(ctx, "جمع سهم‌های دلخواه باید دقیقاً برابر مبلغ کل باشد", Toast.LENGTH_SHORT).show()
                        return@TextButton
                    }
                    saving = true
                    scope.launch {
                        try {
                            val draft = ExpenseDraft(
                                title = title.trim(),
                                amountRial = amt,
                                payerId = payerId,
                                splitMethod = splitMethod,
                                beneficiaryIds = beneficiaries.toList(),
                                customSharesByMemberId = if (splitMethod == SplitConst.METHOD_CUSTOM) customParsed else emptyMap(),
                                occurredAt = occurredAt,
                                note = note.trim().ifEmpty { null },
                            )
                            if (editingExpense == null) dao.addSplitExpenseV2(groupId, draft)
                            else dao.updateSplitExpenseV2(editingExpense.id, draft)
                            onDismiss()
                        } catch (e: SplitValidationException) {
                            Toast.makeText(ctx, e.message, Toast.LENGTH_SHORT).show()
                        } finally {
                            saving = false
                        }
                    }
                },
            ) { T("ذخیره", 14, 800, C.accent) }
        },
        dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
    )

    if (pickingDate) {
        JDateDialog("تاریخ هزینه", occurredAt, { occurredAt = it }) { pickingDate = false }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MembersTabContent(
    groupId: Long,
    isClosed: Boolean,
    hide: Boolean,
    members: List<MemberRow>,
    summary: ir.jibeman.core.GroupSummaryInfo,
) {
    val dao = app().dao
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val people by remember { dao.people() }.collectAsStateWithLifecycle(emptyList())
    var showAdd by remember { mutableStateOf(false) }
    var newName by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }

    val activePersonIds = remember(members) { members.filter { !it.isArchived() && it.m.personId != null }.map { it.m.personId!! }.toSet() }
    val availableContacts = remember(people, activePersonIds) { people.filter { it.p.id !in activePersonIds } }

    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (!isClosed) {
            GhostButton(if (showAdd) "بستن افزودن عضو" else "افزودن عضو جدید", Modifier.fillMaxWidth(), Ic.plus, C.sky) {
                showAdd = !showAdd
            }
        }

        if (showAdd && !isClosed) {
            Tile(Modifier.fillMaxWidth()) {
                if (availableContacts.isNotEmpty()) {
                    T("افزودن از مخاطبین:", 11.5f, color = C.muted, modifier = Modifier.padding(bottom = 6.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        availableContacts.forEach { p ->
                            Chip(p.p.name, false) {
                                if (busy) return@Chip
                                busy = true
                                scope.launch {
                                    runCatching { dao.addMemberV2(groupId, p.p.id, p.p.name) }
                                        .onFailure { Toast.makeText(ctx, it.message ?: "خطا", Toast.LENGTH_SHORT).show() }
                                    busy = false
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field(newName, { newName = it }, "افزودن عضو با نام", Modifier.weight(1f), leading = Ic.user)
                    Box(
                        Modifier.size(46.dp).clip(RoundedCornerShape(14.dp)).background(C.lime).clickable(enabled = !busy) {
                            val clean = newName.trim()
                            if (clean.isEmpty()) return@clickable
                            busy = true
                            scope.launch {
                                runCatching { dao.addMemberV2(groupId, null, clean); newName = "" }
                                    .onFailure { Toast.makeText(ctx, it.message ?: "خطا", Toast.LENGTH_SHORT).show() }
                                busy = false
                            }
                        },
                        contentAlignment = Alignment.Center,
                    ) { Ico(Ic.plus, tint = C.onLime) }
                }
            }
        }

        members.forEach { m ->
            val bal = summary.balanceByMemberId[m.m.id]
            val net = bal?.netBalance ?: 0L
            val archived = m.isArchived()
            Tile(Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Avatar(m.label(), if (m.isSelf()) C.accent else C.violet, 38)
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            T(m.label(), 13.5f, 700, if (archived) C.muted else C.ink, maxLines = 1)
                            if (m.isSelf()) StatusPill("شما", C.accent)
                            if (archived) StatusPill("بایگانی", C.muted)
                        }
                        val stText = when (bal?.state ?: MemberBalanceState.SETTLED) {
                            MemberBalanceState.CREDITOR -> "طلبکار"
                            MemberBalanceState.DEBTOR -> "بدهکار"
                            MemberBalanceState.SETTLED -> "تسویه"
                        }
                        val stColor = when (bal?.state ?: MemberBalanceState.SETTLED) {
                            MemberBalanceState.CREDITOR -> C.ok
                            MemberBalanceState.DEBTOR -> C.warn
                            MemberBalanceState.SETTLED -> C.muted
                        }
                        T(stText, 11, 700, stColor)
                    }
                    if (!isClosed && !m.isSelf()) {
                        TextButton({
                            scope.launch {
                                runCatching {
                                    if (archived) dao.restoreMemberV2(groupId, m.m.id)
                                    else dao.archiveMemberV2(groupId, m.m.id)
                                }.onFailure { Toast.makeText(ctx, it.message ?: "خطا", Toast.LENGTH_LONG).show() }
                            }
                        }) { T(if (archived) "بازیابی" else "بایگانی", 11.5f, 700, if (archived) C.sky else C.muted) }
                    }
                }
                Spacer(Modifier.height(8.dp))
                Divider()
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
                        T("پرداختی", 10, color = C.muted)
                        T(amount(bal?.totalPaid ?: 0L, hide), 12, 700)
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
                        T("سهم کل", 10, color = C.muted)
                        T(amount(bal?.totalShare ?: 0L, hide), 12, 700)
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
                        T("مانده خالص", 10, color = C.muted)
                        T(
                            if (net == 0L) "۰" else amount(net, hide, plus = true),
                            12,
                            800,
                            if (net > 0L) C.ok else if (net < 0L) C.warn else C.muted,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SettlementsTabContent(
    isClosed: Boolean,
    hide: Boolean,
    byId: Map<Long, MemberRow>,
    members: List<MemberRow>,
    settlements: List<SplitSettlement>,
    summary: ir.jibeman.core.GroupSummaryInfo,
    onOpenRecord: (OptimizedTransfer?) -> Unit,
    onReverse: (SplitSettlement) -> Unit,
) {
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                T("پیشنهادهای تسویه", 13.5f, 700)
                T(
                    if (summary.optimization.isExact) "بهینه‌سازی دقیق (حداقل تعداد تراکنش ممکن)"
                    else "پیشنهاد بهینه حریصانه (بیش از ۱۴ عضو تصفیه‌نشده)",
                    10.5f,
                    color = C.muted,
                )
            }
            if (!isClosed && members.size >= 2) {
                TextButton({ onOpenRecord(null) }) { T("+ تسویه دستی", 12, 700, C.sky) }
            }
        }

        if (summary.optimization.transfers.isEmpty()) {
            Tile(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Ico(Ic.check, 18.dp, C.ok)
                    T(
                        if (summary.needsReviewCount > 0) "بر اساس هزینه‌های تاییدشده، اعضا صاف هستند."
                        else "همه اعضا با هم تسویه هستند.",
                        12.5f,
                        700,
                        C.ok,
                    )
                }
            }
        } else {
            summary.optimization.transfers.forEach { t ->
                val fromName = byId[t.fromMemberId]?.label().orEmpty()
                val toName = byId[t.toMemberId]?.label().orEmpty()
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(C.surface)
                        .border(1.dp, C.line, RoundedCornerShape(18.dp)).padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    T(
                        "$fromName باید ${amount(t.amount, hide)} تومان به $toName بدهد.",
                        12.5f,
                        700,
                        modifier = Modifier.weight(1f),
                    )
                    if (!isClosed) {
                        Box(
                            Modifier.height(34.dp).clip(RoundedCornerShape(10.dp)).background(C.lime.copy(alpha = 0.16f))
                                .clickable { onOpenRecord(t) }.padding(horizontal = 10.dp),
                            contentAlignment = Alignment.Center,
                        ) { T("ثبت تسویه", 11.5f, 800, C.accent) }
                    }
                }
            }
        }

        T("تاریخچه تسویه‌ها", 13.5f, 700, modifier = Modifier.padding(top = 4.dp))
        if (settlements.isEmpty()) {
            Empty("هنوز تسویه‌ای در این گروه ثبت نشده است.")
        } else {
            settlements.forEach { s ->
                val fromName = byId[s.fromMemberId]?.label().orEmpty()
                val toName = byId[s.toMemberId]?.label().orEmpty()
                val reversed = s.status == SplitConst.SETTLEMENT_REVERSED
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(C.surface)
                        .border(1.dp, C.line, RoundedCornerShape(18.dp)).padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    CatIcon(Ic.swap, if (reversed) C.bad else C.ok, 34.dp)
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            androidx.compose.material3.Text(
                                "$fromName ← $toName",
                                color = if (reversed) C.muted else C.ink,
                                fontFamily = ir.jibeman.ui.Vazir,
                                fontSize = androidx.compose.ui.unit.TextUnit(12.5f, androidx.compose.ui.unit.TextUnitType.Sp),
                                fontWeight = androidx.compose.ui.text.font.FontWeight(700),
                                textDecoration = if (reversed) TextDecoration.LineThrough else null,
                            )
                            if (reversed) StatusPill("برگشت‌خورده", C.bad)
                        }
                        val meta = buildString {
                            append(Jalali.longDate(s.settledAt))
                            if (!s.note.isNullOrBlank()) append(" · ${s.note}")
                            if (reversed && !s.reversalReason.isNullOrBlank()) append(" · علت: ${s.reversalReason}")
                        }
                        T(meta, 10.5f, color = C.muted, maxLines = 1)
                    }
                    T("${amount(s.amount, hide)} ت", 12, 800, if (reversed) C.muted else C.ink)
                    if (!isClosed && !reversed) {
                        TextButton({ onReverse(s) }) { T("برگشت", 11.5f, 700, C.bad) }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SettlementFormDialog(
    groupId: Long,
    members: List<MemberRow>,
    activeSettlements: List<SplitSettlement>,
    prefill: OptimizedTransfer?,
    onDismiss: () -> Unit,
) {
    val dao = app().dao
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    val initialFrom = prefill?.fromMemberId ?: members.first().m.id
    val initialTo = prefill?.toMemberId ?: members.firstOrNull { it.m.id != initialFrom }?.m?.id ?: initialFrom

    var fromId by remember(prefill) { mutableLongStateOf(initialFrom) }
    var toId by remember(prefill) { mutableLongStateOf(initialTo) }
    var amountText by remember(prefill) { mutableStateOf(prefill?.let { Money.tomanInput(it.amount) } ?: "") }
    var settledAt by remember(prefill) { mutableLongStateOf(System.currentTimeMillis()) }
    var pickingDate by remember { mutableStateOf(false) }
    var note by remember(prefill) { mutableStateOf("") }
    val idempotencyKey = remember(prefill) { UUID.randomUUID().toString() }
    var duplicateConfirmed by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }

    val parsed = Money.parseToman(amountText)
    val invalidFraction = parsed != null && parsed > 0L && parsed % SplitConst.RIAL_PRECISION != 0L
    val validAmount = parsed?.takeIf { it > 0L && it % SplitConst.RIAL_PRECISION == 0L }
    val remaining = if (prefill != null && validAmount != null) maxOf(0L, prefill.amount - validAmount) else null
    val recentSimilar = validAmount != null && activeSettlements.any {
        it.fromMemberId == fromId && it.toMemberId == toId && it.amount == validAmount &&
            System.currentTimeMillis() - it.createdAt < 60_000L
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = C.sheet,
        title = { T("ثبت تسویه حساب", 17, 800) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Label("پرداخت‌کننده (بدهکار)")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    members.forEach { m -> Chip(m.label(), fromId == m.m.id) { fromId = m.m.id } }
                }
                Label("دریافت‌کننده (طلبکار)")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    members.forEach { m -> Chip(m.label(), toId == m.m.id) { toId = m.m.id } }
                }
                AmountField(amountText, { amountText = it; duplicateConfirmed = false }, "مبلغ پرداختی (تومان)")
                if (invalidFraction) T("اعشار تومانی مجاز نیست؛ مبلغ باید به تومان کامل باشد.", 11, color = C.bad)
                if (remaining != null && validAmount != null) {
                    T(
                        if (remaining == 0L) "تسویه کامل بدهی پیشنهادی" else "تسویه جزئی · باقی‌مانده: ${Money.toman(remaining)} تومان",
                        11.5f,
                        700,
                        C.t2,
                    )
                }
                PickField(Jalali.longDate(settledAt), Ic.cal) { pickingDate = true }
                Field(note, { note = it }, "یادداشت (اختیاری)")
                if (recentSimilar && duplicateConfirmed) {
                    T("تسویه مشابهی در یک دقیقه اخیر ثبت شده است. برای ثبت مجدد دوباره تایید کنید.", 11, color = C.warn)
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !saving,
                onClick = {
                    val amt = validAmount
                    if (amt == null || fromId == toId) {
                        Toast.makeText(ctx, "پرداخت‌کننده، دریافت‌کننده و مبلغ معتبر لازم است", Toast.LENGTH_SHORT).show()
                        return@TextButton
                    }
                    if (recentSimilar && !duplicateConfirmed) {
                        duplicateConfirmed = true
                        return@TextButton
                    }
                    saving = true
                    scope.launch {
                        try {
                            dao.recordSplitSettlement(
                                groupId,
                                SettlementDraft(
                                    fromMemberId = fromId,
                                    toMemberId = toId,
                                    amountRial = amt,
                                    settledAt = settledAt,
                                    idempotencyKey = idempotencyKey,
                                    note = note.trim().ifEmpty { null },
                                ),
                            )
                            onDismiss()
                        } catch (e: SplitValidationException) {
                            Toast.makeText(ctx, e.message, Toast.LENGTH_SHORT).show()
                        } finally {
                            saving = false
                        }
                    }
                },
            ) { T(if (recentSimilar && duplicateConfirmed) "تایید ثبت مجدد" else "ثبت تسویه", 14, 800, C.accent) }
        },
        dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
    )

    if (pickingDate) {
        JDateDialog("تاریخ تسویه", settledAt, { settledAt = it }) { pickingDate = false }
    }
}

@Composable
private fun ReverseSettlementDialog(
    fromName: String,
    toName: String,
    amountRial: Long,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var reason by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = C.sheet,
        title = { T("برگشت دادن تسویه", 17, 800) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                T("تسویه $fromName به $toName به مبلغ ${Money.toman(amountRial)} تومان در تاریخچه باقی می‌ماند و مانده اعضا به حالت قبل برمی‌گردد.", 12, color = C.t2)
                Field(reason, { reason = it }, "علت برگشت (اختیاری)")
            }
        },
        confirmButton = {
            TextButton({ onConfirm(reason); onDismiss() }) { T("تایید برگشت", 14, 800, C.bad) }
        },
        dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
    )
}

@Composable
private fun SummaryTabContent(
    group: SplitGroup,
    isClosed: Boolean,
    hide: Boolean,
    members: List<MemberRow>,
    summary: ir.jibeman.core.GroupSummaryInfo,
    auditLogs: List<ir.jibeman.core.db.SplitAuditLog>,
    onCopy: () -> Unit,
    onToggleClose: () -> Unit,
) {
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Tile(Modifier.weight(1f)) {
                T("جمع کل هزینه‌ها", 11, color = C.muted)
                T("${amount(summary.totalExpenses, hide)} ت", 15, 800)
                T("${Money.fa(summary.validExpenseCount.toString())} هزینه تاییدشده", 10.5f, color = C.t2)
            }
            Tile(Modifier.weight(1f)) {
                T("مانده تسویه‌نشده", 11, color = C.muted)
                T(
                    if (summary.isSettled) "۰ تومان" else "${amount(summary.totalOutstandingDebt, hide)} ت",
                    15,
                    800,
                    if (summary.isSettled) C.ok else C.warn,
                )
                T("تسویه‌شده: ${amount(summary.totalActiveSettlements, hide)}", 10.5f, color = C.t2)
            }
        }

        Tile(Modifier.fillMaxWidth()) {
            T("تراز مالی اعضا", 13.5f, 700, modifier = Modifier.padding(bottom = 6.dp))
            members.forEachIndexed { idx, m ->
                val b = summary.balanceByMemberId[m.m.id] ?: return@forEachIndexed
                if (idx > 0) Divider()
                Column(Modifier.padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        T(m.label(), 12.5f, 700)
                        T(
                            if (b.netBalance == 0L) "تسویه" else "${amount(b.netBalance, hide, plus = true)} تومان",
                            12.5f,
                            800,
                            if (b.netBalance > 0L) C.ok else if (b.netBalance < 0L) C.warn else C.muted,
                        )
                    }
                    T(
                        "پرداخت: ${amount(b.totalPaid, hide)} · سهم: ${amount(b.totalShare, hide)}" +
                            (if (b.settlementsOut > 0L) " · تسویه پرداختی: ${amount(b.settlementsOut, hide)}" else "") +
                            (if (b.settlementsIn > 0L) " · تسویه دریافتی: ${amount(b.settlementsIn, hide)}" else ""),
                        10.5f,
                        color = C.muted,
                    )
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GhostButton("کپی گزارش", Modifier.weight(1f), Ic.copy, C.ink, onCopy)
            GhostButton(
                if (isClosed) "بازگشایی گروه" else "بستن گروه",
                Modifier.weight(1f),
                Ic.lock,
                if (isClosed) C.sky else C.ink,
                onToggleClose,
            )
        }

        if (auditLogs.isNotEmpty()) {
            Tile(Modifier.fillMaxWidth()) {
                T("تاریخچه تغییرات", 13, 700, C.t2, modifier = Modifier.padding(bottom = 6.dp))
                auditLogs.take(15).forEachIndexed { idx, log ->
                    if (idx > 0) Divider()
                    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        T(log.summary, 11, color = C.ink, modifier = Modifier.weight(1f))
                        T(Jalali.shortDateTime(log.at), 10, color = C.muted)
                    }
                }
            }
        }
    }
}
