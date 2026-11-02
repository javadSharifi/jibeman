package ir.jibeman.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ir.jibeman.core.Banks
import ir.jibeman.core.Jalali
import ir.jibeman.core.Money
import ir.jibeman.core.db.AccType
import ir.jibeman.core.db.Account
import ir.jibeman.core.db.TxType
import ir.jibeman.core.db.TxnRow

// ---------- text & icons ----------

@Composable
fun T(
    text: String, size: Number = 14, weight: Int = 500, color: Color = if (LocalOnGlass.current) Color.White else C.ink,
    modifier: Modifier = Modifier, maxLines: Int = Int.MAX_VALUE, align: TextAlign? = null,
) = Text(
    text, modifier, color = color, fontSize = size.toFloat().sp, fontWeight = FontWeight(weight), fontFamily = Vazir,
    maxLines = maxLines, overflow = TextOverflow.Ellipsis, textAlign = align,
)

@Composable
fun Ico(icon: ImageVector, size: Dp = 20.dp, tint: Color = if (LocalOnGlass.current) Color.White else C.ink, modifier: Modifier = Modifier) =
    Icon(icon, null, modifier.size(size), tint = tint)

fun amount(rial: Long, hide: Boolean, plus: Boolean = false) = if (hide) Money.HIDDEN else Money.toman(rial, plus)
fun short(rial: Long, hide: Boolean) = if (hide) Money.HIDDEN else Money.short(rial)

// ---------- backgrounds (static gradients only: no live blur, it costs GPU and battery) ----------

fun Modifier.heroBg() = drawBehind {
    drawRect(C.bg)
    drawRect(
        Brush.radialGradient(
            0f to C.heroA, 0.3f to C.heroB, 0.6f to C.heroC, 0.92f to Color.Transparent,
            center = Offset(size.width / 2, -size.height * 0.08f), radius = maxOf(size.width, size.height) * 1.05f,
        )
    )
}

fun Modifier.glowBg() = drawBehind {
    drawRect(C.bg)
    drawRect(
        Brush.radialGradient(
            listOf(C.primary.copy(alpha = 0.2f), Color.Transparent),
            center = Offset(size.width / 2, 0f), radius = size.width * 0.9f,
        )
    )
}

private val cardBases = listOf(
    listOf(Color(0xFFA9D6F2), Color(0xFF4A91E4), Color(0xFF2453B8)),
    listOf(Color(0xFFB6CDFF), Color(0xFF5A8CF2), Color(0xFF2A55C6)),
    listOf(Color(0xFFCACCFF), Color(0xFF727AEC), Color(0xFF3A3FAE)),
    listOf(Color(0xFF7FA8FA), Color(0xFF3C70DE), Color(0xFF1D3F9C)),
)

/** "Glass" bank card: linear base + soft highlight + two light rays (sweep gradient). Styles 0..2 cards, 3 highlight. */
fun Modifier.glass(style: Int) = drawWithCache {
    val w = size.width
    val h = size.height
    val base = cardBases[style.mod(cardBases.size)]
    // white text sits on these cards in both themes, so light mode keeps the same base, slightly deepened
    val lin = Brush.linearGradient(
        if (C.isDark) base else base.map { lerp(it, Color.Black, 0.14f) },
        start = Offset(w * 0.1f, 0f), end = Offset(w * 0.9f, h),
    )
    val hl = Brush.radialGradient(
        listOf(Color.White.copy(alpha = if (C.isDark) 0.55f else 0.32f), Color.Transparent),
        center = Offset(if (style == 1) w * 0.85f else w * 0.15f, 0f), radius = maxOf(w, h) * 0.6f,
    )
    val t = Color.Transparent
    val ray = Brush.sweepGradient(
        0f to t, 0.58f to t, 0.6f to Color.White.copy(alpha = 0.26f), 0.625f to t,
        0.655f to t, 0.675f to Color.White.copy(alpha = 0.18f), 0.70f to t, 1f to t,
        center = Offset(if (style == 1) w * 0.2f else w * 0.8f, h * 1.15f),
    )
    onDrawBehind { drawRect(lin); drawRect(ray); drawRect(hl) }
}

// ---------- small pieces ----------

