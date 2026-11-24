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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.jibeman.app
import ir.jibeman.core.Jalali
import ir.jibeman.core.Money
import ir.jibeman.core.db.AccountBalance
import ir.jibeman.core.db.SavingsCommitment
import ir.jibeman.core.db.TxType
import ir.jibeman.core.db.Txn
import ir.jibeman.ui.C
import ir.jibeman.ui.CatIcon
import ir.jibeman.ui.Confirm
import ir.jibeman.ui.Empty
import ir.jibeman.ui.AmountField
import ir.jibeman.ui.Field
import ir.jibeman.ui.GhostButton
import ir.jibeman.ui.Ic
import ir.jibeman.ui.Ico
import ir.jibeman.ui.LimeButton
import ir.jibeman.ui.Mono
import ir.jibeman.ui.Segmented
import ir.jibeman.ui.T
import kotlinx.coroutines.launch

private const val MAX_TOMAN_DIGITS = 12

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuickAddSheet(req: AddReq, onDone: (goToAccounts: Boolean) -> Unit) {
    val app = app()
    val dao = app.dao
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    var editing by remember { mutableStateOf<Txn?>(null) }
    var type by remember { mutableStateOf(req.type) }
    var amountText by remember { mutableStateOf("") }
    var accountId by remember { mutableLongStateOf(req.accountId) }
    var toId by remember { mutableLongStateOf(0) }
    var catId by remember { mutableStateOf<Long?>(null) }
    var title by remember { mutableStateOf("") }
    var at by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var pickDate by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var returnCommitment by remember { mutableStateOf(true) }
    val accounts by remember { dao.balances() }.collectAsStateWithLifecycle(null)
    val cats by remember(type) { dao.categories(if (type == TxType.INCOME) "INCOME" else "EXPENSE") }.collectAsStateWithLifecycle(emptyList())

    val selectedAcc = accounts?.find { it.account.id == accountId }?.account
    val targetAcc = accounts?.find { it.account.id == toId }?.account
    val isWithdrawalFromSavings = selectedAcc?.isSavings == true && (type == TxType.EXPENSE || (type == TxType.TRANSFER && targetAcc?.isSavings != true))

    LaunchedEffect(req.txnId) {
        if (req.txnId != 0L) dao.txn(req.txnId)?.let {
            editing = it; type = it.type; amountText = Money.tomanInput(it.amount); accountId = it.accountId
            toId = it.toAccountId ?: 0; catId = it.categoryId; title = it.title.orEmpty(); at = it.occurredAt
        }
    }
    LaunchedEffect(accounts) { if (accountId == 0L) accountId = accounts?.firstOrNull()?.account?.id ?: 0 }

    fun save() {
        val rial = Money.parseToman(amountText) ?: 0
        val err = when {
            rial <= 0 -> "مبلغ را وارد کن"
            accountId == 0L -> "حساب را انتخاب کن"
            type == TxType.TRANSFER && (toId == 0L || toId == accountId) -> "حساب مقصد را انتخاب کن"
            else -> null
        }
        if (err != null) return Toast.makeText(ctx, err, Toast.LENGTH_SHORT).show()
        val base = editing ?: Txn(type = type, amount = 0, accountId = 0, occurredAt = at)
        val t = base.copy(
            type = type, amount = rial, accountId = accountId,
            toAccountId = if (type == TxType.TRANSFER) toId else null,
            categoryId = if (type == TxType.TRANSFER) null else catId,
            title = title.trim().ifBlank { null }, occurredAt = at,
        )
        scope.launch {
            val txnId = if (editing != null) {
                dao.upsertTxn(t)
                editing!!.id
            } else {
                dao.insertTxn(t)
            }
            if (isWithdrawalFromSavings && returnCommitment && editing == null) {
                dao.insertSavingsCommitment(
                    SavingsCommitment(
                        accountId = accountId,
                        txnId = txnId,
                        amount = rial,
                        paidAmount = 0,
                        note = title.trim().ifBlank { if (type == TxType.TRANSFER) "انتقال از پس‌انداز" else "برداشت از پس‌انداز" },
                        createdAt = at,
                    )
                )
            }
            onDone(false)
        }
    }

    ModalBottomSheet(
        onDismissRequest = { onDone(false) }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = C.sheet, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { Box(Modifier.padding(top = 10.dp, bottom = 12.dp).size(40.dp, 4.dp).clip(RoundedCornerShape(2.dp)).background(C.ink.copy(alpha = 0.25f))) },
    ) {
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
            val list = accounts ?: return@CompositionLocalProvider
            if (list.isEmpty()) {
                Empty("برای ثبت تراکنش اول یک حساب بساز.", "ساخت حساب") { onDone(true) }
                Box(Modifier.navigationBarsPadding().height(24.dp))
                return@CompositionLocalProvider
            }
            val isAdjust = editing?.type == TxType.ADJUST
            Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).navigationBarsPadding()) {
                if (isAdjust) T("تعدیل موجودی", 15, 800, modifier = Modifier.fillMaxWidth(), align = TextAlign.Center)
                else Segmented(listOf(TxType.EXPENSE to "هزینه", TxType.INCOME to "درآمد", TxType.TRANSFER to "انتقال"), type) { type = it; catId = null }

                T("مبلغ (تومان)", 12, color = C.muted, modifier = Modifier.padding(top = 16.dp, bottom = 6.dp))
                AmountField(
                    amountText, { amountText = it }, "۰",
                    allowNegative = isAdjust, maxDigits = MAX_TOMAN_DIGITS,
                )

                if (!isAdjust) {
                    Row(Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        AccountPicker(list, accountId, if (type == TxType.TRANSFER) "از" else null, Modifier.weight(1f)) { accountId = it }
                        if (type == TxType.TRANSFER) AccountPicker(list.filter { it.account.id != accountId }, toId, "به", Modifier.weight(1f)) { toId = it }
                        else DateChip(at, Modifier.weight(1f)) { pickDate = true }
                    }
                    if (type == TxType.TRANSFER) DateChip(at, Modifier.padding(top = 8.dp).fillMaxWidth()) { pickDate = true }
                    else LazyRow(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), contentPadding = PaddingValues(horizontal = 0.dp)) {
                        items(cats, key = { it.id }) { c ->
                            val on = c.id == catId
                            Column(
                                Modifier.width(62.dp).clip(RoundedCornerShape(14.dp)).clickable { catId = if (on) null else c.id }.padding(vertical = 4.dp),
                                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Box(
                                    Modifier.size(50.dp).clip(RoundedCornerShape(16.dp))
                                        .border(2.dp, if (on) C.lime else Color.Transparent, RoundedCornerShape(16.dp)).padding(2.dp),
                                    contentAlignment = Alignment.Center,
                                ) { CatIcon(Ic.category(c.icon), C.cat[c.color.mod(C.cat.size)], 46.dp) }
                                T(c.name, 10.5f, if (on) 700 else 500, if (on) C.ink else C.t2, maxLines = 1, align = TextAlign.Center)
                            }
                        }
                    }
                    Field(title, { title = it }, if (type == TxType.TRANSFER) "توضیح (اختیاری)" else "عنوان یا توضیح، مثلاً اسنپ (اختیاری)", Modifier.padding(top = 10.dp), leading = Ic.pen)
                    if (isWithdrawalFromSavings) {
                        Row(
                            Modifier.padding(top = 10.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp))
                                .background(C.lime.copy(alpha = 0.12f)).border(1.dp, C.lime.copy(alpha = 0.3f), RoundedCornerShape(14.dp))
                                .clickable { returnCommitment = !returnCommitment }.padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Box(
                                Modifier.size(20.dp).clip(RoundedCornerShape(6.dp))
                                    .background(if (returnCommitment) C.lime else Color.Transparent)
                                    .border(1.5.dp, if (returnCommitment) C.lime else C.line, RoundedCornerShape(6.dp)),
                                contentAlignment = Alignment.Center,
                            ) {
                                if (returnCommitment) Ico(Ic.check, 14.dp, C.onLime)
                            }
                            Column(Modifier.weight(1f)) {
                                T("این مبلغ را به پس‌انداز برمی‌گردانم", 12.5f, 700, C.accent)
                                T("ثبت تعهد بازگشت (طلب از خود) جهت بازگرداندن در آینده", 10.5f, color = C.t2)
                            }
                        }
                    }
                }

                // keypad stays LTR: 1 2 3 left to right, like every phone dialer
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Column(Modifier.padding(top = 8.dp)) {
                        listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"), listOf("000", "0", "<")).forEach { row ->
                            Row {
                                row.forEach { k ->
                                    Box(
                                        Modifier.weight(1f).height(48.dp).clip(RoundedCornerShape(12.dp)).clickable {
                                            amountText = when {
                                                k == "<" -> amountText.dropLast(1)
                                                amountText.isEmpty() && (k == "0" || k == "000") -> amountText
                                                else -> Money.normalizeAmountInput(amountText + k, MAX_TOMAN_DIGITS, isAdjust) ?: amountText
                                            }
                                        },
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        if (k == "<") Ico(Ic.backspace, 24.dp) else T(Money.fa(k), if (k == "000") 18 else 22, 600)
                                    }
                                }
                            }
                        }
                    }
                }
                Row(Modifier.padding(top = 6.dp, bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (editing != null) GhostButton("حذف", color = C.bad, icon = Ic.trash) { confirmDelete = true }
                    if (!isAdjust) LimeButton(
                        when { editing != null -> "ذخیره"; type == TxType.INCOME -> "ثبت درآمد"; type == TxType.TRANSFER -> "ثبت انتقال"; else -> "ثبت هزینه" },
                        Modifier.weight(1f), Ic.check,
                    ) { save() }
                }
            }
        }
    }

    if (pickDate) DateDialog(at, { at = it }) { pickDate = false }
    if (confirmDelete) Confirm("حذف تراکنش", "این تراکنش حذف شود؟", "حذف", danger = true,
        onOk = { editing?.let { e -> scope.launch { dao.deleteTxn(e.id); onDone(false) } } }, onDismiss = { confirmDelete = false })
}

