package ir.jibeman.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import ir.jibeman.core.Money

@Composable
fun PinDots(
    length: Int,
    total: Int = 4,
    isError: Boolean = false,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(total) { index ->
            val filled = index < length
            val color by animateColorAsState(
                targetValue = when {
                    isError -> C.bad
                    filled -> C.lime
                    else -> Color.White.copy(alpha = 0.2f)
                },
                animationSpec = tween(150),
            )
            val size by animateDpAsState(
                targetValue = if (filled || isError) 14.dp else 11.dp,
                animationSpec = tween(150),
            )
            Box(
                Modifier
                    .size(size)
                    .clip(CircleShape)
                    .background(color)
                    .then(
                        if (!filled && !isError) Modifier.border(1.dp, Color.White.copy(alpha = 0.3f), CircleShape)
                        else Modifier
                    )
            )
        }
    }
}

@Composable
fun PinKeypad(
    onDigit: (String) -> Unit,
    onDelete: () -> Unit,
    onBiometric: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Rows 1 to 3: numbers 1-9
        val rows = listOf(
            listOf("1", "2", "3"),
            listOf("4", "5", "6"),
            listOf("7", "8", "9"),
        )

        rows.forEach { row ->
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterHorizontally),
            ) {
                row.forEach { d ->
                    KeypadButton(
                        text = Money.fa(d),
                        onClick = { onDigit(d) },
                    )
                }
            }
        }

        // Bottom row: Biometric / Empty, 0, Backspace
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterHorizontally),
        ) {
            if (onBiometric != null) {
                KeypadIconButton(
                    icon = Ic.fingerprint,
                    tint = C.sky,
                    onClick = onBiometric,
                )
            } else {
                Box(Modifier.size(68.dp))
            }

            KeypadButton(
                text = Money.fa("0"),
                onClick = { onDigit("0") },
            )

            KeypadIconButton(
                icon = Ic.backspace,
                tint = C.muted,
                onClick = onDelete,
            )
        }
    }
}

@Composable
private fun KeypadButton(
    text: String,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .size(68.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(C.surface)
            .border(1.dp, C.line, RoundedCornerShape(22.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        T(text, 22, 700, Color.White)
    }
}

@Composable
private fun KeypadIconButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .size(68.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(C.surface)
            .border(1.dp, C.line, RoundedCornerShape(22.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Ico(icon, 24.dp, tint)
    }
}
