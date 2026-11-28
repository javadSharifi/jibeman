import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BatteryCharging,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Cpu,
  Edit3,
  ExternalLink,
  FileText,
  Info,
  Layers,
  LockKeyhole,
  MessageSquare,
  Monitor,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  IPHONE_BUYING_TIP,
  IPHONE_CHECKLIST_ITEMS,
  IPHONE_CHECKLIST_SECTIONS,
  buildReceiptTemplate,
  createInspection,
  formatInspectionReport,
  getActiveInspection,
  getInspectionStats,
  loadIphoneStore,
  saveIphoneStore,
  type IphoneCheckStatus,
  type IphoneChecklistItem,
  type IphoneChecklistSection,
  type IphoneInspection,
  type IphoneInspectionStore,
  type IphoneSectionAccent,
  type IphoneSectionIcon,
} from '../core/iphoneChecklist';
import { Money } from '../core/money';
import { AmountInput } from '../components/AmountInput';
import { HeaderBar } from '../components/UI';

interface IphoneBuyProps {
  onBack: () => void;
}

type FilterMode = 'ALL' | 'CRITICAL' | 'PENDING' | 'FAILED';

const SECTION_ICONS: Record<IphoneSectionIcon, LucideIcon> = {
  ShieldCheck,
  Wrench,
  Cpu,
  Monitor,
  BatteryCharging,
  Camera,
  LockKeyhole,
};

const ACCENT_STYLES: Record<IphoneSectionAccent, { iconBox: string; badge: string }> = {
  bad: {
    iconBox: 'bg-bad/15 text-bad border border-bad/25',
    badge: 'bg-bad/15 text-bad border border-bad/25',
  },
  warn: {
    iconBox: 'bg-warn/15 text-warn border border-warn/25',
    badge: 'bg-warn/15 text-warn border border-warn/25',
  },
  sky: {
    iconBox: 'bg-sky/15 text-sky border border-sky/25',
    badge: 'bg-sky/15 text-sky border border-sky/25',
  },
  primary: {
    iconBox: 'bg-primary/20 text-sky border border-primary/30',
    badge: 'bg-primary/20 text-sky border border-primary/30',
  },
  ok: {
    iconBox: 'bg-ok/15 text-ok border border-ok/25',
    badge: 'bg-ok/15 text-ok border border-ok/25',
  },
};

const SCREEN_COLORS = [
  { id: 'black', label: 'مشکی (OLED)', hex: '#000000', lightText: true },
  { id: 'white', label: 'سفید', hex: '#FFFFFF', lightText: false },
  { id: 'red', label: 'قرمز', hex: '#EF4444', lightText: true },
  { id: 'green', label: 'سبز', hex: '#22C55E', lightText: false },
  { id: 'blue', label: 'آبی', hex: '#3B82F6', lightText: true },
] as const;

