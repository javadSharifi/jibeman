package ir.jibeman.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.core.view.WindowCompat
import ir.jibeman.R

/** User's theme choice; SYSTEM follows the phone. */
enum class ThemeMode { SYSTEM, LIGHT, DARK }

/**
 * Design tokens; see docs/DESIGN-SYSTEM.md.
 * Values come from [p], swapped by [JibeTheme], so the whole app can be read from plain (non-composable) code too.
 */
object C {
    private val state = mutableStateOf(darkPalette)

    internal var p: Palette
        get() = state.value
        set(v) { state.value = v }

    val bg get() = state.value.bg
    val sheet get() = state.value.sheet
    val surface get() = state.value.surface
    val surface2 get() = state.value.surface2
    val dock get() = state.value.dock
    val line get() = state.value.line
    val primary get() = state.value.primary
    val primaryStrong get() = state.value.primaryStrong
    val sky get() = state.value.sky
    val lime get() = state.value.lime
    val onLime get() = state.value.onLime

    /** Lime as text/icon on an app surface (pale lime is unreadable on the light background). */
    val accent get() = state.value.accent

    /** Primary text/icon color: white in dark, near-black in light. Use with .copy(alpha=…) for subtle fills. */
    val ink get() = state.value.ink
    val t2 get() = state.value.t2
    val muted get() = state.value.muted
    val ok get() = state.value.ok
    val warn get() = state.value.warn
    val bad get() = state.value.bad
    val violet get() = state.value.violet

    /** Hero header wash: a deep blue glow in dark, a pale tint in light so dark text stays readable. */
    val heroA get() = state.value.heroA
    val heroB get() = state.value.heroB
    val heroC get() = state.value.heroC

    /** Translucent pill/button fill on a hero header, and its border. */
    val veil get() = state.value.veil
    val veilLine get() = state.value.veilLine

    /** Category palette, referenced by index from the DB. */
    val cat get() = state.value.cat

    /** Only two palettes exist; identity is enough and keeps [Palette] simple. */
    val isDark get() = state.value !== lightPalette
}

/** True inside blue "glass" surfaces, where text and icons are always white (they hover over the brand blue). */
val LocalOnGlass = staticCompositionLocalOf { false }

internal class Palette(
    val bg: Color = Color(0xFF05060D),
    val sheet: Color = Color(0xFF0D1230),
    val surface: Color = Color(0xFF131936),
    val surface2: Color = Color(0xFF1C2347),
    val dock: Color = Color(0xFF11162F),
    val line: Color = Color(0x12FFFFFF),
    val primary: Color = Color(0xFF3880F2),
    val primaryStrong: Color = Color(0xFF2F6FDC), // white small text on blue needs this one (4.7:1)
    val sky: Color = Color(0xFF6A9EFA),
    val lime: Color = Color(0xFFE8FCB4),
    val onLime: Color = Color(0xFF14265C),
    val accent: Color = Color(0xFFE8FCB4),
    val ink: Color = Color.White,
    val t2: Color = Color(0xBDFFFFFF),
    val muted: Color = Color(0xFF8C94B8),
    val ok: Color = Color(0xFF7BE3B0),
    val warn: Color = Color(0xFFFFC977),
    val bad: Color = Color(0xFFFF8A9A),
    val violet: Color = Color(0xFFB9AEFF),
    val heroA: Color = Color(0xFF90B8FF),
    val heroB: Color = Color(0xFF4A84EE),
    val heroC: Color = Color(0xFF1B3883),
    val veil: Color = Color(0x21FFFFFF),
    val veilLine: Color = Color(0x26FFFFFF),
    val cat: List<Color> = listOf(
        Color(0xFF8DB6FF), Color(0xFFFFB27A), Color(0xFFF59AC8), Color(0xFF7BE3B0),
        Color(0xFFE8FCB4), Color(0xFFB9AEFF), Color(0xFFFFC977), Color(0xFFFF8A9A),
    ),
)

private val darkPalette = Palette()

