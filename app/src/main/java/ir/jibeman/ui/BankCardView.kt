package ir.jibeman.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ir.jibeman.R
import ir.jibeman.core.Bank
import ir.jibeman.core.BankKit
import ir.jibeman.core.Banks
import ir.jibeman.core.Money
import ir.jibeman.core.db.Account

/**
 * Curated palette for personalizing card colors.
 */
object CardPalettes {
    val presets = listOf(
        0xFF1E2024L to "مشکی آبنوسی",
        0xFF1F5FD6L to "آبی بلو",
        0xFFC8102EL to "قرمز ملت",
        0xFF1C7A4BL to "سبز کشاورزی",
        0xFF0B4F9CL to "سرمه‌ای ملی",
        0xFFB8860BL to "طلایی پاسارگاد",
        0xFF0A6EBDL to "فیروزه‌ای سامان",
        0xFFE65100L to "نارنجی مسکن",
        0xFF00796BL to "سبز رفاه",
        0xFF5B21B6L to "بنفش درباری",
        0xFF991B1BL to "یاقوتی",
        0xFF065F46L to "زمردی",
        0xFFB76E79L to "رز گلد",
        0xFF0F172AL to "دریایی عمیق",
        0xFF475569L to "تیتانیوم",
    )
}

/**
 * Dynamic luxury gradient shader for Iranian debit cards.
 * Combines the bank/chosen color with light reflections and metallic sheen.
 */
fun Modifier.cardShading(baseColor: Color, style: Int = 0) = drawWithCache {
    val w = size.width
    val h = size.height

    val darkBase = lerp(baseColor, Color.Black, 0.45f)
    val midTone = baseColor
    val lightBase = lerp(baseColor, Color.White, 0.22f)

    val lin = Brush.linearGradient(
        colors = listOf(lightBase, midTone, darkBase),
        start = Offset(w * 0.1f, 0f),
        end = Offset(w * 0.95f, h * 1.05f),
    )

    val hl = Brush.radialGradient(
        colors = listOf(Color.White.copy(alpha = 0.38f), Color.Transparent),
        center = Offset(w * 0.2f, -h * 0.15f),
        radius = maxOf(w, h) * 0.85f,
    )

    val ray = Brush.linearGradient(
        0.0f to Color.Transparent,
        0.45f to Color.Transparent,
        0.52f to Color.White.copy(alpha = 0.14f),
        0.58f to Color.White.copy(alpha = 0.24f),
        0.65f to Color.White.copy(alpha = 0.08f),
        0.75f to Color.Transparent,
        1.0f to Color.Transparent,
        start = Offset(0f, h * 0.8f),
        end = Offset(w, 0f),
    )

    onDrawBehind {
        drawRect(lin)
        drawRect(hl)
        drawRect(ray)
    }
}

/**
 * High-fidelity Iranian Debit Card Component.
 * Displays bank logo, chip, NFC, 16-digit PAN, expiry, CVV2, IBAN, and quick copy actions.
 */