@Composable
fun Mono(bankCode: String?, type: String, size: Dp = 30.dp) {
    val bank = Banks.of(bankCode)
    Box(
        Modifier.size(size).clip(RoundedCornerShape(size / 3)).background(Color.White.copy(alpha = 0.95f))
            .border(1.dp, C.ink.copy(alpha = 0.08f), RoundedCornerShape(size / 3)),
        contentAlignment = Alignment.Center,
    ) {
        if (bank != null && type == AccType.BANK) {
            if (bank.logoRes != null) {
                Icon(
                    painter = painterResource(bank.logoRes),
                    contentDescription = bank.name,
                    tint = Color.Unspecified,
                    modifier = Modifier.size(size * 0.74f).clip(RoundedCornerShape(size * 0.1f)),
                )
            } else {
                T(bank.letter, size.value * 0.46f, 800, Color(bank.color))
            }
        } else {
            Ico(Ic.wallet, size * 0.55f, Color(0xFF3A3FAE))
        }
    }
}

@Composable
fun CatIcon(icon: ImageVector, color: Color, size: Dp = 40.dp) = Box(
    Modifier.size(size).clip(RoundedCornerShape(size / 3)).background(color.copy(alpha = 0.13f)),
    contentAlignment = Alignment.Center,
) { Ico(icon, size * 0.5f, color) }

@Composable
fun CircleBtn(icon: ImageVector, dark: Boolean = false, onClick: () -> Unit) = Box(
    Modifier.size(42.dp).clip(RoundedCornerShape(14.dp))
        .background(if (dark) C.surface else C.veil)
        .border(1.dp, if (dark) C.line else C.veilLine, RoundedCornerShape(14.dp))
        .clickable(onClick = onClick),
    contentAlignment = Alignment.Center,
) { Ico(icon) }

@Composable
fun WhiteDot(icon: ImageVector, size: Dp = 30.dp) = Box(
    Modifier.size(size).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center,
) { Ico(icon, size * 0.5f, C.onLime) }

@Composable
fun ActionPill(label: String, icon: ImageVector, modifier: Modifier = Modifier, onClick: () -> Unit) = Row(
    modifier.height(48.dp).clip(RoundedCornerShape(24.dp)).background(C.primaryStrong).clickable(onClick = onClick).padding(horizontal = 7.dp),
    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
) {
    Box(Modifier.size(34.dp).clip(CircleShape).background(C.lime), contentAlignment = Alignment.Center) { Ico(icon, 16.dp, C.onLime) }
    T(label, 14, 700, Color.White, maxLines = 1)
}

@Composable
fun ActionCircle(label: String, icon: ImageVector, onClick: () -> Unit) = Column(
    Modifier.width(72.dp).clickable(onClick = onClick), horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(7.dp),
) {
    Box(Modifier.size(52.dp).clip(CircleShape).background(C.primary), contentAlignment = Alignment.Center) { Ico(icon, tint = Color.White) }
    T(label, 11, color = C.t2, align = TextAlign.Center, maxLines = 1)
}

@Composable
fun SectionHeader(title: String, action: String? = null, onAction: () -> Unit = {}) = Row(
    Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 18.dp, bottom = 10.dp),
    verticalAlignment = Alignment.CenterVertically,
) {
    T(title, 14, 700, modifier = Modifier.weight(1f))
    if (action != null) Row(Modifier.clickable(onClick = onAction), verticalAlignment = Alignment.CenterVertically) {
        T(action, 12, color = C.sky); Ico(Ic.chevLeft, 15.dp, C.sky)
    }
}

@Composable
fun Group(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) = Column(
    modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(C.surface)
        .border(1.dp, C.line, RoundedCornerShape(20.dp)).padding(horizontal = 12.dp, vertical = 2.dp),
    content = content,
)

@Composable
fun Divider() = Box(Modifier.fillMaxWidth().height(1.dp).background(C.line))

@Composable
fun Tile(modifier: Modifier = Modifier, blue: Boolean = false, content: @Composable ColumnScope.() -> Unit) = Column(
    modifier.clip(RoundedCornerShape(20.dp))
        .then(if (blue) Modifier.background(Brush.linearGradient(listOf(Color(0xFF3B7DF0), Color(0xFF2A62D4)))) else Modifier.background(C.surface))
        .border(1.dp, if (blue) Color.White.copy(alpha = 0.12f) else C.line, RoundedCornerShape(20.dp))
        .padding(horizontal = 14.dp, vertical = 12.dp),
) {
    CompositionLocalProvider(LocalOnGlass provides blue) { content() }
}