// Same hue family, darkened where the dark values would fail contrast on white.
private val lightPalette = Palette(
    bg = Color(0xFFF2F4FA), sheet = Color.White, surface = Color.White, surface2 = Color(0xFFE9EDF7),
    dock = Color.White, line = Color(0x14141C36), sky = Color(0xFF2B63C9), lime = Color(0xFFDCF290),
    accent = Color(0xFF4F6B14), ink = Color(0xFF10162B), t2 = Color(0xB31A2138), muted = Color(0xFF6B7390),
    ok = Color(0xFF12855A), warn = Color(0xFFA26100), bad = Color(0xFFC2263A), violet = Color(0xFF5B4BC4),
    heroA = Color(0xFFBFD4FF), heroB = Color(0xFFD7E3FF), heroC = Color(0xFFEDF1FB),
    veil = Color(0x0F10162B), veilLine = Color(0x1F10162B),
    cat = listOf(
        Color(0xFF3A6FD8), Color(0xFFC26512), Color(0xFFC13C86), Color(0xFF11885C),
        Color(0xFF7A9414), Color(0xFF5A4BC8), Color(0xFFB07400), Color(0xFFC2293D),
    ),
)

val Vazir = FontFamily(
    Font(R.font.vazirmatn_regular, FontWeight.Normal),
    Font(R.font.vazirmatn_medium, FontWeight.Medium),
    Font(R.font.vazirmatn_medium, FontWeight.SemiBold),
    Font(R.font.vazirmatn_bold, FontWeight.Bold),
    Font(R.font.vazirmatn_extrabold, FontWeight.ExtraBold),
)

private fun Typography.vazir(): Typography {
    fun TextStyle.f() = copy(fontFamily = Vazir)
    return copy(
        displayLarge = displayLarge.f(), displayMedium = displayMedium.f(), displaySmall = displaySmall.f(),
        headlineLarge = headlineLarge.f(), headlineMedium = headlineMedium.f(), headlineSmall = headlineSmall.f(),
        titleLarge = titleLarge.f(), titleMedium = titleMedium.f(), titleSmall = titleSmall.f(),
        bodyLarge = bodyLarge.f(), bodyMedium = bodyMedium.f(), bodySmall = bodySmall.f(),
        labelLarge = labelLarge.f(), labelMedium = labelMedium.f(), labelSmall = labelSmall.f(),
    )
}

private fun scheme(p: Palette, dark: Boolean) = if (dark) darkColorScheme(
    primary = p.accent, onPrimary = p.onLime, secondary = p.primary, onSecondary = Color.White,
    background = p.bg, onBackground = p.ink, surface = p.sheet, onSurface = p.ink,
    surfaceVariant = p.surface, onSurfaceVariant = p.t2, surfaceContainerHigh = p.sheet,
    surfaceContainerHighest = p.surface, surfaceContainer = p.sheet, outline = p.line, error = p.bad,
) else lightColorScheme(
    primary = p.accent, onPrimary = Color.White, secondary = p.primary, onSecondary = Color.White,
    background = p.bg, onBackground = p.ink, surface = p.sheet, onSurface = p.ink,
    surfaceVariant = p.surface, onSurfaceVariant = p.t2, surfaceContainerHigh = p.sheet,
    surfaceContainerHighest = p.surface, surfaceContainer = p.sheet, outline = p.line, error = p.bad,
)

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

/** Window background before Compose draws, so a manual theme never flashes the system one. */
fun themeBackground(mode: ThemeMode, systemDark: Boolean): Int {
    val dark = when (mode) {
        ThemeMode.SYSTEM -> systemDark
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    return (if (dark) darkPalette else lightPalette).bg.toArgb()
}

@Composable
fun JibeTheme(mode: ThemeMode = ThemeMode.SYSTEM, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    val p = if (dark) darkPalette else lightPalette
    C.p = p
    val view = LocalView.current
    SideEffect {
        val window = view.context.findActivity()?.window ?: return@SideEffect
        WindowCompat.getInsetsController(window, view).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }
    // key(p) is not used: it would reset navigation/scrolling state on every theme change.
    // Instead C is state-backed, so each composable that reads it recomposes; draw modifiers read the palette
    // at composition time so their cached lambdas are rebuilt too.
    MaterialTheme(colorScheme = scheme(p, dark), typography = Typography().vazir()) {
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl, content = content)
    }
}