@Composable
fun AccountPicker(
    list: List<AccountBalance>, selected: Long, prefix: String?, modifier: Modifier,
    emptyOption: String? = null, onPick: (Long) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    val a = list.firstOrNull { it.account.id == selected }?.account
    Box(modifier) {
        Row(
            Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(15.dp)).background(C.surface)
                .border(1.dp, C.line, RoundedCornerShape(15.dp)).clickable { open = true }.padding(horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (prefix != null) T(prefix, 11, color = C.muted)
            if (a != null) Mono(a.bankCode, a.type, 26.dp)
            T(a?.name ?: emptyOption ?: "انتخاب حساب", 12.5f, 600, if (a == null) C.muted else C.ink, Modifier.weight(1f), maxLines = 1)
            Ico(Ic.chevDown, 15.dp, C.muted)
        }
        DropdownMenu(open, { open = false }, containerColor = C.sheet) {
            emptyOption?.let {
                DropdownMenuItem(text = { T(it, 13, 600) }, onClick = { onPick(0); open = false })
            }
            list.forEach { ab ->
                DropdownMenuItem(
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Mono(ab.account.bankCode, ab.account.type, 26.dp)
                            Column {
                                T(ab.account.name, 13, 600)
                                T(Money.toman(ab.balance) + " تومان", 11, color = C.muted)
                            }
                        }
                    },
                    onClick = { onPick(ab.account.id); open = false },
                )
            }
        }
    }
}

