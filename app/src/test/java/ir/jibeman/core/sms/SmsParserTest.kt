package ir.jibeman.core.sms

import ir.jibeman.core.Jalali
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

/** Fixtures keep the real SMS layouts (docs/BANK-FORMATS.md) with made-up names and numbers. */
class SmsParserTest {
    private val templates = File("src/main/assets/banks").listFiles()!!.sortedBy { it.name }.map { SmsParser.load(it.readText()) }

    private fun parse(sender: String, body: String): Parsed? {
        val norm = SmsParser.normalize(body)
        val (t, by) = SmsParser.detect(templates, sender, norm) ?: return null
        return SmsParser.parse(t, norm, by)
    }

    private val keshWithdraw = "برداشت450,000\nمانده98,736,120\n050810-09:48\nکارت4417*\nbki. ir"
    private val keshPaya = "واریز پایا12,500,000\nمانده111,236,120\n050730-13:07\n123456789\nbki. ir"
    private val bluCharge = "شارژ شدی\n علی عزیز، 200,000 ریال بابت خرید شارژ از حساب شما پرید.\nموجودی: 38,553,000 ریال\n۱۳:۰۸\n۱۴۰۵.۰۸.۰۷"
    private val bluDeposit = "واریز پول\nعلی عزیز، 44,000,000ریال به حساب شما نشست.\nموجودی: 82,753,000 ریال\n۱۴:۰۶\n۱۴۰۵.۰۸.۰۶"

    @Test fun keshavarziWithdraw() {
        val p = parse("KESHAVARZI", keshWithdraw)!!
        assertEquals("keshavarzi", p.bank); assertEquals("EXPENSE", p.type)
        assertEquals(450_000L, p.amount); assertEquals(98_736_120L, p.balance)
        assertEquals("4417", p.card4); assertNull(p.accountNo)
        assertEquals(Jalali.millis(1405, 8, 10, 9, 48), p.occurredAt)
        assertEquals(true, p.bySender)
    }

    @Test fun keshavarziPaya() {
        val p = parse("Keshavarzi", keshPaya)!!
        assertEquals("INCOME", p.type); assertEquals(12_500_000L, p.amount)
        assertEquals("123456789", p.accountNo); assertNull(p.card4)
        assertEquals(Jalali.millis(1405, 7, 30, 13, 7), p.occurredAt)
    }

    @Test fun keshavarziSatnaVariant() {
        assertEquals(1_000L, parse("KESHAVARZI", "واریز ساتنا1,000\nمانده5,000\n050801-10:00\n123456789\nbki. ir")!!.amount)
    }

    @Test fun bluCharge() {
        val p = parse("+989999987641", bluCharge)!!
        assertEquals("blu", p.bank); assertEquals("EXPENSE", p.type)
        assertEquals(200_000L, p.amount); assertEquals(38_553_000L, p.balance)
        assertEquals("خرید شارژ", p.description)
        assertEquals(Jalali.millis(1405, 8, 7, 13, 8), p.occurredAt)
    }

    @Test fun bluDepositAllSenderForms() {
        for (s in listOf("09999987641", "+989999987641", "9999987641")) {
            val p = parse(s, bluDeposit)!!
            assertEquals("INCOME", p.type); assertEquals(44_000_000L, p.amount); assertEquals(true, p.bySender)
        }
    }

    @Test fun signatureFallbackWhenSenderChanges() {
        val p = parse("+98300012345", keshWithdraw)!!
        assertEquals("keshavarzi", p.bank); assertEquals(false, p.bySender)
    }

    @Test fun nonTransactionsIgnored() {
        assertNull(parse("KESHAVARZI", "رمز پویا: 123456\nbki. ir"))
        assertNull(parse("09999987641", "بلو: با دعوت دوستانت جایزه بگیر"))
        assertNull(parse("+989121234567", "سلام، فردا میای؟"))
    }

    @Test fun duplicateHashOnlyForSameText() {
        val a = SmsIngest.hash("blu", SmsParser.normalize(bluCharge))
        assertEquals(a, SmsIngest.hash("blu", SmsParser.normalize(bluCharge.replace("200,000", "۲۰۰٬۰۰۰"))))
        assertNotEquals(a, SmsIngest.hash("blu", SmsParser.normalize(bluCharge.replace("38,553,000", "38,353,000"))))
    }
}
