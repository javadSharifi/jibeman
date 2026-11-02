package ir.jibeman.core

import ir.jibeman.R

/**
 * Iranian banks with brand colors, logos, card prefixes, and IBAN codes
 * ported from the `iran-bankit` dataset.
 */
data class Bank(
    val code: String,
    val name: String,
    val color: Long,
    val gradientEnd: Long = color,
    val logoRes: Int? = null,
    val cardPrefixes: List<String> = emptyList(),
    val ibanCodes: List<String> = emptyList(),
) {
    val letter get() = name.first().toString()
}

object Banks {
    val all: List<Bank> = listOf(
        Bank("mellat", "ملت", 0xFFC8102E, 0xFF8B0014, R.drawable.ic_bank_mellat, listOf("610433", "991975"), listOf("012")),
        Bank("blu", "بلو", 0xFF1F5FD6, 0xFF0E3EA3, R.drawable.ic_bank_blu, listOf("62198618", "62198619")),
        Bank("keshavarzi", "کشاورزی", 0xFF1C7A4B, 0xFF0E4A2C, R.drawable.ic_bank_keshavarzi, listOf("603770", "639217"), listOf("016")),
        Bank("melli", "ملی", 0xFF0B4F9C, 0xFF052B58, R.drawable.ic_bank_melli, listOf("603799", "636214"), listOf("017", "062")),
        Bank("saderat", "صادرات", 0xFF1A3D8F, 0xFF0C2154, R.drawable.ic_bank_saderat, listOf("603769"), listOf("019")),
        Bank("tejarat", "تجارت", 0xFF1B4B9B, 0xFF0D295C, R.drawable.ic_bank_tejarat, listOf("627353", "585983"), listOf("018")),
        Bank("sepah", "سپه", 0xFFB07D00, 0xFF6D4E00, R.drawable.ic_bank_sepah, listOf("589210", "639370", "505801", "636949", "627381", "639599"), listOf("015", "063", "065")),
        Bank("saman", "سامان", 0xFF0A6EBD, 0xFF053E6D, R.drawable.ic_bank_saman, listOf("621986"), listOf("056")),
        Bank("pasargad", "پاسارگاد", 0xFFB8860B, 0xFF4A3700, R.drawable.ic_bank_pasargad, listOf("502229", "639347"), listOf("057")),
        Bank("parsian", "پارسیان", 0xFF8B1D2C, 0xFF4D0C15, R.drawable.ic_bank_parsian, listOf("622106", "639194", "627884"), listOf("054")),
        Bank("maskan", "مسکن", 0xFFE65100, 0xFF8A3000, R.drawable.ic_bank_maskan, listOf("628023"), listOf("014")),
        Bank("refah", "رفاه", 0xFF00796B, 0xFF00433C, R.drawable.ic_bank_refah, listOf("589463"), listOf("013")),
        Bank("eghtesad", "اقتصاد نوین", 0xFF6A1B9A, 0xFF3E0A5D, R.drawable.ic_bank_eghtesad, listOf("627412"), listOf("055")),
        Bank("ayandeh", "آینده", 0xFF5D4037, 0xFF32221D, R.drawable.ic_bank_ayandeh, listOf("636214"), listOf("062")),
        Bank("resalat", "رسالت", 0xFF00838F, 0xFF00484F, R.drawable.ic_bank_resalat, listOf("504172"), listOf("070")),
        Bank("shahr", "شهر", 0xFFC62828, 0xFF6B1111, R.drawable.ic_bank_shahr, listOf("502806", "504706"), listOf("061")),
        Bank("post", "پست بانک", 0xFF2E7D32, 0xFF144717, R.drawable.ic_bank_post, listOf("627760"), listOf("021")),
        Bank("sina", "سینا", 0xFF1565C0, 0xFF0A3668, R.drawable.ic_bank_sina, listOf("639346"), listOf("059")),
        Bank("mehr", "مهر ایران", 0xFF2E7D32, 0xFF154418, R.drawable.ic_bank_mehr, listOf("606373"), listOf("060")),
        Bank("dey", "دی", 0xFF4A148C, 0xFF27054E, R.drawable.ic_bank_dey, listOf("502938"), listOf("066")),
        Bank("karafarin", "کارآفرین", 0xFF1B5E20, 0xFF0A3310, R.drawable.ic_bank_karafarin, listOf("627488", "502910"), listOf("053")),
        Bank("sarmaye", "سرمایه", 0xFF0288D1, 0xFF014B74, R.drawable.ic_bank_sarmaye, listOf("639607"), listOf("058")),
        Bank("gardeshgari", "گردشگری", 0xFF3E2723, 0xFF1F1210, R.drawable.ic_bank_gardeshgari, listOf("505416"), listOf("064")),
        Bank("iranzamin", "ایران زمین", 0xFF512DA8, 0xFF281358, R.drawable.ic_bank_iranzamin, listOf("505785"), listOf("069")),
        Bank("tosetaavon", "توسعه تعاون", 0xFF00695C, 0xFF003831, R.drawable.ic_bank_tosetaavon, listOf("502908"), listOf("022")),
        Bank("tosesaderat", "توسعه صادرات", 0xFF0D47A1, 0xFF05214E, R.drawable.ic_bank_tosesaderat, listOf("627648", "207177"), listOf("020")),
        Bank("sanatmadan", "صنعت و معدن", 0xFF8D6E63, 0xFF48352F, R.drawable.ic_bank_sanatmadan, listOf("627961"), listOf("011")),
        Bank("markazi", "مرکزی", 0xFF0D233A, 0xFF050F1A, R.drawable.ic_bank_markazi, listOf("636795"), listOf("010")),
        Bank("other", "سایر", 0xFF3A3FAE, 0xFF1C206B, null, emptyList(), emptyList()),
    )

    private val prefixMap: Map<String, Bank> by lazy {
        val map = mutableMapOf<String, Bank>()
        all.forEach { bank ->
            bank.cardPrefixes.forEach { prefix ->
                map[prefix] = bank
            }
        }
        map
    }

    private val sortedPrefixes: List<String> by lazy {
        prefixMap.keys.sortedByDescending { it.length }
    }

    private val ibanMap: Map<String, Bank> by lazy {
        val map = mutableMapOf<String, Bank>()
        all.forEach { bank ->
            bank.ibanCodes.forEach { code ->
                if (!map.containsKey(code)) map[code] = bank
            }
        }
        map
    }

    fun of(code: String?): Bank? = all.firstOrNull { it.code == code }

    /**
     * Matches prefix by length descending (8-digit Blu matches before 6-digit Saman).
     */
    fun findByCardPrefix(digits: String): Bank? {
        for (prefix in sortedPrefixes) {
            if (digits.startsWith(prefix)) return prefixMap[prefix]
        }
        return null
    }

    fun findByIbanCode(code: String): Bank? = ibanMap[code]
}
