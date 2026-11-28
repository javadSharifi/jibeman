import React, { useState } from 'react';
import { Copy, Check, Eye, EyeOff, Radio, Edit2, Pencil, Trash2, PieChart } from 'lucide-react';
import { getBankByCode, type Bank } from '../core/banks';
import { BankKit } from '../core/bankKit';
import { Money } from '../core/money';
import { BankLogo, EmvChip } from './BankLogos';
import type { AccountWithBalance } from '../core/db/helpers';

interface BankCardProps {
  account: AccountWithBalance;
  hidden?: boolean;
  onClick?: () => void;
  onReport?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  variant?: 'mini' | 'large' | 'compact';
  interactive?: boolean;
  revealDetails?: boolean;
}

export function BankLogoBadge({
  bank,
  size = 36,
  className = '',
}: {
  bank?: Bank;
  size?: number;
  className?: string;
}) {
  const brandColor = bank?.color || '#3A3FAE';
  const hasVector = bank?.code && [
    'blu', 'keshavarzi', 'mellat', 'saman', 'pasargad', 'parsian', 'refah',
    'ayandeh', 'maskan', 'dey', 'eghtesad', 'gardeshgari', 'iranzamin',
    'karafarin', 'markazi', 'mehr', 'melli', 'post', 'resalat', 'saderat',
    'sanatmadan', 'sarmaye', 'sepah', 'shahr', 'sina', 'tejarat', 'tosesaderat', 'tosetaavon'
  ].includes(bank.code);

  return (
    <div
      className={`rounded-[11px] bg-white border border-black/10 flex items-center justify-center shrink-0 shadow-sm overflow-hidden p-1 select-none ${className}`}
      style={{ width: size, height: size }}
    >
      {hasVector ? (
        <BankLogo code={bank!.code} size={Math.round(size * 0.72)} />
      ) : (
        <span
          className="font-black"
          style={{ fontSize: Math.round(size * 0.5), color: brandColor }}
        >
          {bank?.letter || 'ب'}
        </span>
      )}
    </div>
  );
}

