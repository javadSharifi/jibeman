package ir.jibeman.core

import kotlin.math.min

object SplitConst {
    const val RIAL_PRECISION = 10L
    const val EXACT_OPTIMIZATION_LIMIT = 14
    const val METHOD_EQUAL = "EQUAL"
    const val METHOD_CUSTOM = "CUSTOM"
    const val GROUP_OPEN = "OPEN"
    const val GROUP_CLOSED = "CLOSED"
    const val ROLE_SELF = "SELF"
    const val ROLE_MEMBER = "MEMBER"
    const val MEMBER_ACTIVE = "ACTIVE"
    const val MEMBER_ARCHIVED = "ARCHIVED"
    const val INTEGRITY_VALID = "VALID"
    const val INTEGRITY_NEEDS_REVIEW = "NEEDS_REVIEW"
    const val SETTLEMENT_ACTIVE = "ACTIVE"
    const val SETTLEMENT_REVERSED = "REVERSED"
}

class SplitValidationException(
    val code: String,
    override val message: String,
) : IllegalArgumentException(message)

data class SplitMemberInput(
    val id: Long,
    val role: String,
    val status: String,
)

data class SplitExpenseInput(
    val id: Long,
    val amount: Long,
    val payerId: Long,
    val splitMethod: String,
    val integrityStatus: String,
    val isDeleted: Boolean,
)

data class SplitShareInput(
    val expenseId: Long,
    val memberId: Long,
    val amount: Long,
)

data class SplitSettlementInput(
    val id: Long,
    val fromMemberId: Long,
    val toMemberId: Long,
    val amount: Long,
    val status: String,
)

data class ExpenseDraft(
    val title: String,
    val amountRial: Long,
    val payerId: Long,
    val splitMethod: String,
    val beneficiaryIds: List<Long>,
    val customSharesByMemberId: Map<Long, Long> = emptyMap(),
    val occurredAt: Long,
    val note: String? = null,
)

data class SettlementDraft(
    val fromMemberId: Long,
    val toMemberId: Long,
    val amountRial: Long,
    val settledAt: Long,
    val idempotencyKey: String,
    val note: String? = null,
)

enum class MemberBalanceState { CREDITOR, DEBTOR, SETTLED }

data class MemberBalanceInfo(
    val memberId: Long,
    val totalPaid: Long,
    val totalShare: Long,
    val settlementsOut: Long,
    val settlementsIn: Long,
    val netBalance: Long,
    val state: MemberBalanceState,
)

data class OptimizedTransfer(
    val fromMemberId: Long,
    val toMemberId: Long,
    val amount: Long,
)

data class SettlementOptimizationInfo(
    val isExact: Boolean,
    val isGuaranteedMinimum: Boolean,
    val nonZeroMemberCount: Int,
    val transfers: List<OptimizedTransfer>,
)

data class GroupSummaryInfo(
    val totalExpenses: Long,
    val validExpenseCount: Int,
    val needsReviewCount: Int,
    val needsReviewAmount: Long,
    val totalActiveSettlements: Long,
    val totalOutstandingDebt: Long,
    val isSettled: Boolean,
    val balances: List<MemberBalanceInfo>,
    val balanceByMemberId: Map<Long, MemberBalanceInfo>,
    val optimization: SettlementOptimizationInfo,
)

object SplitEngine {
    fun assertValidPositiveRial10(amountRial: Long, fieldName: String = "مبلغ") {
        if (amountRial <= 0L) {
            throw SplitValidationException("NON_POSITIVE_AMOUNT", "$fieldName باید بیشتر از صفر باشد.")
        }
        if (amountRial % SplitConst.RIAL_PRECISION != 0L) {
            throw SplitValidationException(
                "INVALID_PRECISION",
                "$fieldName باید ضریب صحیحی از تومان (۱۰ ریال) باشد.",
            )
        }
    }

