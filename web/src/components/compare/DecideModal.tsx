import React, { useState, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  X,
  Award,
  CheckCircle2,
  Target,
  CreditCard,
  ShieldAlert,
  FileText,
  UserCheck,
  Lock,
  Box,
  AlertTriangle,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  Footprints,
  Clock,
} from 'lucide-react';
import { db, type CompareSession, type CompareItem, type Account, type Category } from '../../core/db';
import { Money } from '../../core/money';
import { ImpulseBrakeModal } from '../impulse/ImpulseBrakeModal';

interface LegalCheckItem {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  critical: boolean;
}

const LEGAL_CHECKS: LegalCheckItem[] = [
  {
    id: 'invoice',
    title: 'فاکتور معتبر چاپی با مهر و درج سریال',
    description: 'درج دقیق شماره سریال (IMEI / VIN / Serial Number) و مهر و امضای معتبر فروشنده/فروشگاه روی فاکتور.',
    icon: FileText,
    critical: true,
  },
  {
    id: 'test_warranty',
    title: 'مهلت تست مکتوب با حق فسخ صریح',
    description: 'قید صریح حداقل ۴۸ تا ۷۲ ساعت مهلت تست و تعهد مکتوب به استرداد کامل وجه در صورت هرگونه نقص فنی یا مغایرت.',
    icon: ShieldAlert,
    critical: true,
  },
  {
    id: 'seller_account',
    title: 'واریز منحصراً به حساب شخص فروشنده (مالک)',
    description: 'نام دارنده کارت/حساب بانکی دقیقاً با کارت شناسایی فروشنده تطبیق داده شود. هرگز به حساب شخص ثالث واریز نکنید (شگرد کلاهبرداری مثلثی).',
    icon: UserCheck,
    critical: true,
  },
  {
    id: 'ownership_transfer',
    title: 'انتقال قطعی مالکیت و خروج کامل اکانت‌ها',
    description: 'انتقال مالکیت همتا در محل (گوشی) / سند و تعویض پلاک (خودرو) / خروج کامل از iCloud، Google، BIOS Password و BitLocker.',
    icon: Lock,
    critical: true,
  },
  {
    id: 'physical_delivery',
    title: 'تحویل فیزیکی کامل کالا و متعلقات فابریک',
    description: 'دریافت جعبه فابریک با شماره سریال یکسان، شارژر و آداپتور اصلی، برگه گارانتی و کلیه متعلقات قبل از پرداخت و ترک محل.',
    icon: Box,
    critical: false,
  },
];

interface DecideModalProps {
  session: CompareSession;
  item: CompareItem;
  onClose: () => void;
  onSuccess: () => void;
}