/** Blue brand card (gradient + light rays) that keeps white content in both themes. */
@Composable
fun GlassCard(
    modifier: Modifier = Modifier, shape: RoundedCornerShape = RoundedCornerShape(24.dp), style: Int = 3,
    contentPadding: PaddingValues = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
    content: @Composable ColumnScope.() -> Unit,
) = Column(
    modifier.clip(shape).glass(style).border(1.dp, Color.White.copy(alpha = 0.22f), shape).padding(contentPadding),
) {
    CompositionLocalProvider(LocalOnGlass provides true) { content() }
}

@Composable
fun Bar(fraction: Float, modifier: Modifier = Modifier) = Box(
    modifier.fillMaxWidth().height(5.dp).clip(CircleShape).background(C.ink.copy(alpha = 0.1f)),
) {
    // the fill grows from the start (right, in RTL) and ends in a lime tip
    Box(
        Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).height(5.dp).clip(CircleShape)
            .background(Brush.horizontalGradient(0f to C.primary, 0.6f to C.primary, 1f to C.lime))
    )
}

@Composable
fun Chip(label: String, on: Boolean, icon: ImageVector? = null, onClick: () -> Unit) = Row(
    Modifier.height(34.dp).clip(CircleShape).background(if (on) C.lime else C.surface)
        .border(1.dp, if (on) Color.Transparent else C.line, CircleShape).clickable(onClick = onClick).padding(horizontal = 13.dp),
    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp),
) {
    T(label, 12, if (on) 700 else 500, if (on) C.onLime else C.t2, maxLines = 1)
    if (icon != null) Ico(icon, 15.dp, if (on) C.onLime else C.t2)
}

@Composable
fun <K> Segmented(options: List<Pair<K, String>>, selected: K, onSelect: (K) -> Unit) = Row(
    Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp)).background(C.surface).padding(4.dp),
    horizontalArrangement = Arrangement.spacedBy(4.dp),
) {
    options.forEach { (k, label) ->
        val on = k == selected
        Box(
            Modifier.weight(1f).height(38.dp).clip(RoundedCornerShape(11.dp)).background(if (on) C.lime else Color.Transparent)
                .clickable { onSelect(k) },
            contentAlignment = Alignment.Center,
        ) { T(label, 13, 700, if (on) C.onLime else C.t2) }
    }
}

@Composable
fun LimeButton(label: String, modifier: Modifier = Modifier, icon: ImageVector? = null, height: Dp = 52.dp, onClick: () -> Unit) = Row(
    modifier.height(height).clip(RoundedCornerShape(18.dp)).background(C.lime).clickable(onClick = onClick).padding(horizontal = 16.dp),
    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
) {
    if (icon != null) Ico(icon, 18.dp, C.onLime)
    T(label, 14, 800, C.onLime, maxLines = 1)
}

@Composable
fun GhostButton(label: String, modifier: Modifier = Modifier, icon: ImageVector? = null, color: Color = C.ink, onClick: () -> Unit) = Row(
    modifier.height(48.dp).clip(RoundedCornerShape(16.dp)).background(C.surface).border(1.dp, C.line, RoundedCornerShape(16.dp))
        .clickable(onClick = onClick).padding(horizontal = 14.dp),
    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
) {
    if (icon != null) Ico(icon, 18.dp, color)
    T(label, 13, 700, color, maxLines = 1)
}

/** Screen title row for pushed (non-tab) screens: back on the right (RTL), optional action on the left. */
@Composable
fun TopBar(title: String, onBack: () -> Unit, dark: Boolean = true, action: ImageVector? = null, onAction: () -> Unit = {}) = Row(
    Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 6.dp),
    verticalAlignment = Alignment.CenterVertically,
) {
    CircleBtn(Ic.chevRight, dark, onBack)
    T(title, 16, 700, modifier = Modifier.weight(1f), align = TextAlign.Center, maxLines = 1)
    if (action != null) CircleBtn(action, dark, onAction) else Spacer(Modifier.size(42.dp))
}

