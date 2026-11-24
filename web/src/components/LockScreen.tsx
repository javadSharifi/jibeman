import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Delete, Fingerprint } from 'lucide-react';
import { verifyPin, isBiometricEnabled, verifyBiometric, recordActivity } from '../core/security';
import { Money } from '../core/money';

interface LockScreenProps {
  onUnlock: () => void;
}

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function LockScreen({ onUnlock }: LockScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const biometricAvailable = isBiometricEnabled();

  const handleSuccessfulUnlock = useCallback(() => {
    recordActivity();
    onUnlock();
  }, [onUnlock]);

  const triggerBiometric = useCallback(async () => {
    if (!biometricAvailable) return;
    const ok = await verifyBiometric();
    if (ok) {
      handleSuccessfulUnlock();
    }
  }, [biometricAvailable, handleSuccessfulUnlock]);

  // Prompt biometric on initial screen render if enabled
  useEffect(() => {
    if (biometricAvailable) {
      // Small timeout to allow UI transition
      const t = setTimeout(() => {
        triggerBiometric();
      }, 300);
      return () => clearTimeout(t);
    }
  }, [biometricAvailable, triggerBiometric]);

  const handleDigit = useCallback(
    async (digit: string) => {
      if (pin.length >= 4) return;
      const nextPin = pin + digit;
      setPin(nextPin);
      setError(false);

      if (nextPin.length === 4) {
        const valid = await verifyPin(nextPin);
        if (valid) {
          handleSuccessfulUnlock();
        } else {
          setError(true);
          setShake(true);
          setTimeout(() => setShake(false), 500);
          setTimeout(() => setPin(''), 400);
        }
      }
    },
    [pin, handleSuccessfulUnlock]
  );

  const handleDelete = useCallback(() => {
    setPin(prev => prev.slice(0, -1));
    setError(false);
  }, []);

  // Physical keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const digit = Money.ascii(e.key);
      if (/^\d$/.test(digit)) {
        handleDigit(digit);
      } else if (e.key === 'Backspace') {
        handleDelete();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDigit, handleDelete]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between safe-lock bg-[#070b14] text-white select-none overflow-x-hidden overflow-y-auto animate-fade-in">
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[340px] h-[340px] bg-primary/20 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Header */}
      <div className="relative z-10 flex flex-col items-center pt-8 text-center">
        <div className="w-16 h-16 rounded-[22px] bg-lime text-onLime flex items-center justify-center shadow-glow mb-4">
          <Lock size={30} strokeWidth={2.4} />
        </div>
        <h1 className="text-xl font-black text-white">جیب من</h1>
        <p className="text-xs text-muted mt-1">
          {error ? (
            <span className="text-warn font-bold">رمز عبور وارد شده اشتباه است</span>
          ) : (
            'برنامه قفل است · رمز عبور ۴ رقمی را وارد کنید'
          )}
        </p>

        {/* 4-digit PIN Dots */}
        <div className={`flex items-center gap-4 mt-8 ${shake ? 'animate-bounce text-warn' : ''}`}>
          {[0, 1, 2, 3].map(idx => {
            const filled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  error
                    ? 'bg-warn scale-110'
                    : filled
                    ? 'bg-lime shadow-[0_0_12px_rgba(232,252,180,0.8)] scale-115'
                    : 'bg-white/15 border border-white/20'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Numeric Keypad */}
      <div className="relative z-10 w-full max-w-[280px] pb-6">
        <div className="grid grid-cols-3 gap-y-4 gap-x-5 place-items-center">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigit(num.toString())}
              className="w-16 h-16 rounded-[24px] bg-surface/80 hover:bg-surface border border-line text-xl font-bold text-white flex items-center justify-center active:scale-90 transition-transform shadow-sm"
            >
              {FA_DIGITS[num]}
            </button>
          ))}

          {/* Biometric Button (if enabled) */}
          {biometricAvailable ? (
            <button
              type="button"
              onClick={triggerBiometric}
              className="w-16 h-16 rounded-[24px] bg-sky/15 hover:bg-sky/25 border border-sky/30 text-sky flex items-center justify-center active:scale-90 transition-transform"
              title="ورود با اثر انگشت"
            >
              <Fingerprint size={28} />
            </button>
          ) : (
            <div className="w-16 h-16" />
          )}

          {/* 0 */}
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="w-16 h-16 rounded-[24px] bg-surface/80 hover:bg-surface border border-line text-xl font-bold text-white flex items-center justify-center active:scale-90 transition-transform shadow-sm"
          >
            {FA_DIGITS[0]}
          </button>

          {/* Backspace / Delete */}
          <button
            type="button"
            onClick={handleDelete}
            className="w-16 h-16 rounded-[24px] bg-surface/50 hover:bg-surface border border-line/60 text-muted hover:text-white flex items-center justify-center active:scale-90 transition-transform"
            title="پاک کردن"
          >
            <Delete size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}
