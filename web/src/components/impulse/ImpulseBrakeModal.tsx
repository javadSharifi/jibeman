import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Clock,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Footprints,
  Droplets,
  HeartCrack,
  Flame,
  Megaphone,
  Users,
  RefreshCw,
  Percent,
  Sparkles,
  HelpCircle,
  Trophy,
  Target,
  CreditCard,
  Eye,
  LogOut,
  ChevronLeft,
  Coffee,
  Check,
  Bell,
  ArrowRight,
} from 'lucide-react';
import {
  db,
  type ImpulseSession,
  type PurchaseMotivation,
  type Account,
  type Category,
} from '../../core/db';
import {
  isCloudSyncActiveForInvestment,
  recordInvestmentEntry,
} from '../../core/db/investmentLedger';
import type { Asset as InvestmentAsset } from '../../core/investment';
import { Money } from '../../core/money';
import { AmountInput } from '../AmountInput';
import {
  calculateRequiredDelayMinutes,
  evaluateImpulseRisk,
  formatDelayDuration,
  formatTimeRemaining,
  requestNotificationPermission,
  sendCoolingFinishedNotification,
  MOTIVATION_LABELS,
} from '../../core/impulseEngine';

interface ImpulseBrakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: {
    itemTitle?: string;
    amountRial?: number;
    storeName?: string;
    categoryId?: number;
    accountId?: number;
    compareSessionId?: number;
    compareItemId?: number;
    purpose?: 'CONSUMPTION' | 'INVESTMENT';
    investmentAssetId?: string;
  };
  sessionId?: number | null;
  onSuccess?: (outcome: 'PURCHASED' | 'CANCELLED' | 'STARTED', session: ImpulseSession) => void;
}

type ModalStep = 'ASSESS' | 'EXIT_RULE' | 'TIMER' | 'RE_EVALUATE' | 'RESULT_CANCELLED' | 'RESULT_PURCHASED';

