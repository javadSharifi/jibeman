import React, { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, X } from 'lucide-react';
import { pwaManager } from '../core/pwa';

export function PwaUpdateBanner() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    return pwaManager.subscribe((updateAvailable) => {
      setHasUpdate(updateAvailable);
      if (updateAvailable) setDismissed(false);
    });
  }, []);

  if (!hasUpdate || dismissed) return null;

  const handleUpdate = async () => {
    setIsUpdating(true);
    await pwaManager.applyUpdate();
  };

  return (
    <div className="fixed top-3 inset-x-3 max-w-md mx-auto z-50 animate-slide-down">
      <div className="p-3.5 rounded-2xl bg-[#141C30]/95 border border-lime/40 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 text-white">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-lime/20 text-lime flex items-center justify-center shrink-0">
            <Sparkles size={18} />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-bold text-white block truncate">نسخه جدید برنامه آماده است!</span>
            <span className="text-[10px] text-white/70 block truncate">برای بارگذاری امکانات جدید کلیک کنید</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleUpdate}
            disabled={isUpdating}
            className="px-3 py-1.5 bg-lime text-onLime text-xs font-bold rounded-xl active:scale-95 transition-all shadow flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw size={12} className={isUpdating ? 'animate-spin' : ''} />
            <span>{isUpdating ? 'در حال نصب...' : 'به‌روزرسانی'}</span>
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="w-7 h-7 rounded-lg text-white/50 hover:text-white flex items-center justify-center active:scale-95 transition-all"
            aria-label="بستن"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
