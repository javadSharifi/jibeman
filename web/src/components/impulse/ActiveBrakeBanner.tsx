import React, { useState, useEffect } from 'react';
import { ShieldAlert, Clock, ChevronLeft, Sparkles, CheckCircle2 } from 'lucide-react';
import { db, type ImpulseSession } from '../../core/db';
import { formatTimeRemaining } from '../../core/impulseEngine';

interface ActiveBrakeBannerProps {
  onOpenSession: (sessionId: number) => void;
}

export function ActiveBrakeBanner({ onOpenSession }: ActiveBrakeBannerProps) {
  const [activeSessions, setActiveSessions] = useState<ImpulseSession[]>([]);
  const [nowTime, setNowTime] = useState(Date.now());

  useEffect(() => {
    const load = async () => {
      const list = await db.impulseSessions
        .filter(s => s.status === 'COOLING_OFF' || s.status === 'WAITING_EVAL')
        .reverse()
        .toArray();
      setActiveSessions(list);
    };

    load();
    const sub = setInterval(() => {
      setNowTime(Date.now());
      load();
    }, 2000);

    return () => clearInterval(sub);
  }, []);

  if (activeSessions.length === 0) return null;

  const topSession = activeSessions[0];
  const isFinished = topSession.status === 'WAITING_EVAL' || nowTime >= topSession.coolingEndsAt;
  const remainingMs = Math.max(0, topSession.coolingEndsAt - nowTime);
  const timeInfo = formatTimeRemaining(remainingMs);

  return (
    <div
      onClick={() => onOpenSession(topSession.id!)}
      className="mx-4 my-2 p-3 rounded-2xl bg-gradient-to-r from-amber-500/20 via-surface to-surface border border-amber-500/40 cursor-pointer shadow-lg active:scale-98 transition-all flex items-center justify-between z-30"
    >
      <div className="flex items-center gap-2.5">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            isFinished
              ? 'bg-lime text-onLime animate-bounce'
              : 'bg-amber-500/20 text-amber-400 animate-pulse'
          }`}
        >
          {isFinished ? <Sparkles size={18} /> : <Clock size={18} />}
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black text-white">
              {isFinished ? 'زمان انتظار به پایان رسید!' : 'ترمز خرید هیجانی فعال'}
            </span>
            <span className="text-[9px] font-bold bg-amber-500/30 text-amber-300 px-1.5 py-0.2 rounded-full">
              {topSession.itemTitle}
            </span>
          </div>
          <p className="text-[10px] text-muted mt-0.5">
            {isFinished
              ? 'برای ارزیابی مجدد خرید و تصمیم‌گیری ضربه بزنید'
              : `زمان باقی‌مانده: ${timeInfo.text}`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 text-xs font-bold text-amber-400 shrink-0">
        <span>{isFinished ? 'تصمیم‌گیری' : 'مشاهده'}</span>
        <ChevronLeft size={16} />
      </div>
    </div>
  );
}
