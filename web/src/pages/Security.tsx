import React, { useState, useEffect } from 'react';
import {
  Shield,
  KeyRound,
  Fingerprint,
  Timer,
  Check,
  AlertTriangle,
  Lock,
  X,
} from 'lucide-react';
import { HeaderBar, LimeButton } from '../components/UI';
import {
  isLockEnabled,
  setPin,
  verifyPin,
  removePin,
  isBiometricEnabled,
  setBiometricEnabled,
  isBiometricSupported,
  registerBiometric,
  getLockTimeout,
  setLockTimeout,
  TIMEOUT_OPTIONS,
} from '../core/security';

interface SecurityProps {
  onBack: () => void;
}

export function Security({ onBack }: SecurityProps) {
  const [locked, setLocked] = useState(isLockEnabled());
  const [biometricOn, setBiometricOn] = useState(isBiometricEnabled());
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [timeoutMs, setTimeoutMs] = useState(getLockTimeout());

  // Modals
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [changeModalOpen, setChangeModalOpen] = useState(false);
  const [removeModalOpen, setRemoveModalOpen] = useState(false);

  useEffect(() => {
    isBiometricSupported().then(supported => {
      setBiometricSupported(supported);
    });
  }, []);

  const handleToggleLock = () => {
    if (locked) {
      setRemoveModalOpen(true);
    } else {
      setSetupModalOpen(true);
    }
  };

  const handleToggleBiometric = async () => {
    if (!locked) return;
    if (biometricOn) {
      setBiometricEnabled(false);
      setBiometricOn(false);
    } else {
      const ok = await registerBiometric();
      if (ok) {
        setBiometricOn(true);
      } else {
        alert('ثبت اثر انگشت با خطا مواجه شد یا توسط کاربر لغو شد.');
      }
    }
  };

  const handleSelectTimeout = (val: number) => {
    setLockTimeout(val);
    setTimeoutMs(val);
  };

  return (
    <div className="flex flex-col pb-28 pt-2 px-4 max-w-md mx-auto animate-fade-in">
      <HeaderBar title="امنیت و رمز عبور" onBack={onBack} />

      <div className="mt-4 space-y-4">
        {/* PIN Lock Card */}
        <div className="p-4 rounded-[24px] bg-surface border border-line space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-lime/15 text-lime flex items-center justify-center">
                <Lock size={20} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white">قفل با رمز پین (PIN)</h3>
                <p className="text-[10px] text-muted mt-0.5">رمز ۴ رقمی برای ورود به برنامه</p>
              </div>
            </div>

            <button
              onClick={handleToggleLock}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                locked ? 'bg-lime' : 'bg-surface2 border border-line'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full transition-transform ${
                  locked ? 'bg-onLime -translate-x-6' : 'bg-muted translate-x-0'
                }`}
              />
            </button>
          </div>

          {locked && (
            <div className="pt-2 border-t border-line/50 flex items-center justify-between">
              <span className="text-[11px] text-muted">رمز عبور ۴ رقمی فعال است</span>
              <button
                onClick={() => setChangeModalOpen(true)}
                className="text-xs text-sky font-bold hover:underline"
              >
                تغییر رمز پین
              </button>
            </div>
          )}
        </div>

        {/* Biometrics Card */}
        <div className="p-4 rounded-[24px] bg-surface border border-line space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-sky/15 text-sky flex items-center justify-center">
                <Fingerprint size={22} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white">ورود با اثر انگشت یا چهره</h3>
                <p className="text-[10px] text-muted mt-0.5">Touch ID / Face ID / حسگر بیومتریک</p>
              </div>
            </div>

            <button
              onClick={handleToggleBiometric}
              disabled={!locked || !biometricSupported}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 disabled:opacity-40 ${
                biometricOn && locked ? 'bg-lime' : 'bg-surface2 border border-line'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full transition-transform ${
                  biometricOn && locked ? 'bg-onLime -translate-x-6' : 'bg-muted translate-x-0'
                }`}
              />
            </button>
          </div>

          {!biometricSupported ? (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-warn/10 text-warn text-[10px] leading-relaxed">
              <AlertTriangle size={15} className="shrink-0" />
              <span>
                حسگر بیومتریک در این مرورگر یا دستگاه در دسترس نیست (نیاز به فعال بودن سخت‌افزار و باز شدن روی پروتکل HTTPS دارد).
              </span>
            </div>
          ) : !locked ? (
            <p className="text-[10px] text-muted">برای فعال‌سازی اثر انگشت ابتدا باید رمز پین را فعال کنید.</p>
          ) : null}
        </div>

        {/* Auto Lock Timeout */}
        {locked && (
          <div className="p-4 rounded-[24px] bg-surface border border-line space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/15 text-purple-300 flex items-center justify-center">
                <Timer size={20} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white">زمان قفل خودکار</h3>
                <p className="text-[10px] text-muted mt-0.5">پس از خروج یا پنهان شدن صفحه</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              {TIMEOUT_OPTIONS.map(opt => {
                const active = timeoutMs === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleSelectTimeout(opt.value)}
                    className={`h-10 px-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-colors ${
                      active
                        ? 'bg-lime/15 border-lime text-lime'
                        : 'bg-surface2 border-line text-white/80 hover:bg-surface2/80'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {active && <Check size={15} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Security Banner */}
        <div className="p-4 rounded-[24px] bg-surface2/60 border border-line flex items-start gap-3">
          <Shield size={20} className="text-lime shrink-0 mt-0.5" />
          <div className="text-[11px] text-muted leading-relaxed">
            رمز پین شما با الگوریتم استاندارد <strong className="text-white">SHA-256</strong> و کلید تصادفی (Salt) تنها در حافظه داخلی همین مرورگر ذخیره می‌شود. هیچ رمزی به اینترنت یا سرور ارسال نمی‌شود.
          </div>
        </div>
      </div>

      {/* Setup PIN Modal */}
      {setupModalOpen && (
        <PinModal
          title="تنظیم رمز عبور پین"
          mode="setup"
          onSuccess={() => {
            setSetupModalOpen(false);
            setLocked(true);
          }}
          onClose={() => setSetupModalOpen(false)}
        />
      )}

      {/* Change PIN Modal */}
      {changeModalOpen && (
        <PinModal
          title="تغییر رمز عبور پین"
          mode="change"
          onSuccess={() => {
            setChangeModalOpen(false);
          }}
          onClose={() => setChangeModalOpen(false)}
        />
      )}

      {/* Remove PIN Modal */}
      {removeModalOpen && (
        <PinModal
          title="حذف رمز عبور"
          mode="verify"
          onSuccess={() => {
            removePin();
            setLocked(false);
            setBiometricOn(false);
            setRemoveModalOpen(false);
          }}
          onClose={() => setRemoveModalOpen(false)}
        />
      )}
    </div>
  );
}

// Subcomponent: PIN Entry Modal for setup, change, and remove
interface PinModalProps {
  title: string;
  mode: 'setup' | 'change' | 'verify';
  onSuccess: () => void;
  onClose: () => void;
}

function PinModal({ title, mode, onSuccess, onClose }: PinModalProps) {
  const [step, setStep] = useState<'old' | 'new' | 'confirm'>(
    mode === 'change' ? 'old' : mode === 'verify' ? 'old' : 'new'
  );
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentInput = step === 'old' ? oldPin : step === 'new' ? newPin : confirmPin;

  const handleDigit = async (d: string) => {
    if (currentInput.length >= 4) return;
    const next = currentInput + d;
    setErrorMsg(null);

    if (step === 'old') {
      setOldPin(next);
      if (next.length === 4) {
        const ok = await verifyPin(next);
        if (ok) {
          if (mode === 'verify') {
            onSuccess();
          } else {
            setStep('new');
          }
        } else {
          setErrorMsg('رمز فعلی اشتباه است');
          setTimeout(() => setOldPin(''), 500);
        }
      }
    } else if (step === 'new') {
      setNewPin(next);
      if (next.length === 4) {
        setStep('confirm');
      }
    } else if (step === 'confirm') {
      setConfirmPin(next);
      if (next.length === 4) {
        if (next === newPin) {
          await setPin(newPin);
          onSuccess();
        } else {
          setErrorMsg('رمز وارد شده با تکرار آن همخوانی ندارد');
          setTimeout(() => {
            setConfirmPin('');
            setStep('new');
            setNewPin('');
          }, 800);
        }
      }
    }
  };

  const handleDelete = () => {
    if (step === 'old') setOldPin(prev => prev.slice(0, -1));
    else if (step === 'new') setNewPin(prev => prev.slice(0, -1));
    else setConfirmPin(prev => prev.slice(0, -1));
    setErrorMsg(null);
  };

  const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xs bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-4 text-center">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <h2 className="text-sm font-bold text-white">{title}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-surface flex items-center justify-center text-muted">
            <X size={15} />
          </button>
        </div>

        <div className="space-y-1">
          <span className="text-xs font-bold text-white block">
            {step === 'old'
              ? 'رمز فعلی را وارد کنید'
              : step === 'new'
              ? 'رمز ۴ رقمی جدید را انتخاب کنید'
              : 'رمز جدید را دوباره تکرار کنید'}
          </span>
          {errorMsg ? (
            <span className="text-[11px] text-warn font-semibold">{errorMsg}</span>
          ) : (
            <span className="text-[10px] text-muted">۴ رقم را با کیپد زیر وارد کنید</span>
          )}
        </div>

        {/* Indicator dots */}
        <div className="flex items-center justify-center gap-3 py-2">
          {[0, 1, 2, 3].map(idx => (
            <div
              key={idx}
              className={`w-3.5 h-3.5 rounded-full transition-all ${
                currentInput.length > idx ? 'bg-lime scale-110' : 'bg-white/20'
              }`}
            />
          ))}
        </div>

        {/* Small keypad for modal */}
        <div className="grid grid-cols-3 gap-2 pt-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <button
              key={n}
              onClick={() => handleDigit(n.toString())}
              className="h-11 rounded-xl bg-surface hover:bg-surface2 border border-line text-base font-bold text-white flex items-center justify-center active:scale-95"
            >
              {FA_DIGITS[n]}
            </button>
          ))}
          <div />
          <button
            onClick={() => handleDigit('0')}
            className="h-11 rounded-xl bg-surface hover:bg-surface2 border border-line text-base font-bold text-white flex items-center justify-center active:scale-95"
          >
            {FA_DIGITS[0]}
          </button>
          <button
            onClick={handleDelete}
            className="h-11 rounded-xl bg-surface hover:bg-surface2 border border-line text-muted flex items-center justify-center active:scale-95"
          >
            <KeyRound size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