@Composable
private fun DateChip(at: Long, modifier: Modifier, onClick: () -> Unit) = Row(
    modifier.height(48.dp).clip(RoundedCornerShape(15.dp)).background(C.surface).border(1.dp, C.line, RoundedCornerShape(15.dp))
        .clickable(onClick = onClick).padding(horizontal = 10.dp),
    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
) {
    Ico(Ic.cal, 16.dp, C.sky)
    T(Jalali.shortDateTime(at), 12.5f, 600, modifier = Modifier.weight(1f), maxLines = 1)
    Ico(Ic.chevDown, 15.dp, C.muted)
}

// shortcut: day stepper instead of a full Jalali calendar grid; upgrade when back-dating weeks becomes common
@Composable
private fun DateDialog(at: Long, onChange: (Long) -> Unit, onDismiss: () -> Unit) {
    val today = Jalali.dayStart(System.currentTimeMillis())
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = C.sheet,
        title = { T("تاریخ تراکنش", 17, 800) },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(C.surface).clickable { onChange(Jalali.addDays(at, -1)) }, contentAlignment = Alignment.Center) { Ico(Ic.chevRight) }
                    T(Jalali.longDate(at), 15, 700, modifier = Modifier.weight(1f), align = TextAlign.Center)
                    Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(C.surface).clickable { if (Jalali.dayStart(at) < today) onChange(Jalali.addDays(at, 1)) }, contentAlignment = Alignment.Center) { Ico(Ic.chevLeft) }
                }
                Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    GhostButton("امروز") { onChange(System.currentTimeMillis()) }
                    GhostButton("دیروز") { onChange(Jalali.addDays(System.currentTimeMillis(), -1)) }
                }
            }
        },
        confirmButton = { TextButton(onDismiss) { T("تأیید", 14, 800, C.accent) } },
    )
}