export function IphoneBuy({ onBack }: IphoneBuyProps) {
  const [store, setStore] = useState<IphoneInspectionStore>(() => loadIphoneStore());
  const [filter, setFilter] = useState<FilterMode>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [openNoteItemId, setOpenNoteItemId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Modals
  const [isEditMetaOpen, setIsEditMetaOpen] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isScreenTestOpen, setIsScreenTestOpen] = useState(false);
  const [screenColorIdx, setScreenColorIdx] = useState(0);
  const [hideScreenControls, setHideScreenControls] = useState(false);

  // Meta draft state
  const [metaDraft, setMetaDraft] = useState({
    title: '',
    modelVariant: '',
    partNumber: '',
    priceToman: '',
    batteryHealth: '',
    cycleCount: '',
    sellerNote: '',
  });

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const toastTimerRef = useRef<number | null>(null);

  const active = useMemo(() => getActiveInspection(store), [store]);
  const stats = useMemo(() => getInspectionStats(active), [active]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  };

  const commitStore = (updater: (prev: IphoneInspectionStore) => IphoneInspectionStore) => {
    setStore((prev) => {
      const next = updater(prev);
      saveIphoneStore(next);
      return next;
    });
  };

  const updateActiveInspection = (updater: (ins: IphoneInspection) => IphoneInspection) => {
    commitStore((prev) => ({
      ...prev,
      inspections: prev.inspections.map((ins) =>
        ins.id === active.id ? { ...updater(ins), updatedAt: Date.now() } : ins
      ),
    }));
  };

  const setItemStatus = (itemId: string, nextStatus: IphoneCheckStatus) => {
    updateActiveInspection((ins) => {
      const prevItem = ins.items[itemId];
      return {
        ...ins,
        items: {
          ...ins.items,
          [itemId]: {
            status: nextStatus,
            note: prevItem?.note,
            updatedAt: Date.now(),
          },
        },
      };
    });
  };

  const handleTogglePass = (itemId: string) => {
    const cur = active.items[itemId]?.status ?? 'PENDING';
    setItemStatus(itemId, cur === 'PASS' ? 'PENDING' : 'PASS');
  };

  const handleToggleFail = (itemId: string) => {
    const cur = active.items[itemId]?.status ?? 'PENDING';
    setItemStatus(itemId, cur === 'FAIL' ? 'PENDING' : 'FAIL');
  };

  const handleOpenNote = (itemId: string) => {
    if (openNoteItemId === itemId) {
      setOpenNoteItemId(null);
      setNoteDraft('');
      return;
    }
    setOpenNoteItemId(itemId);
    setNoteDraft(active.items[itemId]?.note ?? '');
  };

  const handleSaveNote = (itemId: string) => {
    const trimmed = noteDraft.trim();
    updateActiveInspection((ins) => {
      const prevItem = ins.items[itemId];
      return {
        ...ins,
        items: {
          ...ins.items,
          [itemId]: {
            status: prevItem?.status ?? 'PENDING',
            note: trimmed || undefined,
            updatedAt: Date.now(),
          },
        },
      };
    });
    setOpenNoteItemId(null);
    setNoteDraft('');
    showToast(trimmed ? 'یادداشت ذخیره شد' : 'یادداشت پاک شد');
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(label);
    } catch {
      showToast('امکان کپی خودکار وجود ندارد');
    }
  };

  const handleResetChecklist = () => {
    if (!confirm(`تمام تیک‌های «${active.title}» پاک و به حالت اولیه برگردد؟`)) return;
    updateActiveInspection((ins) => ({
      ...ins,
      items: {},
    }));
    setOpenNoteItemId(null);
    showToast('چک‌لیست بازنشانی شد');
  };

  const openEditMeta = () => {
    setMetaDraft({
      title: active.title,
      modelVariant: active.modelVariant,
      partNumber: active.partNumber,
      priceToman: active.priceToman,
      batteryHealth: active.batteryHealth,
      cycleCount: active.cycleCount,
      sellerNote: active.sellerNote,
    });
    setIsEditMetaOpen(true);
  };

  const handleSaveMeta = (e: React.FormEvent) => {
    e.preventDefault();
    updateActiveInspection((ins) => ({
      ...ins,
      title: metaDraft.title.trim() || 'بررسی آیفون',
      modelVariant: metaDraft.modelVariant.trim(),
      partNumber: metaDraft.partNumber.trim().toUpperCase(),
      priceToman: metaDraft.priceToman.trim(),
      batteryHealth: Money.ascii(metaDraft.batteryHealth).replace(/[^\d]/g, '').slice(0, 3),
      cycleCount: Money.ascii(metaDraft.cycleCount).replace(/[^\d]/g, '').slice(0, 5),
      sellerNote: metaDraft.sellerNote.trim(),
    }));
    setIsEditMetaOpen(false);
    showToast('مشخصات گوشی ذخیره شد');
  };

  const handleCreateNewInspection = () => {
    const nextNum = Money.fa(String(store.inspections.length + 1));
    const fresh = createInspection(`آیفون بدون کد — مورد ${nextNum}`);
    commitStore((prev) => ({
      activeId: fresh.id,
      inspections: [fresh, ...prev.inspections],
    }));
    setIsSwitcherOpen(false);
    setFilter('ALL');
    setSearchQuery('');
    showToast('برگه بررسی جدید ساخته شد');
  };

  const handleDeleteInspection = (id: string, title: string) => {
    if (store.inspections.length <= 1) {
      handleResetChecklist();
      setIsSwitcherOpen(false);
      return;
    }
    if (!confirm(`بررسی «${title}» حذف شود؟`)) return;
    commitStore((prev) => {
      const remaining = prev.inspections.filter((i) => i.id !== id);
      return {
        activeId: prev.activeId === id ? remaining[0].id : prev.activeId,
        inspections: remaining,
      };
    });
    showToast('بررسی حذف شد');
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return IPHONE_CHECKLIST_ITEMS.filter((item) => {
      const status = active.items[item.id]?.status ?? 'PENDING';
      if (filter === 'CRITICAL' && !item.critical) return false;
      if (filter === 'PENDING' && status !== 'PENDING') return false;
      if (filter === 'FAILED' && status !== 'FAIL') return false;
      if (q) {
        const hay = [
          item.title,
          item.guide,
          item.passCriteria || '',
          ...(item.codeChips || []),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [active.items, filter, searchQuery]);

  const itemsBySection = useMemo(() => {
    const map = new Map<string, IphoneChecklistItem[]>();
    for (const sec of IPHONE_CHECKLIST_SECTIONS) {
      map.set(sec.id, []);
    }
    for (const item of filteredItems) {
      map.get(item.sectionId)?.push(item);
    }
    return map;
  }, [filteredItems]);

  const criticalCount = useMemo(
    () => IPHONE_CHECKLIST_ITEMS.filter((i) => i.critical).length,
    []
  );

  const parsedPriceRial = active.priceToman ? Money.parseToman(active.priceToman) : null;

  const jumpToSection = (sectionId: string) => {
    setCollapsedSections((prev) => ({ ...prev, [sectionId]: false }));
    requestAnimationFrame(() => {
      sectionRefs.current[sectionId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div className="flex flex-col min-h-screen pb-24 pt-2 px-3.5 max-w-md mx-auto">
      {/* Header */}
      <HeaderBar
        title="خرید آیفون"
        onBack={onBack}
        action={
          <button
            type="button"
            onClick={handleCreateNewInspection}
            aria-label="بررسی گوشی جدید"
            title="بررسی گوشی جدید"
            className="w-10 h-10 rounded-2xl bg-lime text-onLime flex items-center justify-center shadow-fab active:scale-95 transition-transform duration-150 ease-out"
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
        }
      />

      {/* Active Phone Bar */}
      <div className="mt-1 mb-3 p-3 rounded-[20px] bg-surface border border-line flex items-center justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Smartphone size={14} className="text-sky shrink-0" />
            <h2 className="text-xs font-extrabold text-white truncate">{active.title}</h2>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap mt-1.5 text-[10px] text-muted">
            {active.modelVariant && (
              <span className="px-2 py-0.5 rounded-full bg-surface2 text-white/85">
                {active.modelVariant}
              </span>
            )}
            {active.partNumber && (
              <span dir="ltr" className="px-2 py-0.5 rounded-full bg-surface2 text-sky font-semibold">
                {active.partNumber}
              </span>
            )}
            {active.batteryHealth && (
              <span className="px-2 py-0.5 rounded-full bg-surface2 text-ok">
                باتری {Money.fa(active.batteryHealth)}٪
                {active.cycleCount ? ` · ${Money.fa(active.cycleCount)} سایکل` : ''}
              </span>
            )}
            {parsedPriceRial != null && parsedPriceRial > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-lime/15 text-lime font-bold">
                {Money.toman(parsedPriceRial)} ت
              </span>
            )}
            {!active.modelVariant &&
              !active.partNumber &&
              !active.batteryHealth &&
              !parsedPriceRial && (
                <span>راهنمای گام‌به‌گام تست آیفون کارکرده و بدون کد</span>
              )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={openEditMeta}
            aria-label="ویرایش مشخصات گوشی"
            title="ثبت مشخصات و قیمت گوشی"
            className="h-8 px-2.5 rounded-xl bg-surface2 border border-line text-[11px] font-bold text-white/90 hover:text-white flex items-center gap-1 active:scale-95 transition-transform duration-150 ease-out"
          >
            <Edit3 size={13} className="text-sky" />
            <span>مشخصات</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSwitcherOpen(true)}
            aria-label="لیست گوشی‌های بررسی‌شده"
            title="گوشی‌های بررسی‌شده"
            className="h-8 px-2.5 rounded-xl bg-surface2 border border-line text-[11px] font-bold text-white/90 hover:text-white flex items-center gap-1 active:scale-95 transition-transform duration-150 ease-out"
          >
            <Layers size={13} className="text-lime" />
            <span>{Money.fa(String(store.inspections.length))}</span>
          </button>
        </div>
      </div>

      {/* Progress & Instant Deal Verdict Card */}
      <div className="p-4 rounded-[24px] bg-surface border border-line space-y-3 mb-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-[11px] text-muted block">پیشرفت چک‌لیست تست</span>
            <div className="text-sm font-black text-white mt-0.5">
              {Money.fa(String(stats.checkedCount))} از {Money.fa(String(stats.total))} مورد بررسی شد
            </div>
          </div>
          <div className="px-3 py-1 rounded-full bg-surface2 border border-line text-xs font-black text-lime">
            {Money.fa(String(stats.progressPercent))}٪
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 rounded-full bg-surface2 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-l from-lime to-primary transition-[width] duration-300 ease-out"
            style={{ width: `${stats.progressPercent}%` }}
          />
        </div>

        {/* Status Counts & Quick Tools */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold flex-wrap">
            <span className="px-2 py-0.5 rounded-full bg-ok/15 text-ok">
              تایید: {Money.fa(String(stats.passed))}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full ${
                stats.failed > 0 ? 'bg-bad/20 text-bad' : 'bg-surface2 text-muted'
              }`}
            >
              ایراد: {Money.fa(String(stats.failed))}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-surface2 text-muted">
              مانده: {Money.fa(String(stats.pending))}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => copyToClipboard(formatInspectionReport(active), 'گزارش کارشناسی کپی شد')}
              title="کپی گزارش کارشناسی"
              className="h-7 px-2.5 rounded-xl bg-surface2 border border-line text-[10px] font-bold text-sky flex items-center gap-1 active:scale-95 transition-transform duration-150 ease-out"
            >
              <Copy size={12} />
              <span>کپی گزارش</span>
            </button>
            {stats.checkedCount > 0 && (
              <button
                type="button"
                onClick={handleResetChecklist}
                title="پاک کردن تیک‌ها"
                aria-label="بازنشانی چک‌لیست"
                className="w-7 h-7 rounded-xl bg-surface2 border border-line text-muted hover:text-white flex items-center justify-center active:scale-95 transition-transform duration-150 ease-out"
              >
                <RotateCcw size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Verdict Banner */}
        {stats.verdict === 'DANGER' && (
          <div className="p-3 rounded-2xl bg-bad/10 border border-bad/30 space-y-1.5 animate-fade-in">
            <div className="flex items-center gap-1.5 text-xs font-black text-bad">
              <ShieldAlert size={16} className="shrink-0" />
              <span>هشدار خط قرمز: این گوشی را نخرید!</span>
            </div>
            <p className="text-[11px] text-white/85 leading-relaxed">
              {Money.fa(String(stats.criticalFailedItems.length))} مورد بحرانی رد شده است:{' '}
              {stats.criticalFailedItems.map((i) => i.title).join('، ')}.
            </p>
          </div>
        )}

        {stats.verdict === 'CAUTION' && (
          <div className="p-3 rounded-2xl bg-warn/10 border border-warn/30 space-y-1 animate-fade-in">
            <div className="flex items-center gap-1.5 text-xs font-black text-warn">
              <AlertTriangle size={15} className="shrink-0" />
              <span>نیاز به احتیاط و چانه‌زنی روی قیمت</span>
            </div>
            <p className="text-[11px] text-white/85 leading-relaxed">
              {Money.fa(String(stats.nonCriticalFailedItems.length))} مورد غیرحیاتی دارای ایراد یا نشانه استهلاک ثبت شده است. هزینه تعمیر یا افت قیمت را کم کنید.
            </p>
          </div>
        )}

        {stats.verdict === 'READY' && (
          <div className="p-3 rounded-2xl bg-ok/10 border border-ok/30 flex items-center gap-2 animate-fade-in">
            <CheckCircle2 size={18} className="text-ok shrink-0" />
            <div className="text-[11px] text-white/90 leading-relaxed">
              <strong className="text-ok block">تمام {Money.fa(String(stats.total))} تست با موفقیت تایید شدند!</strong>
              حتماً پیش از واریز، خروج از iCloud، ریست فکتوری و امضای رسید دستی را کامل انجام دهید.
            </div>
          </div>
        )}
      </div>

      {/* Filters, Search & Quick Section Jump */}
      <div className="space-y-2.5 mb-4">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {(
            [
              { id: 'ALL', label: `همه (${Money.fa(String(stats.total))})` },
              { id: 'CRITICAL', label: `خط قرمزها (${Money.fa(String(criticalCount))})` },
              { id: 'PENDING', label: `باقی‌مانده (${Money.fa(String(stats.pending))})` },
              { id: 'FAILED', label: `ایراددار (${Money.fa(String(stats.failed))})` },
            ] as const
          ).map((chip) => {
            const selected = filter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilter(chip.id)}
                className={`h-8 px-3 rounded-full text-[11px] font-bold shrink-0 border transition-colors duration-150 active:scale-95 ${
                  selected
                    ? 'bg-lime text-onLime border-lime'
                    : 'bg-surface border-line text-muted hover:text-white'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search size={15} className="absolute right-3 top-3 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجوی تست، کد یا قطعه (مثل panic، LCI، True Tone)..."
            className="w-full h-10 rounded-2xl bg-surface border border-line pr-9 pl-8 text-xs text-white placeholder-muted focus:outline-none focus:border-lime"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="پاک کردن جستجو"
              className="absolute left-2.5 top-2.5 w-5 h-5 rounded-full text-muted hover:text-white flex items-center justify-center"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Section Jump Pills */}
        {filter === 'ALL' && !searchQuery.trim() && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
            {IPHONE_CHECKLIST_SECTIONS.map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => jumpToSection(sec.id)}
                className="h-7 px-2.5 rounded-xl bg-surface2/80 border border-line text-[10px] font-semibold text-white/80 hover:text-white shrink-0 active:scale-95 transition-transform duration-150 ease-out"
              >
                {sec.numberFa}. {sec.title.split('،')[0].split(' و ')[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Checklist Sections */}
      <div className="space-y-4">
        {filteredItems.length === 0 ? (
          <div className="p-8 rounded-3xl bg-surface border border-line text-center space-y-2">
            <div className="w-11 h-11 rounded-2xl bg-surface2 text-muted flex items-center justify-center mx-auto">
              <Search size={20} />
            </div>
            <div className="text-sm font-bold text-white">موردی پیدا نشد</div>
            <p className="text-xs text-muted">
              فیلتر یا عبارت جستجو را تغییر دهید تا موارد چک‌لیست نمایش داده شوند.
            </p>
            <button
              type="button"
              onClick={() => {
                setFilter('ALL');
                setSearchQuery('');
              }}
              className="mt-2 h-9 px-4 rounded-xl bg-surface2 border border-line text-xs font-bold text-sky"
            >
              نمایش همه موارد
            </button>
          </div>
        ) : (
          IPHONE_CHECKLIST_SECTIONS.map((section) => {
            const sectionItems = itemsBySection.get(section.id) ?? [];
            if (sectionItems.length === 0) return null;

            const allSectionItems = IPHONE_CHECKLIST_ITEMS.filter((i) => i.sectionId === section.id);
            const sectionDoneCount = allSectionItems.filter(
              (i) => active.items[i.id]?.status === 'PASS'
            ).length;
            const sectionFailCount = allSectionItems.filter(
              (i) => active.items[i.id]?.status === 'FAIL'
            ).length;
            const isCollapsed = !!collapsedSections[section.id];

            return (
              <SectionBlock
                key={section.id}
                section={section}
                items={sectionItems}
                totalInSection={allSectionItems.length}
                doneCount={sectionDoneCount}
                failCount={sectionFailCount}
                isCollapsed={isCollapsed}
                active={active}
                openNoteItemId={openNoteItemId}
                noteDraft={noteDraft}
                setNoteDraft={setNoteDraft}
                sectionRef={(el) => {
                  sectionRefs.current[section.id] = el;
                }}
                onToggleCollapse={() =>
                  setCollapsedSections((prev) => ({
                    ...prev,
                    [section.id]: !prev[section.id],
                  }))
                }
                onTogglePass={handleTogglePass}
                onToggleFail={handleToggleFail}
                onOpenNote={handleOpenNote}
                onSaveNote={handleSaveNote}
                onCopy={copyToClipboard}
                onOpenScreenTest={() => {
                  setScreenColorIdx(0);
                  setHideScreenControls(false);
                  setIsScreenTestOpen(true);
                }}
                onCopyReceipt={() =>
                  copyToClipboard(buildReceiptTemplate(active), 'متن نمونه رسید دستی کپی شد')
                }
              />
            );
          })
        )}
      </div>

      {/* Pro Comparison Smart Tip */}
      <div className="mt-5 p-4 rounded-[22px] bg-gradient-to-l from-primary/15 via-surface to-surface border border-sky/25 space-y-1.5">
        <div className="flex items-center gap-2 text-xs font-extrabold text-sky">
          <Sparkles size={15} />
          <span>یک یادآوری هوشمندانه قبل از خرید نهایی</span>
        </div>
        <p className="text-[12px] leading-[1.75] text-white/85">{IPHONE_BUYING_TIP}</p>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-sheet border border-lime/40 text-xs font-bold text-lime shadow-2xl animate-fade-in whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* Edit Device Info Modal */}
      {isEditMetaOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setIsEditMetaOpen(false)}
        >
          <form
            onSubmit={handleSaveMeta}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-sheet rounded-[28px] border border-line p-5 shadow-2xl space-y-3.5 animate-modal-in"
          >
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-sky/15 text-sky flex items-center justify-center">
                  <Smartphone size={17} />
                </div>
                <h3 className="text-sm font-black text-white">مشخصات آیفون در حال بررسی</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditMetaOpen(false)}
                className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-white block mb-1">عنوان بررسی</label>
              <input
                type="text"
                value={metaDraft.title}
                onChange={(e) => setMetaDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="مثلاً: آیفون ۱۵ آبی - آگهی دیوار"
                className="w-full h-10 rounded-xl bg-surface2 border border-line px-3 text-xs text-white placeholder-muted focus:outline-none focus:border-lime"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-bold text-white block mb-1">مدل و حافظه / رنگ</label>
                <input
                  type="text"
                  value={metaDraft.modelVariant}
                  onChange={(e) => setMetaDraft((d) => ({ ...d, modelVariant: e.target.value }))}
                  placeholder="مثلاً: ۱۲۸ گیگ مشکی"
                  className="w-full h-10 rounded-xl bg-surface2 border border-line px-3 text-xs text-white placeholder-muted focus:outline-none focus:border-lime"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-white block mb-1">پارت‌نامبر</label>
                <input
                  type="text"
                  dir="ltr"
                  value={metaDraft.partNumber}
                  onChange={(e) => setMetaDraft((d) => ({ ...d, partNumber: e.target.value }))}
                  placeholder="CH/A یا ZAA"
                  className="w-full h-10 rounded-xl bg-surface2 border border-line px-3 text-xs text-white placeholder-muted focus:outline-none focus:border-lime"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-bold text-white block mb-1">سلامت باتری (٪)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={metaDraft.batteryHealth}
                  onChange={(e) => setMetaDraft((d) => ({ ...d, batteryHealth: e.target.value }))}
                  placeholder="88"
                  className="w-full h-10 rounded-xl bg-surface2 border border-line px-3 text-xs text-white placeholder-muted focus:outline-none focus:border-lime"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-white block mb-1">تعداد سایکل شارژ</label>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={metaDraft.cycleCount}
                  onChange={(e) => setMetaDraft((d) => ({ ...d, cycleCount: e.target.value }))}
                  placeholder="240"
                  className="w-full h-10 rounded-xl bg-surface2 border border-line px-3 text-xs text-white placeholder-muted focus:outline-none focus:border-lime"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-white block mb-1">قیمت پیشنهادی (تومان)</label>
              <AmountInput
                value={metaDraft.priceToman}
                onChange={(val) => setMetaDraft((d) => ({ ...d, priceToman: val }))}
                placeholder="مثلاً: 42,000,000"
                className="w-full h-10 rounded-xl bg-surface2 border border-line px-3 text-xs text-white placeholder-muted focus:outline-none focus:border-lime"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-white block mb-1">یادداشت (فروشنده / سریال / آدرس)</label>
              <textarea
                rows={2}
                value={metaDraft.sellerNote}
                onChange={(e) => setMetaDraft((d) => ({ ...d, sellerNote: e.target.value }))}
                placeholder="شماره تماس، آدرس مغازه یا نکات کلی..."
                className="w-full rounded-xl bg-surface2 border border-line p-2.5 text-xs text-white placeholder-muted focus:outline-none focus:border-lime resize-none"
              />
            </div>

            <button
              type="submit"
              className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs shadow-fab active:scale-[0.98] transition-transform duration-150 ease-out"
            >
              ذخیره مشخصات
            </button>
          </form>
        </div>
      )}

      {/* Saved Inspections Switcher Modal */}
      {isSwitcherOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setIsSwitcherOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-sheet rounded-[28px] border border-line p-5 shadow-2xl space-y-3.5 animate-modal-in max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <div>
                <h3 className="text-sm font-black text-white">گوشی‌های بررسی‌شده</h3>
                <p className="text-[10px] text-muted">می‌توانید چند آیفون را جداگانه چک و مقایسه کنید</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSwitcherOpen(false)}
                className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 overflow-y-auto flex-1">
              {store.inspections.map((ins) => {
                const insStats = getInspectionStats(ins);
                const isSelected = ins.id === active.id;
                const priceRial = ins.priceToman ? Money.parseToman(ins.priceToman) : null;

                return (
                  <div
                    key={ins.id}
                    onClick={() => {
                      commitStore((prev) => ({ ...prev, activeId: ins.id }));
                      setIsSwitcherOpen(false);
                    }}
                    role="button"
                    tabIndex={0}
                    className={`p-3 rounded-2xl border cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                      isSelected
                        ? 'bg-lime/10 border-lime/40'
                        : 'bg-surface border-line hover:bg-surface2'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate">{ins.title}</span>
                        {isSelected && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-lime text-onLime">
                            فعال
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted flex-wrap">
                        <span>
                          {Money.fa(String(insStats.checkedCount))}/{Money.fa(String(insStats.total))} تست
                        </span>
                        {insStats.criticalFailedItems.length > 0 ? (
                          <span className="text-bad font-bold">
                            {Money.fa(String(insStats.criticalFailedItems.length))} خط قرمز
                          </span>
                        ) : insStats.failed > 0 ? (
                          <span className="text-warn font-bold">
                            {Money.fa(String(insStats.failed))} احتیاط
                          </span>
                        ) : insStats.passed === insStats.total ? (
                          <span className="text-ok font-bold">تایید کامل</span>
                        ) : null}
                        {priceRial != null && priceRial > 0 && (
                          <span className="text-sky">{Money.toman(priceRial)} ت</span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteInspection(ins.id, ins.title);
                      }}
                      aria-label="حذف بررسی"
                      className="w-8 h-8 rounded-xl bg-surface2 border border-line text-muted hover:text-bad flex items-center justify-center shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleCreateNewInspection}
              className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-fab active:scale-[0.98] transition-transform duration-150 ease-out"
            >
              <Plus size={16} strokeWidth={2.5} />
              <span>شروع بررسی آیفون جدید</span>
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen OLED & Display Color Tester */}
      {isScreenTestOpen && (
        <div
          className="fixed inset-0 z-[60] flex flex-col justify-between p-5 select-none"
          style={{ backgroundColor: SCREEN_COLORS[screenColorIdx].hex }}
          onClick={() => setHideScreenControls((v) => !v)}
        >
          {!hideScreenControls && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-between gap-2 bg-black/70 backdrop-blur-md border border-white/15 rounded-2xl px-3.5 py-2.5 text-white animate-fade-in"
            >
              <div className="text-[11px] leading-snug">
                <strong className="block text-xs">تست صفحه‌نمایش ({SCREEN_COLORS[screenColorIdx].label})</strong>
                <span className="text-white/75">برای مخفی کردن نوار، روی صفحه لمس کنید</span>
              </div>
              <button
                type="button"
                onClick={() => setIsScreenTestOpen(false)}
                className="h-8 px-3 rounded-xl bg-white text-black text-xs font-extrabold shrink-0"
              >
                بستن
              </button>
            </div>
          )}

          {!hideScreenControls && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mx-auto flex items-center gap-1.5 bg-black/75 backdrop-blur-md border border-white/15 rounded-2xl p-2 animate-fade-in"
            >
              {SCREEN_COLORS.map((c, idx) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setScreenColorIdx(idx)}
                  className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold border transition-transform active:scale-95 ${
                    screenColorIdx === idx
                      ? 'border-lime text-lime bg-white/10'
                      : 'border-white/15 text-white/80 bg-white/5'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface SectionBlockProps {
  section: IphoneChecklistSection;
  items: IphoneChecklistItem[];
  totalInSection: number;
  doneCount: number;
  failCount: number;
  isCollapsed: boolean;
  active: IphoneInspection;
  openNoteItemId: string | null;
  noteDraft: string;
  setNoteDraft: (val: string) => void;
  sectionRef: (el: HTMLDivElement | null) => void;
  onToggleCollapse: () => void;
  onTogglePass: (id: string) => void;
  onToggleFail: (id: string) => void;
  onOpenNote: (id: string) => void;
  onSaveNote: (id: string) => void;
  onCopy: (text: string, label: string) => void;
  onOpenScreenTest: () => void;
  onCopyReceipt: () => void;
}

function SectionBlock({
  section,
  items,
  totalInSection,
  doneCount,
  failCount,
  isCollapsed,
  active,
  openNoteItemId,
  noteDraft,
  setNoteDraft,
  sectionRef,
  onToggleCollapse,
  onTogglePass,
  onToggleFail,
  onOpenNote,
  onSaveNote,
  onCopy,
  onOpenScreenTest,
  onCopyReceipt,
}: SectionBlockProps) {
  const Icon = SECTION_ICONS[section.iconName];
  const accent = ACCENT_STYLES[section.accent];
  const allPassed = doneCount === totalInSection && failCount === 0;

  return (
    <section ref={sectionRef} className="space-y-2 scroll-mt-4">
      <button
        type="button"
        onClick={onToggleCollapse}
        className="w-full p-3 rounded-[20px] bg-surface2/70 border border-line flex items-center justify-between gap-2.5 text-right active:scale-[0.99] transition-transform duration-150 ease-out"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${accent.iconBox}`}>
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-black text-white">
                بخش {section.numberFa}: {section.title}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${accent.badge}`}>
                {section.badge}
              </span>
              {failCount > 0 && (
                <span className="text-[10px] font-bold text-bad">
                  {Money.fa(String(failCount))} ایراد
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              allPassed ? 'bg-ok/20 text-ok' : 'bg-surface text-muted'
            }`}
          >
            {Money.fa(String(doneCount))}/{Money.fa(String(totalInSection))}
          </span>
          {isCollapsed ? (
            <ChevronDown size={16} className="text-muted" />
          ) : (
            <ChevronUp size={16} className="text-muted" />
          )}
        </div>
      </button>

      {!isCollapsed && (
        <div className="space-y-2.5">
          {section.subtitle && (
            <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-line text-[11px] text-white/80 leading-relaxed flex items-start gap-2">
              <Info size={14} className="text-sky shrink-0 mt-0.5" />
              <span>{section.subtitle}</span>
            </div>
          )}

          {items.map((item) => {
            const state = active.items[item.id];
            const status = state?.status ?? 'PENDING';
            const isNoteOpen = openNoteItemId === item.id;

            return (
              <div
                key={item.id}
                className={`p-3.5 rounded-[20px] border transition-colors duration-150 ${
                  status === 'PASS'
                    ? 'bg-ok/[0.04] border-ok/30'
                    : status === 'FAIL'
                      ? 'bg-bad/[0.07] border-bad/40'
                      : 'bg-surface border-line'
                }`}
              >
                {/* Item Header Row */}
                <div className="flex items-start gap-2.5">
                  {/* Primary Check Toggle */}
                  <button
                    type="button"
                    onClick={() => onTogglePass(item.id)}
                    aria-label={status === 'PASS' ? `لغو تایید ${item.title}` : `تایید ${item.title}`}
                    className="w-8 h-8 -mr-1 -mt-0.5 flex items-center justify-center shrink-0 active:scale-90 transition-transform duration-150 ease-out"
                  >
                    <span
                      className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-colors ${
                        status === 'PASS'
                          ? 'bg-ok border-ok text-onLime'
                          : 'bg-surface2 border-lineStrong text-transparent hover:border-lime/60'
                      }`}
                    >
                      <Check size={15} strokeWidth={3} />
                    </span>
                  </button>

                  {/* Title & Badges */}
                  <div
                    onClick={() => onTogglePass(item.id)}
                    className="flex-1 min-w-0 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      {item.critical && (
                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-bad/15 text-bad border border-bad/25">
                          خط قرمز
                        </span>
                      )}
                      {status === 'FAIL' && (
                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-bad text-black">
                          ایراد ثبت شد
                        </span>
                      )}
                      {status === 'PASS' && (
                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-ok/20 text-ok">
                          تایید شد
                        </span>
                      )}
                    </div>
                    <h3 className="text-[13px] font-bold text-white leading-snug">{item.title}</h3>
                  </div>

                  {/* Secondary Actions: Mark Fail & Add Note */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleFail(item.id)}
                      aria-label="ثبت ایراد در این مورد"
                      title="ثبت ایراد / رد کردن"
                      className={`w-8 h-8 rounded-xl border flex items-center justify-center active:scale-90 transition-transform duration-150 ease-out ${
                        status === 'FAIL'
                          ? 'bg-bad text-black border-bad'
                          : 'bg-surface2 border-line text-muted hover:text-bad'
                      }`}
                    >
                      <X size={15} strokeWidth={2.5} />
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenNote(item.id)}
                      aria-label="افزودن یادداشت"
                      title="یادداشت"
                      className={`w-8 h-8 rounded-xl border flex items-center justify-center active:scale-90 transition-transform duration-150 ease-out ${
                        state?.note || isNoteOpen
                          ? 'bg-sky/15 text-sky border-sky/35'
                          : 'bg-surface2 border-line text-muted hover:text-white'
                      }`}
                    >
                      <MessageSquare size={14} />
                    </button>
                  </div>
                </div>

                {/* Test Guide Subtext (Always Visible Underneath Checklist Item) */}
                <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] space-y-2">
                  <p className="text-[12px] leading-[1.75] text-t2">
                    <span className="text-sky font-bold ml-1">راهنمای تست:</span>
                    {item.guide}
                  </p>

                  {item.passCriteria && (
                    <div className="rounded-xl bg-ok/[0.07] border border-ok/15 px-2.5 py-1.5 text-[11px] leading-relaxed text-ok/95 flex items-start gap-1.5">
                      <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
                      <span>
                        <strong className="ml-1">تایید سلامت:</strong>
                        {item.passCriteria}
                      </span>
                    </div>
                  )}

                  {/* Quick Copy Codes, Verification Links & Helpers */}
                  {(item.codeChips?.length ||
                    item.links?.length ||
                    item.hasScreenTest ||
                    item.hasReceiptTemplate) && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {item.codeChips?.map((code) => (
                        <button
                          key={code}
                          type="button"
                          dir="ltr"
                          onClick={() => onCopy(code, `«${code}» کپی شد`)}
                          title="لمس برای کپی"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-[10px] font-mono text-sky active:scale-95 transition-transform duration-150 ease-out"
                        >
                          <Copy size={10} />
                          <span>{code}</span>
                        </button>
                      ))}

                      {item.links?.map((lnk) => (
                        <a
                          key={lnk.url}
                          href={lnk.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          dir="ltr"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primaryStrong/25 hover:bg-primaryStrong/40 border border-sky/30 text-[10px] font-bold text-white active:scale-95 transition-transform duration-150 ease-out"
                        >
                          <span>{lnk.label}</span>
                          <ExternalLink size={10} />
                        </a>
                      ))}

                      {item.hasScreenTest && (
                        <button
                          type="button"
                          onClick={onOpenScreenTest}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-lime/15 hover:bg-lime/25 border border-lime/30 text-[10px] font-bold text-lime active:scale-95 transition-transform duration-150 ease-out"
                        >
                          <Monitor size={11} />
                          <span>تست صفحه مشکی تمام‌صفحه</span>
                        </button>
                      )}

                      {item.hasReceiptTemplate && (
                        <button
                          type="button"
                          onClick={onCopyReceipt}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-lime/15 hover:bg-lime/25 border border-lime/30 text-[10px] font-bold text-lime active:scale-95 transition-transform duration-150 ease-out"
                        >
                          <FileText size={11} />
                          <span>کپی متن نمونه رسید دستی</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Saved Note Preview */}
                  {!isNoteOpen && state?.note && (
                    <button
                      type="button"
                      onClick={() => onOpenNote(item.id)}
                      className="w-full text-right rounded-xl bg-sky/10 border border-sky/20 px-2.5 py-1.5 text-[11px] text-white/90 flex items-start gap-1.5"
                    >
                      <MessageSquare size={12} className="text-sky shrink-0 mt-0.5" />
                      <span>
                        <strong className="text-sky ml-1">یادداشت:</strong>
                        {state.note}
                      </span>
                    </button>
                  )}

                  {/* Inline Note Editor */}
                  {isNoteOpen && (
                    <div className="flex items-center gap-1.5 pt-1 animate-fade-in">
                      <input
                        type="text"
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            onSaveNote(item.id);
                          }
                        }}
                        placeholder="مثلاً: سلامت ۸۷٪ و ۲۴۰ سایکل..."
                        autoFocus
                        className="flex-1 h-9 rounded-xl bg-surface2 border border-line px-2.5 text-xs text-white placeholder-muted focus:outline-none focus:border-sky"
                      />
                      <button
                        type="button"
                        onClick={() => onSaveNote(item.id)}
                        className="h-9 px-3 rounded-xl bg-sky text-onLime text-xs font-extrabold shrink-0"
                      >
                        ثبت
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