export function BankCard({
  account,
  hidden = false,
  onClick,
  onReport,
  onEdit,
  onDelete,
  variant = 'mini',
  interactive = true,
  revealDetails = false,
}: BankCardProps) {
  const bank = getBankByCode(account.bankCode) || BankKit.detectByCard(account.cardNumber);
  const primaryColor = account.cardColor || bank?.color || '#1F5FD6';
  const gradientEnd = bank?.gradientEnd || '#0E3EA3';

  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [showCvv, setShowCvv] = useState(true);

  const copyToClipboard = (e: React.MouseEvent, text: string, itemKey: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedItem(itemKey);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const panDigits = BankKit.cleanDigits(account.cardNumber);
  const pan = panDigits;
  const displayPan = hidden
    ? `•••• •••• •••• ${account.last4 || '••••'}`
    : panDigits
    ? (panDigits.length === 16 ? BankKit.formatCardNumber(panDigits) : panDigits.replace(/(.{4})/g, '$1 ').trim())
    : `•••• •••• •••• ${account.last4 || '••••'}`;

  if (variant === 'mini') {
    return (
      <div
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        className="w-[146px] h-[134px] rounded-[20px] p-3 flex flex-col justify-between shrink-0 relative overflow-hidden border border-white/20 shadow-card cursor-pointer active:scale-95 transition-transform text-white select-none"
        style={{
          background: `radial-gradient(75% 60% at 20% 0%, rgba(255,255,255,0.45), transparent 70%), linear-gradient(150deg, ${primaryColor} 0%, ${gradientEnd} 100%)`,
        }}
      >
        <div className="flex items-center justify-between z-10">
          <BankLogoBadge bank={bank} size={30} />
          <div className="flex items-center gap-1">
            {account.isSavings && (
              <div className="text-[9px] px-1.5 py-0.5 rounded-[6px] bg-lime text-onLime font-bold shadow-sm">
                پس‌انداز
              </div>
            )}
            {account.last4 && (
              <div className="text-[10px] px-2 py-0.5 rounded-[8px] bg-white/20 font-mono tracking-wider font-semibold">
                *{Money.fa(account.last4)}
              </div>
            )}
          </div>
        </div>

        <div className="z-10 mt-auto">
          <div className="text-[11px] opacity-90 truncate font-semibold">
            {account.name}
          </div>
          <div className="text-base font-extrabold mt-0.5 tracking-tight">
            {hidden ? Money.HIDDEN : Money.toman(account.balance)}
            <span className="text-[10px] font-normal opacity-75 mr-1">تومان</span>
          </div>
        </div>
      </div>
    );
  }

  // Compact Bank Card variant (FinPay / Shetab Card Action Design)
  if (variant === 'compact') {
    return (
      <article
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        className="w-full rounded-[24px] p-5 flex flex-col gap-4 relative overflow-hidden border border-white/20 shadow-card text-white select-none transition-all active:scale-[0.99] hover:border-white/35 cursor-pointer"
        style={{
          background: `radial-gradient(85% 65% at 15% 0%, rgba(255,255,255,0.28), transparent 75%), linear-gradient(140deg, ${primaryColor} 0%, ${gradientEnd} 100%)`,
        }}
      >
        {/* 1. Header: Bank Logo, Names, Badges, and Action Buttons (Edit, Delete) */}
        <header className="flex items-center justify-between gap-2 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <BankLogoBadge bank={bank} size={42} />
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white truncate">
                  {account.name || (bank ? `بانک ${bank.name}` : 'حساب بانکی')}
                </h3>
                {account.isSavings && (
                  <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-lime text-onLime font-black shadow-sm shrink-0">
                    پس‌انداز
                  </span>
                )}
              </div>
              <p className="text-xs text-white/75 truncate mt-0.5">
                {bank ? `کارت شتابی • ${bank.name}` : account.type === 'CASH' ? 'کیف پول نقدی' : 'حساب بانکی'}
              </p>
            </div>
          </div>

          {/* Action buttons (Report, Edit, Delete) in header */}
          <div className="flex items-center gap-1.5 shrink-0 z-20">
            {onReport && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReport();
                }}
                aria-label="گزارش ماهانه این کارت"
                title="گزارش ماهانه این کارت"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-black/25 hover:bg-black/45 text-lime transition-all active:scale-95 border border-white/10 shadow-sm"
              >
                <PieChart size={15} />
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                aria-label="ویرایش کارت"
                title="ویرایش کارت"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-black/25 hover:bg-black/45 text-white transition-all active:scale-95 border border-white/10 shadow-sm"
              >
                <Pencil size={15} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                aria-label="حذف کارت"
                title="حذف کارت"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-black/25 hover:bg-bad/30 text-bad/90 hover:text-bad transition-all active:scale-95 border border-white/10 shadow-sm"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </header>

        {/* 2. Balance Row */}
        <div className="flex items-center justify-between gap-2 z-10 pt-1">
          <span className="text-xs text-white/80 font-medium">موجودی کارت</span>
          <p className="text-2xl font-black text-white dir-ltr">
            {hidden ? Money.HIDDEN : Money.toman(account.balance)}
            <span className="text-xs font-normal text-white/80 mr-1">تومان</span>
          </p>
        </div>

        {/* 3. Card Number Bar & Copy Button */}
        {panDigits && (
          <div className="flex items-center justify-between gap-2 bg-black/35 rounded-xl px-4 py-3 border border-white/10 z-10">
            <button
              type="button"
              onClick={(e) => copyToClipboard(e, panDigits, 'pan')}
              aria-label="کپی شماره کارت"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-white/90 hover:text-white transition-opacity shrink-0 active:scale-95"
            >
              {copiedItem === 'pan' ? (
                <Check size={16} className="text-lime" />
              ) : (
                <Copy size={16} />
              )}
              <span>{copiedItem === 'pan' ? 'کپی شد' : 'کپی'}</span>
            </button>
            <p className="font-mono text-sm sm:text-base tracking-[2px] text-white font-extrabold dir-ltr select-all">
              {Money.fa(displayPan)}
            </p>
          </div>
        )}

        {/* 4. Expiry & CVV2 Footer */}
        {(account.cardExpiry || account.cardCvv2) && (
          <footer className="flex items-center justify-between gap-4 pt-3 border-t border-white/20 text-xs z-10">
            {account.cardExpiry && (
              <div className="flex items-center gap-1.5 font-mono text-white/90 dir-ltr">
                <span className="text-white/60 font-sans text-[11px]">EXP:</span>
                <span className="font-bold text-xs">
                  {hidden ? '••/••' : Money.fa(BankKit.formatExpiry(account.cardExpiry))}
                </span>
              </div>
            )}

            {account.cardCvv2 && (
              <div className="flex items-center gap-2 font-mono text-white/90 dir-ltr">
                <span className="text-white/60 font-sans text-[11px]">CVV2:</span>
                <span className="font-bold text-xs">
                  {showCvv ? (hidden ? '•••' : Money.fa(account.cardCvv2)) : '••••'}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCvv((prev) => !prev);
                  }}
                  aria-label="نمایش یا مخفی کردن CVV2"
                  className="inline-flex items-center justify-center text-white/70 hover:text-white transition-colors"
                >
                  {showCvv ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
              </div>
            )}
          </footer>
        )}
      </article>
    );
  }

  // Minimal Sleek Large Bank Card variant
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className="w-full rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between relative overflow-hidden border border-white/20 shadow-card cursor-pointer text-white select-none transition-transform active:scale-[0.99]"
      style={{
        background: `radial-gradient(85% 65% at 15% 0%, rgba(255,255,255,0.35), transparent 75%), linear-gradient(140deg, ${primaryColor} 0%, ${gradientEnd} 100%)`,
      }}
    >
      {/* 1. Header: Logo, Bank & Account Name, Badges & Actions */}
      <div className="flex items-center justify-between z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <BankLogoBadge bank={bank} size={32} />
          <div className="min-w-0">
            <div className="text-sm font-bold text-white flex items-center gap-1.5 truncate">
              <span>{bank ? `بانک ${bank.name}` : account.name}</span>
              {account.isSavings && (
                <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-lime text-onLime font-black shadow-sm shrink-0">
                  پس‌انداز
                </span>
              )}
            </div>
            {bank && account.name !== bank.name && (
              <div className="text-[11px] text-white/75 truncate">{account.name}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              title="ویرایش مشخصات کارت"
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold transition-colors active:scale-95 border border-white/20 shadow-sm"
            >
              <Edit2 size={11} />
              <span>ویرایش</span>
            </button>
          )}
          <div className="flex items-center text-white/60" title="Contactless / شتاب">
            <Radio size={16} className="rotate-90" />
          </div>
        </div>
      </div>

      {/* 2. Middle: Embossed / Masked Card Number */}
      <div className="z-10 my-2">
        <div
          onClick={(e) => {
            if (pan.length === 16) {
              copyToClipboard(e, pan, 'pan');
            }
          }}
          className={`flex items-center justify-between px-2 py-1 rounded-lg transition-colors ${
            pan.length === 16 ? 'hover:bg-white/10 cursor-pointer' : ''
          }`}
        >
          <div className="font-mono text-base sm:text-lg tracking-[2px] text-white font-extrabold dir-ltr">
            {Money.fa(displayPan)}
          </div>
          {pan.length === 16 && (
            <button type="button" aria-label="کپی شماره کارت" className="text-white/80 hover:text-white">
              {copiedItem === 'pan' ? <Check size={14} className="text-lime" /> : <Copy size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* 3. Bottom: Balance on one side, Expiry / CVV / Shetab on other side */}
      <div className="z-10 pt-2 border-t border-white/15 flex items-end justify-between">
        <div>
          <span className="text-[10px] text-white/70 block">موجودی</span>
          <div className="text-base sm:text-lg font-black dir-ltr">
            {hidden ? Money.HIDDEN : Money.toman(account.balance)}
            <span className="text-[10px] font-normal text-white/80 mr-1">تومان</span>
          </div>
        </div>

        {(account.cardExpiry || account.cardCvv2) ? (
          <div className="flex items-center gap-3 dir-ltr">
            {account.cardExpiry && (
              <div>
                <span className="text-[9px] text-white/70 block font-medium">انقضا</span>
                <bdi className="text-xs font-bold font-mono inline-block">
                  {hidden ? '••/••' : Money.fa(BankKit.formatExpiry(account.cardExpiry))}
                </bdi>
              </div>
            )}
            {account.cardCvv2 && (
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-white/70 font-medium">CVV2</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCvv(prev => !prev);
                    }}
                    className="text-white/70 hover:text-white"
                  >
                    {showCvv ? <EyeOff size={10} /> : <Eye size={10} />}
                  </button>
                </div>
                <bdi
                  onClick={(e) => {
                    if (showCvv) copyToClipboard(e, account.cardCvv2!, 'cvv');
                  }}
                  className="text-xs font-bold font-mono cursor-pointer hover:underline inline-block"
                >
                  {showCvv ? (hidden ? '•••' : Money.fa(account.cardCvv2)) : '•••'}
                </bdi>
              </div>
            )}
          </div>
        ) : (
          <span className="text-[9px] text-white/60 font-mono uppercase tracking-wider">
            {account.type === 'BANK' ? 'SHETAB' : account.type}
          </span>
        )}
      </div>

      {/* 4. Optional IBAN bar */}
      {revealDetails && account.iban && (
        <div
          onClick={(e) => copyToClipboard(e, `IR${BankKit.cleanDigits(account.iban)}`, 'iban')}
          className="z-10 mt-2 pt-1.5 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-white/90 dir-ltr px-1 hover:bg-white/5 rounded transition-colors cursor-pointer"
        >
          <span>{BankKit.formatIban(account.iban)}</span>
          <button className="text-white/80 ml-2">
            {copiedItem === 'iban' ? <Check size={12} className="text-lime" /> : <Copy size={12} />}
          </button>
        </div>
      )}
    </div>
  );
}