    fun assertValidNonNegativeRial10(amountRial: Long, fieldName: String = "مبلغ") {
        if (amountRial < 0L) {
            throw SplitValidationException("NEGATIVE_AMOUNT", "$fieldName نمی‌تواند منفی باشد.")
        }
        if (amountRial % SplitConst.RIAL_PRECISION != 0L) {
            throw SplitValidationException(
                "INVALID_PRECISION",
                "$fieldName باید ضریب صحیحی از تومان (۱۰ ریال) باشد.",
            )
        }
    }

    fun validateExpenseDraft(draft: ExpenseDraft, validMemberIds: Set<Long>) {
        if (draft.title.isBlank()) {
            throw SplitValidationException("EMPTY_TITLE", "عنوان هزینه الزامی است.")
        }
        assertValidPositiveRial10(draft.amountRial, "مبلغ هزینه")
        if (draft.payerId !in validMemberIds) {
            throw SplitValidationException("INVALID_PAYER", "پرداخت‌کننده انتخاب‌شده در گروه معتبر نیست.")
        }
        if (draft.beneficiaryIds.isEmpty()) {
            throw SplitValidationException("NO_BENEFICIARIES", "حداقل یک عضو باید در هزینه سهیم باشد.")
        }
        val seen = HashSet<Long>()
        for (id in draft.beneficiaryIds) {
            if (!seen.add(id)) {
                throw SplitValidationException("DUPLICATE_BENEFICIARY", "عضو تکراری در لیست سهیم‌شدگان وجود دارد.")
            }
            if (id !in validMemberIds) {
                throw SplitValidationException("INVALID_BENEFICIARY", "عضو انتخاب‌شده در گروه معتبر نیست.")
            }
        }

        when (draft.splitMethod) {
            SplitConst.METHOD_EQUAL -> Unit
            SplitConst.METHOD_CUSTOM -> {
                var total = 0L
                var positiveCount = 0
                for (id in seen) {
                    val share = draft.customSharesByMemberId[id]
                        ?: throw SplitValidationException("MISSING_CUSTOM_SHARE", "سهم همه اعضای انتخاب‌شده باید مشخص شود.")
                    assertValidNonNegativeRial10(share, "سهم عضو")
                    if (share > 0L) positiveCount++
                    total = addExact(total, share)
                }
                if (positiveCount == 0) {
                    throw SplitValidationException("ALL_ZERO_SHARES", "حداقل سهم یک عضو باید بیشتر از صفر باشد.")
                }
                if (total != draft.amountRial) {
                    throw SplitValidationException(
                        "CUSTOM_SPLIT_MISMATCH",
                        "مجموع سهم‌های دلخواه باید دقیقاً برابر با مبلغ کل هزینه باشد.",
                    )
                }
            }
            else -> throw SplitValidationException("UNSUPPORTED_SPLIT_METHOD", "روش تقسیم پشتیبانی نمی‌شود.")
        }
    }

    fun validateSettlementDraft(draft: SettlementDraft, validMemberIds: Set<Long>) {
        if (draft.idempotencyKey.isBlank()) {
            throw SplitValidationException("MISSING_IDEMPOTENCY_KEY", "کلید یکتای عملیات تسویه الزامی است.")
        }
        assertValidPositiveRial10(draft.amountRial, "مبلغ تسویه")
        if (draft.fromMemberId !in validMemberIds || draft.toMemberId !in validMemberIds) {
            throw SplitValidationException("INVALID_SETTLEMENT_MEMBER", "اعضای تسویه در گروه معتبر نیستند.")
        }
        if (draft.fromMemberId == draft.toMemberId) {
            throw SplitValidationException("SELF_SETTLEMENT", "پرداخت‌کننده و دریافت‌کننده تسویه نمی‌توانند یکسان باشند.")
        }
    }

