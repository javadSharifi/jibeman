package ir.jibeman.core

import androidx.compose.ui.text.AnnotatedString
import ir.jibeman.ui.GroupedAmount
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MoneyInputTest {
    @Test fun parsesGroupedPersianAndArabicAmounts() {
        assertEquals(1_250_000L, Money.parseToman("۱۲۵٬۰۰۰"))
        assertEquals(1_250_000L, Money.parseToman("١٢٥ ٠٠٠"))
    }

    @Test fun preservesExactRialPrecisionOfTomanInput() {
        assertEquals(1_250_003L, Money.parseToman("۱۲۵٬۰۰۰٫۳"))
        assertNull(Money.parseToman("۱۲۵٫۳۴"))
    }

    @Test fun rejectsInvalidOrOversizedAmountsAndAcceptsZero() {
        assertNull(Money.parseToman(""))
        assertNull(Money.parseToman("۱۲x۳"))
        assertNull(Money.parseToman("12345678901234"))
        assertEquals(0L, Money.parseToman("۰"))
    }

    @Test fun roundTripsSignedBalancesWithoutRounding() {
        assertEquals("-1234.5", Money.tomanInput(-12_345L))
        assertEquals(-12_345L, Money.parseToman("−۱٬۲۳۴٫۵", allowNegative = true))
        assertNull(Money.parseToman("-1234.5"))
        assertEquals("منفی هزار و دویست و سی و چهار تومان و پنج ریال", Money.amountWords(-12_345L))
        assertEquals("⁦−۰٫۳⁩", Money.toman(-3L))
    }

    @Test fun caretRemainsOnTheSameDigitAcrossGrouping() {
        val view = GroupedAmount.filter(AnnotatedString("125000.3"))
        assertEquals("125,000.3", view.text.text)
        assertEquals(3, view.offsetMapping.transformedToOriginal(4))
        assertEquals(3, view.offsetMapping.transformedToOriginal(3))
        assertEquals(5, view.offsetMapping.originalToTransformed(4))
        assertEquals(9, view.offsetMapping.originalToTransformed(8))
    }
}