@Composable
fun RealisticBankCard(
    account: Account,
    modifier: Modifier = Modifier,
    interactive: Boolean = true,
    onEdit: (() -> Unit)? = null,
    revealDetails: Boolean = false,
) {
    val ctx = LocalContext.current
    val bank = Banks.of(account.bankCode) ?: account.cardNumber?.let { BankKit.detectByCard(it) }

    // Primary card color: user-specified color > bank brand color > fallback
    val cardColorLong = account.cardColor ?: bank?.color ?: 0xFF1E2B4FL
    val cardColor = Color(cardColorLong)

    var showCvv by remember(revealDetails) { mutableStateOf(false) }

    fun copyToClipboard(label: String, text: String, toastMsg: String) {
        val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText(label, text)
        clip.description.extras = android.os.PersistableBundle().apply {
            putBoolean("android.content.extra.IS_SENSITIVE", true)
        }
        cm.setPrimaryClip(clip)
        Toast.makeText(ctx, toastMsg, Toast.LENGTH_SHORT).show()
    }

    val panDigits = BankKit.cleanDigits(account.cardNumber)
    val displayPan = when {
        !revealDetails -> "•••• •••• •••• " + if (panDigits.length >= 4) panDigits.takeLast(4) else "••••"
        panDigits.length == 16 -> BankKit.formatCardNumber(panDigits)
        panDigits.isNotEmpty() -> panDigits.chunked(4).joinToString(" ")
        !account.accountNo.isNullOrBlank() -> "شماره حساب: ${account.accountNo}"
        else -> "•••• •••• •••• ••••"
    }

    val shape = RoundedCornerShape(22.dp)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .shadow(16.dp, shape, ambientColor = cardColor.copy(alpha = 0.6f), spotColor = cardColor.copy(alpha = 0.8f))
            .clip(shape)
            .cardShading(cardColor, account.style)
            .border(1.2.dp, Color.White.copy(alpha = 0.35f), shape)
            .padding(horizontal = 20.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        CompositionLocalProvider(LocalOnGlass provides true) {
            // ---- Top Header: Bank Logo + Bank Name + Edit & NFC ----
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    BankLogoBadge(bank, size = 38.dp)
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            T(
                                text = bank?.let { "بانک ${it.name}" } ?: account.name.ifBlank { "کارت بانکی" },
                                size = 14.5f,
                                weight = 800,
                                color = Color.White,
                                maxLines = 1,
                            )
                            if (account.isSavings) {
                                T("پس‌انداز", 9.5f, 800, C.onLime, modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(C.lime).padding(horizontal = 6.dp, vertical = 2.dp))
                            }
                        }
                        if (bank != null && account.name.isNotBlank() && account.name != bank.name) {
                            T(account.name, 11, weight = 500, color = Color.White.copy(alpha = 0.82f), maxLines = 1)
                        }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (interactive && onEdit != null) {
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(Color.White.copy(alpha = 0.22f))
                                .border(1.dp, Color.White.copy(alpha = 0.35f), RoundedCornerShape(10.dp))
                                .clickable { onEdit() }
                                .padding(horizontal = 9.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Ico(Ic.pen, 12.dp, tint = Color.White)
                            T("ویرایش", 11.5f, weight = 700, color = Color.White)
                        }
                    }
                    Ico(Ic.nfc, 26.dp, tint = Color.White.copy(alpha = 0.9f))
                }
            }

            Spacer(Modifier.height(14.dp))

            // ---- Chip & Contactless Row ----
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                // Golden EMV Chip
                Icon(
                    painter = painterResource(R.drawable.ic_chip),
                    contentDescription = "EMV Chip",
                    tint = Color.Unspecified,
                    modifier = Modifier.size(42.dp, 30.dp),
                )
                // Shetab mark or subtle emblem
                T("شتاب", 11, weight = 700, color = Color.White.copy(alpha = 0.75f))
            }

            Spacer(Modifier.height(16.dp))

            // ---- 16-Digit Card Number (Embossed & Monospaced) ----
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .then(if (interactive && revealDetails && panDigits.length >= 16) Modifier.clickable {
                        copyToClipboard("Card Number", panDigits, "شماره کارت کپی شد")
                    } else Modifier)
                    .padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                T(
                    text = Money.fa(displayPan),
                    size = 19.5f,
                    weight = 700,
                    color = Color.White,
                    modifier = Modifier.weight(1f),
                )
                if (interactive && revealDetails && panDigits.length >= 16) {
                    Ico(Ic.copy, 16.dp, tint = Color.White.copy(alpha = 0.75f))
                }
            }

            Spacer(Modifier.height(12.dp))

            // ---- Bottom Details: Expiry, CVV2, Actions ----
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                // Expiry Date
                if (revealDetails && !account.cardExpiry.isNullOrBlank()) {
                    Column {
                        T("انقضا", 9.5f, weight = 500, color = Color.White.copy(alpha = 0.75f))
                        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                            T(Money.fa(BankKit.formatExpiry(account.cardExpiry)), 13, weight = 700, color = Color.White)
                        }
                    }
                } else {
                    Spacer(Modifier.width(1.dp))
                }

                // CVV2
                if (revealDetails && !account.cardCvv2.isNullOrBlank()) {
                    Column(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .then(if (interactive && showCvv) Modifier.clickable {
                                copyToClipboard("CVV2", account.cardCvv2, "کد CVV2 کپی شد")
                            } else Modifier)
                            .padding(horizontal = 4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            T("CVV2", 9.5f, weight = 500, color = Color.White.copy(alpha = 0.75f))
                            if (interactive) {
                                Box(
                                    modifier = Modifier
                                        .size(16.dp)
                                        .clickable { showCvv = !showCvv },
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Ico(if (showCvv) Ic.eyeOff else Ic.eye, 12.dp, tint = Color.White.copy(alpha = 0.8f))
                                }
                            }
                        }
                        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                            T(
                                text = if (showCvv) Money.fa(account.cardCvv2) else "•••",
                                size = 13,
                                weight = 700,
                                color = Color.White,
                            )
                        }
                    }
                }

                // Card Type Label
                T(
                    text = if (account.type == "BANK") "DEBIT CARD" else account.type,
                    size = 10,
                    weight = 600,
                    color = Color.White.copy(alpha = 0.75f),
                )
            }

            // ---- Optional IBAN Bar ----
            if (revealDetails && !account.iban.isNullOrBlank()) {
                val cleanIban = BankKit.cleanDigits(account.iban)
                val fullIban = if (cleanIban.startsWith("IR")) cleanIban else "IR$cleanIban"
                val displayIban = BankKit.formatIban(account.iban)

                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color.Black.copy(alpha = 0.2f))
                        .border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(10.dp))
                        .then(if (interactive) Modifier.clickable {
                            copyToClipboard("IBAN", fullIban, "شماره شبا کپی شد")
                        } else Modifier)
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    T(text = displayIban, size = 11, weight = 600, color = Color.White.copy(alpha = 0.95f))
                    if (interactive) {
                        Ico(Ic.copy, 14.dp, tint = Color.White.copy(alpha = 0.8f))
                    }
                }
            }
        }
    }
}