@Composable
fun Empty(text: String, action: String? = null, onAction: () -> Unit = {}) = Column(
    Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp),
) {
    T(text, 13, color = C.muted, align = TextAlign.Center)
    if (action != null) LimeButton(action, height = 44.dp, onClick = onAction)
}

/** Single-line text input in the app style. */
@Composable
fun Field(
    value: String, onChange: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier,
    number: Boolean = false, ltr: Boolean = false, leading: ImageVector? = null,
) = Row(
    modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(15.dp)).background(C.surface)
        .border(1.dp, C.line, RoundedCornerShape(15.dp)).padding(horizontal = 14.dp),
    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
) {
    if (leading != null) Ico(leading, 18.dp, C.muted)
    Box(Modifier.weight(1f)) {
        if (value.isEmpty()) T(placeholder, 13, color = C.muted, maxLines = 1)
        BasicTextField(
            value, onChange, singleLine = true, cursorBrush = SolidColor(C.lime),
            textStyle = TextStyle(color = C.ink, fontSize = 14.sp, fontFamily = Vazir, fontWeight = FontWeight.Medium,
                textAlign = if (ltr) TextAlign.Left else TextAlign.Start),
            keyboardOptions = if (number) KeyboardOptions(keyboardType = KeyboardType.Number) else KeyboardOptions.Default,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
fun Label(text: String) = T(text, 12, color = C.muted, modifier = Modifier.padding(top = 14.dp, bottom = 6.dp))

@Composable
fun Confirm(title: String, text: String, ok: String, danger: Boolean = false, onOk: () -> Unit, onDismiss: () -> Unit) = AlertDialog(
    onDismissRequest = onDismiss, containerColor = C.sheet,
    title = { T(title, 17, 800) }, text = { T(text, 13, color = C.t2) },
    confirmButton = { TextButton({ onOk(); onDismiss() }) { T(ok, 14, 800, if (danger) C.bad else C.accent) } },
    dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
)

// ---------- transaction row ----------

@Composable
fun TxnRowView(r: TxnRow, hide: Boolean, onClick: () -> Unit) {
    val t = r.txn
    val (icon, color) = when (t.type) {
        TxType.TRANSFER -> Ic.swap to C.violet
        TxType.ADJUST -> Ic.scale to C.sky
        TxType.DEBT -> Ic.receipt to C.cat[3]
        else -> if (r.categoryName == null) Ic.tag to C.warn else Ic.category(r.categoryIcon) to C.cat[(r.categoryColor ?: 0).mod(C.cat.size)]
    }
    val title = t.title ?: when (t.type) {
        TxType.TRANSFER -> "انتقال"
        TxType.ADJUST -> "تعدیل موجودی"
        TxType.DEBT -> "قرض"
        else -> r.categoryName ?: if (t.type == TxType.INCOME) "واریز" else "برداشت"
    }
    val noCat = r.categoryName == null && (t.type == TxType.EXPENSE || t.type == TxType.INCOME)
    val sub = when (t.type) {
        TxType.TRANSFER -> "${r.accountName} ← ${r.toAccountName ?: ""} · ${Jalali.time(t.occurredAt)}"
        else -> listOf(if (noCat) "بدون دسته" else r.categoryName ?: "", r.accountName, Jalali.time(t.occurredAt)).filter { it.isNotEmpty() }.joinToString(" · ")
    }
    val (value, valueColor) = when (t.type) {
        TxType.INCOME -> amount(t.amount, hide, plus = true) to C.ok
        TxType.EXPENSE -> amount(-t.amount, hide) to C.ink
        TxType.TRANSFER -> amount(t.amount, hide) to C.sky
        else -> amount(t.amount, hide, plus = true) to C.sky
    }
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        CatIcon(icon, color)
        Column(Modifier.weight(1f)) {
            T(title, 13.5f, 600, maxLines = 1)
            T(sub, 11, color = if (noCat) C.warn else C.muted, maxLines = 1)
        }
        Column(horizontalAlignment = Alignment.End) {
            T(value, 13.5f, 700, valueColor, maxLines = 1)
            val sms = t.source != "MANUAL"
            T(
                if (sms) "پیامک" else "دستی", 9.5f, 500, if (sms) C.accent else C.muted,
                Modifier.padding(top = 3.dp).clip(RoundedCornerShape(6.dp))
                    .background(if (sms) C.lime.copy(alpha = 0.11f) else C.ink.copy(alpha = 0.06f)).padding(horizontal = 6.dp, vertical = 1.dp),
            )
        }
    }
}

@Composable
fun TxnGroup(rows: List<TxnRow>, hide: Boolean, onClick: (TxnRow) -> Unit) = Group {
    rows.forEachIndexed { i, r ->
        if (i > 0) Divider()
        TxnRowView(r, hide) { onClick(r) }
    }
}

// ---------- bank cards ----------

fun accTypeLabel(a: Account) = when (a.type) {
    AccType.CASH -> "نقد"
    AccType.WALLET -> "کیف پول"
    else -> "بانکی"
}

@Composable
fun BankMini(a: Account, balance: Long, last4: String?, hide: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(20.dp)
    val bank = Banks.of(a.bankCode)
    val colorLong = a.cardColor ?: bank?.color
    val customColor = colorLong?.let { Color(it) }
    val display4 = last4 ?: a.cardNumber?.filter(Char::isDigit)?.takeLast(4)

    val shadowColor = customColor?.copy(alpha = 0.5f) ?: Color(0xFF081C5A)
    val cardMod = if (customColor != null) {
        modifier.shadow(10.dp, shape, ambientColor = shadowColor, spotColor = shadowColor)
            .clip(shape).cardShading(customColor, a.style)
    } else {
        modifier.shadow(10.dp, shape, ambientColor = shadowColor, spotColor = shadowColor)
            .clip(shape).glass(a.style)
    }

    Column(
        cardMod.border(1.dp, Color.White.copy(alpha = 0.3f), shape).clickable(onClick = onClick).padding(12.dp),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        CompositionLocalProvider(LocalOnGlass provides true) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Mono(a.bankCode, a.type)
                Spacer(Modifier.weight(1f))
                T(accTypeLabel(a), 10, modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(Color.White.copy(alpha = 0.22f)).padding(horizontal = 8.dp, vertical = 2.dp))
            }
            Column {
                T(a.name, 12, color = Color.White.copy(alpha = 0.92f), maxLines = 1)
                T(amount(balance, hide), 17, 800, maxLines = 1)
            }
            Row(Modifier.fillMaxWidth()) {
                T("تومان", 10, color = Color.White.copy(alpha = 0.88f), modifier = Modifier.weight(1f))
                if (display4 != null) T("⁦•• ${Money.fa(display4)}⁩", 10, color = Color.White.copy(alpha = 0.88f))
            }
        }
    }
}

