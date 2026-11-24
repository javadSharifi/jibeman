import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowRight,
  Plus,
  Trash2,
  Trophy,
  Table,
  ArrowLeftRight,
  Share2,
  Check,
  X,
  HelpCircle,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Settings,
  SlidersHorizontal,
  CreditCard,
  Target,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  db,
  type CompareSession,
  type CompareItem,
  type CompareCriterion,
  type CompareCheck,
} from '../../core/db';
import {
  calculateItemStats,
  orderCompareItems,
  type SortMode,
} from '../../core/compareEngine';
import { Money } from '../../core/money';
import { AmountInput } from '../AmountInput';

// Modals
import { QuickCheckModal } from './QuickCheckModal';
import { HeadToHeadModal } from './HeadToHeadModal';
import { MatrixModal } from './MatrixModal';
import { DecideModal } from './DecideModal';
import { ShareModal } from './ShareModal';

interface CompareSessionViewProps {
  sessionId: number;
  onBack: () => void;
}

export function CompareSessionView({ sessionId, onBack }: CompareSessionViewProps) {
  const [session, setSession] = useState<CompareSession | null>(null);
  const [items, setItems] = useState<CompareItem[]>([]);
  const [criteria, setCriteria] = useState<CompareCriterion[]>([]);
  const [checks, setChecks] = useState<CompareCheck[]>([]);

  // UI States
  const [sortBy, setSortBy] = useState<SortMode>('RECOMMENDED');
  const [showCriteriaSection, setShowCriteriaSection] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  // New Item Form
  const [newItemName, setNewItemName] = useState('');
  const [newItemPriceToman, setNewItemPriceToman] = useState('');
  const [newItemStore, setNewItemStore] = useState('');
  const [newItemUrl, setNewItemUrl] = useState('');
  const [newItemWarranty, setNewItemWarranty] = useState('');

  // New Criterion Form
  const [newCritTitle, setNewCritTitle] = useState('');
  const [newCritWhy, setNewCritWhy] = useState('');
  const [newCritStrict, setNewCritStrict] = useState(false);
  const [newCritWeight, setNewCritWeight] = useState<number>(1);

  // Edit Item State
  const [editingItem, setEditingItem] = useState<CompareItem | null>(null);
  const [editPriceToman, setEditPriceToman] = useState('');

  // Modals
  const [quickCheckItem, setQuickCheckItem] = useState<CompareItem | null>(null);
  const [isHeadToHeadOpen, setIsHeadToHeadOpen] = useState(false);
  const [isMatrixOpen, setIsMatrixOpen] = useState(false);
  const [decideItem, setDecideItem] = useState<CompareItem | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isEditSessionOpen, setIsEditSessionOpen] = useState(false);
  const [editSessionTitle, setEditSessionTitle] = useState('');
  const [editSessionBudgetToman, setEditSessionBudgetToman] = useState('');

  const loadData = async () => {
    const s = await db.compareSessions.get(sessionId);
    if (!s) {
      onBack();
      return;
    }
    setSession(s);
    setEditSessionTitle(s.title);
    setEditSessionBudgetToman(s.budget ? Money.tomanInput(s.budget) : '');

    const [itemList, critList, checkList] = await Promise.all([
      db.compareItems.where('sessionId').equals(sessionId).toArray(),
      db.compareCriteria.where('sessionId').equals(sessionId).sortBy('sortOrder'),
      db.compareChecks.where('sessionId').equals(sessionId).toArray(),
    ]);

    setItems(itemList);
    setCriteria(critList);
    setChecks(checkList);
  };

  useEffect(() => {
    loadData();
  }, [sessionId]);

  const orderedItems = useMemo(() => {
    return orderCompareItems(items, criteria, checks, session?.budget, sortBy);
  }, [items, criteria, checks, session?.budget, sortBy]);

  const chosenItem = useMemo(() => {
    if (!session?.chosenItemId) return null;
    return items.find(i => i.id === session.chosenItemId) || null;
  }, [session?.chosenItemId, items]);

  const handleAddItem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newItemName.trim() || !session) return;

    const price = newItemPriceToman ? Money.parseToman(newItemPriceToman) : undefined;

    await db.compareItems.add({
      sessionId: session.id!,
      name: newItemName.trim(),
      price: price || undefined,
      storeName: newItemStore.trim() || undefined,
      url: newItemUrl.trim() || undefined,
      warranty: newItemWarranty.trim() || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    setNewItemName('');
    setNewItemPriceToman('');
    setNewItemStore('');
    setNewItemUrl('');
    setNewItemWarranty('');
    setIsQuickAddOpen(false);
    loadData();
  };

  const handleAddCriterion = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newCritTitle.trim() || !session) return;

    await db.compareCriteria.add({
      sessionId: session.id!,
      title: newCritTitle.trim(),
      why: newCritWhy.trim() || undefined,
      strict: newCritStrict,
      weight: newCritWeight,
      sortOrder: criteria.length,
      createdAt: Date.now(),
    });

    setNewCritTitle('');
    setNewCritWhy('');
    setNewCritStrict(false);
    setNewCritWeight(1);
    loadData();
  };

  const handleDeleteCriterion = async (critId: number) => {
    if (!confirm('آیا از حذف این معیار اطمینان دارید؟')) return;
    await db.compareCriteria.delete(critId);
    await db.compareChecks.where('criterionId').equals(critId).delete();
    loadData();
  };

  const handleToggleCriterionStrict = async (crit: CompareCriterion) => {
    await db.compareCriteria.update(crit.id!, { strict: !crit.strict });
    loadData();
  };

  const handleChangeCriterionWeight = async (crit: CompareCriterion) => {
    // Cycle weights: 1 -> 3 -> 0.5 -> 1
    const nextWeight = crit.weight === 1 ? 3 : crit.weight === 3 ? 0.5 : 1;
    await db.compareCriteria.update(crit.id!, { weight: nextWeight });
    loadData();
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!confirm('آیا این گزینه از مقایسه حذف شود؟')) return;
    await db.compareItems.delete(itemId);
    await db.compareChecks.where('itemId').equals(itemId).delete();
    if (session?.chosenItemId === itemId) {
      await db.compareSessions.update(session.id!, {
        chosenItemId: undefined,
        status: 'OPEN',
      });
    }
    loadData();
  };

  const handleUpdateItem = async () => {
    if (!editingItem) return;
    const price = editPriceToman ? Money.parseToman(editPriceToman) : undefined;

    await db.compareItems.update(editingItem.id!, {
      name: editingItem.name.trim(),
      price: price || undefined,
      storeName: editingItem.storeName?.trim() || undefined,
      url: editingItem.url?.trim() || undefined,
      warranty: editingItem.warranty?.trim() || undefined,
      updatedAt: Date.now(),
    });

    setEditingItem(null);
    loadData();
  };

  const handleSaveSessionEdit = async () => {
    if (!session || !editSessionTitle.trim()) return;
    const budget = editSessionBudgetToman ? Money.parseToman(editSessionBudgetToman) : undefined;

    await db.compareSessions.update(session.id!, {
      title: editSessionTitle.trim(),
      budget: budget || undefined,
      updatedAt: Date.now(),
    });

    setIsEditSessionOpen(false);
    loadData();
  };

  const handleDeleteSession = async () => {
    if (!session) return;
    if (!confirm(`آیا جلسه مقایسه «${session.title}» و تمام داده‌های آن حذف شود؟`)) return;

    await Promise.all([
      db.compareSessions.delete(session.id!),
      db.compareItems.where('sessionId').equals(session.id!).delete(),
      db.compareCriteria.where('sessionId').equals(session.id!).delete(),
      db.compareChecks.where('sessionId').equals(session.id!).delete(),
    ]);

    onBack();
  };

  if (!session) return null;

  return (
    <div className="flex flex-col min-h-screen pb-28 pt-2 px-3 max-w-md mx-auto">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between py-2 border-b border-line mb-3">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-2xl bg-surface border border-line flex items-center justify-center text-white active:scale-95"
        >
          <ArrowRight size={20} />
        </button>

        <div className="flex-1 text-center px-2 min-w-0">
          <div className="flex items-center justify-center gap-1.5">
            {session.status === 'DECIDED' ? (
              <span className="text-[10px] font-black bg-ok/20 text-ok border border-ok/30 px-2 py-0.2 rounded-full">
                تصمیم نهایی گرفته شد
              </span>
            ) : (
              <span className="text-[10px] font-bold bg-sky/20 text-sky px-2 py-0.2 rounded-full">
                در حال ارزیابی
              </span>
            )}
          </div>
          <h1 className="text-sm font-black text-white truncate mt-0.5">{session.title}</h1>
        </div>

        <button
          onClick={() => setIsEditSessionOpen(true)}
          className="w-10 h-10 rounded-2xl bg-surface border border-line flex items-center justify-center text-muted hover:text-white active:scale-95"
        >
          <Settings size={18} />
        </button>
      </div>

      {/* Action Pills Bar */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <button
          disabled={items.length < 2}
          onClick={() => setIsHeadToHeadOpen(true)}
          className="h-10 rounded-xl bg-surface hover:bg-surface2 border border-line text-xs font-bold text-white flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-40"
        >
          <ArrowLeftRight size={14} className="text-sky" />
          مقایسه رو در رو
        </button>

        <button
          disabled={items.length === 0 || criteria.length === 0}
          onClick={() => setIsMatrixOpen(true)}
          className="h-10 rounded-xl bg-surface hover:bg-surface2 border border-line text-xs font-bold text-white flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-40"
        >
          <Table size={14} className="text-purple-400" />
          ماتریس جدول
        </button>

        <button
          disabled={items.length === 0}
          onClick={() => setIsShareOpen(true)}
          className="h-10 rounded-xl bg-surface hover:bg-surface2 border border-line text-xs font-bold text-white flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-40"
        >
          <Share2 size={14} className="text-lime" />
          اشتراک متن
        </button>
      </div>

      {/* Budget Limit Card if set */}
      {session.budget && session.budget > 0 && (
        <div className="p-3 rounded-2xl bg-surface border border-line mb-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-lime/10 text-lime flex items-center justify-center font-bold">
              💰
            </div>
            <div>
              <span className="text-[10px] text-muted block">سقف بودجه در نظر گرفته شده:</span>
              <span className="font-black text-white">{Money.toman(session.budget)} تومان</span>
            </div>
          </div>
          <span className="text-[11px] text-muted">
            {Money.fa(String(items.filter(i => i.price && i.price <= session.budget!).length))} گزینه در سقف بودجه
          </span>
        </div>
      )}

      {/* Decided Item Banner if session has winner */}
      {chosenItem && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-lime/15 via-surface to-surface border border-lime/40 mb-3 space-y-2.5 animate-scale-in">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-black text-lime">
              <Trophy size={16} />
              انتخاب نهایی شما:
            </span>
            <button
              onClick={() => setDecideItem(chosenItem)}
              className="text-[11px] text-sky hover:underline"
            >
              تغییر یا ثبت مالی
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-white">{chosenItem.name}</h3>
              {chosenItem.price && (
                <div className="text-xs font-bold text-lime mt-0.5">
                  {Money.toman(chosenItem.price)} تومان
                </div>
              )}
            </div>

            <button
              onClick={() => setDecideItem(chosenItem)}
              className="h-9 px-3 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <CreditCard size={14} />
              ثبت تراکنش
            </button>
          </div>

          {session.decisionNote && (
            <div className="text-[11px] text-white/80 bg-black/30 p-2.5 rounded-xl border border-white/5">
              💬 <strong>دلیل انتخاب:</strong> {session.decisionNote}
            </div>
          )}
        </div>
      )}

      {/* Criteria Collapsible Section */}
      <div className="rounded-2xl bg-surface border border-line mb-3 overflow-hidden">
        <button
          onClick={() => setShowCriteriaSection(prev => !prev)}
          className="w-full p-3.5 flex items-center justify-between text-xs font-bold text-white hover:bg-surface2 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-lime/15 text-lime text-[11px] font-black flex items-center justify-center">
              {Money.fa(String(criteria.length))}
            </span>
            <span>معیارهای ارزیابی و تصمیم‌گیری</span>
          </div>
          <div className="flex items-center gap-1 text-muted text-[11px]">
            <span>{showCriteriaSection ? 'بستن' : 'مشاهده و افزودن'}</span>
            {showCriteriaSection ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </button>

        {showCriteriaSection && (
          <div className="p-3 border-t border-line space-y-3 bg-sheet/40">
            {/* Criteria List */}
            {criteria.length === 0 ? (
              <p className="text-xs text-muted text-center py-2">
                هنوز معیاری تعریف نشده است. معیارهای مهم برای خرید (مثل باتری، گارانتی، قیمت) را بنویسید.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {criteria.map(crit => (
                  <div
                    key={crit.id}
                    className="p-2.5 rounded-xl bg-surface2 border border-line flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-white truncate">{crit.title}</span>
                        {crit.strict && (
                          <span className="text-[9px] font-black bg-danger/20 text-danger border border-danger/30 px-1.5 py-0.2 rounded">
                            خط قرمز
                          </span>
                        )}
                      </div>
                      {crit.why && <span className="text-[10px] text-muted block mt-0.5 truncate">{crit.why}</span>}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Weight Selector Button */}
                      <button
                        onClick={() => handleChangeCriterionWeight(crit)}
                        className={`h-7 px-2 rounded-lg text-[10px] font-bold border transition-colors ${
                          crit.weight === 3
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : crit.weight === 0.5
                            ? 'bg-white/5 text-muted border-line'
                            : 'bg-surface text-white/90 border-line'
                        }`}
                        title="تغییر وزن معیار"
                      >
                        {crit.weight === 3 ? '★ ضریب ۳' : crit.weight === 0.5 ? 'ضریب ۰٫۵' : 'ضریب ۱'}
                      </button>

                      {/* Strict Toggle Button */}
                      <button
                        onClick={() => handleToggleCriterionStrict(crit)}
                        className={`h-7 px-2 rounded-lg text-[10px] font-bold border transition-colors ${
                          crit.strict
                            ? 'bg-danger text-white border-danger'
                            : 'bg-surface text-muted border-line hover:text-white'
                        }`}
                        title="تغییر وضعیت خط قرمز (الزامی)"
                      >
                        {crit.strict ? 'خط قرمز ✓' : 'معمولی'}
                      </button>

                      <button
                        onClick={() => handleDeleteCriterion(crit.id!)}
                        className="w-7 h-7 rounded-lg bg-surface border border-line flex items-center justify-center text-muted hover:text-danger"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Criterion Inline Form */}
            <form onSubmit={handleAddCriterion} className="pt-2 border-t border-line/60 space-y-2">
              <span className="text-[11px] font-bold text-white block">+ افزودن معیار تازه:</span>
              <input
                type="text"
                placeholder="مثلاً: صفحه‌نمایش OLED یا دوربین با کیفیت"
                value={newCritTitle}
                onChange={e => setNewCritTitle(e.target.value)}
                className="w-full h-10 rounded-xl bg-surface border border-line text-xs text-white px-3 placeholder-muted focus:outline-none focus:border-lime"
              />

              <input
                type="text"
                placeholder="دلیل اهمیت این معیار (اختیاری)"
                value={newCritWhy}
                onChange={e => setNewCritWhy(e.target.value)}
                className="w-full h-9 rounded-xl bg-surface border border-line text-[11px] text-white px-3 placeholder-muted focus:outline-none"
              />

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newCritStrict}
                      onChange={e => setNewCritStrict(e.target.checked)}
                      className="rounded accent-danger w-3.5 h-3.5"
                    />
                    <span className={newCritStrict ? 'text-danger font-bold' : ''}>خط قرمز (الزام قطعی)</span>
                  </label>

                  <select
                    value={newCritWeight}
                    onChange={e => setNewCritWeight(Number(e.target.value))}
                    className="h-8 rounded-lg bg-surface border border-line text-[10px] text-white px-1.5 focus:outline-none"
                  >
                    <option value={3}>اهمیت: بسیار مهم (۳x)</option>
                    <option value={1}>اهمیت: معمولی (۱x)</option>
                    <option value={0.5}>اهمیت: جانبی (۰٫۵x)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={!newCritTitle.trim()}
                  className="h-8 px-3 rounded-lg bg-lime text-onLime font-bold text-xs disabled:opacity-40"
                >
                  ثبت معیار
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Items Section Header with Sorting */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-black text-white">گزینه‌های خرید</h2>
          <span className="text-xs text-muted">({Money.fa(String(items.length))} کالا)</span>
        </div>

        <div className="flex items-center gap-1">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortMode)}
            className="h-8 rounded-xl bg-surface border border-line text-[11px] font-bold text-white px-2 focus:outline-none"
          >
            <option value="RECOMMENDED">پیشنهاد هوشمند</option>
            <option value="MATCH">بیشترین تطابق</option>
            <option value="PRICE_ASC">ارزان‌ترین قیمت</option>
            <option value="PRICE_DESC">گران‌ترین قیمت</option>
            <option value="VALUE">بالاترین ارزش خرید</option>
          </select>

          <button
            onClick={() => setIsQuickAddOpen(prev => !prev)}
            className="h-8 px-2.5 rounded-xl bg-lime text-onLime font-black text-xs flex items-center gap-1 shadow-sm active:scale-95"
          >
            <Plus size={14} strokeWidth={3} />
            افزودن کالا
          </button>
        </div>
      </div>

      {/* Add Item Drawer / Form */}
      {isQuickAddOpen && (
        <form
          onSubmit={handleAddItem}
          className="p-3.5 rounded-2xl bg-surface border border-line mb-3 space-y-2.5 animate-scale-in"
        >
          <div className="flex items-center justify-between border-b border-line/60 pb-1.5">
            <span className="text-xs font-bold text-white">+ مشخصات کالای جدید:</span>
            <button
              type="button"
              onClick={() => setIsQuickAddOpen(false)}
              className="text-muted hover:text-white"
            >
              <X size={15} />
            </button>
          </div>

          <div>
            <label className="text-[10px] text-muted mb-1 block">نام یا مدل کالا (الزامی):</label>
            <input
              type="text"
              required
              placeholder="مثلاً: گوشی سامسونگ گلکسی S24 FE"
              value={newItemName}
              onChange={e => setNewItemName(e.target.value)}
              className="w-full h-10 rounded-xl bg-surface2 border border-line text-xs text-white px-3 placeholder-muted focus:outline-none focus:border-lime"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted mb-1 block">قیمت به تومان (اختیاری):</label>
              <AmountInput
                value={newItemPriceToman}
                onChange={setNewItemPriceToman}
                placeholder="مثلاً ۳۲٫۰۰۰٫۰۰۰"
                className="w-full h-10 rounded-xl bg-surface2 border border-line text-xs text-white px-3 focus:outline-none focus:border-lime"
              />
            </div>

            <div>
              <label className="text-[10px] text-muted mb-1 block">فروشگاه یا فروشنده:</label>
              <input
                type="text"
                placeholder="مثلاً: دیجی‌کالا / چارسو"
                value={newItemStore}
                onChange={e => setNewItemStore(e.target.value)}
                className="w-full h-10 rounded-xl bg-surface2 border border-line text-xs text-white px-3 placeholder-muted focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted mb-1 block">گارانتی:</label>
              <input
                type="text"
                placeholder="مثلاً: ۱۸ ماهه شرکتی"
                value={newItemWarranty}
                onChange={e => setNewItemWarranty(e.target.value)}
                className="w-full h-9 rounded-xl bg-surface2 border border-line text-xs text-white px-3 placeholder-muted focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] text-muted mb-1 block">لینک صفحه محصول:</label>
              <input
                type="url"
                placeholder="https://..."
                value={newItemUrl}
                onChange={e => setNewItemUrl(e.target.value)}
                className="w-full h-9 rounded-xl bg-surface2 border border-line text-xs text-white px-3 placeholder-muted focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!newItemName.trim()}
            className="w-full h-10 rounded-xl bg-lime text-onLime font-black text-xs shadow-fab active:scale-98 transition-transform disabled:opacity-40"
          >
            ثبت و افزودن کالا
          </button>
        </form>
      )}

      {/* Items Cards List */}
      <div className="space-y-3">
        {orderedItems.length === 0 ? (
          <div className="py-12 text-center space-y-3 bg-surface rounded-2xl border border-line p-5">
            <div className="w-12 h-12 rounded-2xl bg-white/5 text-muted flex items-center justify-center mx-auto">
              <Zap size={24} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">هنوز کالایی ثبت نشده است</h3>
              <p className="text-xs text-muted mt-1 max-w-[240px] mx-auto">
                کالاهایی که بین خریدشان مردد هستید را اضافه کنید تا معیارها را روی آن‌ها بسنجید.
              </p>
            </div>
            <button
              onClick={() => setIsQuickAddOpen(true)}
              className="h-10 px-4 rounded-xl bg-lime text-onLime font-bold text-xs inline-flex items-center gap-1.5 shadow-fab"
            >
              <Plus size={16} />
              افزودن اولین کالا
            </button>
          </div>
        ) : (
          orderedItems.map((item, index) => {
            const stats = calculateItemStats(item, criteria, checks, session.budget);
            const isWinner = session.chosenItemId === item.id;
            const rank = index + 1;

            return (
              <div
                key={item.id}
                className={`p-4 rounded-2xl border transition-all ${
                  isWinner
                    ? 'bg-lime/[0.04] border-lime/50 shadow-md ring-1 ring-lime/30'
                    : stats.hasStrictFailure
                    ? 'bg-surface border-danger/40'
                    : 'bg-surface border-line hover:border-line/80'
                }`}
              >
                {/* Header Row: Rank, Title, Price, Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                        isWinner
                          ? 'bg-lime text-onLime shadow-sm'
                          : rank === 1
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-surface2 text-muted border border-line'
                      }`}
                    >
                      {isWinner ? <Trophy size={14} /> : Money.fa(String(rank))}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="text-sm font-black text-white leading-tight">{item.name}</h3>
                        {isWinner && (
                          <span className="text-[10px] font-black bg-lime text-onLime px-2 py-0.2 rounded-full">
                            گزینه برگزیده
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-1 text-xs text-muted flex-wrap">
                        {item.price ? (
                          <span className="font-bold text-lime">
                            {Money.toman(item.price)} تومان
                          </span>
                        ) : (
                          <span>قیمت ثبت نشده</span>
                        )}

                        {item.storeName && (
                          <span>· 🏪 {item.storeName}</span>
                        )}

                        {item.warranty && (
                          <span>· 🛡️ {item.warranty}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Match Percentage Badge */}
                  <div className="text-left shrink-0">
                    <div className="text-base font-black text-white">
                      {Money.fa(String(stats.matchPercent))}٪
                    </div>
                    <span className="text-[10px] text-muted block -mt-0.5">تطابق با معیارها</span>
                  </div>
                </div>

                {/* Match Progress Bar */}
                <div className="w-full bg-surface2 h-1.5 rounded-full overflow-hidden my-3">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      stats.hasStrictFailure
                        ? 'bg-danger'
                        : stats.matchPercent >= 80
                        ? 'bg-ok'
                        : stats.matchPercent >= 50
                        ? 'bg-lime'
                        : 'bg-warn'
                    }`}
                    style={{ width: `${stats.matchPercent}%` }}
                  />
                </div>

                {/* Deal-breaker / Strict Failure Banner */}
                {stats.hasStrictFailure && (
                  <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/30 text-xs text-danger flex items-center gap-2 mb-3">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>
                      <strong>نقض خط قرمز:</strong> {stats.strictFails.map(c => c.title).join('، ')}
                    </span>
                  </div>
                )}

                {/* Budget Warning if over budget */}
                {stats.budgetStatus === 'OVER' && (
                  <div className="p-2 rounded-xl bg-warn/10 border border-warn/30 text-[11px] text-warn flex items-center gap-1.5 mb-3">
                    <span>⚠️ فراتر از سقف بودجه ({Money.toman(Math.abs(stats.budgetDiff!))} تومان گران‌تر)</span>
                  </div>
                )}

                {/* Counts and Evaluation Badges */}
                <div className="flex items-center justify-between text-xs py-1 border-t border-line/40">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-ok font-bold">
                      <Check size={13} strokeWidth={3} />
                      {Money.fa(String(stats.pass))} رعایت
                    </span>
                    <span className="text-muted">·</span>
                    <span className="flex items-center gap-1 text-danger font-bold">
                      <X size={13} strokeWidth={3} />
                      {Money.fa(String(stats.fail))} رد
                    </span>
                    <span className="text-muted">·</span>
                    <span className="flex items-center gap-1 text-muted">
                      <HelpCircle size={13} />
                      {Money.fa(String(stats.unknown))} نامشخص
                    </span>
                  </div>

                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-sky hover:underline flex items-center gap-0.5"
                    >
                      مشاهده لینک
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>

                {/* Card Action Buttons */}
                <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-line/40">
                  {/* Quick-check walk button */}
                  <button
                    onClick={() => setQuickCheckItem(item)}
                    className="h-10 rounded-xl bg-surface2 hover:bg-white/10 border border-line text-xs font-bold text-white flex items-center justify-center gap-1.5 active:scale-98 transition-colors"
                  >
                    <Zap size={14} className="text-lime" />
                    <span>بررسی سریع ({Money.fa(String(stats.unknown))})</span>
                  </button>

                  {/* Decide Winner button */}
                  <button
                    onClick={() => setDecideItem(item)}
                    className={`h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 active:scale-98 transition-colors ${
                      isWinner
                        ? 'bg-ok/20 text-ok border border-ok/40'
                        : 'bg-lime text-onLime shadow-sm font-black'
                    }`}
                  >
                    <Trophy size={14} />
                    <span>{isWinner ? 'گزینه برگزیده ✓' : 'انتخاب به عنوان برنده'}</span>
                  </button>
                </div>

                {/* Sub-actions: Edit / Delete */}
                <div className="flex items-center justify-end gap-3 mt-2 pt-1 text-[11px] text-muted">
                  <button
                    onClick={() => {
                      setEditingItem(item);
                      setEditPriceToman(item.price ? Money.tomanInput(item.price) : '');
                    }}
                    className="hover:text-white"
                  >
                    ویرایش مشخصات
                  </button>
                  <span>·</span>
                  <button
                    onClick={() => handleDeleteItem(item.id!)}
                    className="hover:text-danger"
                  >
                    حذف کالا
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modals */}
      {quickCheckItem && (
        <QuickCheckModal
          item={quickCheckItem}
          criteria={criteria}
          checks={checks}
          onClose={() => setQuickCheckItem(null)}
          onRefresh={loadData}
        />
      )}

      {isHeadToHeadOpen && (
        <HeadToHeadModal
          items={items}
          criteria={criteria}
          checks={checks}
          budget={session.budget}
          onClose={() => setIsHeadToHeadOpen(false)}
        />
      )}

      {isMatrixOpen && (
        <MatrixModal
          items={orderedItems}
          criteria={criteria}
          checks={checks}
          budget={session.budget}
          onClose={() => setIsMatrixOpen(false)}
        />
      )}

      {decideItem && (
        <DecideModal
          session={session}
          item={decideItem}
          onClose={() => setDecideItem(null)}
          onSuccess={loadData}
        />
      )}

      {isShareOpen && (
        <ShareModal
          session={session}
          items={items}
          criteria={criteria}
          checks={checks}
          onClose={() => setIsShareOpen(false)}
        />
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-line p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h3 className="text-sm font-bold text-white">ویرایش کالا</h3>
              <button onClick={() => setEditingItem(null)} className="text-muted hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="text-[10px] text-muted block mb-1">نام کالا:</label>
              <input
                type="text"
                value={editingItem.name}
                onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                className="w-full h-10 rounded-xl bg-surface2 border border-line text-xs text-white px-3 focus:outline-none focus:border-lime"
              />
            </div>

            <div>
              <label className="text-[10px] text-muted block mb-1">قیمت به تومان:</label>
              <AmountInput
                value={editPriceToman}
                onChange={setEditPriceToman}
                className="w-full h-10 rounded-xl bg-surface2 border border-line text-xs text-white px-3 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted block mb-1">فروشگاه:</label>
                <input
                  type="text"
                  value={editingItem.storeName || ''}
                  onChange={e => setEditingItem({ ...editingItem, storeName: e.target.value })}
                  className="w-full h-9 rounded-xl bg-surface2 border border-line text-xs text-white px-2 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-muted block mb-1">گارانتی:</label>
                <input
                  type="text"
                  value={editingItem.warranty || ''}
                  onChange={e => setEditingItem({ ...editingItem, warranty: e.target.value })}
                  className="w-full h-9 rounded-xl bg-surface2 border border-line text-xs text-white px-2 focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={handleUpdateItem}
              className="w-full h-11 rounded-xl bg-lime text-onLime font-black text-xs shadow-fab mt-2"
            >
              ذخیره تغییرات
            </button>
          </div>
        </div>
      )}

      {/* Edit Session Modal */}
      {isEditSessionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-line p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h3 className="text-sm font-bold text-white">تنظیمات جلسه مقایسه</h3>
              <button onClick={() => setIsEditSessionOpen(false)} className="text-muted hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="text-[10px] text-muted block mb-1">نام جلسه مقایسه:</label>
              <input
                type="text"
                value={editSessionTitle}
                onChange={e => setEditSessionTitle(e.target.value)}
                className="w-full h-10 rounded-xl bg-surface2 border border-line text-xs text-white px-3 focus:outline-none focus:border-lime"
              />
            </div>

            <div>
              <label className="text-[10px] text-muted block mb-1">سقف بودجه به تومان (اختیاری):</label>
              <AmountInput
                value={editSessionBudgetToman}
                onChange={setEditSessionBudgetToman}
                placeholder="مثلاً ۵۰٫۰۰۰٫۰۰۰"
                className="w-full h-10 rounded-xl bg-surface2 border border-line text-xs text-white px-3 focus:outline-none"
              />
            </div>

            <div className="pt-2 border-t border-line/60 space-y-2">
              <button
                onClick={handleSaveSessionEdit}
                className="w-full h-11 rounded-xl bg-lime text-onLime font-black text-xs shadow-fab"
              >
                ذخیره تغییرات
              </button>

              <button
                onClick={handleDeleteSession}
                className="w-full h-10 rounded-xl bg-danger/15 text-danger border border-danger/30 font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Trash2 size={14} />
                حذف کامل این جلسه مقایسه
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
