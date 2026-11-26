import React, { useState, useEffect } from 'react';
import { AmountInput } from '../components/AmountInput';
import { Plus, X, HandCoins, ArrowDownLeft, ArrowUpRight, Pencil, Trash2, Calendar } from 'lucide-react';
import { db, type Debt, type Account } from '../core/db';
import { Money } from '../core/money';
import { Jalali } from '../core/jalali';
import { HeaderBar } from '../components/UI';
import { Select } from '../components/Select';

interface DebtWithRemaining extends Debt {
  remaining: number;
  paid: number;
}

export function Debts({ onBack, hidden }: { onBack: () => void; hidden: boolean }) {
  const [direction, setDirection] = useState<'OWED_TO_ME' | 'I_OWE'>('OWED_TO_ME');
  const [debts, setDebts] = useState<DebtWithRemaining[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<DebtWithRemaining | null>(null);
  const [deleteTargetDebt, setDeleteTargetDebt] = useState<DebtWithRemaining | null>(null);
  const [payTargetDebt, setPayTargetDebt] = useState<DebtWithRemaining | null>(null);

  // Form states
  const nowJ = Jalali.of(Date.now());
  const [formDirection, setFormDirection] = useState<'OWED_TO_ME' | 'I_OWE'>('OWED_TO_ME');
  const [person, setPerson] = useState('');
  const [amountToman, setAmountToman] = useState('');
  const [note, setNote] = useState('');
  const [hasDueDate, setHasDueDate] = useState(true);
  const [dueYear, setDueYear] = useState(nowJ.y);
  const [dueMonth, setDueMonth] = useState(nowJ.m);
  const [dueDay, setDueDay] = useState(nowJ.d);

  // Payment modal states
  const [payAmountToman, setPayAmountToman] = useState('');
  const [selectedAccId, setSelectedAccId] = useState<number | undefined>();

  const loadDebts = async () => {
    const [allDebts, allPayments, allAccs] = await Promise.all([
      db.debts.where('direction').equals(direction).toArray(),
      db.debtPayments.toArray(),
      db.accounts.filter(a => !a.archived).toArray(),
    ]);
    setAccounts(allAccs);
    if (allAccs.length > 0 && !selectedAccId) setSelectedAccId(allAccs[0].id);

    const withRem: DebtWithRemaining[] = allDebts
      .map(d => {
        const pmts = allPayments.filter(p => p.debtId === d.id);
        const paid = pmts.reduce((acc, p) => acc + p.amount, 0);
        return {
          ...d,
          paid,
          remaining: Math.max(0, d.amount - paid),
        };
      })
      .sort((a, b) => {
        const aDone = a.remaining === 0 ? 1 : 0;
        const bDone = b.remaining === 0 ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        if (a.dueAt != null && b.dueAt != null) return a.dueAt - b.dueAt;
        if (a.dueAt != null) return -1;
        if (b.dueAt != null) return 1;
        return b.createdAt - a.createdAt;
      });
    setDebts(withRem);
  };

  useEffect(() => {
    loadDebts();
  }, [direction]);

  const applyDateFromMillis = (ms: number) => {
    const j = Jalali.of(ms);
    setDueYear(j.y);
    setDueMonth(j.m);
    setDueDay(j.d);
    setHasDueDate(true);
  };

  const getComputedDueMillis = (): number | undefined => {
    if (!hasDueDate) return undefined;
    const safeYear = Number.isFinite(dueYear) && dueYear >= 1300 && dueYear <= 1500 ? dueYear : nowJ.y;
    const safeMonth = Math.max(1, Math.min(12, dueMonth || nowJ.m));
    const maxD = Jalali.monthDays(safeYear, safeMonth);
    const safeDay = Math.max(1, Math.min(maxD, dueDay || 1));
    return Jalali.millis(safeYear, safeMonth, safeDay);
  };

  const openAddModal = () => {
    setEditingDebt(null);
    setFormDirection(direction);
    setPerson('');
    setAmountToman('');
    setNote('');
    applyDateFromMillis(Date.now());
    setIsFormOpen(true);
  };

  const openEditModal = (d: DebtWithRemaining) => {
    setEditingDebt(d);
    setFormDirection(d.direction);
    setPerson(d.person);
    setAmountToman(Money.tomanInput(d.amount));
    setNote(d.note || '');
    if (d.dueAt != null) {
      applyDateFromMillis(d.dueAt);
    } else {
      const cur = Jalali.of(Date.now());
      setDueYear(cur.y);
      setDueMonth(cur.m);
      setDueDay(cur.d);
      setHasDueDate(false);
    }
    setIsFormOpen(true);
  };

  const handleSaveDebt = async () => {
    const amt = Money.parseToman(amountToman);
    if (!person.trim() || !amt) {
      alert('لطفاً نام شخص و مبلغ را وارد کنید');
      return;
    }

    if (editingDebt && amt < editingDebt.paid) {
      alert(`مبلغ کل نمی‌تواند کمتر از مبلغ پرداخت‌شده قبلی (${Money.toman(editingDebt.paid)} تومان) باشد.`);
      return;
    }

    const dueAt = getComputedDueMillis();

    if (editingDebt?.id != null) {
      await db.debts.update(editingDebt.id, {
        direction: formDirection,
        person: person.trim(),
        amount: amt,
        dueAt,
        note: note.trim() || undefined,
      });
    } else {
      await db.debts.add({
        direction: formDirection,
        person: person.trim(),
        amount: amt,
        dueAt,
        note: note.trim() || undefined,
        createdAt: Date.now(),
      });
    }

    setIsFormOpen(false);
    setEditingDebt(null);
    setPerson('');
    setAmountToman('');
    setNote('');
    loadDebts();
  };

  const handleDeleteDebt = async (debt: DebtWithRemaining) => {
    if (debt.id == null) return;
    await db.transaction('rw', [db.debts, db.debtPayments, db.outbox], async () => {
      await db.debtPayments.where('debtId').equals(debt.id!).delete();
      await db.debts.delete(debt.id!);
    });
    setDeleteTargetDebt(null);
    loadDebts();
  };

  const handleAddPayment = async () => {
    if (!payTargetDebt) return;
    const rial = Money.parseToman(payAmountToman);
    if (!rial || rial > payTargetDebt.remaining) {
      alert('مبلغ پرداخت باید بیشتر از صفر و حداکثر برابر با مانده باشد.');
      return;
    }
    const incoming = payTargetDebt.direction === 'OWED_TO_ME';

    let txnId: number | undefined;
    if (selectedAccId) {
      txnId = await db.txns.add({
        type: 'DEBT',
        amount: incoming ? rial : -rial,
        accountId: selectedAccId,
        title: incoming ? `وصول طلب از ${payTargetDebt.person}` : `پرداخت بدهی به ${payTargetDebt.person}`,
        occurredAt: Date.now(),
        source: 'MANUAL',
        createdAt: Date.now(),
      });
    }

    await db.debtPayments.add({
      debtId: payTargetDebt.id!,
      amount: rial,
      at: Date.now(),
      txnId,
    });

    setPayTargetDebt(null);
    setPayAmountToman('');
    loadDebts();
  };

  const computedDueAt = getComputedDueMillis();
  const todayStart = Jalali.dayStart(Date.now());

  return (
    <div className="flex flex-col pb-28 pt-2 px-4 max-w-md mx-auto">
      <HeaderBar
        title="بدهی و طلب"
        onBack={onBack}
        action={
          <button
            onClick={openAddModal}
            aria-label="افزودن بدهی یا طلب"
            className="w-10 h-10 rounded-2xl bg-lime text-onLime flex items-center justify-center shadow-fab"
          >
            <Plus size={20} strokeWidth={2.8} />
          </button>
        }
      />

      {/* Direction Segment Switcher */}
      <div className="flex bg-surface rounded-2xl p-1 gap-1 my-3">
        <button
          onClick={() => setDirection('OWED_TO_ME')}
          className={`flex-1 h-10 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            direction === 'OWED_TO_ME' ? 'bg-lime text-onLime shadow' : 'text-t2'
          }`}
        >
          <ArrowDownLeft size={16} />
          طلب‌های من (بستانکار)
        </button>
        <button
          onClick={() => setDirection('I_OWE')}
          className={`flex-1 h-10 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            direction === 'I_OWE' ? 'bg-lime text-onLime shadow' : 'text-t2'
          }`}
        >
          <ArrowUpRight size={16} />
          بدهی‌های من (بدهکار)
        </button>
      </div>

      {/* Debts list */}
      <div className="space-y-3 mt-2">
        {debts.map(d => {
          const isDone = d.remaining === 0;
          const isOverdue = !isDone && d.dueAt != null && Jalali.dayStart(d.dueAt) < todayStart;
          return (
            <div key={d.id} className="p-4 rounded-[22px] bg-surface border border-line space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center ${
                    direction === 'OWED_TO_ME' ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn'
                  }`}>
                    <HandCoins size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white truncate">{d.person}</h3>
                    <div className={`text-[11px] mt-0.5 ${
                      isDone ? 'text-ok' : isOverdue ? 'text-bad font-semibold' : 'text-muted'
                    }`}>
                      {isDone
                        ? 'تسویه شده ✓'
                        : d.dueAt != null
                          ? `سررسید: ${Jalali.longDate(d.dueAt)}${isOverdue ? ' (سررسید گذشته)' : ''}`
                          : 'بدون سررسید'}
                    </div>
                    {d.note && (
                      <div className="text-[11px] text-t2 mt-0.5 truncate">{d.note}</div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <div className="text-sm font-black text-white dir-ltr">
                    {hidden ? '•••' : Money.toman(d.remaining)}
                    <span className="text-[10px] text-muted font-normal mr-1">تومان</span>
                  </div>
                  {!isDone && d.remaining < d.amount && (
                    <div className="text-[10px] text-muted dir-ltr">
                      از {hidden ? '•••' : Money.toman(d.amount)} تومان
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-line/50">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEditModal(d)}
                    aria-label="ویرایش"
                    className="h-8 px-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-line text-muted hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Pencil size={13} />
                    ویرایش
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTargetDebt(d)}
                    aria-label="حذف"
                    className="h-8 px-2.5 rounded-xl bg-bad/10 hover:bg-bad/20 border border-bad/20 text-bad text-[11px] font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Trash2 size={13} />
                    حذف
                  </button>
                </div>

                {!isDone ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPayTargetDebt(d);
                      setPayAmountToman(Money.tomanInput(d.remaining));
                    }}
                    className="h-8 px-3 rounded-xl bg-sky/15 hover:bg-sky/25 text-sky text-[11px] font-bold transition-colors"
                  >
                    {direction === 'OWED_TO_ME' ? 'ثبت دریافت' : 'ثبت تسویه'}
                  </button>
                ) : (
                  <span className="text-[11px] text-ok font-bold">تسویه کامل ✓</span>
                )}
              </div>
            </div>
          );
        })}

        {debts.length === 0 && (
          <div className="py-20 text-center text-muted text-xs">
            موردی در این دسته ثبت نشده است.
          </div>
        )}
      </div>

      {/* Add / Edit Debt Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm animate-fade-in p-3">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="debt-form-title"
            className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5 max-h-[92vh] overflow-y-auto no-scrollbar"
          >
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 id="debt-form-title" className="text-sm font-bold text-white">
                {editingDebt
                  ? 'ویرایش بدهی / طلب'
                  : formDirection === 'OWED_TO_ME'
                    ? 'ثبت طلب جدید'
                    : 'ثبت بدهی جدید'}
              </h2>
              <button
                type="button"
                aria-label="بستن"
                onClick={() => {
                  setIsFormOpen(false);
                  setEditingDebt(null);
                }}
                className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted"
              >
                <X size={16} />
              </button>
            </div>

            {/* Direction selector */}
            <div className="grid grid-cols-2 p-1 bg-surface rounded-xl border border-line gap-1">
              <button
                type="button"
                onClick={() => setFormDirection('OWED_TO_ME')}
                className={`py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                  formDirection === 'OWED_TO_ME' ? 'bg-lime text-onLime shadow-sm' : 'text-muted'
                }`}
              >
                طلب دارم (بستانکار)
              </button>
              <button
                type="button"
                onClick={() => setFormDirection('I_OWE')}
                className={`py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                  formDirection === 'I_OWE' ? 'bg-lime text-onLime shadow-sm' : 'text-muted'
                }`}
              >
                بدهکارم (بدهی به دیگران)
              </button>
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">طرف حساب (شخص / شرکت)</label>
              <input
                type="text"
                placeholder="مثلاً: علی رضایی"
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
              />
            </div>

            <div>
              <label htmlFor="debt-amount" className="text-[11px] text-muted block mb-1">مبلغ کل (تومان)</label>
              <AmountInput
                id="debt-amount"
                placeholder="۰"
                value={amountToman}
                onChange={setAmountToman}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
              />
            </div>

            {/* Jalali Due Date Section */}
            <div className="p-3 rounded-2xl bg-surface border border-line space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted font-bold flex items-center gap-1.5">
                  <Calendar size={13} className="text-sky" />
                  تاریخ سررسید (این بدهی برای کی است)
                </span>
                <button
                  type="button"
                  onClick={() => setHasDueDate(v => !v)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-colors ${
                    hasDueDate
                      ? 'bg-sky/15 border-sky/40 text-sky'
                      : 'bg-white/5 border-line text-muted'
                  }`}
                >
                  {hasDueDate ? 'دارای سررسید' : 'بدون سررسید'}
                </button>
              </div>

              {hasDueDate ? (
                <>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => applyDateFromMillis(Date.now())}
                      className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-t2"
                    >
                      امروز
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDateFromMillis(Jalali.addDays(Date.now(), 7))}
                      className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-t2"
                    >
                      ۷ روز آینده
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const cur = Jalali.of(Date.now());
                        const lastDay = Jalali.monthDays(cur.y, cur.m);
                        applyDateFromMillis(Jalali.millis(cur.y, cur.m, lastDay));
                      }}
                      className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-t2"
                    >
                      پایان این ماه
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <label htmlFor="debt-due-day" className="text-[10px] text-muted block mb-1">روز</label>
                      <input
                        id="debt-due-day"
                        type="number"
                        min={1}
                        max={31}
                        value={dueDay}
                        onChange={e => setDueDay(Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 1)))}
                        className="w-full h-9 rounded-lg bg-sheet border border-line text-white text-center text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted block mb-1">ماه</label>
                      <Select
                        size="sm"
                        value={dueMonth}
                        onChange={val => setDueMonth(Number(val))}
                        options={Jalali.MONTHS.map((m, idx) => ({ value: idx + 1, label: m }))}
                        align="center"
                      />
                    </div>
                    <div>
                      <label htmlFor="debt-due-year" className="text-[10px] text-muted block mb-1">سال</label>
                      <input
                        id="debt-due-year"
                        type="number"
                        value={dueYear}
                        onChange={e => setDueYear(parseInt(e.target.value, 10) || nowJ.y)}
                        className="w-full h-9 rounded-lg bg-sheet border border-line text-white text-center text-xs"
                      />
                    </div>
                  </div>

                  {computedDueAt != null && (
                    <div className="text-[10.5px] text-sky font-medium text-center pt-0.5">
                      {Jalali.longDate(computedDueAt)}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[10.5px] text-muted">
                  بدون تاریخ سررسید، این مورد در تعهدات ماهانه صفحه خانه محاسبه نمی‌شود.
                </p>
              )}
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">یادداشت (اختیاری)</label>
              <input
                type="text"
                placeholder="دلیل قرض یا توضیح..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
              />
            </div>

            <button
              type="button"
              onClick={handleSaveDebt}
              className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center shadow-fab"
            >
              {editingDebt ? 'ذخیره تغییرات' : 'ثبت و ذخیره'}
            </button>
          </div>
        </div>
      )}

      {/* Delete Debt Confirmation Modal */}
      {deleteTargetDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-debt-title"
            className="w-full max-w-sm rounded-[24px] bg-sheet border border-line p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center gap-2.5 text-bad">
              <div className="w-9 h-9 rounded-xl bg-bad/15 flex items-center justify-center shrink-0">
                <Trash2 size={18} />
              </div>
              <h2 id="delete-debt-title" className="text-sm font-bold text-white">
                حذف {deleteTargetDebt.direction === 'OWED_TO_ME' ? 'طلب' : 'بدهی'} «{deleteTargetDebt.person}»
              </h2>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              این {deleteTargetDebt.direction === 'OWED_TO_ME' ? 'طلب' : 'بدهی'} و سابقه پرداخت‌های ثبت‌شده برای آن حذف می‌شود؛ تراکنش‌های ثبت‌شده در حساب‌ها سر جایشان می‌مانند.
            </p>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => handleDeleteDebt(deleteTargetDebt)}
                className="flex-1 h-10 rounded-xl bg-bad hover:bg-bad/90 text-white text-xs font-bold transition-colors active:scale-95 shadow-sm"
              >
                حذف قطعی
              </button>
              <button
                type="button"
                onClick={() => setDeleteTargetDebt(null)}
                className="flex-1 h-10 rounded-xl bg-surface hover:bg-surface2 border border-line text-white text-xs font-semibold transition-colors active:scale-95"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay / Settle Modal */}
      {payTargetDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 className="text-sm font-bold text-white">
                {payTargetDebt.direction === 'OWED_TO_ME' ? 'دریافت طلب از' : 'پرداخت بدهی به'} {payTargetDebt.person}
              </h2>
              <button onClick={() => setPayTargetDebt(null)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted">
                <X size={16} />
              </button>
            </div>

            <div>
              <label htmlFor="debt-payment-amount" className="text-[11px] text-muted block mb-1">مبلغ پرداختی (تومان)</label>
              <AmountInput
                id="debt-payment-amount"
                value={payAmountToman}
                onChange={setPayAmountToman}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 dir-ltr focus:outline-none focus:border-sky"
              />
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">حساب مرتبط</label>
              <Select
                value={selectedAccId || undefined}
                onChange={(val) => setSelectedAccId(Number(val))}
                options={accounts
                  .filter((a): a is Account & { id: number } => a.id != null)
                  .map(a => ({
                    value: a.id,
                    label: a.name,
                  }))}
                placeholder="انتخاب حساب"
              />
            </div>

            <button
              onClick={handleAddPayment}
              className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center shadow-fab"
            >
              ثبت پرداخت
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
