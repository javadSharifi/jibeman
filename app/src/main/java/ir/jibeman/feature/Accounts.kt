package ir.jibeman.feature

import android.content.Intent
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.jibeman.app
import ir.jibeman.core.BankKit
import ir.jibeman.core.Banks
import ir.jibeman.core.Jalali
import ir.jibeman.core.Money
import ir.jibeman.core.db.AccType
import ir.jibeman.core.db.Account
import ir.jibeman.core.db.Totals
import ir.jibeman.core.db.TxType
import ir.jibeman.core.db.Txn
import ir.jibeman.ui.ActionCircle
import ir.jibeman.ui.BankMini
import ir.jibeman.ui.CardColorPicker
import ir.jibeman.ui.RealisticBankCard
import ir.jibeman.ui.Bar
import ir.jibeman.ui.BottomSpace
import ir.jibeman.ui.C
import ir.jibeman.ui.CircleBtn
import ir.jibeman.ui.Confirm
import ir.jibeman.ui.Empty
import ir.jibeman.ui.Field
import ir.jibeman.ui.GhostButton
import ir.jibeman.ui.Ic
import ir.jibeman.ui.Ico
import ir.jibeman.ui.Label
import ir.jibeman.ui.LimeButton
import ir.jibeman.ui.LocalOnGlass
import ir.jibeman.ui.Mono
import ir.jibeman.ui.SectionHeader
import ir.jibeman.ui.Segmented
import ir.jibeman.ui.T
import ir.jibeman.ui.Tile
import ir.jibeman.ui.TopBar
import ir.jibeman.ui.TxnGroup
import ir.jibeman.ui.accTypeLabel
import ir.jibeman.ui.amount
import ir.jibeman.ui.glass
import ir.jibeman.ui.glowBg
import ir.jibeman.ui.heroBg
import ir.jibeman.ui.short
import kotlinx.coroutines.launch

@Composable
fun AccountsScreen(go: (Route) -> Unit) {
    val app = app()
    val hide = app.prefs.hideAmounts
    val accounts by remember { app.dao.balances() }.collectAsStateWithLifecycle(emptyList())
    LazyColumn(Modifier.fillMaxSize().glowBg(), contentPadding = BottomSpace, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Row(Modifier.statusBarsPadding().padding(start = 16.dp, end = 16.dp, top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    T("حساب‌ها", 22, 800)
                    T("جمع: ${amount(accounts.sumOf { it.balance }, hide)} تومان", 12, color = C.t2)
                }
                CircleBtn(Ic.plus, dark = true) { go(Route.EditAccount(0)) }
            }
        }
        if (accounts.isEmpty()) item { Empty("هنوز حسابی نساخته‌ای.", "افزودن حساب") { go(Route.EditAccount(0)) } }
        items(accounts, key = { it.account.id }) { ab ->
            BankMini(ab.account, ab.balance, ab.last4, hide, Modifier.padding(horizontal = 16.dp).fillMaxWidth().height(128.dp)) {
                go(Route.AccountDetail(ab.account.id))
            }
        }
    }
}