export function DecideModal({
  session,
  item,
  onClose,
  onSuccess,
}: DecideModalProps) {
  const [decisionNote, setDecisionNote] = useState(session.decisionNote || '');
  const [actionType, setActionType] = useState<'NONE' | 'TXN' | 'GOAL'>('NONE');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number>(0);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImpulseModalOpen, setIsImpulseModalOpen] = useState(false);

  // Legal safety checklist state
  const [checkedLegal, setCheckedLegal] = useState<Record<string, boolean>>({});
  const [showLegalDetails, setShowLegalDetails] = useState(true);

  useEffect(() => {
    Promise.all([
      db.accounts.where('archived').equals(0).toArray(),
      db.categories.where('kind').equals('EXPENSE').toArray(),
    ]).then(([accs, cats]) => {
      setAccounts(accs);
      if (accs.length > 0) setSelectedAccountId(accs[0].id!);
      setCategories(cats);
      // Try to find a shopping-related category
      const shoppingCat = cats.find(c => c.name.includes('خرید') || c.name.includes('کالا'));
      if (shoppingCat) setSelectedCategoryId(shoppingCat.id!);
      else if (cats.length > 0) setSelectedCategoryId(cats[0].id!);
    });
  }, []);

  const toggleLegalCheck = (id: string) => {
    setCheckedLegal(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAllLegal = () => {
    const all: Record<string, boolean> = {};
    LEGAL_CHECKS.forEach(c => (all[c.id] = true));
    setCheckedLegal(all);
  };

  const checkedLegalCount = LEGAL_CHECKS.filter(c => checkedLegal[c.id]).length;
  const criticalUncheckedCount = LEGAL_CHECKS.filter(c => c.critical && !checkedLegal[c.id]).length;

  const handleConfirmDecision = async () => {
    setIsSubmitting(true);
    try {
      // Build summary of legal checks for note
      const legalPassed = LEGAL_CHECKS.filter(c => checkedLegal[c.id]).map(c => c.title);
      const legalNotePart = legalPassed.length > 0
        ? `\n[چک‌لیست حقوقی تایید شده: ${legalPassed.length}/${LEGAL_CHECKS.length} مورد]`
        : '';

      const finalNote = (decisionNote.trim() + legalNotePart).trim();

      // 1. Mark session as decided
      await db.compareSessions.update(session.id!, {
        status: 'DECIDED',
        chosenItemId: item.id!,
        decisionNote: finalNote || undefined,
        decidedAt: Date.now(),
        updatedAt: Date.now(),
      });

      // 2. Perform optional financial action
      if (actionType === 'TXN' && item.price && selectedAccountId) {
        await db.txns.add({
          type: 'EXPENSE',
          amount: item.price,
          accountId: selectedAccountId,
          categoryId: selectedCategoryId || undefined,
          title: `خرید ${item.name}`,
          note: finalNote || `انتخاب شده در مقایسه «${session.title}»`,
          occurredAt: Date.now(),
          source: 'MANUAL',
          createdAt: Date.now(),
        });
      } else if (actionType === 'GOAL' && item.price) {
        await db.goals.add({
          title: `خرید ${item.name}`,
          target: item.price,
          icon: 'Target',
          color: 4,
          closed: false,
          createdAt: Date.now(),
        });
      }

      onSuccess();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-md animate-fade-in p-4">
      <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-line shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-line bg-surface/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-lime/20 text-lime flex items-center justify-center">
              <Award size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">انتخاب گزینه نهایی</h2>
              <span className="text-[11px] text-muted">ثبت تصمیم و نتیجه مقایسه</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface2 border border-line flex items-center justify-center text-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Winner Item Card */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-lime/10 to-surface border border-lime/30 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-lime text-onLime flex items-center justify-center font-bold shrink-0">
              <Award size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold text-lime block">کالای برگزیده شما:</span>
              <h3 className="text-sm font-black text-white truncate">{item.name}</h3>
              {item.price && (
                <div className="text-xs font-bold text-white/90 mt-0.5">
                  {Money.toman(item.price)} تومان
                </div>
              )}
            </div>
          </div>

          {/* Legal and Handover Safety Checklist */}
          <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 overflow-hidden">
            <div
              onClick={() => setShowLegalDetails(!showLegalDetails)}
              className="p-3 bg-amber-500/15 flex items-center justify-between cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert size={16} className="text-amber-400 shrink-0" />
                <span className="text-xs font-black text-amber-200">
                  چک‌لیست حقوقی و تحویل کالا (قبل از پرداخت)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  checkedLegalCount === LEGAL_CHECKS.length
                    ? 'bg-ok/20 text-ok border border-ok/40'
                    : 'bg-amber-400/20 text-amber-300'
                }`}>
                  {checkedLegalCount} از {LEGAL_CHECKS.length}
                </span>
                {showLegalDetails ? <ChevronUp size={14} className="text-amber-300" /> : <ChevronDown size={14} className="text-amber-300" />}
              </div>
            </div>

            {showLegalDetails && (
              <div className="p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted">
                    برای جلوگیری از کلاهبرداری یا خرید مال مسروقه/معیوب، قبل از واریز بررسی کنید:
                  </p>
                  {checkedLegalCount < LEGAL_CHECKS.length && (
                    <button
                      onClick={selectAllLegal}
                      className="text-[10px] font-bold text-amber-300 hover:underline shrink-0 pr-1"
                    >
                      تایید همه
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {LEGAL_CHECKS.map(check => {
                    const isChecked = !!checkedLegal[check.id];
                    const Icon = check.icon;
                    return (
                      <div
                        key={check.id}
                        onClick={() => toggleLegalCheck(check.id)}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                          isChecked
                            ? 'bg-ok/10 border-ok/40'
                            : 'bg-surface/80 border-line hover:border-amber-500/40'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {isChecked ? (
                            <CheckSquare size={16} className="text-ok" />
                          ) : (
                            <Square size={16} className="text-muted" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Icon size={13} className={isChecked ? 'text-ok' : 'text-amber-400'} />
                            <span className={`text-xs font-bold ${isChecked ? 'text-ok' : 'text-white'}`}>
                              {check.title}
                            </span>
                            {check.critical && !isChecked && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-bad/20 text-bad font-semibold">
                                حیاتی
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted mt-1 leading-relaxed">
                            {check.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {criticalUncheckedCount > 0 && actionType === 'TXN' && (
                  <div className="p-2 rounded-xl bg-bad/15 border border-bad/30 flex items-center gap-2 text-[10px] text-bad font-bold">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>توجه: {criticalUncheckedCount} مورد حیاتی هنوز تایید نشده است! هرگز بدون فاکتور، مهلت تست و واریز به حساب مالک پول ندهید.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Decision Reason / Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-white flex items-center gap-1">
              📝 یادداشت و دلیل انتخاب شما:
            </label>
            <textarea
              rows={2}
              value={decisionNote}
              onChange={e => setDecisionNote(e.target.value)}
              placeholder="مثلاً: بهترین ترکیب قیمت و کیفیت را داشت، مهلت تست مکتوب داد و مدارک تایید شد..."
              className="w-full bg-surface2 border border-line rounded-xl p-2.5 text-xs text-white placeholder-muted focus:outline-none focus:border-lime"
            />
          </div>

          {/* Jibeman Direct Financial Actions */}
          <div className="space-y-2 pt-1 border-t border-line/50">
            <label className="text-xs font-bold text-white block">یکپارچگی با جیب من:</label>

            {/* Option 1: Just decide */}
            <div
              onClick={() => setActionType('NONE')}
              className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                actionType === 'NONE'
                  ? 'bg-white/10 border-white/40 ring-1 ring-white/20'
                  : 'bg-surface border-line'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                actionType === 'NONE' ? 'border-lime bg-lime text-onLime' : 'border-muted'
              }`}>
                {actionType === 'NONE' && <CheckCircle2 size={12} />}
              </div>
              <div className="text-xs font-medium text-white/90">
                فقط ثبت به عنوان برنده (بدون عملیات مالی)
              </div>
            </div>

            {/* Option 2: Record expense */}
            {item.price && item.price > 0 && (
              <div
                onClick={() => setActionType('TXN')}
                className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                  actionType === 'TXN'
                    ? 'bg-ok/10 border-ok/40 ring-1 ring-ok/30'
                    : 'bg-surface border-line'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  actionType === 'TXN' ? 'border-ok bg-ok text-black' : 'border-muted'
                }`}>
                  {actionType === 'TXN' && <CheckCircle2 size={12} />}
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <CreditCard size={13} className="text-ok" />
                    خریداری شد (ثبت تراکنش هزینه در حساب بانکی)
                  </div>
                  <div className="text-[10px] text-muted mt-0.5">
                    کسر مبلغ {Money.toman(item.price)} تومان از موجودی کارت
                  </div>
                </div>
              </div>
            )}

            {/* Sub-form if TXN is chosen */}
            {actionType === 'TXN' && (
              <div className="p-3 bg-surface2 rounded-xl border border-line space-y-2 text-xs">
                <div>
                  <label className="text-[10px] text-muted block mb-1">پرداخت از حساب / کارت:</label>
                  <select
                    value={selectedAccountId}
                    onChange={e => setSelectedAccountId(Number(e.target.value))}
                    className="w-full h-9 rounded-lg bg-surface border border-line text-xs text-white px-2 focus:outline-none"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-muted block mb-1">دسته‌بندی هزینه:</label>
                  <select
                    value={selectedCategoryId}
                    onChange={e => setSelectedCategoryId(Number(e.target.value))}
                    className="w-full h-9 rounded-lg bg-surface border border-line text-xs text-white px-2 focus:outline-none"
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Option 3: Add to savings goals */}
            {item.price && item.price > 0 && (
              <div
                onClick={() => setActionType('GOAL')}
                className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                  actionType === 'GOAL'
                    ? 'bg-sky/10 border-sky/40 ring-1 ring-sky/30'
                    : 'bg-surface border-line'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  actionType === 'GOAL' ? 'border-sky bg-sky text-black' : 'border-muted'
                }`}>
                  {actionType === 'GOAL' && <CheckCircle2 size={12} />}
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Target size={13} className="text-sky" />
                    قصد خرید دارم (افزودن به اهداف پس‌انداز)
                  </div>
                  <div className="text-[10px] text-muted mt-0.5">
                    ایجاد قلک پس‌انداز با مبلغ هدف {Money.toman(item.price)} تومان
                  </div>
                </div>
              </div>
            )}

            {/* Option 4: Impulse Purchase Brake (Store Exit Rule) */}
            {item.price && item.price > 0 && (
              <div
                onClick={() => setIsImpulseModalOpen(true)}
                className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15 flex items-center gap-2.5 cursor-pointer transition-all"
              >
                <div className="w-7 h-7 rounded-lg bg-amber-400 text-black flex items-center justify-center shrink-0">
                  <ShieldAlert size={16} />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    ترمز خرید هیجانی (قانون خروج از فروشگاه)
                  </div>
                  <div className="text-[10px] text-muted mt-0.5">
                    مکث ۳۰ دقیقه‌ای، بررسی احساسات و ایجاد فاصله زمانی قبل از پرداخت
                  </div>
                </div>
                <div className="text-[10px] font-bold text-amber-400 bg-amber-400/20 px-2 py-1 rounded-lg">
                  شروع ترمز
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-line bg-surface/50">
          <button
            disabled={isSubmitting}
            onClick={handleConfirmDecision}
            className="w-full h-12 rounded-2xl bg-lime text-onLime font-extrabold text-sm shadow-fab active:scale-98 transition-transform disabled:opacity-50"
          >
            {isSubmitting ? 'در حال ثبت...' : 'تایید و ثبت نهایی تصمیم'}
          </button>
        </div>

        {/* Impulse Brake Modal */}
        <ImpulseBrakeModal
          isOpen={isImpulseModalOpen}
          onClose={() => setIsImpulseModalOpen(false)}
          initialData={{
            itemTitle: item.name,
            amountRial: item.price,
            storeName: item.storeName,
            compareSessionId: session.id,
            compareItemId: item.id,
            accountId: selectedAccountId || undefined,
            categoryId: selectedCategoryId || undefined,
          }}
          onSuccess={() => {
            setIsImpulseModalOpen(false);
            onSuccess();
            onClose();
          }}
        />
      </div>
    </div>
  );
}