    /**
     * Deterministic equal split at 10-Rial precision; remainder distributed by ascending memberId.
     */
    fun computeEqualShares(amountRial: Long, memberIds: List<Long>): Map<Long, Long> {
        assertValidPositiveRial10(amountRial, "مبلغ هزینه")
        if (memberIds.isEmpty()) {
            throw SplitValidationException("NO_BENEFICIARIES", "حداقل یک عضو برای تقسیم مساوی لازم است.")
        }
        val sorted = memberIds.sorted()
        for (i in 1 until sorted.size) {
            if (sorted[i] == sorted[i - 1]) {
                throw SplitValidationException("DUPLICATE_BENEFICIARY", "شناسه عضو تکراری مجاز نیست.")
            }
        }
        val count = sorted.size.toLong()
        val totalTomans = amountRial / SplitConst.RIAL_PRECISION
        val baseTomans = totalTomans / count
        val remTomans = (totalTomans % count).toInt()
        val out = LinkedHashMap<Long, Long>(sorted.size)
        sorted.forEachIndexed { index, id ->
            out[id] = (baseTomans + if (index < remTomans) 1L else 0L) * SplitConst.RIAL_PRECISION
        }
        if (out.values.sum() != amountRial) {
            throw SplitValidationException("SHARE_SUM_INVARIANT", "خطای محاسبه: مجموع سهم‌ها با مبلغ کل برابر نیست.")
        }
        return out
    }

    fun computeCustomShares(
        amountRial: Long,
        memberIds: List<Long>,
        customSharesByMemberId: Map<Long, Long>,
    ): Map<Long, Long> {
        assertValidPositiveRial10(amountRial, "مبلغ هزینه")
        if (memberIds.isEmpty()) {
            throw SplitValidationException("NO_BENEFICIARIES", "حداقل یک عضو برای تقسیم دلخواه لازم است.")
        }
        val sorted = memberIds.sorted()
        for (i in 1 until sorted.size) {
            if (sorted[i] == sorted[i - 1]) {
                throw SplitValidationException("DUPLICATE_BENEFICIARY", "شناسه عضو تکراری مجاز نیست.")
            }
        }
        var total = 0L
        var positiveCount = 0
        val out = LinkedHashMap<Long, Long>(sorted.size)
        for (id in sorted) {
            val share = customSharesByMemberId[id]
                ?: throw SplitValidationException("MISSING_CUSTOM_SHARE", "سهم همه اعضای انتخاب‌شده باید مشخص شود.")
            assertValidNonNegativeRial10(share, "سهم عضو")
            if (share > 0L) positiveCount++
            total = addExact(total, share)
            out[id] = share
        }
        if (positiveCount == 0) {
            throw SplitValidationException("ALL_ZERO_SHARES", "حداقل سهم یک عضو باید بیشتر از صفر باشد.")
        }
        if (total != amountRial) {
            throw SplitValidationException(
                "CUSTOM_SPLIT_MISMATCH",
                "مجموع سهم‌های دلخواه باید دقیقاً برابر با مبلغ کل هزینه باشد.",
            )
        }
        return out
    }

    fun computeExpenseShares(
        amountRial: Long,
        splitMethod: String,
        memberIds: List<Long>,
        customSharesByMemberId: Map<Long, Long> = emptyMap(),
    ): Map<Long, Long> = when (splitMethod) {
        SplitConst.METHOD_EQUAL -> computeEqualShares(amountRial, memberIds)
        SplitConst.METHOD_CUSTOM -> computeCustomShares(amountRial, memberIds, customSharesByMemberId)
        else -> throw SplitValidationException("UNSUPPORTED_SPLIT_METHOD", "روش تقسیم پشتیبانی نمی‌شود.")
    }