@Composable
fun AccountDetailScreen(id: Long, back: () -> Unit, go: (Route) -> Unit, add: (AddReq) -> Unit) {
    val app = app()
    val dao = app.dao
    val hide = app.prefs.hideAmounts
    val scope = rememberCoroutineScope()
    val accounts by remember { dao.balances() }.collectAsStateWithLifecycle(null)
    val ab = accounts?.firstOrNull { it.account.id == id }
    val now = remember { Jalali.of(System.currentTimeMillis()) }
    val month = remember { Jalali.monthRange(now.y, now.m) }
    val totals by remember { dao.totals(month.first, month.second, id) }.collectAsStateWithLifecycle(Totals(0, 0, 0))
    val recent by remember { dao.recent(id, 5) }.collectAsStateWithLifecycle(emptyList())
    var adjust by remember { mutableStateOf(false) }
    var editCardSheet by remember { mutableStateOf(false) }

    val ctx = LocalContext.current
    if (accounts != null && ab == null) { LaunchedEffect(Unit) { back() }; return } // deleted
    if (ab == null) return
    val a = ab.account

    LazyColumn(Modifier.fillMaxSize().background(C.bg), contentPadding = PaddingValues(bottom = 40.dp)) {
        item {
            Column(Modifier.heroBg().padding(bottom = 4.dp)) {
                TopBar(a.name, back, dark = false, action = Ic.pen) { go(Route.EditAccount(id)) }
                Column(Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                    RealisticBankCard(
                        a,
                        interactive = true,
                        onEdit = if (a.type == AccType.BANK) {{ editCardSheet = true }} else null,
                    )
                }
                Row(
                    Modifier.padding(horizontal = 20.dp, vertical = 6.dp).fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column {
                        T("موجودی حساب", 11f, color = C.t2)
                        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            T(amount(ab.balance, hide), 20, 800, maxLines = 1)
                            T("تومان", 11.5f, color = C.muted, modifier = Modifier.padding(bottom = 3.dp))
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (a.type == AccType.BANK) {
                            Row(
                                Modifier.clip(RoundedCornerShape(12.dp)).background(C.surface).border(1.dp, C.line, RoundedCornerShape(12.dp))
                                    .clickable { editCardSheet = true }.padding(horizontal = 12.dp, vertical = 7.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Ico(Ic.pen, 15.dp, C.accent)
                                T("ویرایش کارت", 11.5f, 600, C.accent)
                            }
                        }
                        if (!a.cardNumber.isNullOrBlank() || !a.iban.isNullOrBlank()) {
                            Row(
                                Modifier.clip(RoundedCornerShape(12.dp)).background(C.surface).border(1.dp, C.line, RoundedCornerShape(12.dp))
                                    .clickable {
                                        val shareText = buildString {
                                            appendLine("اطلاعات حساب بانکی:")
                                            Banks.of(a.bankCode)?.let { appendLine("بانک: ${it.name}") }
                                            appendLine("نام حساب: ${a.name}")
                                            if (!a.cardNumber.isNullOrBlank()) appendLine("شماره کارت: ${BankKit.formatCardNumber(a.cardNumber)}")
                                            if (!a.iban.isNullOrBlank()) appendLine("شماره شبا: ${BankKit.formatIban(a.iban)}")
                                            if (!a.accountNo.isNullOrBlank()) appendLine("شماره حساب: ${a.accountNo}")
                                        }.trim()
                                        val sendIntent = Intent().apply {
                                            action = Intent.ACTION_SEND
                                            putExtra(Intent.EXTRA_TEXT, shareText)
                                            type = "text/plain"
                                        }
                                        ctx.startActivity(Intent.createChooser(sendIntent, "ارسال اطلاعات کارت"))
                                    }.padding(horizontal = 12.dp, vertical = 7.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Ico(Ic.share, 15.dp, C.accent)
                                T("اشتراک کارت", 11.5f, 600, C.accent)
                            }
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 18.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                ActionCircle("انتقال", Ic.swap) { add(AddReq(TxType.TRANSFER, accountId = id)) }
                ActionCircle("گردش حساب", Ic.list) { go(Route.Txns(id)) }
                ActionCircle("تعدیل موجودی", Ic.scale) { adjust = true }
                ActionCircle(if (a.type == AccType.BANK) "ویرایش کارت" else "ویرایش", Ic.pen) {
                    if (a.type == AccType.BANK) editCardSheet = true else go(Route.EditAccount(id))
                }
            }
            Row(Modifier.padding(start = 16.dp, end = 16.dp, top = 18.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Tile(Modifier.weight(1f)) {
                    T("خروجی ${Jalali.MONTHS[now.m - 1]}", 12, color = C.t2)
                    T(short(totals.expense, hide), 19, 800, modifier = Modifier.padding(top = 8.dp))
                    Bar(if (totals.income > 0) totals.expense.toFloat() / totals.income else 0f, Modifier.padding(top = 8.dp))
                    T("از ورودی ${short(totals.income, hide)}", 10.5f, color = C.t2, modifier = Modifier.padding(top = 4.dp))
                }
                Tile(Modifier.weight(1f)) {
                    T("تراکنش‌های این ماه", 12, color = C.t2)
                    T(Money.fa(totals.count.toString()), 19, 800, modifier = Modifier.padding(top = 8.dp))
                    T("ورودی ${short(totals.income, hide)}", 10.5f, color = C.ok, modifier = Modifier.padding(top = 9.dp))
                }
            }
            SectionHeader("آخرین تراکنش‌ها", if (recent.isEmpty()) null else "همه") { go(Route.Txns(id)) }
            if (recent.isEmpty()) Empty("تراکنشی برای این حساب نیست.") else TxnGroup(recent, hide) { add(AddReq(txnId = it.txn.id)) }
        }
    }

    if (editCardSheet) {
        EditCardBottomSheet(
            account = a,
            onDismiss = { editCardSheet = false },
            onOpenFullSettings = {
                editCardSheet = false
                go(Route.EditAccount(id))
            },
        )
    }

    if (adjust) AdjustDialog(ab.balance, onDismiss = { adjust = false }) { actual ->
        val diff = actual - ab.balance
        if (diff != 0L) scope.launch {
            dao.upsertTxn(Txn(type = TxType.ADJUST, amount = diff, accountId = id, title = "تعدیل موجودی", occurredAt = System.currentTimeMillis()))
        }
    }
}

@Composable
private fun AdjustDialog(current: Long, onDismiss: () -> Unit, onOk: (Long) -> Unit) {
    var text by remember { mutableStateOf("") }
    val parsed = Money.parseToman(text)
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = C.sheet,
        title = { T("تعدیل موجودی", 17, 800) },
        text = {
            Column {
                T("موجودی واقعی حساب را از اپ یا پیامک بانک وارد کن. اختلاف به‌صورت یک تراکنش «تعدیل» ثبت می‌شود.", 12.5f, color = C.t2)
                T("موجودی فعلی در برنامه: ${Money.toman(current)} تومان", 12, color = C.muted, modifier = Modifier.padding(top = 10.dp, bottom = 10.dp))
                Field(text, { text = it }, "موجودی واقعی (تومان)", number = true)
                if (parsed != null) T(Money.words(parsed / 10) + " تومان", 11, color = C.muted, modifier = Modifier.padding(top = 6.dp))
            }
        },
        confirmButton = { TextButton({ if (parsed != null) { onOk(parsed); onDismiss() } }) { T("ثبت", 14, 800, if (parsed != null) C.accent else C.muted) } },
        dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditCardBottomSheet(
    account: Account,
    onDismiss: () -> Unit,
    onOpenFullSettings: () -> Unit,
) {
    val app = app()
    val dao = app.dao
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current

    var name by remember(account.id) { mutableStateOf(account.name) }
    var bank by remember(account.id) { mutableStateOf(account.bankCode) }
    var cardNumber by remember(account.id) { mutableStateOf(account.cardNumber?.let { BankKit.formatCardNumber(it) }.orEmpty()) }
    var cardExpiry by remember(account.id) { mutableStateOf(account.cardExpiry?.let { BankKit.formatExpiry(it) }.orEmpty()) }
    var cardCvv2 by remember(account.id) { mutableStateOf(account.cardCvv2.orEmpty()) }
    var iban by remember(account.id) { mutableStateOf(account.iban?.let { BankKit.formatIban(it) }.orEmpty()) }
    var cardColor by remember(account.id) { mutableStateOf(account.cardColor) }

    fun toast(s: String) = Toast.makeText(ctx, s, Toast.LENGTH_SHORT).show()

    fun save() {
        val cleanPan = BankKit.cleanDigits(cardNumber)
        val cleanExpiry = BankKit.cleanDigits(cardExpiry)
        val cleanCvv = BankKit.cleanDigits(cardCvv2)
        val cleanIban = BankKit.cleanDigits(iban)

        when {
            cleanPan.isNotEmpty() && cleanPan.length != 16 -> return toast("شماره کارت باید ۱۶ رقم باشد")
            cardExpiry.isNotBlank() && !BankKit.isExpiryValid(cardExpiry) -> return toast("فرمت تاریخ انقضا نامعتبر است (ماه بین ۰۱ تا ۱۲)")
        }

        val detectedBank = if (cleanPan.isNotEmpty()) BankKit.detectByCard(cleanPan)?.code ?: bank else bank
        val finalName = name.trim().ifBlank {
            Banks.of(detectedBank)?.let { if (it.code == "blu") "بلوبانک" else "بانک ${it.name}" } ?: account.name
        }

        val updated = account.copy(
            name = finalName,
            bankCode = detectedBank,
            cardNumber = cleanPan.ifBlank { null },
            cardExpiry = cleanExpiry.ifBlank { null },
            cardCvv2 = cleanCvv.ifBlank { null },
            iban = cleanIban.ifBlank { null },
            cardColor = cardColor,
        )

        scope.launch {
            val existingCards = dao.cards(account.id).map { it.last4 }
            dao.saveAccount(updated, existingCards)
            toast("مشخصات کارت با موفقیت ذخیره شد")
            onDismiss()
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = C.sheet,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = {
            Box(
                Modifier
                    .padding(top = 10.dp, bottom = 12.dp)
                    .size(40.dp, 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(C.ink.copy(alpha = 0.25f))
            )
        },
    ) {
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .imePadding()
                    .padding(horizontal = 16.dp)
                    .navigationBarsPadding()
            ) {
                // Header
                Row(
                    Modifier.fillMaxWidth().padding(bottom = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column {
                        T("ویرایش سریع مشخصات کارت", 16.5f, 800)
                        T("تغییر شماره کارت، انقضا، CVV2، شبا و رنگ کارت", 11.5f, color = C.muted)
                    }
                    CircleBtn(Ic.x) { onDismiss() }
                }

                // Live Card Preview
                RealisticBankCard(
                    Account(
                        name = name.ifBlank { Banks.of(bank)?.name ?: "نام کارت" },
                        type = account.type,
                        bankCode = bank,
                        accountNo = account.accountNo,
                        cardNumber = cardNumber.ifBlank { null },
                        cardExpiry = cardExpiry.ifBlank { null },
                        cardCvv2 = cardCvv2.ifBlank { null },
                        iban = iban.ifBlank { null },
                        cardColor = cardColor,
                        style = account.style,
                    ),
                    interactive = false,
                    modifier = Modifier.padding(vertical = 4.dp),
                )

                Spacer(Modifier.height(8.dp))

                // Card Number
                Label("شماره کارت (۱۶ رقم)")
                Field(
                    cardNumber,
                    { input ->
                        val digits = BankKit.cleanDigits(input).take(16)
                        cardNumber = BankKit.formatCardNumber(digits)
                        val detected = BankKit.detectByCard(digits)
                        if (detected != null) {
                            val prev = bank
                            bank = detected.code
                            if (prev != detected.code) cardColor = null
                            if (name.isBlank() || name.startsWith("بانک ") || name == "بلوبانک" || Banks.all.any { b -> b.name == name || "بانک ${b.name}" == name }) {
                                name = if (detected.code == "blu") "بلوبانک" else "بانک ${detected.name}"
                            }
                        }
                    },
                    "۶۰۳۷ •••• •••• ••••",
                    number = true,
                    ltr = true,
                )
                val panDigits = BankKit.cleanDigits(cardNumber)
                if (panDigits.length == 16) {
                    val isValid = BankKit.validateCard(panDigits)
                    Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Ico(if (isValid) Ic.check else Ic.alert, 14.dp, if (isValid) C.ok else C.bad)
                        T(if (isValid) "شماره کارت معتبر است (الگوریتم لوهن)" else "چکسام کارت نامعتبر است", 11, color = if (isValid) C.ok else C.bad)
                    }
                }

                // Expiry and CVV2
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f)) {
                        Label("تاریخ انقضا (ماه / سال)")
                        Field(
                            cardExpiry,
                            { input ->
                                val digits = BankKit.cleanDigits(input).take(4)
                                cardExpiry = BankKit.formatExpiry(digits)
                            },
                            "مثلاً ۰۸ / ۰۵",
                            number = true,
                            ltr = true,
                        )
                        if (cardExpiry.isNotBlank() && !BankKit.isExpiryValid(cardExpiry)) {
                            T("ماه باید بین ۰۱ تا ۱۲ باشد", 10.5f, color = C.bad, modifier = Modifier.padding(top = 2.dp))
                        }
                    }
                    Column(Modifier.weight(1f)) {
                        Label("کد CVV2")
                        Field(
                            cardCvv2,
                            { cardCvv2 = BankKit.cleanDigits(it).take(4) },
                            "۳ یا ۴ رقم",
                            number = true,
                            ltr = true,
                        )
                    }
                }

                // IBAN
                Label("شماره شبا (اختیاری)")
                Field(
                    iban,
                    { input ->
                        val digits = BankKit.cleanDigits(input).take(24)
                        iban = BankKit.formatIban(digits)
                        if (bank == null) {
                            BankKit.detectByIban(digits)?.let { detected ->
                                bank = detected.code
                                if (name.isBlank()) name = "بانک ${detected.name}"
                            }
                        }
                    },
                    "IR •• •••• •••• •••• •••• •••• ••",
                    ltr = true,
                )

                // Card Color Customization
                Label("رنگ و طرح کارت")
                CardColorPicker(
                    bank = Banks.of(bank),
                    selectedColor = cardColor,
                    onSelectColor = { cardColor = it },
                )

                // Card Name
                Label("نام روی کارت / حساب")
                Field(name, { name = it }, "مثلاً کارت شخصی، حساب حقوق")

                Spacer(Modifier.height(18.dp))

                // Save button
                LimeButton("ذخیره تغییرات کارت", Modifier.fillMaxWidth(), Ic.check) { save() }

                Spacer(Modifier.height(8.dp))

                // Link to full settings
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .clickable { onOpenFullSettings() }
                        .padding(vertical = 10.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Ico(Ic.list, 15.dp, C.muted)
                    Spacer(Modifier.width(6.dp))
                    T("سایر تنظیمات حساب (موجودی اولیه، پیامک‌ها و...)", 12, 600, C.muted)
                }

                Spacer(Modifier.height(16.dp))
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EditAccountScreen(id: Long, back: () -> Unit) {
    val app = app()
    val dao = app.dao
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    var loaded by remember { mutableStateOf(id == 0L) }
    var original by remember { mutableStateOf<Account?>(null) }
    var name by remember { mutableStateOf("") }
    var type by remember { mutableStateOf(AccType.BANK) }
    var bank by remember { mutableStateOf<String?>(null) }
    var accountNo by remember { mutableStateOf("") }
    var initial by remember { mutableStateOf("") }
    var style by remember { mutableIntStateOf(0) }
    val cards = remember { mutableStateListOf<String>() }
    var newCard by remember { mutableStateOf("") }
    var cardNumber by remember { mutableStateOf("") }
    var cardExpiry by remember { mutableStateOf("") }
    var cardCvv2 by remember { mutableStateOf("") }
    var iban by remember { mutableStateOf("") }
    var cardColor by remember { mutableStateOf<Long?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }

    LaunchedEffect(id) {
        if (id != 0L) dao.account(id)?.let { a ->
            original = a; name = a.name; type = a.type; bank = a.bankCode; accountNo = a.accountNo.orEmpty()
            initial = if (a.initialBalance == 0L) "" else (a.initialBalance / 10).toString(); style = a.style
            cardNumber = a.cardNumber?.let { BankKit.formatCardNumber(it) }.orEmpty()
            cardExpiry = a.cardExpiry?.let { BankKit.formatExpiry(it) }.orEmpty()
            cardCvv2 = a.cardCvv2.orEmpty()
            iban = a.iban?.let { BankKit.formatIban(it) }.orEmpty()
            cardColor = a.cardColor
            cards.clear(); cards.addAll(dao.cards(id).map { it.last4 })
        }
        loaded = true
    }
    if (!loaded) return

    fun toast(s: String) = Toast.makeText(ctx, s, Toast.LENGTH_SHORT).show()
    fun save() {
        val finalName = name.trim().ifBlank { if (type == AccType.BANK) Banks.of(bank)?.let { if (it.code == "blu") "بلوبانک" else "بانک ${it.name}" }.orEmpty() else if (type == AccType.CASH) "نقد" else "" }
        val init = if (initial.isBlank()) 0L else Money.parseToman(initial)
        val pending = Money.ascii(newCard).trim()
        val cleanPan = BankKit.cleanDigits(cardNumber)
        val cleanExpiry = BankKit.cleanDigits(cardExpiry)
        val cleanCvv = BankKit.cleanDigits(cardCvv2)
        val cleanIban = BankKit.cleanDigits(iban)

        when {
            finalName.isBlank() -> return toast("نام حساب را وارد کن")
            type == AccType.BANK && bank == null -> return toast("بانک را انتخاب کن یا شماره کارت را وارد کن")
            type == AccType.BANK && cleanPan.isNotEmpty() && cleanPan.length != 16 -> return toast("شماره کارت باید ۱۶ رقم باشد")
            init == null -> return toast("موجودی اولیه فقط عدد باشد")
            pending.isNotEmpty() && (pending.length != 4 || !pending.all(Char::isDigit)) -> return toast("شماره کارت: دقیقاً ۴ رقم آخر")
        }
        if (pending.length == 4 && pending !in cards) cards += pending
        val a = (original ?: Account(name = "", type = type)).copy(
            name = finalName, type = type, bankCode = if (type == AccType.BANK) bank else null,
            accountNo = Money.ascii(accountNo).trim().ifBlank { null }.takeIf { type == AccType.BANK },
            initialBalance = init ?: 0, style = style,
            cardNumber = cleanPan.ifBlank { null }.takeIf { type == AccType.BANK },
            cardExpiry = cleanExpiry.ifBlank { null }.takeIf { type == AccType.BANK },
            cardCvv2 = cleanCvv.ifBlank { null }.takeIf { type == AccType.BANK },
            iban = cleanIban.ifBlank { null }.takeIf { type == AccType.BANK },
            cardColor = cardColor.takeIf { type == AccType.BANK },
        )
        scope.launch {
            dao.saveAccount(a, if (type == AccType.BANK) cards.toList() else emptyList())
            back()
        }
    }

    Column(Modifier.fillMaxSize().glowBg()) {
        TopBar(if (id == 0L) "حساب جدید" else (if (type == AccType.BANK) "ویرایش کارت و حساب" else "ویرایش حساب"), back)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).imePadding().padding(horizontal = 16.dp)) {
            // Live Realistic Card Preview
            RealisticBankCard(
                Account(
                    name = name.ifBlank { Banks.of(bank)?.name ?: "نام حساب" },
                    type = type,
                    bankCode = bank,
                    accountNo = accountNo.ifBlank { null },
                    cardNumber = cardNumber.ifBlank { null },
                    cardExpiry = cardExpiry.ifBlank { null },
                    cardCvv2 = cardCvv2.ifBlank { null },
                    iban = iban.ifBlank { null },
                    cardColor = cardColor,
                    style = style,
                ),
                interactive = false,
                modifier = Modifier.padding(top = 8.dp, bottom = 8.dp),
            )
            Label("نوع حساب")
            Segmented(listOf(AccType.BANK to "بانکی", AccType.CASH to "نقد", AccType.WALLET to "کیف پول"), type) { type = it }
            if (type == AccType.BANK) {
                SectionHeader("مشخصات کارت بانکی")
                Label("شماره کارت (تشخیص خودکار بانک)")
                Field(
                    cardNumber,
                    { input ->
                        val digits = BankKit.cleanDigits(input).take(16)
                        cardNumber = BankKit.formatCardNumber(digits)
                        val detected = BankKit.detectByCard(digits)
                        if (detected != null) {
                            val prevBank = bank
                            bank = detected.code
                            if (prevBank != detected.code) {
                                // Reset to new bank color if not custom
                                cardColor = null
                            }
                            if (name.isBlank() || name.startsWith("بانک ") || name == "بلوبانک" || Banks.all.any { b -> b.name == name || "بانک ${b.name}" == name }) {
                                name = if (detected.code == "blu") "بلوبانک" else "بانک ${detected.name}"
                            }
                        }
                    },
                    "۶۰۳۷ •••• •••• ••••",
                    number = true,
                    ltr = true,
                )
                val panDigits = BankKit.cleanDigits(cardNumber)
                if (panDigits.length == 16) {
                    val isValid = BankKit.validateCard(panDigits)
                    Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Ico(if (isValid) Ic.check else Ic.alert, 14.dp, if (isValid) C.ok else C.bad)
                        T(if (isValid) "شماره کارت معتبر است (الگوریتم لوهن)" else "چکسام کارت نامعتبر است (الگوریتم لوهن)", 11, color = if (isValid) C.ok else C.bad)
                    }
                } else if (panDigits.length in 6..15) {
                    Banks.of(bank)?.let {
                        T("بانک شناسایی‌شده: ${it.name}", 11, color = C.accent, modifier = Modifier.padding(top = 2.dp))
                    }
                }

                // Expiry Date and CVV2
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f)) {
                        Label("تاریخ انقضا (اختیاری)")
                        Field(
                            cardExpiry,
                            { input ->
                                val digits = BankKit.cleanDigits(input).take(4)
                                cardExpiry = BankKit.formatExpiry(digits)
                            },
                            "ماه / سال (مثلاً ۰۸ / ۰۵)",
                            number = true,
                            ltr = true,
                        )
                        if (cardExpiry.isNotBlank() && !BankKit.isExpiryValid(cardExpiry)) {
                            T("ماه باید بین ۰۱ تا ۱۲ باشد", 10.5f, color = C.bad, modifier = Modifier.padding(top = 2.dp))
                        }
                    }
                    Column(Modifier.weight(1f)) {
                        Label("کد CVV2 (اختیاری)")
                        Field(
                            cardCvv2,
                            { cardCvv2 = BankKit.cleanDigits(it).take(4) },
                            "۳ یا ۴ رقم",
                            number = true,
                            ltr = true,
                        )
                    }
                }

                // IBAN / Sheba
                Label("شماره شبا (اختیاری)")
                Field(
                    iban,
                    { input ->
                        val digits = BankKit.cleanDigits(input).take(24)
                        iban = BankKit.formatIban(digits)
                        if (bank == null) {
                            BankKit.detectByIban(digits)?.let { detected ->
                                bank = detected.code
                                if (name.isBlank()) name = "بانک ${detected.name}"
                            }
                        }
                    },
                    "IR •• •••• •••• •••• •••• •••• ••",
                    ltr = true,
                )
                val cleanIban = BankKit.cleanDigits(iban)
                if (cleanIban.length == 24) {
                    val validIban = BankKit.validateIban(cleanIban)
                    Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Ico(if (validIban) Ic.check else Ic.alert, 14.dp, if (validIban) C.ok else C.bad)
                        T(if (validIban) "شماره شبا معتبر است" else "چکسام شماره شبا نامعتبر است", 11, color = if (validIban) C.ok else C.bad)
                    }
                }

                // Card Color Customization
                Label("رنگ و طرح کارت (شخصی‌سازی)")
                CardColorPicker(
                    bank = Banks.of(bank),
                    selectedColor = cardColor,
                    onSelectColor = { cardColor = it },
                )

                Label("انتخاب یا تغییر دستی بانک")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Banks.all.forEach { b ->
                        val on = b.code == bank
                        Row(
                            Modifier.height(36.dp).clip(CircleShape).background(if (on) C.lime else C.surface)
                                .border(1.dp, if (on) Color.Transparent else C.line, CircleShape).clickable { bank = b.code }.padding(start = 4.dp, end = 12.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Box(Modifier.size(28.dp).clip(CircleShape).background(Color.White).border(1.dp, C.ink.copy(alpha = 0.08f), CircleShape), contentAlignment = Alignment.Center) {
                                if (b.logoRes != null) {
                                    androidx.compose.material3.Icon(
                                        painter = androidx.compose.ui.res.painterResource(b.logoRes),
                                        contentDescription = b.name,
                                        tint = Color.Unspecified,
                                        modifier = Modifier.size(20.dp).clip(CircleShape),
                                    )
                                } else {
                                    T(b.letter, 12, 800, Color(b.color))
                                }
                            }
                            T(b.name, 12, 600, if (on) C.onLime else C.t2)
                        }
                    }
                }
            }
            SectionHeader(if (type == AccType.BANK) "اطلاعات حساب و پیامک‌ها" else "اطلاعات حساب")
            Label("نام حساب")
            Field(name, { name = it }, if (type == AccType.BANK) "مثلاً حساب حقوق" else "مثلاً کیف پول")
            Label("موجودی فعلی (تومان)")
            Field(initial, { initial = it }, "۰", number = true)
            Money.parseToman(initial)?.let { if (it > 0) T(Money.words(it / 10) + " تومان", 11, color = C.muted, modifier = Modifier.padding(top = 6.dp)) }
            if (id != 0L) T("این عدد موجودیِ پیش از اولین تراکنش ثبت‌شده است. برای اصلاح موجودی فعلی از «تعدیل موجودی» استفاده کن.", 11, color = C.muted, modifier = Modifier.padding(top = 4.dp))
            if (type == AccType.BANK) {
                Label("شماره حساب (اختیاری، برای تشخیص پیامک واریز)")
                Field(accountNo, { accountNo = it }, "مثلاً ۲۲۹۸۷۲۸۳۶", number = true, ltr = true)
                Label("کارت‌های پیامک (۴ رقم آخر، برای تشخیص پیامک)")
                cards.forEach { c ->
                    Row(
                        Modifier.padding(bottom = 6.dp).fillMaxWidth().height(46.dp).clip(RoundedCornerShape(14.dp)).background(C.surface).padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Ico(Ic.card, 18.dp, C.sky)
                        T("⁦•••• ${Money.fa(c)}⁩", 14, 600, modifier = Modifier.padding(horizontal = 10.dp).weight(1f))
                        Ico(Ic.x, 18.dp, C.muted, Modifier.clickable { cards.remove(c) })
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field(newCard, { if (Money.ascii(it).length <= 4) newCard = it }, "۴ رقم آخر کارت", Modifier.weight(1f), number = true, ltr = true)
                    CircleBtn(Ic.plus, dark = true) {
                        val d = Money.ascii(newCard).trim()
                        if (d.length == 4 && d.all(Char::isDigit)) { if (d !in cards) cards += d; newCard = "" } else toast("دقیقاً ۴ رقم")
                    }
                }
            }
            Label("ظاهر کارت")
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                repeat(3) { s ->
                    Box(
                        Modifier.size(64.dp, 42.dp).clip(RoundedCornerShape(12.dp)).glass(s)
                            .border(if (s == style) 2.dp else 1.dp, if (s == style) C.lime else C.ink.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
                            .clickable { style = s },
                    )
                }
            }
            Spacer(Modifier.height(24.dp))
        }
        Row(Modifier.navigationBarsPadding().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (original != null) GhostButton("حذف", color = C.bad, icon = Ic.trash) { confirmDelete = true }
            LimeButton("ذخیره", Modifier.weight(1f), Ic.check) { save() }
        }
    }
    if (confirmDelete) Confirm(
        "حذف حساب", "«${original?.name}» و همه تراکنش‌هایش برای همیشه حذف می‌شوند. این کار برگشت ندارد.", "حذف", danger = true,
        onOk = { original?.let { a -> scope.launch { dao.deleteAccount(a); back() } } }, onDismiss = { confirmDelete = false },
    )
}