/** Bottom floating dock (only on the 4 root tabs). */
@Composable
fun Dock(current: Int, onTab: (Int) -> Unit, onAdd: () -> Unit, modifier: Modifier = Modifier) {
    val items = listOf(Ic.home to "خانه", Ic.list to "تراکنش‌ها", null, Ic.wallet to "حساب‌ها", Ic.grid to "بیشتر")
    Box(modifier.fillMaxWidth()) {
        // fade so scrolling content doesn't look cut under the dock
        Box(Modifier.fillMaxWidth().height(130.dp).align(Alignment.BottomCenter).background(Brush.verticalGradient(listOf(Color.Transparent, C.bg.copy(alpha = 0.94f), C.bg))))
        Row(
            Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(start = 12.dp, end = 12.dp, bottom = 12.dp)
                .fillMaxWidth().height(64.dp).shadow(24.dp, RoundedCornerShape(24.dp)).clip(RoundedCornerShape(24.dp)).background(C.dock)
                .border(1.dp, C.ink.copy(alpha = 0.08f), RoundedCornerShape(24.dp)).padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceAround,
        ) {
            var tab = 0
            items.forEach { item ->
                if (item == null) {
                    Spacer(Modifier.width(58.dp))
                } else {
                    val idx = tab++
                    val on = idx == current
                    Column(
                        Modifier.width(62.dp).clip(RoundedCornerShape(14.dp)).clickable { onTab(idx) }.padding(vertical = 4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Box(
                            Modifier.size(50.dp, 28.dp).clip(RoundedCornerShape(14.dp)).background(if (on) C.sky.copy(alpha = 0.18f) else Color.Transparent),
                            contentAlignment = Alignment.Center,
                        ) { Ico(item.first, 20.dp, if (on) C.sky else C.muted) }
                        T(item.second, 10, if (on) 600 else 500, if (on) C.ink else C.muted, maxLines = 1)
                    }
                }
            }
        }
        // the + sits above the dock with a ring the color of the page, which reads as a notch
        Box(
            Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 12.dp + 64.dp - 30.dp).offset(y = 0.dp)
                .size(66.dp).clip(RoundedCornerShape(23.dp)).background(C.bg).padding(6.dp)
                .clip(RoundedCornerShape(19.dp)).background(C.lime).clickable(onClick = onAdd),
            contentAlignment = Alignment.Center,
        ) { Ico(Ic.plus, 26.dp, C.onLime) }
    }
}

