import React, { useState } from 'react';
import { X, Share2, Copy, Check } from 'lucide-react';
import type { CompareSession, CompareItem, CompareCriterion, CompareCheck } from '../../core/db';
import { generateShareText } from '../../core/compareEngine';

interface ShareModalProps {
  session: CompareSession;
  items: CompareItem[];
  criteria: CompareCriterion[];
  checks: CompareCheck[];
  onClose: () => void;
}

export function ShareModal({
  session,
  items,
  criteria,
  checks,
  onClose,
}: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const text = generateShareText(session, items, criteria, checks);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `مقایسه خرید: ${session.title}`,
          text,
        });
      } catch {
        // ignore share cancellation
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-md animate-fade-in p-4">
      <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-line shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-line bg-surface/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky/20 text-sky flex items-center justify-center">
              <Share2 size={16} />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">اشتراک‌گذاری خلاصه مقایسه</h2>
              <span className="text-[11px] text-muted">ارسال به دوستان، تلگرام یا واتساپ</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface2 border border-line flex items-center justify-center text-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Text Preview */}
        <div className="p-4 space-y-3 overflow-y-auto">
          <p className="text-xs text-muted">
            متن زیر با فرمت شیک برای ارسال به پیام‌رسان‌ها جهت مشورت با دیگران آماده شده است:
          </p>

          <div className="p-3 bg-surface2 rounded-2xl border border-line/80 font-mono text-xs text-white/90 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap select-all">
            {text}
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-line bg-surface/50 space-y-2">
          <button
            onClick={handleCopy}
            className={`w-full h-12 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-98 ${
              copied
                ? 'bg-ok text-black font-black'
                : 'bg-lime text-onLime shadow-fab'
            }`}
          >
            {copied ? (
              <>
                <Check size={16} strokeWidth={3} />
                <span>متن در حافظه کپی شد!</span>
              </>
            ) : (
              <>
                <Copy size={16} />
                <span>کپی متن مقایسه</span>
              </>
            )}
          </button>

          {typeof navigator.share === 'function' && (
            <button
              onClick={handleNativeShare}
              className="w-full h-11 rounded-xl bg-surface hover:bg-surface2 border border-line text-xs font-bold text-white flex items-center justify-center gap-2"
            >
              <Share2 size={15} />
              اشتراک‌گذاری مستقیم
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