    fun calculateGroupSummary(
        members: List<SplitMemberInput>,
        expenses: List<SplitExpenseInput>,
        shares: List<SplitShareInput>,
        settlements: List<SplitSettlementInput>,
    ): GroupSummaryInfo {
        val memberIds = members.map { it.id }.sorted()
        val memberSet = memberIds.toHashSet()

        val paidBy = HashMap<Long, Long>(memberIds.size)
        val shareBy = HashMap<Long, Long>(memberIds.size)
        val outBy = HashMap<Long, Long>(memberIds.size)
        val inBy = HashMap<Long, Long>(memberIds.size)
        for (id in memberIds) {
            paidBy[id] = 0L
            shareBy[id] = 0L
            outBy[id] = 0L
            inBy[id] = 0L
        }

        val sharesByExpense = shares.groupBy { it.expenseId }
        var totalExpenses = 0L
        var validExpenseCount = 0
        var needsReviewCount = 0
        var needsReviewAmount = 0L

        for (exp in expenses) {
            if (exp.isDeleted) continue
            if (exp.integrityStatus != SplitConst.INTEGRITY_VALID || exp.payerId !in memberSet) {
                needsReviewCount++
                needsReviewAmount = addExact(needsReviewAmount, exp.amount)
                continue
            }
            val expShares = sharesByExpense[exp.id].orEmpty()
            val allValid = expShares.isNotEmpty() &&
                expShares.all { it.amount >= 0L && it.memberId in memberSet } &&
                expShares.sumOf { it.amount } == exp.amount
            if (!allValid) {
                needsReviewCount++
                needsReviewAmount = addExact(needsReviewAmount, exp.amount)
                continue
            }
            validExpenseCount++
            totalExpenses = addExact(totalExpenses, exp.amount)
            paidBy[exp.payerId] = addExact(paidBy[exp.payerId] ?: 0L, exp.amount)
            for (s in expShares) {
                shareBy[s.memberId] = addExact(shareBy[s.memberId] ?: 0L, s.amount)
            }
        }

        var totalActiveSettlements = 0L
        for (stl in settlements) {
            if (stl.status != SplitConst.SETTLEMENT_ACTIVE) continue
            if (stl.fromMemberId !in memberSet || stl.toMemberId !in memberSet) {
                throw SplitValidationException("ORPHAN_SETTLEMENT", "تسویه به عضو نامعتبر اشاره دارد.")
            }
            if (stl.fromMemberId == stl.toMemberId || stl.amount <= 0L) {
                throw SplitValidationException("INVALID_SETTLEMENT", "رکورد تسویه نامعتبر است.")
            }
            totalActiveSettlements = addExact(totalActiveSettlements, stl.amount)
            outBy[stl.fromMemberId] = addExact(outBy[stl.fromMemberId] ?: 0L, stl.amount)
            inBy[stl.toMemberId] = addExact(inBy[stl.toMemberId] ?: 0L, stl.amount)
        }

        val balances = ArrayList<MemberBalanceInfo>(memberIds.size)
        val byId = HashMap<Long, MemberBalanceInfo>(memberIds.size)
        var netSum = 0L
        var totalOutstandingDebt = 0L

        for (id in memberIds) {
            val paid = paidBy[id] ?: 0L
            val share = shareBy[id] ?: 0L
            val sOut = outBy[id] ?: 0L
            val sIn = inBy[id] ?: 0L
            val net = (paid - share) + (sOut - sIn)
            netSum = addExact(netSum, net)
            if (net > 0L) totalOutstandingDebt = addExact(totalOutstandingDebt, net)

            val state = when {
                net > 0L -> MemberBalanceState.CREDITOR
                net < 0L -> MemberBalanceState.DEBTOR
                else -> MemberBalanceState.SETTLED
            }
            val info = MemberBalanceInfo(id, paid, share, sOut, sIn, net, state)
            balances += info
            byId[id] = info
        }

        if (netSum != 0L) {
            throw SplitValidationException("ZERO_SUM_INVARIANT", "مجموع مانده اعضای گروه برابر صفر نشد.")
        }

        val optimization = optimizeSettlements(balances.map { it.memberId to it.netBalance })
        return GroupSummaryInfo(
            totalExpenses = totalExpenses,
            validExpenseCount = validExpenseCount,
            needsReviewCount = needsReviewCount,
            needsReviewAmount = needsReviewAmount,
            totalActiveSettlements = totalActiveSettlements,
            totalOutstandingDebt = totalOutstandingDebt,
            isSettled = totalOutstandingDebt == 0L && needsReviewCount == 0,
            balances = balances,
            balanceByMemberId = byId,
            optimization = optimization,
        )
    }