val BottomSpace = PaddingValues(bottom = 150.dp)

/** Jalali date picker: three steppers (day, month, year). Returns start-of-day millis. */
@Composable
fun JDateDialog(title: String, initial: Long, onPick: (Long) -> Unit, onDismiss: () -> Unit) {
    val j0 = remember { Jalali.of(initial) }
    var y by remember { mutableIntStateOf(j0.y) }
    var m by remember { mutableIntStateOf(j0.m) }
    var d by remember { mutableIntStateOf(j0.d) }
    val maxD = Jalali.monthDays(y, m)
    if (d > maxD) d = maxD
    @Composable
    fun Stepper(label: String, value: String, dec: () -> Unit, inc: () -> Unit) = Row(
        Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        T(label, 12, color = C.muted, modifier = Modifier.width(44.dp))
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(C.surface).clickable(onClick = dec), contentAlignment = Alignment.Center) { Ico(Ic.chevRight, 18.dp) }
        T(value, 16, 700, modifier = Modifier.weight(1f), align = TextAlign.Center)
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(C.surface).clickable(onClick = inc), contentAlignment = Alignment.Center) { Ico(Ic.chevLeft, 18.dp) }
    }
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = C.sheet,
        title = { T(title, 17, 800) },
        text = {
            Column {
                Stepper("روز", Money.fa(d.toString()), { d = if (d > 1) d - 1 else maxD }, { d = if (d < maxD) d + 1 else 1 })
                Stepper("ماه", Jalali.MONTHS[m - 1], { if (m > 1) m-- else { m = 12; y-- } }, { if (m < 12) m++ else { m = 1; y++ } })
                Stepper("سال", Money.fa(y.toString()), { y-- }, { y++ })
                T(Jalali.longDate(Jalali.millis(y, m, d)), 12, color = C.t2, modifier = Modifier.fillMaxWidth().padding(top = 8.dp), align = TextAlign.Center)
            }
        },
        confirmButton = { TextButton({ onPick(Jalali.millis(y, m, d)); onDismiss() }) { T("تأیید", 14, 800, C.accent) } },
        dismissButton = { TextButton(onDismiss) { T("انصراف", 14, 600, C.t2) } },
    )
}

/** Field-looking button that opens a picker. */
@Composable
fun PickField(text: String, icon: ImageVector, modifier: Modifier = Modifier, muted: Boolean = false, onClick: () -> Unit) = Row(
    modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(15.dp)).background(C.surface).border(1.dp, C.line, RoundedCornerShape(15.dp))
        .clickable(onClick = onClick).padding(horizontal = 14.dp),
    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
) {
    Ico(icon, 18.dp, C.sky)
    T(text, 13.5f, 600, if (muted) C.muted else C.ink, Modifier.weight(1f), maxLines = 1)
    Ico(Ic.chevDown, 15.dp, C.muted)
}

/** Segmented progress: one bar per installment. */
@Composable
fun Segments(total: Int, done: Int, modifier: Modifier = Modifier, light: Boolean = false) = Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
    repeat(total.coerceAtMost(60)) { i ->
        Box(Modifier.weight(1f).height(4.dp).clip(CircleShape).background(if (i < done) C.lime else (if (light) Color.White.copy(alpha = 0.3f) else C.ink.copy(alpha = 0.12f))))
    }
}
