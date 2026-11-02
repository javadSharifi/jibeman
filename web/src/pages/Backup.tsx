import React, { useState } from 'react';
import {
  Download,
  Upload,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Cloud,
  RefreshCw,
  LogOut,
  Mail,
  Lock,
  ArrowRightLeft,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedInitialDataIfNeeded } from '../core/db';
import { HeaderBar } from '../components/UI';
import { connect, disconnect, getCfg, syncNow, SyncHttpError } from '../core/sync';

export function Backup({ onBack }: { onBack: () => void }) {
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // Cloud Sync form state
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');

  // Sync state tracking
  const [cfg, setSyncCfg] = useState(() => getCfg());
  const pendingCount = useLiveQuery(() => db.outbox?.count() ?? 0, [], 0);

  const refreshCfg = () => setSyncCfg(getCfg());

  const handleCloudAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('لطفاً یک ایمیل معتبر وارد کنید.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('رمز عبور باید حداقل ۸ کاراکتر باشد.');
      return;
    }
    if (mode === 'register' && password !== password2) {
      setErrorMsg('رمزهای عبور وارد شده یکسان نیستند.');
      return;
    }

    setBusy(true);
    try {
      await connect(cleanEmail, password, mode);
      refreshCfg();
      setStatusMsg(
        mode === 'register'
          ? 'حساب ابری ساخته شد و اطلاعات پشتیبان‌گیری شد.'
          : 'ورود موفق! اطلاعات شما از کلادفلر بازیابی شد.'
      );
      setEmail('');
      setPassword('');
      setPassword2('');
    } catch (err: any) {
      if (err instanceof SyncHttpError) {
        if (err.status === 409) {
          setErrorMsg('با این ایمیل قبلاً حساب ساخته شده است. لطفاً حالت «ورود» را انتخاب کنید.');
        } else if (err.status === 401) {
          setErrorMsg('ایمیل یا رمز اشتباه است، یا حسابی با این مشخصات یافت نشد.');
        } else if (err.status === 429) {
          setErrorMsg('تعداد تلاش‌های شما بیش از حد بوده است. چند دقیقه دیگر امتحان کنید.');
        } else {
          setErrorMsg(`خطای سرور (${err.status})`);
        }
      } else {
        setErrorMsg('اتصال به سرور برقرار نشد. لطفاً اتصال اینترنت خود را بررسی کنید.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleManualSync = async () => {
    setBusy(true);
    setErrorMsg('');
    setStatusMsg('');
    try {
      await syncNow();
      refreshCfg();
      setStatusMsg('همگام‌سازی ابری با موفقیت انجام شد.');
    } catch (err: any) {
      setErrorMsg('خطا در برقراری ارتباط با سرور.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (confirm('آیا از خروج از حساب ابری مطمئن هستید؟ اطلاعات روی این دستگاه باقی می‌ماند.')) {
      await disconnect();
      refreshCfg();
      setStatusMsg('از حساب ابری خارج شدید.');
    }
  };

  const handleExport = async () => {
    try {
      const [accounts, cards, categories, txns, loans, installments, debts, debtPayments, goals, goalEntries, splitGroups, splitExpenses] = await Promise.all([
        db.accounts.toArray(),
        db.cards.toArray(),
        db.categories.toArray(),
        db.txns.toArray(),
        db.loans.toArray(),
        db.installments.toArray(),
        db.debts.toArray(),
        db.debtPayments.toArray(),
        db.goals.toArray(),
        db.goalEntries.toArray(),
        db.splitGroups.toArray(),
        db.splitExpenses.toArray(),
      ]);

      const backupObj = {
        version: 1,
        exportedAt: Date.now(),
        data: {
          accounts,
          cards,
          categories,
          txns,
          loans,
          installments,
          debts,
          debtPayments,
          goals,
          goalEntries,
          splitGroups,
          splitExpenses,
        }
      };

      const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jibeman-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMsg('پشتیبان محلی با موفقیت دانلود شد.');
    } catch (e) {
      alert('خطا در تهیه پشتیبان');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.data) {
        alert('فایل پشتیبان نامعتبر است.');
        return;
      }

      const d = parsed.data;
      await Promise.all([
        db.accounts.clear(),
        db.cards.clear(),
        db.categories.clear(),
        db.txns.clear(),
        db.loans.clear(),
        db.installments.clear(),
        db.debts.clear(),
        db.debtPayments.clear(),
        db.goals.clear(),
        db.goalEntries.clear(),
        db.splitGroups.clear(),
        db.splitExpenses.clear(),
      ]);

      if (d.accounts?.length) await db.accounts.bulkAdd(d.accounts);
      if (d.cards?.length) await db.cards.bulkAdd(d.cards);
      if (d.categories?.length) await db.categories.bulkAdd(d.categories);
      if (d.txns?.length) await db.txns.bulkAdd(d.txns);
      if (d.loans?.length) await db.loans.bulkAdd(d.loans);
      if (d.installments?.length) await db.installments.bulkAdd(d.installments);
      if (d.debts?.length) await db.debts.bulkAdd(d.debts);
      if (d.debtPayments?.length) await db.debtPayments.bulkAdd(d.debtPayments);
      if (d.goals?.length) await db.goals.bulkAdd(d.goals);
      if (d.goalEntries?.length) await db.goalEntries.bulkAdd(d.goalEntries);
      if (d.splitGroups?.length) await db.splitGroups.bulkAdd(d.splitGroups);
      if (d.splitExpenses?.length) await db.splitExpenses.bulkAdd(d.splitExpenses);

      setStatusMsg('داده‌ها با موفقیت بازیابی شدند.');
    } catch (err) {
      alert('خطا در خواندن فایل پشتیبان.');
    }
  };

  const handleReset = async () => {
    if (confirm('آیا مطمئن هستید؟ تمام داده‌های مالی شما پاک شده و به حالت اولیه بازمی‌گردد!')) {
      await db.delete();
      await db.open();
      await seedInitialDataIfNeeded();
      setStatusMsg('اطلاعات بازنشانی شد.');
      setTimeout(() => window.location.reload(), 1000);
    }
  };

  return (
    <div className="flex flex-col pb-28 pt-2 px-4 max-w-md mx-auto">
      <HeaderBar title="پشتیبان‌گیری و همگام‌سازی" onBack={onBack} />

      {/* Cloudflare Cloud Sync Card */}
      <div className="mt-4 p-5 rounded-[24px] bg-surface border border-line shadow-lg relative overflow-hidden">
        <div className="flex items-center justify-between pb-3 border-b border-line/60">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-sky/15 text-sky flex items-center justify-center">
              <Cloud size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">پشتیبان‌گیری ابری کلادفلر</h3>
              <p className="text-[11px] text-muted">ذخیره امن و بازیابی خودکار روی گوشی یا سیستم جدید</p>
            </div>
          </div>
          {cfg && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-ok/15 text-ok text-[11px] font-bold">
              <span className="w-2 h-2 rounded-full bg-ok animate-pulse" />
              متصل
            </span>
          )}
        </div>

        {cfg ? (
          /* Connected State */
          <div className="mt-4 space-y-4">
            <div className="p-3.5 rounded-2xl bg-surface2/60 border border-line/50 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted">ایمیل متصل:</span>
                <span className="font-mono text-white font-semibold dir-ltr">{cfg.email}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted">آخرین همگام‌سازی:</span>
                <span className="text-white">
                  {cfg.at ? new Date(cfg.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : 'در انتظار'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted">تغییرات در صف ارسال:</span>
                <span className={pendingCount > 0 ? 'text-lime font-bold' : 'text-muted'}>
                  {pendingCount > 0 ? `${pendingCount} مورد` : 'همه‌چیز همگام است'}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleManualSync}
                disabled={busy}
                className="flex-1 h-11 rounded-xl bg-sky text-black font-bold text-xs flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50"
              >
                <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />
                <span>{busy ? 'در حال همگام‌سازی...' : 'همگام‌سازی الان'}</span>
              </button>
              <button
                onClick={handleDisconnect}
                disabled={busy}
                className="h-11 px-3.5 rounded-xl bg-bad/15 text-bad hover:bg-bad/25 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-98 transition-all"
                title="خروج از حساب"
              >
                <LogOut size={16} />
                <span>خروج</span>
              </button>
            </div>
          </div>
        ) : (
          /* Not Connected Form */
          <div className="mt-4">
            {/* Mode Switcher */}
            <div className="grid grid-cols-2 p-1 rounded-xl bg-surface2/80 border border-line/60 mb-4 text-xs font-bold">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`py-2 rounded-lg transition-all ${
                  mode === 'login' ? 'bg-sky text-black shadow-sm' : 'text-muted hover:text-white'
                }`}
              >
                ورود به حساب (گوشی جدید)
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className={`py-2 rounded-lg transition-all ${
                  mode === 'register' ? 'bg-sky text-black shadow-sm' : 'text-muted hover:text-white'
                }`}
              >
                ساخت حساب ابری
              </button>
            </div>

            <form onSubmit={handleCloudAuth} className="space-y-3">
              <div className="relative">
                <div className="absolute right-3.5 top-3.5 text-muted pointer-events-none">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ایمیل شما (مثلاً Gmail)"
                  dir="ltr"
                  required
                  className="w-full h-11 pr-10 pl-3 rounded-xl bg-surface2/50 border border-line/60 text-white placeholder-muted text-xs focus:outline-none focus:border-sky transition-colors font-mono"
                />
              </div>

              <div className="relative">
                <div className="absolute right-3.5 top-3.5 text-muted pointer-events-none">
                  <Lock size={16} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="رمز عبور (حداقل ۸ کاراکتر)"
                  dir="ltr"
                  required
                  className="w-full h-11 pr-10 pl-3 rounded-xl bg-surface2/50 border border-line/60 text-white placeholder-muted text-xs focus:outline-none focus:border-sky transition-colors"
                />
              </div>

              {mode === 'register' && (
                <div className="relative">
                  <div className="absolute right-3.5 top-3.5 text-muted pointer-events-none">
                    <Lock size={16} />
                  </div>
                  <input
                    type="password"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    placeholder="تکرار رمز عبور"
                    dir="ltr"
                    required
                    className="w-full h-11 pr-10 pl-3 rounded-xl bg-surface2/50 border border-line/60 text-white placeholder-muted text-xs focus:outline-none focus:border-sky transition-colors"
                  />
                </div>
              )}

              <p className="text-[10px] text-muted leading-relaxed px-1">
                {mode === 'login'
                  ? '💡 اگر قبلاً حساب ساخته‌اید یا روی گوشی قبلی اطلاعات داشتید، با وارد کردن همان ایمیل و رمز، اطلاعات شما فوراً بازنشانی می‌شود.'
                  : '🔒 امنیت کامل: رمز و ایمیل شما فقط روی دستگاه به کلید امن تبدیل می‌شوند و هرگز به صورت متنی روی سرور ذخیره نمی‌شوند.'}
              </p>

              <button
                type="submit"
                disabled={busy}
                className="w-full h-12 rounded-xl bg-sky hover:bg-sky/90 text-black font-black text-xs flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50 mt-2 shadow-md"
              >
                {busy ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>در حال اتصال...</span>
                  </>
                ) : (
                  <>
                    <ArrowRightLeft size={16} />
                    <span>{mode === 'register' ? 'ساخت حساب و همگام‌سازی ابری' : 'ورود و بازیابی اطلاعات'}</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>

      {statusMsg && (
        <div className="mt-3 p-3.5 rounded-2xl bg-ok/15 text-ok text-xs font-bold flex items-center gap-2 border border-ok/20">
          <CheckCircle2 size={18} className="shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="mt-3 p-3.5 rounded-2xl bg-bad/15 text-bad text-xs font-bold flex items-center gap-2 border border-bad/20">
          <AlertTriangle size={18} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Manual Backup Options */}
      <div className="mt-6">
        <h4 className="text-xs font-bold text-muted mb-2 px-1">پشتیبان‌گیری دستی (آفلاین)</h4>
        <div className="space-y-3">
          {/* Export Button */}
          <button
            onClick={handleExport}
            className="w-full h-14 rounded-2xl bg-surface hover:bg-surface2 border border-line p-4 flex items-center justify-between text-white active:scale-98 transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-lime/15 text-lime flex items-center justify-center">
                <Download size={18} />
              </div>
              <div className="text-right">
                <span className="text-xs font-bold block">دانلود فایل پشتیبان (JSON)</span>
                <span className="text-[10px] text-muted">ذخیره تمام اطلاعات در قالب فایل</span>
              </div>
            </div>
          </button>

          {/* Import Button */}
          <label className="w-full h-14 rounded-2xl bg-surface hover:bg-surface2 border border-line p-4 flex items-center justify-between text-white active:scale-98 transition-transform cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky/15 text-sky flex items-center justify-center">
                <Upload size={18} />
              </div>
              <div className="text-right">
                <span className="text-xs font-bold block">بازیابی از فایل پشتیبان</span>
                <span className="text-[10px] text-muted">انتخاب فایل پشتیبان قبلی</span>
              </div>
            </div>
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>

          {/* Reset Button */}
          <button
            onClick={handleReset}
            className="w-full h-14 rounded-2xl bg-bad/10 hover:bg-bad/20 border border-bad/20 p-4 flex items-center justify-between text-bad active:scale-98 transition-transform mt-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-bad/20 text-bad flex items-center justify-center">
                <AlertTriangle size={18} />
              </div>
              <div className="text-right">
                <span className="text-xs font-bold block">حذف کامل و بازنشانی برنامه</span>
                <span className="text-[10px] opacity-80">پاک کردن کل تراکنش‌ها و حساب‌ها</span>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