    fun optimizeSettlements(balances: List<Pair<Long, Long>>): SettlementOptimizationInfo {
        var sum = 0L
        val nonZero = ArrayList<Pair<Long, Long>>()
        for ((id, net) in balances) {
            sum = addExact(sum, net)
            if (net != 0L) nonZero += id to net
        }
        if (sum != 0L) {
            throw SplitValidationException("ZERO_SUM_VIOLATION", "مجموع مانده اعضای گروه صفر نیست.")
        }

        val sorted = nonZero.sortedBy { it.first }
        if (sorted.isEmpty()) {
            return SettlementOptimizationInfo(isExact = true, isGuaranteedMinimum = true, 0, emptyList())
        }

        val transfers = if (sorted.size <= SplitConst.EXACT_OPTIMIZATION_LIMIT) {
            exactOptimize(sorted)
        } else {
            greedyOptimizeFallback(sorted)
        }
        verifyTransfersZeroOut(sorted, transfers)

        val isExact = sorted.size <= SplitConst.EXACT_OPTIMIZATION_LIMIT
        return SettlementOptimizationInfo(
            isExact = isExact,
            isGuaranteedMinimum = isExact,
            nonZeroMemberCount = sorted.size,
            transfers = transfers,
        )
    }

    private fun greedySettleSubset(entries: List<Pair<Long, Long>>): List<OptimizedTransfer> {
        data class Node(val id: Long, var amount: Long)
        val creditors = entries.filter { it.second > 0L }.map { Node(it.first, it.second) }.toMutableList()
        val debtors = entries.filter { it.second < 0L }.map { Node(it.first, -it.second) }.toMutableList()
        val cmp = compareByDescending<Node> { it.amount }.thenBy { it.id }
        val out = ArrayList<OptimizedTransfer>()

        while (debtors.isNotEmpty() && creditors.isNotEmpty()) {
            debtors.sortWith(cmp)
            creditors.sortWith(cmp)
            val d = debtors.first()
            val c = creditors.first()
            val x = min(d.amount, c.amount)
            out += OptimizedTransfer(d.id, c.id, x)
            d.amount -= x
            c.amount -= x
            if (d.amount == 0L) debtors.removeAt(0)
            if (c.amount == 0L) creditors.removeAt(0)
        }
        return out
    }

