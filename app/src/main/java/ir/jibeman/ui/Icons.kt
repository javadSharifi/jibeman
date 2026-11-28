package ir.jibeman.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * Line icons, 24 grid, 1.75 stroke, round caps — drawn after Lucide (ISC license).
 * Only the icons the app uses; no icon library (keeps the APK small). Never use emoji.
 */
object Ic {
    private fun v(vararg d: String) = ImageVector.Builder(defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f).apply {
        d.forEach {
            addPath(
                addPathNodes(it), fill = null, stroke = SolidColor(Color.White), strokeLineWidth = 1.75f,
                strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round,
            )
        }
    }.build()

    private fun circle(cx: Float, cy: Float, r: Float) = "M${cx - r} ${cy}a$r $r 0 1 0 ${2 * r} 0a$r $r 0 1 0 ${-2 * r} 0"
    private fun rect(x: Float, y: Float, w: Float, h: Float, r: Float) =
        "M${x + r} ${y}h${w - 2 * r}a$r $r 0 0 1 $r ${r}v${h - 2 * r}a$r $r 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a$r $r 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a$r $r 0 0 1 $r ${-r}z"

    val home by lazy { v("M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z") }
    val list by lazy { v("M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01") }
    val wallet by lazy { v("M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v3m0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5", "M21 12h-4a2 2 0 0 0 0 4h4z") }
    val grid by lazy { v(rect(3f, 3f, 7f, 7f, 2f), rect(14f, 3f, 7f, 7f, 2f), rect(3f, 14f, 7f, 7f, 2f), rect(14f, 14f, 7f, 7f, 2f)) }
    val plus by lazy { v("M12 5v14M5 12h14") }
    val eye by lazy { v("M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", circle(12f, 12f, 3f)) }
    val eyeOff by lazy { v("M9.9 4.24A9 9 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.39-1.61M2 2l20 20M14.12 14.12a3 3 0 1 1-4.24-4.24") }
    val out by lazy { v("M7 17 17 7M8 7h9v9") }
    val inn by lazy { v("M17 7 7 17M16 17H7V8") }
    val go by lazy { v("M17 17 7 7M16 7H7v9") }
    val trend by lazy { v("M22 7l-8.5 8.5-5-5L2 17M16 7h6v6") }
    val trendDown by lazy { v("M22 17l-8.5-8.5-5 5L2 7M16 17h6v-6") }
    val swap by lazy { v("M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7") }
    val search by lazy { v(circle(11f, 11f, 7f), "m20 20-3.5-3.5") }
    val chevDown by lazy { v("m6 9 6 6 6-6") }
    val chevUp by lazy { v("m18 15-6-6-6 6") }
    val chevLeft by lazy { v("m15 18-6-6 6-6") }
    val chevRight by lazy { v("m9 18 6-6-6-6") }
    val check by lazy { v("M20 6 9 17l-5-5") }
    val x by lazy { v("M18 6 6 18M6 6l12 12") }
    val pen by lazy { v("M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z") }
    val trash by lazy { v("M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2") }
    val card by lazy { v(rect(2f, 5f, 20f, 14f, 2.5f), "M2 10h20M6 15h4") }
    val copy by lazy { v(rect(9f, 9f, 13f, 13f, 2f), "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1") }
    val share by lazy { v(circle(18f, 5f, 3f), circle(6f, 12f, 3f), circle(18f, 19f, 3f), "m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98") }
    val cal by lazy { v(rect(3f, 4f, 18f, 18f, 2.5f), "M16 2v4M8 2v4M3 10h18") }
    val shield by lazy { v("M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z") }
    val save by lazy { v("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3") }
    val upload by lazy { v("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12") }
    val alert by lazy { v("m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3M12 9v4M12 17h.01") }
    val backspace by lazy { v("M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zM18 9l-6 6M12 9l6 6") }
    val msg by lazy { v("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z") }
    val users by lazy { v("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75", circle(9f, 7f, 4f)) }
    val lock by lazy { v(rect(4f, 11f, 16f, 10f, 2.5f), "M8 11V7a4 4 0 0 1 8 0v4") }
    val fingerprint by lazy { v("M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4", "M14 13.12c0 2.38 0 6.38-1 8.88", "M17.29 21.02c.12-.6.43-2.3.5-3.02", "M2 12a10 10 0 0 1 18-6", "M2 16h.01", "M21.8 16c.2-2 .13-5.35 0-6", "M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2", "M8.65 22c.21-.66.45-1.32.57-2", "M9 6.8a6 6 0 0 1 9 5.2v2") }
    val user by lazy { v(circle(12f, 8f, 4f), "M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1") }
    val bank by lazy { v("M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l9 5H3z") }
    val receipt by lazy { v("M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1zM8 8h8M8 12h8M8 16h5") }
    val target by lazy { v(circle(12f, 12f, 9f), circle(12f, 12f, 5f), circle(12f, 12f, 1f)) }
    val split by lazy { v(circle(12f, 12f, 9f), "M12 3v9l6.4 6.4M12 12l-6.4 6.4") }
    val nfc by lazy { v("M6 8.3a7.4 7.4 0 0 1 0 7.4M9.5 6.2a11.8 11.8 0 0 1 0 11.6M12.9 4.1a15.9 15.9 0 0 1 0 15.8") }
    val scale by lazy { v("M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0zM8 21h8") }
    val sun by lazy { v(circle(12f, 12f, 4f), "M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41") }
    val moon by lazy { v("M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z") }
    val pieChart by lazy { v("M21.21 15.89A10 10 0 1 1 8 2.83", "M22 12A10 10 0 0 0 12 2v10z") }

    // category icons
    val car by lazy { v("M5 17H3v-5l2-5h14l2 5v5h-2M9 17h6M3 12h18", circle(7f, 17f, 2f), circle(17f, 17f, 2f)) }
    val bag by lazy { v("M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0") }
    val food by lazy { v("M3 2v7a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3zm0 0v7") }
    val brief by lazy { v(rect(2f, 7f, 20f, 14f, 2f), "M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16") }
    val phone by lazy { v(rect(6f, 2f, 12f, 20f, 2.5f), "M11 18h2") }
    val zap by lazy { v("M13 2 3 14h9l-1 8 10-12h-9z") }
    val heart by lazy { v("M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z") }
    val gift by lazy { v("M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z") }
    val book by lazy { v("M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20") }
    val tag by lazy { v("M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z", circle(7.5f, 7.5f, 1f)) }
    val plane by lazy { v("M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z") }
    val coffee by lazy { v("M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM6 2v2M10 2v2M14 2v2") }

    val categoryKeys = listOf("food", "car", "bag", "zap", "phone", "home", "heart", "gift", "book", "brief", "plane", "coffee", "bank", "tag")

    fun category(key: String?): ImageVector = when (key) {
        "food" -> food; "car" -> car; "bag" -> bag; "zap" -> zap; "phone" -> phone; "home" -> home
        "heart" -> heart; "gift" -> gift; "book" -> book; "brief" -> brief; "plane" -> plane; "coffee" -> coffee; "bank" -> bank; "target" -> target
        else -> tag
    }
}
