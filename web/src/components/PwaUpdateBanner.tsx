import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, RefreshCw, X, AlertCircle, PlusCircle, Wrench, Zap } from 'lucide-react';
import { pwaManager } from '../core/pwa';
import { APP_VERSION, formatVersionFa, type AppChangelog } from '../core/version';

export function PwaUpdateBanner() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [availableChangelog, setAvailableChangelog] = useState<AppChangelog | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const hadUpdateRef = useRef(false);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return pwaManager.subscribe((state) => {
      setHasUpdate(state.hasUpdate);
      setAvailableVersion(state.availableVersion);
      setAvailableChangelog(state.availableChangelog);
      if (state.hasUpdate && !hadUpdateRef.current) {
        setDismissedVersion(null);
        setUpdateError(null);
      }
      hadUpdateRef.current = state.hasUpdate;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    };
  }, []);

  const updateKey = availableVersion ?? 'pending';
  if (!hasUpdate || dismissedVersion === updateKey) return null;

  const handleUpdate = async () => {
    setIsUpdating(true);
    setUpdateError(null);

    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    safetyTimerRef.current = setTimeout(() => {
      setIsUpdating(false);
      setUpdateError('به‌روزرسانی بیش از حد طول کشید. لطفاً دوباره امتحان کنید.');
    }, 20_000);

    const res = await pwaManager.applyUpdate();
    if (!res.ok) {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      setIsUpdating(false);
      setUpdateError(
        res.reason === 'offline'
          ? 'برای دریافت نسخه جدید، اتصال اینترنت را بررسی کنید.'
          : 'خطا در نصب نسخه جدید؛ لطفاً دوباره تلاش کنید.'
      );
    }
  };

  const title =
    availableVersion && availableVersion !== APP_VERSION
      ? `نسخه جدید ${formatVersionFa(availableVersion)} منتشر شد!`
      : 'نسخه جدید برنامه آماده است!';

  const changelogSections = [
    {
      key: 'added',
      label: 'امکانات جدید',
      items: availableChangelog?.added ?? [],
      icon: PlusCircle,
      badgeClass: 'bg-lime/15 text-lime',
      dotClass: 'bg-lime',
    },
    {
      key: 'fixed',
      label: 'رفع باگ‌ها و خطاها',
      items: availableChangelog?.fixed ?? [],
      icon: Wrench,
      badgeClass: 'bg-ok/15 text-ok',
      dotClass: 'bg-ok',
    },
    {
      key: 'improved',
      label: 'بهبودها',
      items: availableChangelog?.improved ?? [],
      icon: Zap,
      badgeClass: 'bg-sky/15 text-sky',
      dotClass: 'bg-sky',
    },
  ].filter((section) => section.items.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-update-title"
        className="w-full max-w-sm rounded-[28px] bg-sheet border border-lime/35 p-5 shadow-2xl space-y-4 text-white animate-modal-in"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-lime/20 text-lime flex items-center justify-center shrink-0">
              <Sparkles size={22} />
            </div>
            <div className="min-w-0">
              <h2 id="pwa-update-title" className="text-sm font-extrabold text-white leading-snug">
                {title}
              </h2>
              <p className="text-[11px] text-white/65 mt-0.5">
                نسخه فعلی: {formatVersionFa(APP_VERSION)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDismissedVersion(updateKey)}
            disabled={isUpdating}
            className="w-8 h-8 rounded-full bg-surface text-muted hover:text-white flex items-center justify-center active:scale-95 transition-all shrink-0 disabled:opacity-40"
            aria-label="بستن"
          >
            <X size={16} />
          </button>
        </div>

        {changelogSections.length > 0 ? (
          <div className="space-y-2.5">
            {availableChangelog?.title && (
              <p className="text-xs font-bold text-white/90 leading-relaxed">
                {availableChangelog.title}
              </p>
            )}
            <div className="max-h-56 overflow-y-auto rounded-2xl bg-surface/80 border border-line/70 p-3 space-y-3">
              {changelogSections.map((section) => {
                const Icon = section.icon;
                return (
                  <div key={section.key} className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${section.badgeClass}`}
                      >
                        <Icon size={11} />
                        <span>{section.label}</span>
                      </span>
                    </div>
                    <ul className="space-y-1 pr-1">
                      {section.items.map((item, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-[11px] text-white/85 leading-relaxed"
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${section.dotClass}`}
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-white/60 leading-relaxed">
              تمام اطلاعات مالی شما به‌صورت امن روی دستگاه باقی می‌ماند.
            </p>
          </div>
        ) : (
          <p className="text-xs text-white/80 leading-relaxed">
            برای دریافت امکانات و رفع باگ‌های جدید به‌روزرسانی کنید. تمام اطلاعات مالی شما به‌صورت امن روی دستگاه باقی می‌ماند.
          </p>
        )}

        {updateError && (
          <div className="p-2.5 rounded-xl bg-bad/15 border border-bad/30 text-bad text-[11px] flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{updateError}</span>
          </div>
        )}

        <div className="flex gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => setDismissedVersion(updateKey)}
            disabled={isUpdating}
            className="flex-1 h-11 rounded-xl bg-surface border border-line text-xs font-bold text-t2 hover:text-white active:scale-[0.97] transition-all disabled:opacity-40"
          >
            بعداً
          </button>
          <button
            type="button"
            onClick={handleUpdate}
            disabled={isUpdating}
            className="flex-[1.5] h-11 bg-lime text-onLime text-xs font-extrabold rounded-xl active:scale-[0.97] transition-all shadow-fab flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            <RefreshCw size={14} className={isUpdating ? 'animate-spin' : ''} />
            <span>{isUpdating ? 'در حال نصب...' : 'به‌روزرسانی'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