    private fun exactOptimize(nonZeroSorted: List<Pair<Long, Long>>): List<OptimizedTransfer> {
        val n = nonZeroSorted.size
        val totalMasks = 1 shl n
        val maskSums = LongArray(totalMasks)
        for (mask in 1 until totalMasks) {
            val lsb = mask and -mask
            val bitIndex = Integer.numberOfTrailingZeros(lsb)
            maskSums[mask] = maskSums[mask xor lsb] + nonZeroSorted[bitIndex].second
        }

        val dp = IntArray(totalMasks)
        val firstSubset = IntArray(totalMasks)
        val minimalByLowestBit = Array(n) { ArrayList<Int>() }

        for (mask in 1 until totalMasks) {
            if (maskSums[mask] != 0L) continue
            val lsb = mask and -mask
            val lowestBit = Integer.numberOfTrailingZeros(lsb)
            val candidates = minimalByLowestBit[lowestBit]

            var bestCount = 1
            var bestSub = mask
            for (i in 0 until candidates.size) {
                val sub = candidates[i]
                if ((sub and mask) != sub) continue
                val rest = mask xor sub
                val restCount = dp[rest]
                if (restCount > 0 && 1 + restCount > bestCount) {
                    bestCount = 1 + restCount
                    bestSub = sub
                }
            }
            dp[mask] = bestCount
            firstSubset[mask] = bestSub
            if (bestCount == 1) candidates += mask
        }

        val subsets = ArrayList<List<Pair<Long, Long>>>()
        var rem = totalMasks - 1
        while (rem != 0) {
            val sub = firstSubset[rem]
            if (sub == 0) {
                throw SplitValidationException("OPTIMIZER_STATE_ERROR", "خطا در تفکیک زیرمجموعه‌های تسویه.")
            }
            val list = ArrayList<Pair<Long, Long>>()
            for (i in 0 until n) {
                if ((sub and (1 shl i)) != 0) list += nonZeroSorted[i]
            }
            subsets += list
            rem = rem xor sub
        }

        val transfers = ArrayList<OptimizedTransfer>()
        for (subset in subsets) {
            transfers += greedySettleSubset(subset)
        }
        return transfers.sortedWith(
            compareByDescending<OptimizedTransfer> { it.amount }
                .thenBy { it.fromMemberId }
                .thenBy { it.toMemberId },
        )
    }

    private fun greedyOptimizeFallback(nonZeroSorted: List<Pair<Long, Long>>): List<OptimizedTransfer> {
        val remaining = HashMap<Long, Long>(nonZeroSorted.size)
        for ((id, net) in nonZeroSorted) remaining[id] = net

        val creditors = nonZeroSorted.filter { it.second > 0L }
            .sortedWith(compareByDescending<Pair<Long, Long>> { it.second }.thenBy { it.first })
        val debtors = nonZeroSorted.filter { it.second < 0L }
            .sortedWith(compareBy<Pair<Long, Long>> { it.second }.thenBy { it.first })

        val transfers = ArrayList<OptimizedTransfer>()
        for ((cid, cVal) in creditors) {
            if ((remaining[cid] ?: 0L) <= 0L) continue
            for ((did, dVal) in debtors) {
                if ((remaining[did] ?: 0L) >= 0L) continue
                if (cVal == -dVal) {
                    transfers += OptimizedTransfer(did, cid, cVal)
                    remaining[cid] = 0L
                    remaining[did] = 0L
                    break
                }
            }
        }

        val leftover = remaining.entries
            .filter { it.value != 0L }
            .map { it.key to it.value }
            .sortedBy { it.first }
        transfers += greedySettleSubset(leftover)

        return transfers.sortedWith(
            compareByDescending<OptimizedTransfer> { it.amount }
                .thenBy { it.fromMemberId }
                .thenBy { it.toMemberId },
        )
    }

    private fun verifyTransfersZeroOut(
        balances: List<Pair<Long, Long>>,
        transfers: List<OptimizedTransfer>,
    ) {
        val map = balances.toMap().toMutableMap()
        for (t in transfers) {
            if (t.amount <= 0L || t.fromMemberId == t.toMemberId) {
                throw SplitValidationException("INVALID_TRANSFER", "تراکنش تسویه نامعتبر تولید شد.")
            }
            map[t.fromMemberId] = (map[t.fromMemberId] ?: 0L) + t.amount
            map[t.toMemberId] = (map[t.toMemberId] ?: 0L) - t.amount
        }
        if (map.values.any { it != 0L }) {
            throw SplitValidationException("TRANSFER_IMBALANCE", "اجرای تسویه‌ها مانده‌ها را صفر نمی‌کند.")
        }
    }

    private fun addExact(a: Long, b: Long): Long = try {
        Math.addExact(a, b)
    } catch (_: ArithmeticException) {
        throw SplitValidationException("OVERFLOW", "مقدار مبلغ از حد مجاز بیشتر است.")
    }
}
