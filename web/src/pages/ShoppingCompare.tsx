import React, { useState, useEffect, useMemo } from 'react';
import {
  Scale,
  Plus,
  Trophy,
  Clock,
  Sparkles,
  ChevronLeft,
  Search,
  CheckCircle2,
  Trash2,
  Smartphone,
  Laptop,
  Home,
  Car,
  Footprints,
  Headphones,
  X,
  CreditCard,
  Target,
} from 'lucide-react';
import { db, type CompareSession, type CompareItem, type CompareCriterion } from '../core/db';
import { COMPARE_TEMPLATES, type CompareTemplate } from '../core/compareEngine';
import { Money } from '../core/money';
import { AmountInput } from '../components/AmountInput';
import { HeaderBar } from '../components/UI';
import { CompareSessionView } from '../components/compare/CompareSessionView';

interface ShoppingCompareProps {
  onBack: () => void;
  hidden?: boolean;
}

type TabFilter = 'ALL' | 'OPEN' | 'DECIDED';

export function ShoppingCompare({ onBack, hidden }: ShoppingCompareProps) {
  const [sessions, setSessions] = useState<CompareSession[]>([]);
  const [items, setItems] = useState<CompareItem[]>([]);
  const [criteria, setCriteria] = useState<CompareCriterion[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

  // Filters & Search
  const [activeTab, setActiveTab] = useState<TabFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBudgetToman, setNewBudgetToman] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<CompareTemplate | null>(null);

  const loadData = async () => {
    const [sList, iList, cList] = await Promise.all([
      db.compareSessions.orderBy('updatedAt').reverse().toArray(),
      db.compareItems.toArray(),
      db.compareCriteria.toArray(),
    ]);

    setSessions(sList);
    setItems(iList);
    setCriteria(cList);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      if (activeTab === 'OPEN' && s.status !== 'OPEN') return false;
      if (activeTab === 'DECIDED' && s.status !== 'DECIDED') return false;
      if (searchQuery.trim() && !s.title.includes(searchQuery.trim())) return false;
      return true;
    });
  }, [sessions, activeTab, searchQuery]);

  const stats = useMemo(() => {
    const total = sessions.length;
    const open = sessions.filter(s => s.status === 'OPEN').length;
    const decided = sessions.filter(s => s.status === 'DECIDED').length;
    const totalItems = items.length;
    return { total, open, decided, totalItems };
  }, [sessions, items]);

  const handleCreateSession = async () => {
    if (!newTitle.trim()) return;

    const budget = newBudgetToman ? Money.parseToman(newBudgetToman) : undefined;
    const now = Date.now();

    const sessionId = await db.compareSessions.add({
      title: newTitle.trim(),
      budget: budget || undefined,
      status: 'OPEN',
      createdAt: now,
      updatedAt: now,
    });

    // If created with a template, populate criteria
    if (selectedTemplate) {
      const templateCriteria = selectedTemplate.criteria.map((c, idx) => ({
        sessionId,
        title: c.title,
        why: c.why,
        strict: c.strict,
        weight: c.weight,
        sortOrder: idx,
        createdAt: now,
      }));

      await db.compareCriteria.bulkAdd(templateCriteria);
    }

    setIsNewModalOpen(false);
    setNewTitle('');
    setNewBudgetToman('');
    setSelectedTemplate(null);
    await loadData();
    setActiveSessionId(sessionId);
  };

  const handleApplyTemplate = (tpl: CompareTemplate) => {
    setSelectedTemplate(tpl);
    setNewTitle(tpl.title);
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: number, title: string) => {
    e.stopPropagation();
    if (!confirm(`آیا جلسه مقایسه «${title}» حذف شود؟`)) return;

    await Promise.all([
      db.compareSessions.delete(sessionId),
      db.compareItems.where('sessionId').equals(sessionId).delete(),
      db.compareCriteria.where('sessionId').equals(sessionId).delete(),
      db.compareChecks.where('sessionId').equals(sessionId).delete(),
    ]);

    loadData();
  };

  // If a session is open, render its view
  if (activeSessionId) {
    return (
      <CompareSessionView
        sessionId={activeSessionId}
        onBack={() => {
          setActiveSessionId(null);
          loadData();
        }}
      />
    );
  }

  const getTemplateIcon = (name: string) => {
    switch (name) {
      case 'Smartphone':
        return <Smartphone size={18} />;
      case 'Laptop':
        return <Laptop size={18} />;
      case 'Home':
        return <Home size={18} />;
      case 'Car':
        return <Car size={18} />;
      case 'Footprints':
        return <Footprints size={18} />;
      case 'Headphones':
        return <Headphones size={18} />;
      default:
        return <Sparkles size={18} />;
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-28 pt-2 px-3 max-w-md mx-auto">
      {/* Header */}
      <HeaderBar
        title="مقایسه و دستیار خرید"
        onBack={onBack}
        action={
          <button
            onClick={() => setIsNewModalOpen(true)}
            className="w-10 h-10 rounded-2xl bg-lime text-onLime flex items-center justify-center font-bold shadow-fab active:scale-95"
            title="جلسه مقایسه جدید"
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
        }
      />

      {/* Overview Stats Cards */}
      <div className="grid grid-cols-3 gap-2 mt-2 mb-4">
        <div className="p-3 rounded-2xl bg-surface border border-line text-center">
          <span className="text-[10px] text-muted block mb-0.5">کل مقایسه‌ها</span>
          <span className="text-sm font-black text-white">{Money.fa(String(stats.total))}</span>
        </div>

        <div className="p-3 rounded-2xl bg-surface border border-line text-center">
          <span className="text-[10px] text-sky block mb-0.5">در حال بررسی</span>
          <span className="text-sm font-black text-sky">{Money.fa(String(stats.open))}</span>
        </div>

        <div className="p-3 rounded-2xl bg-surface border border-line text-center">
          <span className="text-[10px] text-ok block mb-0.5">تصمیم‌گیری‌شده</span>
          <span className="text-sm font-black text-ok">{Money.fa(String(stats.decided))}</span>
        </div>
      </div>

      {/* Tabs and Search Bar */}
      <div className="space-y-2.5 mb-4">
        {/* Segmented Tabs */}
        <div className="p-1 rounded-2xl bg-surface border border-line flex items-center text-xs">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`flex-1 h-8 rounded-xl font-bold transition-all ${
              activeTab === 'ALL' ? 'bg-white/15 text-white shadow-sm' : 'text-muted hover:text-white'
            }`}
          >
            همه ({Money.fa(String(stats.total))})
          </button>
          <button
            onClick={() => setActiveTab('OPEN')}
            className={`flex-1 h-8 rounded-xl font-bold transition-all ${
              activeTab === 'OPEN' ? 'bg-sky/20 text-sky shadow-sm' : 'text-muted hover:text-white'
            }`}
          >
            در حال بررسی ({Money.fa(String(stats.open))})
          </button>
          <button
            onClick={() => setActiveTab('DECIDED')}
            className={`flex-1 h-8 rounded-xl font-bold transition-all ${
              activeTab === 'DECIDED' ? 'bg-ok/20 text-ok shadow-sm' : 'text-muted hover:text-white'
            }`}
          >
            نهایی‌شده ({Money.fa(String(stats.decided))})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search size={15} className="absolute right-3 top-3 text-muted" />
          <input
            type="text"
            placeholder="جستجوی نام مقایسه یا کالا..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-10 rounded-2xl bg-surface border border-line pr-9 pl-3 text-xs text-white placeholder-muted focus:outline-none focus:border-lime"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-2.5 text-muted hover:text-white"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Quick Launch Pre-built Templates Banner */}
      {sessions.length === 0 && (
        <div className="p-4 rounded-3xl bg-gradient-to-r from-lime/10 to-surface border border-lime/30 mb-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-lime text-onLime flex items-center justify-center font-bold">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="text-xs font-black text-white">شروع سریع با قالب‌های آماده</h3>
              <p className="text-[10px] text-muted">معیارهای استاندارد و خط قرمزهای آماده برای خرید</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            {COMPARE_TEMPLATES.slice(0, 4).map(tpl => (
              <button
                key={tpl.id}
                onClick={() => {
                  handleApplyTemplate(tpl);
                  setIsNewModalOpen(true);
                }}
                className="p-2.5 rounded-xl bg-surface2 hover:bg-white/10 border border-line text-right active:scale-98 transition-colors flex items-center gap-2"
              >
                <div className="w-7 h-7 rounded-lg bg-white/5 text-lime flex items-center justify-center shrink-0">
                  {getTemplateIcon(tpl.iconName)}
                </div>
                <span className="text-[11px] font-bold text-white truncate">{tpl.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sessions List */}
      <div className="space-y-2.5 flex-1">
        {filteredSessions.length === 0 ? (
          <div className="py-12 text-center space-y-3 bg-surface rounded-3xl border border-line p-5">
            <div className="w-12 h-12 rounded-2xl bg-white/5 text-muted flex items-center justify-center mx-auto">
              <Scale size={24} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">هیچ جلسه مقایسه‌ای یافت نشد</h3>
              <p className="text-xs text-muted mt-1 max-w-[240px] mx-auto">
                {searchQuery
                  ? 'موردی با این عبارت جستجو پیدا نشد.'
                  : 'برای تصمیم‌گیری بهتر قبل از خرید، یک مقایسه جدید بسازید.'}
              </p>
            </div>
            <button
              onClick={() => setIsNewModalOpen(true)}
              className="h-10 px-4 rounded-xl bg-lime text-onLime font-bold text-xs inline-flex items-center gap-1.5 shadow-fab"
            >
              <Plus size={16} />
              شروع مقایسه تازه
            </button>
          </div>
        ) : (
          filteredSessions.map(session => {
            const sessionItems = items.filter(i => i.sessionId === session.id);
            const sessionCriteria = criteria.filter(c => c.sessionId === session.id);
            const chosen = sessionItems.find(i => i.id === session.chosenItemId);

            return (
              <div
                key={session.id}
                onClick={() => setActiveSessionId(session.id!)}
                className={`p-4 rounded-2xl border cursor-pointer active:scale-98 transition-all ${
                  session.status === 'DECIDED'
                    ? 'bg-ok/[0.03] border-ok/30 hover:border-ok/50'
                    : 'bg-surface hover:bg-surface2 border-line'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold shrink-0 ${
                        session.status === 'DECIDED'
                          ? 'bg-ok/20 text-ok'
                          : 'bg-sky/20 text-sky'
                      }`}
                    >
                      {session.status === 'DECIDED' ? <Trophy size={18} /> : <Scale size={18} />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-black text-white truncate">{session.title}</h3>
                        {session.status === 'DECIDED' ? (
                          <span className="text-[10px] font-bold text-ok bg-ok/15 px-2 py-0.2 rounded-full">
                            انتخاب شد
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-sky bg-sky/15 px-2 py-0.2 rounded-full">
                            در حال بررسی
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-muted mt-1 space-x-2 space-x-reverse">
                        <span>{Money.fa(String(sessionItems.length))} کالا</span>
                        <span>·</span>
                        <span>{Money.fa(String(sessionCriteria.length))} معیار</span>
                        {session.budget && (
                          <>
                            <span>·</span>
                            <span className="text-lime">سقف {Money.toman(session.budget)} ت</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={e => handleDeleteSession(e, session.id!, session.title)}
                      className="w-8 h-8 rounded-xl bg-surface2 border border-line flex items-center justify-center text-muted hover:text-danger transition-colors"
                      title="حذف"
                    >
                      <Trash2 size={14} />
                    </button>
                    <ChevronLeft size={18} className="text-muted" />
                  </div>
                </div>

                {/* Winner Item Preview */}
                {chosen && (
                  <div className="mt-3 pt-2.5 border-t border-line/50 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-ok font-bold truncate">
                      <CheckCircle2 size={13} />
                      <span>کالای انتخاب شده: {chosen.name}</span>
                    </div>
                    {chosen.price && (
                      <span className="text-lime font-bold shrink-0">
                        {Money.toman(chosen.price)} ت
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Create New Session Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-md animate-fade-in p-4">
          <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-line shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-line bg-surface/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-lime text-onLime flex items-center justify-center font-bold">
                  <Scale size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white">ایجاد جلسه مقایسه خرید</h2>
                  <span className="text-[11px] text-muted">سفارشی یا از روی قالب</span>
                </div>
              </div>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="w-8 h-8 rounded-full bg-surface2 border border-line flex items-center justify-center text-muted hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4 overflow-y-auto">
              {/* Pre-built Templates Carousel / Grid */}
              <div>
                <label className="text-xs font-bold text-white mb-2 block flex items-center gap-1">
                  <Sparkles size={13} className="text-lime" />
                  قالب‌های آماده با معیارهای حرفه‌ای:
                </label>

                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                  {COMPARE_TEMPLATES.map(tpl => {
                    const isSelected = selectedTemplate?.id === tpl.id;
                    return (
                      <div
                        key={tpl.id}
                        onClick={() => handleApplyTemplate(tpl)}
                        className={`p-2.5 rounded-2xl border cursor-pointer text-right transition-all ${
                          isSelected
                            ? 'bg-lime/15 border-lime text-white ring-1 ring-lime/40'
                            : 'bg-surface hover:bg-surface2 border-line text-white/80'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                              isSelected ? 'bg-lime text-onLime' : 'bg-surface2 text-muted'
                            }`}
                          >
                            {getTemplateIcon(tpl.iconName)}
                          </div>
                          <span className="text-xs font-bold truncate">{tpl.title}</span>
                        </div>
                        <span className="text-[10px] text-muted block truncate">{tpl.description}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Title Input */}
              <div>
                <label className="text-xs font-bold text-white mb-1 block">نام جلسه مقایسه:</label>
                <input
                  type="text"
                  placeholder="مثلاً: مقایسه گوشی‌های زیر ۳۰ میلیون"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full h-11 rounded-xl bg-surface2 border border-line text-xs text-white px-3 focus:outline-none focus:border-lime"
                />
              </div>

              {/* Budget Limit Input */}
              <div>
                <label className="text-xs font-bold text-white mb-1 block">
                  سقف بودجه در نظر گرفته شده به تومان (اختیاری):
                </label>
                <AmountInput
                  value={newBudgetToman}
                  onChange={setNewBudgetToman}
                  placeholder="مثلاً ۳۰٫۰۰۰٫۰۰۰"
                  className="w-full h-11 rounded-xl bg-surface2 border border-line text-xs text-white px-3 focus:outline-none focus:border-lime"
                />
                <span className="text-[10px] text-muted mt-1 block">
                  اگر بودجه تعیین کنید، سیستم کالاهای فراتر از بودجه را به شما هشدار می‌دهد.
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-line bg-surface/50">
              <button
                disabled={!newTitle.trim()}
                onClick={handleCreateSession}
                className="w-full h-12 rounded-2xl bg-lime text-onLime font-extrabold text-sm shadow-fab active:scale-98 transition-transform disabled:opacity-40"
              >
                شروع و ورود به مقایسه
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