export function ImpulseBrakeModal({
  isOpen,
  onClose,
  initialData,
  sessionId,
  onSuccess,
}: ImpulseBrakeModalProps) {
  const [step, setStep] = useState<ModalStep>('ASSESS');
  const [activeSession, setActiveSession] = useState<ImpulseSession | null>(null);

  // Assessment Form States
  const [itemTitle, setItemTitle] = useState(initialData?.itemTitle || '');
  const [amountToman, setAmountToman] = useState(
    initialData?.amountRial ? String(Money.toToman(initialData.amountRial)) : ''
  );
  const [storeName, setStoreName] = useState(initialData?.storeName || '');
  const [motivation, setMotivation] = useState<PurchaseMotivation>('EXCITEMENT');
  const [motivationNote, setMotivationNote] = useState('');

  // 7 Emotional & Self-Check Questions
  const [isTired, setIsTired] = useState(false);
  const [isStressed, setIsStressed] = useState(false);
  const [isRushing, setIsRushing] = useState(false);
  const [isSellerPushing, setIsSellerPushing] = useState(false);
  const [isOverexcited, setIsOverexcited] = useState(true);
  const [hasResearched, setHasResearched] = useState(false);
  const [isPrePlanned, setIsPrePlanned] = useState(false);

  // Store Exit & Cooling States
  const [initialEmotionNote, setInitialEmotionNote] = useState('');
  const [intentNote, setIntentNote] = useState('');
  const [nowTime, setNowTime] = useState(Date.now());
  const [bypassDialogOpen, setBypassDialogOpen] = useState(false);
  const [bypassReason, setBypassReason] = useState('');

  // Re-evaluation Answers (7 Questions)
  const [stillNeed, setStillNeed] = useState(false);
  const [stillExcited, setStillExcited] = useState(false);
  const [badIfSkipped, setBadIfSkipped] = useState(false);
  const [alternativesChecked, setAlternativesChecked] = useState(false);
  const [priceCompared, setPriceCompared] = useState(false);
  const [sellerPressureFelt, setSellerPressureFelt] = useState(false);
  const [happyTomorrow, setHappyTomorrow] = useState(false);
  const [finalEvalNote, setFinalEvalNote] = useState('');

  // Final Txn Registration Form
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [investmentAssets, setInvestmentAssets] = useState<InvestmentAsset[]>([]);
  const [purpose, setPurpose] = useState<'CONSUMPTION' | 'INVESTMENT'>(
    initialData?.purpose ?? 'CONSUMPTION'
  );
  const [investmentAssetId, setInvestmentAssetId] = useState<string>(
    initialData?.investmentAssetId ?? ''
  );
  const [investmentQuantity, setInvestmentQuantity] = useState<string>('');
  const [selectedAccountId, setSelectedAccountId] = useState<number>(initialData?.accountId || 0);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number>(initialData?.categoryId || 0);
  const [actionChoice, setActionChoice] = useState<'TXN' | 'GOAL' | 'ONLY_RECORD'>('TXN');

  // Timer interval ref
  const timerRef = useRef<any>(null);

  // Load existing session if passed
  useEffect(() => {
    if (!isOpen) return;

    // Load accounts, categories and investment assets for possible final purchase
    Promise.all([
      db.accounts.filter(a => !a.archived).toArray(),
      db.categories.where('kind').equals('EXPENSE').toArray(),
      db.assets.filter(a => !a.archivedAt).toArray(),
    ]).then(([accList, catList, assetList]) => {
      setAccounts(accList);
      if (accList.length > 0 && !selectedAccountId) {
        setSelectedAccountId(initialData?.accountId || accList[0].id!);
      }
      setCategories(catList);
      if (catList.length > 0 && !selectedCategoryId) {
        const defaultCat = catList.find(c => c.name.includes('خرید') || c.name.includes('کالا')) || catList[0];
        setSelectedCategoryId(initialData?.categoryId || defaultCat.id!);
      }
      setInvestmentAssets(assetList);
      if (assetList.length > 0 && !investmentAssetId) {
        setInvestmentAssetId(initialData?.investmentAssetId || assetList[0].id);
      }
    });

    if (sessionId) {
      db.impulseSessions.get(sessionId).then(sess => {
        if (sess) {
          setActiveSession(sess);
          setItemTitle(sess.itemTitle);
          setAmountToman(String(Money.toToman(sess.amount)));
          setStoreName(sess.storeName || '');
          setMotivation(sess.motivation);
          setPurpose(sess.purpose ?? 'CONSUMPTION');
          setInvestmentAssetId(sess.investmentAssetId ?? '');
          setInvestmentQuantity(sess.investmentQuantity ?? '');
          setIsTired(sess.isTired);
          setIsStressed(sess.isStressed);
          setIsRushing(sess.isRushing);
          setIsSellerPushing(sess.isSellerPushing);
          setIsOverexcited(sess.isOverexcited);
          setHasResearched(sess.hasResearched);
          setIsPrePlanned(sess.isPrePlanned);

          const currentTime = Date.now();
          if (sess.status === 'COOLING_OFF') {
            if (currentTime >= sess.coolingEndsAt) {
              setStep('RE_EVALUATE');
            } else {
              setStep('TIMER');
            }
          } else if (sess.status === 'WAITING_EVAL') {
            setStep('RE_EVALUATE');
          } else if (sess.status === 'CANCELLED') {
            setStep('RESULT_CANCELLED');
          } else if (sess.status === 'PURCHASED') {
            setStep('RESULT_PURCHASED');
          }
        }
      });
    } else {
      // New session from scratch or initial data
      if (initialData) {
        if (initialData.itemTitle) setItemTitle(initialData.itemTitle);
        if (initialData.amountRial) setAmountToman(String(Money.toToman(initialData.amountRial)));
        if (initialData.storeName) setStoreName(initialData.storeName);
        if (initialData.purpose) setPurpose(initialData.purpose);
        if (initialData.investmentAssetId) setInvestmentAssetId(initialData.investmentAssetId);
      }
      setStep('ASSESS');
    }
  }, [isOpen, sessionId, initialData]);

  // Live timer tick
  useEffect(() => {
    if (step === 'TIMER' && activeSession) {
      timerRef.current = setInterval(() => {
        const cur = Date.now();
        setNowTime(cur);

        if (cur >= activeSession.coolingEndsAt) {
          clearInterval(timerRef.current);
          sendCoolingFinishedNotification(activeSession.itemTitle);
          setStep('RE_EVALUATE');
          db.impulseSessions.update(activeSession.id!, {
            status: 'WAITING_EVAL',
            updatedAt: Date.now(),
          });
        }
      }, 1000);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [step, activeSession]);

  if (!isOpen) return null;

  const currentAmountRial = Money.parseToman(amountToman) || 0;
  const riskAnalysis = evaluateImpulseRisk(
    isTired,
    isStressed,
    isRushing,
    isSellerPushing,
    isOverexcited,
    hasResearched,
    isPrePlanned,
    motivation
  );

  const calculatedDelayMinutes = calculateRequiredDelayMinutes(
    currentAmountRial,
    isTired,
    isStressed,
    isRushing,
    isSellerPushing
  );

  // Transition to Exit Rule or directly start timer
  const handleProceedToExitRule = () => {
    requestNotificationPermission().catch(() => {});
    setStep('EXIT_RULE');
  };

  // User clicks "از فروشگاه خارج شدم"
  const handleConfirmLeftStore = async () => {
    const now = Date.now();
    const durationMs = calculatedDelayMinutes * 60 * 1000;
    const coolingEndsAt = now + durationMs;

    const sessionPayload: Omit<ImpulseSession, 'id'> = {
      itemTitle: itemTitle.trim() || 'کالای مدنظر',
      amount: currentAmountRial,
      storeName: storeName.trim() || undefined,
      compareSessionId: initialData?.compareSessionId,
      compareItemId: initialData?.compareItemId,
      accountId: selectedAccountId || undefined,
      categoryId: selectedCategoryId || undefined,
      purpose,
      investmentAssetId: purpose === 'INVESTMENT' ? investmentAssetId || undefined : undefined,
      investmentQuantity: purpose === 'INVESTMENT' ? investmentQuantity.trim() || undefined : undefined,
      outcomeStatus: 'UNKNOWN',
      isTired,
      isStressed,
      isRushing,
      isSellerPushing,
      isOverexcited,
      hasResearched,
      isPrePlanned,
      motivation,
      motivationNote: motivationNote.trim() || undefined,
      leftStoreAt: now,
      requiredDelayMinutes: calculatedDelayMinutes,
      coolingStartsAt: now,
      coolingEndsAt,
      initialEmotionNote: initialEmotionNote.trim() || undefined,
      intentNote: intentNote.trim() || undefined,
      status: 'COOLING_OFF',
      createdAt: now,
      updatedAt: now,
    };

    let sId = activeSession?.id;
    if (sId) {
      await db.impulseSessions.update(sId, sessionPayload);
      const updated = await db.impulseSessions.get(sId);
      setActiveSession(updated || null);
    } else {
      sId = await db.impulseSessions.add(sessionPayload as ImpulseSession);
      const created = await db.impulseSessions.get(sId);
      setActiveSession(created || null);
    }

    setNowTime(now);
    setStep('TIMER');

    if (onSuccess && activeSession) {
      onSuccess('STARTED', activeSession);
    }
  };

  // Re-evaluation: User decides NOT to buy (Celebration & Money Saved for consumption; non-profit cancel for investment)
  const handleCancelPurchase = async () => {
    if (!activeSession) return;
    const now = Date.now();
    const isInvestment = (activeSession.purpose ?? purpose) === 'INVESTMENT';

    await db.impulseSessions.update(activeSession.id!, {
      status: 'CANCELLED',
      // Never count cancelled investment purchase as realized financial profit/savings
      savedAmount: isInvestment ? undefined : activeSession.amount,
      outcomeStatus: 'CANCELLED_INTENT',
      completedAt: now,
      updatedAt: now,
      postEval: {
        stillNeed,
        stillExcited,
        badIfSkipped,
        alternativesChecked,
        priceCompared,
        sellerPressureFelt,
        happyTomorrow,
        finalNote: finalEvalNote.trim() || undefined,
      },
    });

    const updated = await db.impulseSessions.get(activeSession.id!);
    setActiveSession(updated || null);
    setStep('RESULT_CANCELLED');

    if (onSuccess && updated) {
      onSuccess('CANCELLED', updated);
    }
  };

  // Re-evaluation: User confirms conscious purchase
  const handleFinalizePurchase = async () => {
    if (!activeSession) return;
    const now = Date.now();
    const isInvestment = (activeSession.purpose ?? purpose) === 'INVESTMENT';
    let finalTxnId: number | undefined;
    let investmentRecordId: string | undefined;
    let outcomeStatus: ImpulseSession['outcomeStatus'] = 'DECIDED_BUY';

    if (isInvestment) {
      // Investment intent NEVER creates an everyday EXPENSE transaction.
      const targetAsset = investmentAssets.find(a => a.id === (investmentAssetId || activeSession.investmentAssetId));
      const qtyStr = (investmentQuantity || activeSession.investmentQuantity || '').trim();
      const qtyNum = Number(Money.ascii(qtyStr));
      const syncBlocked = isCloudSyncActiveForInvestment();

      if (actionChoice === 'TXN' && targetAsset && Number.isFinite(qtyNum) && qtyNum > 0 && activeSession.amount > 0) {
        const res = await recordInvestmentEntry({
          assetId: targetAsset.id,
          kind: 'BUY',
          effectiveAtMs: now,
          payload: {
            quantity: Money.ascii(qtyStr),
            unit: targetAsset.baseUnit,
            fineness: targetAsset.pricingSpec.referenceFineness,
            settlementRial: String(activeSession.amount),
            costKnown: true,
            note: `خرید آگاهانه پس از مکث (${formatDelayDuration(activeSession.requiredDelayMinutes)})`,
          },
          cashLink:
            selectedAccountId && !syncBlocked
              ? { mode: 'CREATE_TXN', accountId: selectedAccountId }
              : { mode: 'NONE' },
        });
        investmentRecordId = res.recordId;
        finalTxnId = res.cashLink?.bankTxnId;
      } else if (actionChoice === 'TXN' && selectedAccountId && activeSession.amount > 0 && !syncBlocked) {
        finalTxnId = await db.txns.add({
          type: 'INVESTMENT_OUT',
          amount: activeSession.amount,
          accountId: selectedAccountId,
          title: `خرید سرمایه‌ای آگاهانه: ${activeSession.itemTitle}`,
          note: 'ثبت شده از جریان بررسی قصد سرمایه‌گذاری (نیازمند تکمیل مقدار در دفتر دارایی).',
          occurredAt: now,
          source: 'MANUAL',
          createdAt: now,
        });
        outcomeStatus = 'UNKNOWN';
      } else {
        outcomeStatus = 'UNKNOWN';
      }
    } else if (actionChoice === 'TXN' && selectedAccountId && activeSession.amount > 0) {
      finalTxnId = await db.txns.add({
        type: 'EXPENSE',
        amount: activeSession.amount,
        accountId: selectedAccountId,
        categoryId: selectedCategoryId || undefined,
        title: `خرید آگاهانه: ${activeSession.itemTitle}`,
        note: `ثبت شده پس از گذراندن ${formatDelayDuration(activeSession.requiredDelayMinutes)} ترمز خرید هیجانی.`,
        occurredAt: now,
        source: 'MANUAL',
        createdAt: now,
      });
    } else if (actionChoice === 'GOAL' && activeSession.amount > 0) {
      await db.goals.add({
        title: `خرید ${activeSession.itemTitle}`,
        target: activeSession.amount,
        icon: 'Target',
        color: 3,
        closed: false,
        createdAt: now,
      });
    } else {
      outcomeStatus = 'UNKNOWN';
    }

    await db.impulseSessions.update(activeSession.id!, {
      status: 'PURCHASED',
      purpose: isInvestment ? 'INVESTMENT' : 'CONSUMPTION',
      investmentAssetId: isInvestment ? investmentAssetId || activeSession.investmentAssetId : undefined,
      investmentRecordId,
      investmentQuantity: isInvestment ? investmentQuantity.trim() || activeSession.investmentQuantity : undefined,
      outcomeStatus,
      finalTxnId,
      completedAt: now,
      updatedAt: now,
      postEval: {
        stillNeed,
        stillExcited,
        badIfSkipped,
        alternativesChecked,
        priceCompared,
        sellerPressureFelt,
        happyTomorrow,
        finalNote: finalEvalNote.trim() || undefined,
      },
    });

    const updated = await db.impulseSessions.get(activeSession.id!);
    setActiveSession(updated || null);
    setStep('RESULT_PURCHASED');

    if (onSuccess && updated) {
      onSuccess('PURCHASED', updated);
    }
  };

  // Emergency Bypass
  const handleEmergencyBypass = async () => {
    if (!activeSession) return;
    const now = Date.now();

    await db.impulseSessions.update(activeSession.id!, {
      status: 'EMERGENCY_BYPASS',
      bypassReason: bypassReason.trim() || 'خروج اضطراری با مسئولیت کاربر',
      completedAt: now,
      updatedAt: now,
    });

    const updated = await db.impulseSessions.get(activeSession.id!);
    setActiveSession(updated || null);
    setBypassDialogOpen(false);
    setStep('RE_EVALUATE');
  };

  const remainingMs = activeSession ? Math.max(0, activeSession.coolingEndsAt - nowTime) : 0;
  const timeInfo = formatTimeRemaining(remainingMs);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-md animate-fade-in p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-sheet rounded-[32px] border border-line shadow-2xl flex flex-col overflow-hidden max-h-[92vh] relative">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-line bg-surface/80 sticky top-0 z-20 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <ShieldAlert size={20} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-black text-white">ترمز خرید هیجانی</h2>
                <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
                  خرید آگاهانه
                </span>
              </div>
              <span className="text-[11px] text-muted">مکث طلایی برای آرامش و حفظ دارایی</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface2 border border-line flex items-center justify-center text-muted hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* STEP 1: ASSESSMENT */}
          {step === 'ASSESS' && (
            <div className="space-y-4 animate-fade-in">
              {/* Product Info Inputs */}
              <div className="p-3.5 bg-surface border border-line rounded-2xl space-y-3">
                <div>
                  <label className="text-xs font-bold text-white mb-1.5 block">هدف خرید:</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPurpose('CONSUMPTION')}
                      className={`h-9 rounded-xl text-xs font-bold border transition-colors ${
                        purpose === 'CONSUMPTION'
                          ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                          : 'bg-surface2 border-line text-muted'
                      }`}
                    >
                      خرید مصرفی
                    </button>
                    <button
                      type="button"
                      onClick={() => setPurpose('INVESTMENT')}
                      className={`h-9 rounded-xl text-xs font-bold border transition-colors ${
                        purpose === 'INVESTMENT'
                          ? 'bg-lime/20 border-lime text-lime'
                          : 'bg-surface2 border-line text-muted'
                      }`}
                    >
                      هدف سرمایه‌گذاری
                    </button>
                  </div>
                </div>

                {purpose === 'INVESTMENT' && investmentAssets.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold text-white mb-1 block">دارایی سرمایه‌ای:</label>
                      <select
                        value={investmentAssetId}
                        onChange={e => setInvestmentAssetId(e.target.value)}
                        className="w-full h-10 rounded-xl bg-surface2 border border-line text-xs text-white px-2"
                      >
                        <option value="">انتخاب نشده (ثبت قصد)</option>
                        {investmentAssets.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-white mb-1 block">مقدار / وزن:</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={investmentQuantity}
                        onChange={e => setInvestmentQuantity(Money.ascii(e.target.value))}
                        placeholder="اختیاری"
                        className="w-full h-10 rounded-xl bg-surface2 border border-line text-xs text-white px-3 dir-ltr"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-white mb-1 block">نام کالا یا خرید مورد نظر:</label>
                  <input
                    type="text"
                    value={itemTitle}
                    onChange={e => setItemTitle(e.target.value)}
                    placeholder="مثلاً: کت چرم، ساعت هوشمند، کفش ورزشی..."
                    className="w-full h-11 rounded-xl bg-surface2 border border-line text-xs text-white px-3 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold text-white mb-1 block">قیمت (تومان):</label>
                    <AmountInput
                      value={amountToman}
                      onChange={setAmountToman}
                      placeholder="مثلاً ۳٫۵۰۰٫۰۰۰"
                      className="w-full h-11 rounded-xl bg-surface2 border border-line text-xs text-white px-3 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-white mb-1 block">نام فروشگاه (اختیاری):</label>
                    <input
                      type="text"
                      value={storeName}
                      onChange={e => setStoreName(e.target.value)}
                      placeholder="مثلاً: پاساژ علاءالدین"
                      className="w-full h-11 rounded-xl bg-surface2 border border-line text-xs text-white px-3 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              </div>

              {/* Motivation Selection */}
              <div>
                <label className="text-xs font-black text-white mb-2 flex items-center gap-1.5">
                  <Flame size={15} className="text-amber-400" />
                  دلیل یا انگیزه اصلی شما برای این خرید چیست؟
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(MOTIVATION_LABELS) as PurchaseMotivation[]).map(key => {
                    const info = MOTIVATION_LABELS[key];
                    const isSelected = motivation === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setMotivation(key)}
                        className={`p-2.5 rounded-xl border text-right transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500/50 ring-1 ring-amber-500/40 text-white'
                            : 'bg-surface hover:bg-surface2 border-line text-muted'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-white truncate">{info.title}</span>
                          {info.risk === 'high' && (
                            <span className="text-[9px] bg-danger/20 text-danger px-1 rounded font-bold">
                              هیجانی
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted line-clamp-2 leading-relaxed">
                          {info.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Emotional & Situation Checklist (Section 1 of Prompt) */}
              <div className="p-3.5 bg-surface border border-line rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <span className="text-xs font-black text-white flex items-center gap-1.5">
                    <Eye size={15} className="text-sky" />
                    ارزیابی شرایط احساسی و لحظه‌ای شما:
                  </span>
                  <span className="text-[10px] text-muted">صادقانه پاسخ دهید</span>
                </div>

                <div className="space-y-2 text-xs">
                  {[
                    { label: 'آیا الان احساس خستگی جسمی یا ذهنی دارم؟', value: isTired, set: setIsTired },
                    { label: 'آیا استرس، اضطراب یا فشار روانی دارم؟', value: isStressed, set: setIsStressed },
                    { label: 'آیا برای خرید عجله و شتاب دارم؟', value: isRushing, set: setIsRushing },
                    { label: 'آیا فروشنده من را به خرید فوری تشویق می‌کند؟', value: isSellerPushing, set: setIsSellerPushing },
                    { label: 'آیا به شدت از محصول هیجان‌زده و ذوق‌زده شده‌ام؟', value: isOverexcited, set: setIsOverexcited },
                    {
                      label: 'قبل از آمدن، درباره مدل و قیمت این محصول تحقیق کافی کرده‌ام؟',
                      value: hasResearched,
                      set: setHasResearched,
                      reverse: true,
                    },
                    {
                      label: 'این خرید از قبل در برنامه مالی و بودجه من پیش‌بینی شده بود؟',
                      value: isPrePlanned,
                      set: setIsPrePlanned,
                      reverse: true,
                    },
                  ].map((q, idx) => (
                    <div
                      key={idx}
                      onClick={() => q.set(!q.value)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        q.value
                          ? 'bg-amber-500/10 border-amber-500/30 text-white'
                          : 'bg-surface2/60 border-line/60 text-muted'
                      }`}
                    >
                      <span className="text-xs font-medium leading-relaxed pr-1">{q.label}</span>
                      <div
                        className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 ${
                          q.value ? 'bg-amber-400 border-amber-400 text-black' : 'border-line bg-surface'
                        }`}
                      >
                        {q.value && <Check size={13} strokeWidth={3} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dynamic Warning Alert Box */}
              {riskAnalysis.isTriggered && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-danger/20 via-surface to-surface border border-danger/40 animate-fade-in space-y-2">
                  <div className="flex items-center gap-2 text-danger font-black text-xs">
                    <AlertTriangle size={17} />
                    <span>هشدار خرید هیجانی فعال شد!</span>
                  </div>
                  <p className="text-[11px] text-white/90 leading-relaxed">
                    عواملی مانند{' '}
                    <strong className="text-amber-300 font-bold">
                      {riskAnalysis.reasons.slice(0, 3).join('، ')}
                    </strong>{' '}
                    شناسایی شدند. خرید در این وضعیت، بیشترین احتمال پشیمانی مالی را دارد.
                  </p>
                  <div className="text-[10px] text-muted flex items-center gap-1.5 pt-1 border-t border-danger/20">
                    <Clock size={12} className="text-amber-400" />
                    <span>
                      پیشنهاد سیستم:{' '}
                      <strong className="text-white">
                        {formatDelayDuration(calculatedDelayMinutes)}
                      </strong>{' '}
                      فاصله زمانی تا تصمیم‌گیری
                    </span>
                  </div>
                </div>
              )}

              {/* Proceed Button */}
              <button
                disabled={!itemTitle.trim()}
                onClick={handleProceedToExitRule}
                className="w-full h-12 rounded-2xl bg-amber-400 hover:bg-amber-300 text-black font-black text-sm shadow-fab active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <span>ادامه و اجرای قانون خروج از فروشگاه</span>
                <ChevronLeft size={18} />
              </button>
            </div>
          )}

          {/* STEP 2: STORE EXIT RULE (Section 2 & 6 of Prompt) */}
          {step === 'EXIT_RULE' && (
            <div className="space-y-4 animate-fade-in">
              {/* Big Warning Callout */}
              <div className="p-4 rounded-3xl bg-gradient-to-b from-amber-500/20 via-surface to-surface border border-amber-500/40 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-amber-400 text-black flex items-center justify-center mx-auto shadow-lg shadow-amber-400/20">
                  <Footprints size={28} />
                </div>
                <h3 className="text-base font-black text-white">قانون خروج از فروشگاه (Store Exit Rule)</h3>
                <div className="p-3.5 bg-black/40 rounded-2xl border border-amber-500/30 text-amber-200 font-bold text-xs leading-relaxed text-right">
                  «الان خرید نکن! از فروشگاه خارج شو و حداقل ۳۰ دقیقه به خودت فرصت بده. قرار نیست امروز حتماً خرید کنی. اگر این محصول واقعاً ارزش خرید داشته باشد، بعد از ۳۰ دقیقه هم می‌توانی درباره آن تصمیم بگیری.»
                </div>
              </div>

              {/* 4 Steps to take right now */}
              <div className="p-3.5 bg-surface border border-line rounded-2xl space-y-2.5">
                <span className="text-xs font-bold text-white block mb-1">
                  در این مدت ۳۰ دقیقه چه کارهایی انجام بدهم؟
                </span>
                <div className="space-y-2 text-xs text-white/90">
                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-danger/20 text-danger flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-bold">
                      ۱
                    </div>
                    <span>هیچ پرداخت، بیعانه یا تعهد خریدی انجام نده.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-bold">
                      ۲
                    </div>
                    <span>از محیط فروشگاه، صحبت‌های فروشنده و فضای هیجانی کاملاً فاصله بگیر.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-sky/20 text-sky flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-bold">
                      ۳
                    </div>
                    <span>قدم بزن، یک لیوان آب خنک بنوش و ذهنت را آرام کن.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-lime/20 text-lime flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-bold">
                      ۴
                    </div>
                    <span>پس از پایان تایمر، دوباره با آرامش تصمیمت را ارزیابی کن.</span>
                  </div>
                </div>
              </div>

              {/* Initial Emotion & Intent Note */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white flex items-center gap-1.5">
                  ✍️ یادداشت اولیه: چرا الان قصد خرید داری؟ (احساس یا عجله‌ات را بنویس)
                </label>
                <textarea
                  rows={2}
                  value={intentNote}
                  onChange={e => setIntentNote(e.target.value)}
                  placeholder="مثلاً: فروشنده گفت این آخرین عدد است و فردا گران می‌شود..."
                  className="w-full bg-surface2 border border-line rounded-xl p-2.5 text-xs text-white placeholder-muted focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Big Action Button (Section 6) */}
              <button
                onClick={handleConfirmLeftStore}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 hover:brightness-105 text-black font-black text-sm shadow-fab active:scale-98 transition-all flex items-center justify-center gap-2.5"
              >
                <Footprints size={20} />
                <span>از فروشگاه خارج شدم (شروع فرصت طلایی ۳۰ دقیقه‌ای)</span>
              </button>

              <button
                type="button"
                onClick={() => setStep('ASSESS')}
                className="w-full text-center text-xs text-muted hover:text-white pt-1"
              >
                بازگشت به ارزیابی اولیه
              </button>
            </div>
          )}

          {/* STEP 3: COOLING TIMER VIEW (Section 3 of Prompt) */}
          {step === 'TIMER' && activeSession && (
            <div className="space-y-4 animate-fade-in text-center">
              {/* Product Info Card during wait */}
              <div className="p-3 bg-surface border border-line rounded-2xl text-right flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-muted block">کالای در حال بررسی:</span>
                  <span className="text-xs font-black text-white">{activeSession.itemTitle}</span>
                  {activeSession.storeName && (
                    <span className="text-[10px] text-muted block mt-0.5">فروشگاه: {activeSession.storeName}</span>
                  )}
                </div>
                {activeSession.amount > 0 && (
                  <div className="text-left">
                    <span className="text-[10px] text-muted block">مبلغ:</span>
                    <span className="text-xs font-bold text-amber-400">
                      {Money.toman(activeSession.amount)} تومان
                    </span>
                  </div>
                )}
              </div>

              {/* Countdown Circular Visual Display */}
              <div className="py-6 px-4 rounded-3xl bg-gradient-to-b from-amber-500/10 via-surface to-surface border border-amber-500/30 flex flex-col items-center justify-center space-y-3">
                <div className="w-16 h-16 rounded-3xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 animate-pulse">
                  <Clock size={32} />
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold text-muted">زمان باقی‌مانده تا تصمیم‌گیری:</span>
                  <div className="text-3xl font-black text-white font-mono tracking-wider dir-ltr">
                    {String(timeInfo.hours).padStart(2, '0')}:{String(timeInfo.minutes).padStart(2, '0')}:
                    {String(timeInfo.seconds).padStart(2, '0')}
                  </div>
                </div>

                <p className="text-[11px] text-amber-200/90 max-w-xs leading-relaxed">
                  ذهنت را از خرید آزاد کن. اگر برنامه را ببندی، زمان همچنان به درستی ثبت و محاسبه خواهد شد.
                </p>
              </div>

              {/* Calming Action Suggestions */}
              <div className="grid grid-cols-3 gap-2 text-right">
                <div className="p-2.5 rounded-xl bg-surface border border-line text-center space-y-1">
                  <Droplets size={18} className="text-sky mx-auto" />
                  <span className="text-[11px] font-bold text-white block">آب بنوشید</span>
                  <span className="text-[9px] text-muted block">کاهش آدرنالین</span>
                </div>
                <div className="p-2.5 rounded-xl bg-surface border border-line text-center space-y-1">
                  <Footprints size={18} className="text-lime mx-auto" />
                  <span className="text-[11px] font-bold text-white block">قدم بزنید</span>
                  <span className="text-[9px] text-muted block">خروج از جو فروشگاه</span>
                </div>
                <div className="p-2.5 rounded-xl bg-surface border border-line text-center space-y-1">
                  <Coffee size={18} className="text-amber-400 mx-auto" />
                  <span className="text-[11px] font-bold text-white block">آرامش ذهن</span>
                  <span className="text-[9px] text-muted block">تنفس عمیق</span>
                </div>
              </div>

              {/* Locked Purchase Notice (Mandatory limitation) */}
              <div className="p-3 rounded-xl bg-surface2/80 border border-line text-center">
                <span className="text-xs font-bold text-muted flex items-center justify-center gap-1.5">
                  <ShieldAlert size={14} className="text-amber-400" />
                  دکمه ثبت خرید تا پایان زمان انتظار قفل است
                </span>
              </div>

              {/* If time finished, direct button to Re-evaluate */}
              {timeInfo.isFinished ? (
                <button
                  onClick={() => setStep('RE_EVALUATE')}
                  className="w-full h-12 rounded-2xl bg-lime hover:bg-lime/90 text-onLime font-black text-sm shadow-fab active:scale-98 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={18} />
                  <span>زمان تمام شد! ارزیابی مجدد خرید</span>
                </button>
              ) : (
                <div className="pt-2 flex flex-col items-center gap-2">
                  <button
                    onClick={() => setBypassDialogOpen(true)}
                    className="text-xs text-muted/80 hover:text-white underline underline-offset-4 transition-colors"
                  >
                    خروج اضطراری از فرایند (در صورت ضرورت مبرم)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: RE-EVALUATION (Section 4 of Prompt) */}
          {step === 'RE_EVALUATE' && activeSession && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-lime/10 via-surface to-surface border border-lime/30 space-y-1">
                <div className="flex items-center gap-2 text-lime font-black text-xs">
                  <Sparkles size={16} />
                  <span>زمان تفکر و آرامش سپری شد!</span>
                </div>
                <p className="text-[11px] text-white/90 leading-relaxed">
                  اکنون با ذهن شفاف و دور از هیجان فروشگاه، به این ۷ سؤال پاسخ دهید تا بهترین تصمیم گرفته شود:
                </p>
              </div>

              {/* 7 Re-eval Questions */}
              <div className="space-y-2 text-xs">
                {[
                  { label: '۱. آیا هنوز احساس نیاز واقعی به این کالا دارم؟', value: stillNeed, set: setStillNeed },
                  {
                    label: '۲. آیا هنوز همان هیجان و ذوق اولیه را نسبت به خرید دارم؟',
                    value: stillExcited,
                    set: setStillExcited,
                  },
                  {
                    label: '۳. آیا اگر امروز نخرم، واقعاً اتفاق بدی می‌افتد؟',
                    value: badIfSkipped,
                    set: setBadIfSkipped,
                  },
                  {
                    label: '۴. آیا گزینه‌های جایگزین یا کارکرده تمیز را بررسی کرده‌ام؟',
                    value: alternativesChecked,
                    set: setAlternativesChecked,
                  },
                  {
                    label: '۵. آیا قیمت را در دیجی‌کالا، ترب یا فروشگاه دیگر مقایسه کرده‌ام؟',
                    value: priceCompared,
                    set: setPriceCompared,
                  },
                  {
                    label: '۶. آیا فروشنده تلاش می‌کرد من را تحت فشار بگذارد؟',
                    value: sellerPressureFelt,
                    set: setSellerPressureFelt,
                  },
                  {
                    label: '۷. اگر فردا صبح از خواب بیدار شوم، باز هم از این خرید کاملاً راضی خواهم بود؟',
                    value: happyTomorrow,
                    set: setHappyTomorrow,
                  },
                ].map((q, idx) => (
                  <div
                    key={idx}
                    onClick={() => q.set(!q.value)}
                    className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      q.value
                        ? 'bg-lime/10 border-lime/40 text-white'
                        : 'bg-surface2/60 border-line/60 text-muted'
                    }`}
                  >
                    <span className="text-xs font-medium leading-relaxed pr-1">{q.label}</span>
                    <div
                      className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 ${
                        q.value ? 'bg-lime border-lime text-black' : 'border-line bg-surface'
                      }`}
                    >
                      {q.value && <Check size={13} strokeWidth={3} />}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white">یادداشت نهایی تصمیم (اختیاری):</label>
                <input
                  type="text"
                  value={finalEvalNote}
                  onChange={e => setFinalEvalNote(e.target.value)}
                  placeholder="مثلاً: متوجه شدم نیازم فوری نیست یا قیمت ترب ارزان‌تر بود..."
                  className="w-full h-10 rounded-xl bg-surface2 border border-line text-xs text-white px-3 focus:outline-none focus:border-lime"
                />
              </div>

              {/* Two Decisive Outcome Actions */}
              <div className="pt-2 space-y-2">
                {/* 1. Cancel Purchase (Saving money!) */}
                <button
                  onClick={handleCancelPurchase}
                  className="w-full h-13 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:brightness-105 text-black font-black text-sm shadow-fab active:scale-98 transition-all flex items-center justify-center gap-2"
                >
                  <Trophy size={18} />
                  <span>منصرف شدم! ذخیره {Money.toman(activeSession.amount)} تومان در جیب من 🎉</span>
                </button>

                {/* 2. Confirm Conscious Purchase */}
                <div className="p-3 bg-surface border border-line rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">هنوز قصد خرید قطعی دارید؟</span>
                    <button
                      onClick={handleFinalizePurchase}
                      className="px-3 py-1.5 rounded-xl bg-lime hover:bg-lime/90 text-onLime font-extrabold text-xs active:scale-95 transition-all"
                    >
                      تأیید خرید آگاهانه
                    </button>
                  </div>

                  {/* Financial destination */}
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-line">
                    <div>
                      <label className="text-[10px] text-muted block mb-1">کسر از حساب:</label>
                      <select
                        value={selectedAccountId}
                        onChange={e => setSelectedAccountId(Number(e.target.value))}
                        className="w-full h-8 rounded-lg bg-surface2 border border-line text-xs text-white px-2 focus:outline-none"
                      >
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-muted block mb-1">دسته‌بندی:</label>
                      <select
                        value={selectedCategoryId}
                        onChange={e => setSelectedCategoryId(Number(e.target.value))}
                        className="w-full h-8 rounded-lg bg-surface2 border border-line text-xs text-white px-2 focus:outline-none"
                      >
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: RESULT CANCELLED (Celebration!) */}
          {step === 'RESULT_CANCELLED' && activeSession && (
            <div className="py-6 text-center space-y-4 animate-fade-in">
              <div className="w-20 h-20 rounded-3xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto shadow-2xl">
                <Trophy size={42} />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-white">تبریک به اراده و هوش مالی شما! 🎉</h3>
                <p className="text-xs text-muted max-w-xs mx-auto leading-relaxed">
                  با ایجاد فاصله زمانی و خروج از جو هیجانی فروشگاه، مانع از یک هزینه غیرضروری شدید.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-surface border border-emerald-500/30 max-w-xs mx-auto space-y-1">
                {(activeSession.purpose ?? purpose) === 'INVESTMENT' ? (
                  <>
                    <span className="text-[11px] text-muted block">تصمیم سرمایه‌گذاری:</span>
                    <span className="text-xs font-bold text-emerald-300 block">
                      انصراف ثبت شد (لغو خرید سود مالی محقق‌شده محسوب نمی‌شود)
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[11px] text-muted block">مبلغ ذخیره شده در حساب شما:</span>
                    <span className="text-xl font-black text-emerald-400">
                      {Money.toman(activeSession.amount)} تومان
                    </span>
                  </>
                )}
              </div>

              <button
                onClick={onClose}
                className="w-full h-12 rounded-2xl bg-surface2 border border-line text-white font-bold text-xs hover:bg-white/10 transition-colors"
              >
                بستن و ثبت در تاریخچه صرفه‌جویی
              </button>
            </div>
          )}

          {/* STEP 6: RESULT PURCHASED */}
          {step === 'RESULT_PURCHASED' && activeSession && (
            <div className="py-6 text-center space-y-4 animate-fade-in">
              <div className="w-20 h-20 rounded-3xl bg-lime/20 text-lime border border-lime/40 flex items-center justify-center mx-auto shadow-2xl">
                <CheckCircle2 size={42} />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-white">خرید آگاهانه با موفقیت ثبت شد</h3>
                <p className="text-xs text-muted max-w-xs mx-auto leading-relaxed">
                  شما این خرید را با تفکر، بررسی و بدون جو هیجانی انجام دادید. مبارکتان باشد!
                </p>
              </div>

              <button
                onClick={onClose}
                className="w-full h-12 rounded-2xl bg-lime text-onLime font-black text-xs hover:bg-lime/90 transition-colors"
              >
                متوجه شدم و بازگشت
              </button>
            </div>
          )}
        </div>

        {/* Emergency Bypass Sub-Dialog */}
        {bypassDialogOpen && (
          <div className="absolute inset-0 z-30 bg-black/90 backdrop-blur-md p-6 flex flex-col justify-center animate-fade-in text-right space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-danger/20 text-danger flex items-center justify-center mx-auto">
              <AlertTriangle size={24} />
            </div>

            <div className="space-y-1 text-center">
              <h4 className="text-sm font-black text-white">خروج اضطراری از تایمر ترمز</h4>
              <p className="text-[11px] text-muted max-w-xs mx-auto leading-relaxed">
                این قابلیت برای محافظت از دارایی شماست. اگر دلیل موجهی دارید، می‌توانید با ذکر دلیل ادامه دهید:
              </p>
            </div>

            <input
              type="text"
              value={bypassReason}
              onChange={e => setBypassReason(e.target.value)}
              placeholder="دلیل ضرورت خرید فوری چیست؟"
              className="w-full h-11 rounded-xl bg-surface border border-line text-xs text-white px-3 focus:outline-none focus:border-danger"
            />

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => setBypassDialogOpen(false)}
                className="h-11 rounded-xl bg-surface2 border border-line text-xs font-bold text-white"
              >
                انصراف و ادامه تایمر
              </button>
              <button
                onClick={handleEmergencyBypass}
                className="h-11 rounded-xl bg-danger text-white font-black text-xs"
              >
                تأیید خروج اضطراری
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