/**
 * Bank logo badge: renders the official VectorDrawable if present,
 * or cleanly falls back to brand monogram letter on a crisp white disc.
 */
@Composable
fun BankLogoBadge(bank: Bank?, size: Dp = 36.dp) {
    Box(
        modifier = Modifier
            .size(size)
            .clip(RoundedCornerShape(size * 0.3f))
            .background(Color.White)
            .border(1.dp, Color.Black.copy(alpha = 0.08f), RoundedCornerShape(size * 0.3f)),
        contentAlignment = Alignment.Center,
    ) {
        if (bank?.logoRes != null) {
            Icon(
                painter = painterResource(bank.logoRes),
                contentDescription = bank.name,
                tint = Color.Unspecified,
                modifier = Modifier
                    .size(size * 0.74f)
                    .clip(RoundedCornerShape(4.dp)),
            )
        } else if (bank != null) {
            T(
                text = bank.letter,
                size = size.value * 0.5f,
                weight = 800,
                color = Color(bank.color),
            )
        } else {
            Ico(Ic.card, size * 0.58f, tint = Color(0xFF1E2B4F))
        }
    }
}

/**
 * Color picker for debit cards.
 * Provides the bank's default brand color + curated luxury card palettes.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CardColorPicker(
    bank: Bank?,
    selectedColor: Long?,
    onSelectColor: (Long?) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // Option 1: Bank Default Color
            if (bank != null) {
                val isDefault = selectedColor == null || selectedColor == bank.color
                val defaultColor = Color(bank.color)
                Row(
                    modifier = Modifier
                        .height(38.dp)
                        .clip(CircleShape)
                        .background(if (isDefault) C.lime.copy(alpha = 0.2f) else C.surface)
                        .border(1.5.dp, if (isDefault) C.lime else C.line, CircleShape)
                        .clickable { onSelectColor(null) }
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(18.dp)
                            .clip(CircleShape)
                            .background(defaultColor)
                            .border(1.dp, Color.White.copy(alpha = 0.4f), CircleShape),
                    )
                    T("رنگ سازمانی بانک", 11.5f, weight = 600, color = if (isDefault) C.ink else C.muted)
                }
            }

            // Presets
            CardPalettes.presets.forEach { (colorLong, name) ->
                val isSelected = selectedColor == colorLong
                val color = Color(colorLong)
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(color)
                        .border(
                            width = if (isSelected) 3.dp else 1.dp,
                            color = if (isSelected) C.lime else Color.White.copy(alpha = 0.3f),
                            shape = CircleShape,
                        )
                        .clickable { onSelectColor(colorLong) },
                    contentAlignment = Alignment.Center,
                ) {
                    if (isSelected) {
                        Ico(Ic.check, 18.dp, tint = Color.White)
                    }
                }
            }
        }
    }
}
