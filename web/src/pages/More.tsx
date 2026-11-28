import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Building2,
  HandCoins,
  Target,
  Users,
  Tags,
  Database,
  Smartphone,
  ChevronLeft,
  X,
  Share,
  PlusSquare,
  UserCheck,
  Wand2,
  Shield,
  ShieldAlert,
  Scale,
  RefreshCw,
  Sparkles,
  Cloud,
  Lock,
  Coins,
} from 'lucide-react';
import { db } from '../core/db';
import { Money } from '../core/money';
import { pwaManager, type PwaUpdateState } from '../core/pwa';
import { isLockEnabled } from '../core/security';
import { getCfg } from '../core/sync';
import { APP_VERSION, APP_VERSION_INFO, formatVersionFa } from '../core/version';
import { getActiveIphoneSummary, subscribeIphoneStore } from '../core/iphoneChecklist';

interface MoreProps {
  onNavigate: (route: string) => void;
}

const INSTALL_DISMISSED_KEY = 'jibeman_pwa_install_dismissed';

function detectIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function More({ onNavigate }: MoreProps) {
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [checkingSilent, setCheckingSilent] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pwaState, setPwaState] = useState<PwaUpdateState>(() => pwaManager.getState());
  const [installDismissed, setInstallDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const isIos = detectIosDevice();
  const lockEnabled = isLockEnabled();
  const cloudCfg = getCfg();
  const [iphoneSummary, setIphoneSummary] = useState(() => getActiveIphoneSummary());

  useEffect(() => {
    return pwaManager.subscribe(setPwaState);
  }, []);

  useEffect(() => {
    setIphoneSummary(getActiveIphoneSummary());
    return subscribeIphoneStore(() => setIphoneSummary(getActiveIphoneSummary()));
  }, []);

  // Live lightweight summary counts so the user sees app state at a glance
  const stats = useLiveQuery(async () => {
    const [
      loans,
      installments,
      debts,
      debtPayments,
      goals,
      splitGroups,
      personsCount,
      rules,
      categoriesCount,
      compareSessions,
      impulseSessions,
      assetsCount,
    ] = await Promise.all([
      db.loans.toArray(),
      db.installments.toArray(),
      db.debts.toArray(),
      db.debtPayments.toArray(),
      db.goals.toArray(),
      db.splitGroups.toArray(),
      db.persons.count(),
      db.rules.toArray(),
      db.categories.count(),
      db.compareSessions.toArray(),
      db.impulseSessions.toArray(),
      db.assets.filter(a => !a.archivedAt).count(),
    ]);

    const unpaidInstCount = installments.filter(
      (i) => i.paidTxnId == null && i.paidAt == null
    ).length;

    const paidByDebt = new Map<number, number>();
    for (const p of debtPayments) {
      paidByDebt.set(p.debtId, (paidByDebt.get(p.debtId) ?? 0) + p.amount);
    }
    const openDebtsCount = debts.filter(
      (d) => d.amount - (paidByDebt.get(d.id ?? -1) ?? 0) > 0
    ).length;

    const activeGoalsCount = goals.filter((g) => !g.closed).length;
    const activeGroupsCount = splitGroups.filter((g) => !g.closed).length;
    const activeRulesCount = rules.filter((r) => r.enabled).length;
    const openComparesCount = compareSessions.filter((c) => c.status === 'OPEN').length;
    const activeBrakesCount = impulseSessions.filter(
      (s) => s.status === 'COOLING_OFF' || s.status === 'WAITING_EVAL'
    ).length;

    return {
      loansCount: loans.length,
      unpaidInstCount,
      openDebtsCount,
      activeGoalsCount,
      activeGroupsCount,
      personsCount,
      activeRulesCount,
      categoriesCount,
      openComparesCount,
      activeBrakesCount,
      assetsCount,
    };
  });

  const handleApplyUpdate = async () => {
    setApplyingUpdate(true);
    setStatusMessage('در حال دریافت و نصب نسخه جدید...');
    const res = await pwaManager.applyUpdate();
    if (!res.ok) {
      setApplyingUpdate(false);
      setStatusMessage(
        res.reason === 'offline'
          ? 'برای نصب نسخه جدید باید به اینترنت متصل باشید.'
          : 'خطا در نصب نسخه جدید؛ لطفاً دوباره تلاش کنید.'
      );
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleSilentCheck = async () => {
    if (checkingSilent || applyingUpdate) return;
    setCheckingSilent(true);
    setStatusMessage('در حال بررسی نسخه...');
    try {
      const hasNew = await pwaManager.checkForUpdate(true);
      if (hasNew) {
        setStatusMessage(null);
      } else {
        setStatusMessage(`نسخه ${formatVersionFa(APP_VERSION)} به‌روز است`);
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch {
      setStatusMessage('بررسی انجام نشد؛ اتصال اینترنت را چک کنید.');
      setTimeout(() => setStatusMessage(null), 3000);
    } finally {
      setCheckingSilent(false);
    }
  };

  const handleInstallAction = async () => {
    if (pwaState.canInstallPrompt) {
      const outcome = await pwaManager.promptInstall();
      if (outcome === 'dismissed') {
        dismissInstallBanner();
      }
      return;
    }
    if (isIos) {
      setShowIosGuide(true);
    }
  };

  const dismissInstallBanner = () => {
    setInstallDismissed(true);
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
    } catch {
      // ignore storage failure
    }
  };

  const showInstallBanner =
    !pwaState.isStandalone &&
    !installDismissed &&
    (pwaState.canInstallPrompt || isIos);

  const smartTools = [
    {
      id: 'impulse',
      label: 'ترمز خرید هیجانی',
      desc: 'تأخیر و خرید آگاهانه',
      icon: ShieldAlert,
      iconColor: 'bg-amber-500/15 text-amber-300',
      badge:
        stats && stats.activeBrakesCount > 0
          ? `${Money.fa(String(stats.activeBrakesCount))} فعال`
          : 'جدید',
      badgeClass:
        stats && stats.activeBrakesCount > 0
          ? 'bg-amber-500/20 text-amber-300 border-amber-400/25'
          : 'bg-lime/15 text-lime border-lime/25',
    },
    {
      id: 'compare',
      label: 'مقایسه خرید',
      desc: 'ارزش خرید و خط قرمزها',
      icon: Scale,
      iconColor: 'bg-emerald-500/15 text-emerald-300',
      badge:
        stats && stats.openComparesCount > 0
          ? `${Money.fa(String(stats.openComparesCount))} باز`
          : undefined,
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/25',
    },
    {
      id: 'iphone',
      label: 'خرید آیفون',
      desc: 'چک‌لیست و راهنمای تست آیفون کارکرده و بدون کد',
      icon: Smartphone,
      iconColor: 'bg-sky/15 text-sky',
      spanFull: true,
      badge:
        iphoneSummary.criticalFailedCount > 0
          ? `${Money.fa(String(iphoneSummary.criticalFailedCount))} خط قرمز`
          : iphoneSummary.checkedCount > 0
            ? `${Money.fa(String(iphoneSummary.checkedCount))}/${Money.fa(String(iphoneSummary.total))}`
            : 'جدید',
      badgeClass:
        iphoneSummary.criticalFailedCount > 0
          ? 'bg-bad/15 text-bad border-bad/25'
          : iphoneSummary.checkedCount > 0
            ? 'bg-sky/15 text-sky border-sky/25'
            : 'bg-lime/15 text-lime border-lime/25',
    },
  ];

  const financeGrid = [
    {
      id: 'investments',
      label: 'مرکز سرمایه‌گذاری',
      sub:
        stats && stats.assetsCount > 0
          ? `${Money.fa(String(stats.assetsCount))} دارایی ثبت‌شده`
          : 'طلا، نقره، سکه و دارایی‌ها',
      icon: Coins,
      iconColor: 'bg-amber-500/15 text-amber-300',
    },
    {
      id: 'loans',
      label: 'وام و اقساط',
      sub:
        stats && stats.loansCount > 0
          ? `${Money.fa(String(stats.loansCount))} وام · ${Money.fa(String(stats.unpaidInstCount))} قسط`
          : 'مدیریت اقساط و سررسید',
      icon: Building2,
      iconColor: 'bg-sky/15 text-sky',
    },
    {
      id: 'debts',
      label: 'بدهی و طلب',
      sub:
        stats && stats.openDebtsCount > 0
          ? `${Money.fa(String(stats.openDebtsCount))} مورد در جریان`
          : 'پیگیری و تسویه حساب',
      icon: HandCoins,
      iconColor: 'bg-ok/15 text-ok',
    },
    {
      id: 'goals',
      label: 'اهداف پس‌انداز',
      sub:
        stats && stats.activeGoalsCount > 0
          ? `${Money.fa(String(stats.activeGoalsCount))} هدف فعال`
          : 'قلک‌ها و برنامه‌ریزی',
      icon: Target,
      iconColor: 'bg-lime/15 text-lime',
    },
    {
      id: 'splits',
      label: 'محاسبه دنگ',
      sub:
        stats && stats.activeGroupsCount > 0
          ? `${Money.fa(String(stats.activeGroupsCount))} گروه فعال`
          : 'تقسیم هزینه سفر و جمع',
      icon: Users,
      iconColor: 'bg-primary/20 text-sky',
    },
  ];

  const settingsRows = [
    {
      id: 'people',
      label: 'اشخاص و مخاطبین',
      icon: UserCheck,
      iconColor: 'bg-purple-500/15 text-purple-300',
      meta:
        stats && stats.personsCount > 0
          ? `${Money.fa(String(stats.personsCount))} نفر`
          : undefined,
      metaClass: 'text-muted',
    },
    {
      id: 'rules',
      label: 'قوانین خودکار پیامک',
      icon: Wand2,
      iconColor: 'bg-amber-500/15 text-amber-300',
      meta:
        stats && stats.activeRulesCount > 0
          ? `${Money.fa(String(stats.activeRulesCount))} قانون`
          : undefined,
      metaClass: 'text-muted',
    },
    {
      id: 'categories',
      label: 'دسته‌بندی‌ها',
      icon: Tags,
      iconColor: 'bg-pink-500/15 text-pink-300',
      meta:
        stats && stats.categoriesCount > 0
          ? `${Money.fa(String(stats.categoriesCount))} دسته`
          : undefined,
      metaClass: 'text-muted',
    },
    {
      id: 'security',
      label: 'امنیت و قفل',
      icon: Shield,
      iconColor: 'bg-emerald-500/15 text-emerald-300',
      meta: lockEnabled ? 'فعال' : 'خاموش',
      metaClass: lockEnabled
        ? 'px-2 py-0.5 rounded-full bg-ok/15 text-ok text-[10px] font-bold'
        : 'text-muted',
    },
    {
      id: 'backup',
      label: 'پشتیبان‌گیری و همگام‌سازی',
      icon: Database,
      iconColor: 'bg-warn/15 text-warn',
      meta: cloudCfg ? 'ابری متصل' : 'محلی',
      metaClass: cloudCfg
        ? 'px-2 py-0.5 rounded-full bg-sky/15 text-sky text-[10px] font-bold'
        : 'text-muted',
    },
  ];

  return (
    <div className="flex flex-col pb-28 pt-3.5 px-4 max-w-md mx-auto">
      {/* Compact Header */}
      <div className="flex items-center justify-between mb-3.5">
        <div>
          <h1 className="text-lg font-black text-white tracking-tight">امکانات و تنظیمات</h1>
        </div>
        <div className="flex items-center gap-1.5">
          {lockEnabled && (
            <button
              type="button"
              onClick={() => onNavigate('security')}
              className="h-7 px-2.5 rounded-full bg-ok/10 border border-ok/20 text-ok text-[10px] font-bold flex items-center gap-1 active:scale-95 transition-transform duration-150 ease-out"
            >
              <Lock size={11} />
              <span>قفل فعال</span>
            </button>
          )}
          {cloudCfg && (
            <button
              type="button"
              onClick={() => onNavigate('backup')}
              className="h-7 px-2.5 rounded-full bg-sky/10 border border-sky/20 text-sky text-[10px] font-bold flex items-center gap-1 active:scale-95 transition-transform duration-150 ease-out"
            >
              <Cloud size={11} />
              <span>همگام</span>
            </button>
          )}
        </div>
      </div>

      {/* Conditional Update Banner — ONLY visible when an update is actually available */}
      {pwaState.hasUpdate && (
        <div className="mb-3 p-3 rounded-[20px] bg-gradient-to-l from-lime/15 via-surface to-surface border border-lime/35 flex items-center justify-between gap-2.5 animate-fade-in">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-lime text-onLime flex items-center justify-center shrink-0">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white block truncate">
                {pwaState.availableVersion && pwaState.availableVersion !== APP_VERSION
                  ? `نسخه جدید ${formatVersionFa(pwaState.availableVersion)} آماده است`
                  : 'نسخه جدید برنامه آماده است'}
              </span>
              <span className="text-[10px] text-white/70 block truncate">
                {statusMessage || 'بدون حذف اطلاعات به‌روزرسانی می‌شود'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleApplyUpdate}
            disabled={applyingUpdate}
            className="px-3 py-1.5 bg-lime text-onLime text-[11px] font-extrabold rounded-xl active:scale-[0.97] transition-transform duration-150 ease-out shrink-0 disabled:opacity-50 flex items-center gap-1.5 shadow-fab"
          >
            <RefreshCw size={12} className={applyingUpdate ? 'animate-spin' : ''} />
            <span>{applyingUpdate ? 'در حال نصب...' : 'به‌روزرسانی'}</span>
          </button>
        </div>
      )}

      {/* Conditional PWA Install Strip — ONLY visible when NOT installed as standalone */}
      {showInstallBanner && (
        <div className="mb-3.5 rounded-[18px] bg-gradient-to-r from-[#1B3883]/90 to-surface border border-white/10 flex items-center pr-3 pl-1.5 py-2 gap-2">
          <button
            type="button"
            onClick={handleInstallAction}
            className="flex-1 flex items-center gap-2.5 text-right min-w-0 active:scale-[0.99] transition-transform duration-150 ease-out"
          >
            <div className="w-8 h-8 rounded-xl bg-lime text-onLime flex items-center justify-center shrink-0">
              <Smartphone size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-bold text-white block truncate">
                {pwaState.canInstallPrompt ? 'نصب اپلیکیشن جیب من' : 'نصب روی صفحه اصلی آیفون'}
              </span>
              <span className="text-[10px] text-white/70 block truncate">
                {pwaState.canInstallPrompt
                  ? 'دسترسی سریع، تمام‌صفحه و آفلاین'
                  : 'افزودن آیکون برنامه به Home Screen'}
              </span>
            </div>
            <ChevronLeft size={16} className="text-white/60 shrink-0" />
          </button>

          <button
            type="button"
            onClick={dismissInstallBanner}
            aria-label="بستن پیشنهاد نصب"
            className="w-7 h-7 rounded-lg text-white/50 hover:text-white flex items-center justify-center shrink-0 active:scale-95 transition-transform duration-150 ease-out"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Section 1: Smart Shopping Tools (2-column row) */}
      <div className="mb-3.5">
        <div className="text-[11px] font-bold text-muted px-1 mb-1.5">دستیار خرید هوشمند</div>
        <div className="grid grid-cols-2 gap-2.5">
          {smartTools.map((item) => {
            const Icon = item.icon;
            const isFull = 'spanFull' in item && Boolean(item.spanFull);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`p-3 rounded-[20px] bg-surface hover:bg-surface2 border border-line text-right flex transition-[transform,background-color] duration-150 ease-out ${
                  isFull
                    ? 'col-span-2 items-center justify-between gap-3 active:scale-[0.98]'
                    : 'flex-col justify-between gap-2.5 active:scale-[0.97]'
                }`}
              >
                <div className={isFull ? 'flex items-center gap-3 min-w-0' : 'flex items-start justify-between w-full gap-1'}>
                  <div className={`w-9 h-9 rounded-[13px] flex items-center justify-center shrink-0 ${item.iconColor}`}>
                    <Icon size={19} />
                  </div>
                  {isFull ? (
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{item.label}</div>
                      <div className="text-[10px] text-muted truncate mt-0.5">{item.desc}</div>
                    </div>
                  ) : (
                    item.badge && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${item.badgeClass}`}>
                        {item.badge}
                      </span>
                    )
                  )}
                </div>
                {isFull ? (
                  <div className="flex items-center gap-2 shrink-0">
                    {item.badge && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${item.badgeClass}`}>
                        {item.badge}
                      </span>
                    )}
                    <ChevronLeft size={15} className="text-muted/70" />
                  </div>
                ) : (
                  <div className="min-w-0 w-full">
                    <div className="text-xs font-bold text-white truncate">{item.label}</div>
                    <div className="text-[10px] text-muted truncate mt-0.5">{item.desc}</div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 2: Financial Management (2x2 Bento Grid) */}
      <div className="mb-3.5">
        <div className="text-[11px] font-bold text-muted px-1 mb-1.5">مدیریت مالی</div>
        <div className="grid grid-cols-2 gap-2.5">
          {financeGrid.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className="p-3 rounded-[20px] bg-surface hover:bg-surface2 border border-line text-right flex flex-col justify-between gap-2.5 active:scale-[0.97] transition-[transform,background-color] duration-150 ease-out"
              >
                <div className="flex items-center justify-between w-full">
                  <div className={`w-9 h-9 rounded-[13px] flex items-center justify-center shrink-0 ${item.iconColor}`}>
                    <Icon size={19} />
                  </div>
                  <ChevronLeft size={14} className="text-muted/60" />
                </div>
                <div className="min-w-0 w-full">
                  <div className="text-xs font-bold text-white truncate">{item.label}</div>
                  <div className="text-[10px] text-muted truncate mt-0.5">{item.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 3: App Settings & Data (Single Unified Inset Card) */}
      <div>
        <div className="text-[11px] font-bold text-muted px-1 mb-1.5">تنظیمات و داده‌ها</div>
        <div className="rounded-[22px] bg-surface border border-line divide-y divide-line overflow-hidden">
          {settingsRows.map((row) => {
            const Icon = row.icon;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => onNavigate(row.id)}
                className="w-full px-3.5 py-2.5 hover:bg-surface2/70 flex items-center justify-between gap-3 text-right active:scale-[0.99] transition-[transform,background-color] duration-150 ease-out"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${row.iconColor}`}>
                    <Icon size={17} />
                  </div>
                  <span className="text-xs font-bold text-white truncate">{row.label}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {row.meta && (
                    <span className={`text-[11px] ${row.metaClass}`}>{row.meta}</span>
                  )}
                  <ChevronLeft size={15} className="text-muted/70" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quiet Version Footer (tap version to silently check without button clutter) */}
      <div className="mt-5 text-center text-muted text-[11px] space-y-0.5">
        <button
          type="button"
          onClick={handleSilentCheck}
          disabled={checkingSilent}
          className="inline-flex items-center gap-1.5 font-semibold text-white/60 hover:text-white/85 active:scale-[0.98] transition-transform duration-150 ease-out"
        >
          <span>
            جیب من · نسخه {formatVersionFa(APP_VERSION)}
            {APP_VERSION_INFO.build ? ` (${formatVersionFa(String(APP_VERSION_INFO.build))})` : ''}
          </span>
          {checkingSilent && <RefreshCw size={11} className="animate-spin text-lime" />}
        </button>
        <div className="text-[10px] text-muted/80">
          {statusMessage && !pwaState.hasUpdate
            ? statusMessage
            : 'کاملاً آفلاین · رمزنگاری‌شده در حافظه دستگاه'}
        </div>
      </div>

      {/* iOS Install Guide Modal */}
      {showIosGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowIosGuide(false)}
        >
          <div
            className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-4 animate-modal-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <h2 className="text-sm font-bold text-white">نحوه نصب روی آیفون</h2>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                aria-label="بستن"
                className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted active:scale-95 transition-transform duration-150 ease-out"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs text-white/90 leading-relaxed">
              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-lime text-onLime font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                  ۱
                </div>
                <div>
                  این صفحه را در مرورگر <strong>Safari (سافاری)</strong> آیفون باز کنید.
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-lime text-onLime font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                  ۲
                </div>
                <div>
                  دکمه <strong>Share</strong> (مربع با فلش رو به بالا <Share size={14} className="inline mx-1 text-sky" />) در پایین مرورگر را بزنید.
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-lime text-onLime font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                  ۳
                </div>
                <div>
                  گزینه <strong>Add to Home Screen</strong> (<PlusSquare size={14} className="inline mx-1 text-sky" /> افزودن به صفحه اصلی) را انتخاب کنید.
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-lime text-onLime font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                  ۴
                </div>
                <div>
                  کار تمام است! آیکون «جیب من» در کنار بقیه برنامه‌های آیفون قرار می‌گیرد و بدون اینترنت هم سریع و تمام‌صفحه باز می‌شود.
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs shadow-fab active:scale-[0.98] transition-transform duration-150 ease-out"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
