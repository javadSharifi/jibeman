import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  Clock,
  Trophy,
  Plus,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  Filter,
  Sliders,
  Settings,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Footprints,
  Flame,
  Brain,
  History,
  Trash2,
} from 'lucide-react';
import { db, type ImpulseSession } from '../core/db';
import { Money } from '../core/money';
import { HeaderBar } from '../components/UI';
import {
  getImpulseConfig,
  saveImpulseConfig,
  formatDelayDuration,
  MOTIVATION_LABELS,
  type ImpulseConfig,
} from '../core/impulseEngine';
import { ImpulseBrakeModal } from '../components/impulse/ImpulseBrakeModal';

interface ImpulseBrakeDashboardProps {
  onBack: () => void;
  hidden?: boolean;
}

type TabMode = 'DASHBOARD' | 'HISTORY' | 'SETTINGS';
type HistoryFilter = 'ALL' | 'COOLING' | 'CANCELLED' | 'PURCHASED';

export function ImpulseBrakeDashboard({ onBack, hidden }: ImpulseBrakeDashboardProps) {
  const [tab, setTab] = useState<TabMode>('DASHBOARD');
  const [sessions, setSessions] = useState<ImpulseSession[]>([]);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('ALL');

  // Config State
  const [config, setConfig] = useState<ImpulseConfig>(getImpulseConfig());
  const [isConfigSaved, setIsConfigSaved] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  const loadData = async () => {
    const list = await db.impulseSessions.orderBy('createdAt').reverse().toArray();
    setSessions(list);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute insights & statistics (Section 8)
  const stats = useMemo(() => {
    const totalCount = sessions.length;
    const cancelledSessions = sessions.filter(s => s.status === 'CANCELLED');
    const cancelledCount = cancelledSessions.length;
    const purchasedCount = sessions.filter(s => s.status === 'PURCHASED').length;
    const coolingCount = sessions.filter(s => s.status === 'COOLING_OFF' || s.status === 'WAITING_EVAL').length;

    // Total money saved
    const totalSavedRial = cancelledSessions.reduce((acc, s) => acc + (s.savedAmount || s.amount || 0), 0);

    // Conditions analysis (خستگی، استرس، هیجان، فروشنده...)
    const conditions = {
      tired: sessions.filter(s => s.isTired).length,
      stressed: sessions.filter(s => s.isStressed).length,
      rushing: sessions.filter(s => s.isRushing).length,
      sellerPushing: sessions.filter(s => s.isSellerPushing).length,
      overexcited: sessions.filter(s => s.isOverexcited).length,
      notResearched: sessions.filter(s => !s.hasResearched).length,
      notPlanned: sessions.filter(s => !s.isPrePlanned).length,
    };

    // Category / motivation breakdown
    const motivationCounts: Record<string, number> = {};
    for (const s of sessions) {
      motivationCounts[s.motivation] = (motivationCounts[s.motivation] || 0) + 1;
    }

    return {
      totalCount,
      cancelledCount,
      purchasedCount,
      coolingCount,
      totalSavedRial,
      conditions,
      motivationCounts,
      successRate: totalCount > 0 ? Math.round((cancelledCount / totalCount) * 100) : 0,
    };
  }, [sessions]);

  const filteredHistory = useMemo(() => {
    return sessions.filter(s => {
      if (historyFilter === 'COOLING') return s.status === 'COOLING_OFF' || s.status === 'WAITING_EVAL';
      if (historyFilter === 'CANCELLED') return s.status === 'CANCELLED';
      if (historyFilter === 'PURCHASED') return s.status === 'PURCHASED';
      return true;
    });
  }, [sessions, historyFilter]);

  const handleSaveConfig = () => {
    saveImpulseConfig(config);
    setIsConfigSaved(true);
    setTimeout(() => setIsConfigSaved(false), 2000);
  };

  const handleDeleteSession = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('آیا از حذف این رکورد اطمینان دارید؟')) {
      await db.impulseSessions.delete(id);
      loadData();
    }
  };

  return (
    <div className="flex flex-col pb-28 pt-2 px-4 max-w-md mx-auto">
      {/* Top Header */}
      <HeaderBar
        title="ترمز خرید هیجانی"
        onBack={onBack}
        action={
          <button
            onClick={() => {
              setSelectedSessionId(null);
              setIsModalOpen(true);
            }}
            className="w-9 h-9 rounded-xl bg-amber-400 text-black flex items-center justify-center font-bold shadow-fab active:scale-95 transition-transform"
          >
            <Plus size={20} />
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex bg-surface border border-line rounded-2xl p-1 mb-4 mt-2">
        <button
          onClick={() => setTab('DASHBOARD')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            tab === 'DASHBOARD' ? 'bg-amber-400 text-black shadow' : 'text-muted hover:text-white'
          }`}
        >
          داشبورد هوش مالی
        </button>
        <button
          onClick={() => setTab('HISTORY')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            tab === 'HISTORY' ? 'bg-amber-400 text-black shadow' : 'text-muted hover:text-white'
          }`}
        >
          تاریخچه خریدهای هیجانی ({sessions.length})
        </button>
        <button
          onClick={() => setTab('SETTINGS')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            tab === 'SETTINGS' ? 'bg-amber-400 text-black shadow' : 'text-muted hover:text-white'
          }`}
        >
          تنظیمات تأخیر
        </button>
      </div>

      {/* TAB 1: DASHBOARD */}
      {tab === 'DASHBOARD' && (
        <div className="space-y-4 animate-fade-in">
          {/* Big Savings Trophy Card */}
          <div className="p-4 rounded-3xl bg-gradient-to-br from-emerald-950/60 via-surface to-surface border border-emerald-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/40">
                  <Trophy size={24} />
                </div>
                <div>
                  <span className="text-[11px] text-muted block">پول ذخیره‌شده با صبر و ترمز:</span>
                  <div className="text-xl font-black text-emerald-400">
                    {hidden ? '••••••••' : Money.toman(stats.totalSavedRial)} تومان
                  </div>
                </div>
              </div>
              <div className="text-left">
                <span className="text-[10px] text-muted block">نرخ نجات:</span>
                <span className="text-sm font-black text-white">{stats.successRate}٪</span>
              </div>
            </div>

            <p className="text-[11px] text-white/80 leading-relaxed border-t border-emerald-500/20 pt-2.5">
              شما تا کنون با ایجاد فاصله زمانی هوشمندانه، از{' '}
              <strong className="text-emerald-300 font-bold">{stats.cancelledCount} خرید عجولانه</strong>{' '}
              منصرف شده‌اید و دارایی خود را حفظ کرده‌اید.
            </p>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 bg-surface border border-line rounded-2xl text-center space-y-1">
              <span className="text-[10px] text-muted block">کل ترمزها</span>
              <span className="text-base font-black text-white">{stats.totalCount}</span>
            </div>
            <div className="p-3 bg-surface border border-line rounded-2xl text-center space-y-1">
              <span className="text-[10px] text-muted block">منصرف شده</span>
              <span className="text-base font-black text-emerald-400">{stats.cancelledCount}</span>
            </div>
            <div className="p-3 bg-surface border border-line rounded-2xl text-center space-y-1">
              <span className="text-[10px] text-muted block">در حال انتظار</span>
              <span className="text-base font-black text-amber-400">{stats.coolingCount}</span>
            </div>
          </div>

          {/* Start New Brake Button */}
          <button
            onClick={() => {
              setSelectedSessionId(null);
              setIsModalOpen(true);
            }}
            className="w-full h-13 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 hover:brightness-105 text-black font-black text-sm shadow-fab active:scale-98 transition-all flex items-center justify-center gap-2"
          >
            <Footprints size={19} />
            <span>الان در فروشگاهم / فعال‌سازی ترمز خرید</span>
          </button>

          {/* Emotional Vulnerability Analysis */}
          <div className="p-4 bg-surface border border-line rounded-2xl space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-xs">
              <Brain size={16} className="text-sky" />
              <span>در چه شرایطی بیشتر دچار هیجان خرید می‌شوم؟</span>
            </div>

            <div className="space-y-2 text-xs">
              {[
                { label: 'احساس خستگی ذهنی یا جسمی', count: stats.conditions.tired },
                { label: 'استرس و فشار روانی روزمره', count: stats.conditions.stressed },
                { label: 'عجله و شتاب در خرید', count: stats.conditions.rushing },
                { label: 'اصرار و تحریک فروشنده در مغازه', count: stats.conditions.sellerPushing },
                { label: 'هیجان و ذوق‌زدگی بالا', count: stats.conditions.overexcited },
                { label: 'عدم تحقیق کافی درباره کالا', count: stats.conditions.notResearched },
                { label: 'خریدهای خارج از برنامه مالی', count: stats.conditions.notPlanned },
              ].map((item, idx) => {
                const percentage = stats.totalCount > 0 ? Math.round((item.count / stats.totalCount) * 100) : 0;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-white/90">{item.label}</span>
                      <span className="text-muted font-bold">
                        {item.count} بار ({percentage}٪)
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-surface2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Motivation Patterns */}
          <div className="p-4 bg-surface border border-line rounded-2xl space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-xs">
              <Flame size={16} className="text-amber-400" />
              <span>الگوی انگیزه‌های خرید عجولانه شما:</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(stats.motivationCounts).map(([key, count]) => {
                const info = MOTIVATION_LABELS[key as keyof typeof MOTIVATION_LABELS];
                if (!info) return null;
                return (
                  <div key={key} className="p-2.5 rounded-xl bg-surface2/60 border border-line/60">
                    <span className="text-[11px] font-bold text-white block truncate">{info.title}</span>
                    <span className="text-[10px] text-muted mt-0.5 block">{count} مورد</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: HISTORY */}
      {tab === 'HISTORY' && (
        <div className="space-y-3 animate-fade-in">
          {/* Filter Pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
            {[
              { id: 'ALL', label: 'همه' },
              { id: 'COOLING', label: 'در حال انتظار' },
              { id: 'CANCELLED', label: 'صرفه‌جویی شده (منصرف)' },
              { id: 'PURCHASED', label: 'خریداری شده' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setHistoryFilter(f.id as HistoryFilter)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                  historyFilter === f.id
                    ? 'bg-amber-400 text-black'
                    : 'bg-surface border border-line text-muted hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredHistory.length === 0 ? (
            <div className="py-12 text-center text-muted text-xs">
              هیچ خریدی در این دسته‌بندی ثبت نشده است.
            </div>
          ) : (
            filteredHistory.map(session => {
              const isCooling = session.status === 'COOLING_OFF' || session.status === 'WAITING_EVAL';
              const isCancelled = session.status === 'CANCELLED';
              const isPurchased = session.status === 'PURCHASED';

              return (
                <div
                  key={session.id}
                  onClick={() => {
                    setSelectedSessionId(session.id!);
                    setIsModalOpen(true);
                  }}
                  className="p-3.5 rounded-2xl bg-surface border border-line hover:border-amber-400/40 cursor-pointer active:scale-98 transition-all space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isCancelled
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : isPurchased
                            ? 'bg-lime/20 text-lime'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {isCancelled ? (
                          <Trophy size={16} />
                        ) : isPurchased ? (
                          <CheckCircle2 size={16} />
                        ) : (
                          <Clock size={16} />
                        )}
                      </div>
                      <div>
                        <span className="text-xs font-black text-white">{session.itemTitle}</span>
                        {session.storeName && (
                          <span className="text-[10px] text-muted block">{session.storeName}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {session.amount > 0 && (
                        <div className="text-left">
                          <span
                            className={`text-xs font-bold ${
                              isCancelled ? 'text-emerald-400' : 'text-white/90'
                            }`}
                          >
                            {Money.toman(session.amount)} تومان
                          </span>
                          <span className="text-[9px] text-muted block">
                            {isCancelled ? 'صرفه‌جویی' : 'مبلغ'}
                          </span>
                        </div>
                      )}

                      <button
                        onClick={e => handleDeleteSession(session.id!, e)}
                        className="w-7 h-7 rounded-lg hover:bg-danger/10 text-muted hover:text-danger flex items-center justify-center transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {session.intentNote && (
                    <div className="text-[11px] text-white/80 bg-surface2/60 p-2 rounded-xl">
                      «{session.intentNote}»
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-muted pt-1 border-t border-line/50">
                    <span>تأخیر: {formatDelayDuration(session.requiredDelayMinutes)}</span>
                    <span
                      className={`font-bold ${
                        isCancelled
                          ? 'text-emerald-400'
                          : isPurchased
                          ? 'text-lime'
                          : 'text-amber-400'
                      }`}
                    >
                      {isCancelled
                        ? 'منصرف شده (ذخیره شد)'
                        : isPurchased
                        ? 'خرید آگاهانه'
                        : 'در حال انتظار'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 3: SETTINGS (Section 5 of Prompt: سیستم تأخیر متناسب با مبلغ خرید) */}
      {tab === 'SETTINGS' && (
        <div className="space-y-4 animate-fade-in">
          <div className="p-3.5 bg-surface border border-line rounded-2xl space-y-1">
            <h3 className="text-xs font-black text-white flex items-center gap-1.5">
              <Sliders size={16} className="text-amber-400" />
              سیستم تأخیر متناسب با ارزش خرید (قابل تنظیم)
            </h3>
            <p className="text-[11px] text-muted leading-relaxed">
              با توجه به مبلغ کالا، زمان توقف و آرامش ذهن را سفارشی‌سازی کنید:
            </p>
          </div>

          <div className="space-y-3">
            {/* Small Purchases */}
            <div className="p-3.5 bg-surface border border-line rounded-2xl space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white">خریدهای کوچک (زیر ۲ میلیون تومان):</span>
                <span className="text-xs font-bold text-amber-400">
                  {config.smallDelayMinutes} دقیقه
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                step="5"
                value={config.smallDelayMinutes}
                onChange={e => setConfig({ ...config, smallDelayMinutes: Number(e.target.value) })}
                className="w-full accent-amber-400"
              />
              <span className="text-[10px] text-muted block">
                توصیه: بدون انتظار یا ۱۰ دقیقه تأخیر
              </span>
            </div>

            {/* Medium Purchases */}
            <div className="p-3.5 bg-surface border border-line rounded-2xl space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white">خریدهای متوسط (۲ تا ۱۰ میلیون تومان):</span>
                <span className="text-xs font-bold text-amber-400">
                  {config.mediumDelayMinutes} دقیقه
                </span>
              </div>
              <input
                type="range"
                min="15"
                max="120"
                step="15"
                value={config.mediumDelayMinutes}
                onChange={e => setConfig({ ...config, mediumDelayMinutes: Number(e.target.value) })}
                className="w-full accent-amber-400"
              />
              <span className="text-[10px] text-muted block">
                قانون خروج از فروشگاه: حداقل ۳۰ دقیقه فاصله
              </span>
            </div>

            {/* Large Purchases */}
            <div className="p-3.5 bg-surface border border-line rounded-2xl space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white">خریدهای بزرگ (۱۰ تا ۵۰ میلیون تومان):</span>
                <span className="text-xs font-bold text-amber-400">
                  {Math.round(config.largeDelayMinutes / 60)} ساعت
                </span>
              </div>
              <input
                type="range"
                min="360"
                max="2880"
                step="360"
                value={config.largeDelayMinutes}
                onChange={e => setConfig({ ...config, largeDelayMinutes: Number(e.target.value) })}
                className="w-full accent-amber-400"
              />
              <span className="text-[10px] text-muted block">
                توصیه استاندارد: حداقل ۲۴ ساعت خواب شبانه قبل از خرید
              </span>
            </div>

            {/* Very Large Purchases */}
            <div className="p-3.5 bg-surface border border-line rounded-2xl space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white">خریدهای بسیار گران‌قیمت (بالای ۵۰ میلیون):</span>
                <span className="text-xs font-bold text-amber-400">
                  {Math.round(config.veryLargeDelayMinutes / 60)} ساعت
                </span>
              </div>
              <input
                type="range"
                min="1440"
                max="7200"
                step="720"
                value={config.veryLargeDelayMinutes}
                onChange={e => setConfig({ ...config, veryLargeDelayMinutes: Number(e.target.value) })}
                className="w-full accent-amber-400"
              />
              <span className="text-[10px] text-muted block">
                توصیه: حداقل ۷۲ ساعت (۳ روز) فرصت بررسی دقیق بازار
              </span>
            </div>

            {/* Tired / Stress Override */}
            <div
              onClick={() =>
                setConfig({ ...config, tiredStressForceWait: !config.tiredStressForceWait })
              }
              className="p-3.5 bg-surface border border-line rounded-2xl flex items-center justify-between cursor-pointer"
            >
              <div>
                <span className="text-xs font-bold text-white block">
                  اجبار ۳۰ دقیقه تأخیر در صورت خستگی یا استرس
                </span>
                <span className="text-[10px] text-muted mt-0.5 block">
                  حتی برای خریدهای کوچک یا متوسط، در صورت خستگی حداقل ۳۰ دقیقه مکث اعمال شود.
                </span>
              </div>
              <div
                className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 ${
                  config.tiredStressForceWait
                    ? 'bg-amber-400 border-amber-400 text-black'
                    : 'border-line bg-surface2'
                }`}
              >
                {config.tiredStressForceWait && <CheckCircle2 size={16} />}
              </div>
            </div>
          </div>

          <button
            onClick={handleSaveConfig}
            className="w-full h-12 rounded-2xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs shadow-fab active:scale-98 transition-all"
          >
            {isConfigSaved ? 'تنظیمات ذخیره شد ✓' : 'ذخیره تنظیمات'}
          </button>
        </div>
      )}

      {/* Impulse Modal */}
      <ImpulseBrakeModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedSessionId(null);
        }}
        sessionId={selectedSessionId}
        onSuccess={() => {
          loadData();
        }}
      />
    </div>
  );
}
