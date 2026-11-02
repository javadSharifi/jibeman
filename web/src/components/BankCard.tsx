import React, { useState } from 'react';
import { Copy, Check, Eye, EyeOff, Radio, Edit2 } from 'lucide-react';
import { getBankByCode, type Bank } from '../core/banks';
import { BankKit } from '../core/bankKit';
import { Money } from '../core/money';
import { BankLogo, EmvChip } from './BankLogos';
import type { AccountWithBalance } from '../core/db/helpers';

interface BankCardProps {
  account: AccountWithBalance;
  hidden?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  variant?: 'mini' | 'large';
  interactive?: boolean;
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
    'karafarin', 'markazi', 'mehr', 'post', 'resalat', 'saderat',
    'sanatmadan', 'sarmaye', 'shahr', 'sina', 'tosesaderat', 'tosetaavon'
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
  onEdit,
  variant = 'mini',
  interactive = true,
}: BankCardProps) {
  const bank = getBankByCode(account.bankCode) || BankKit.detectByCard(account.cardNumber);
  const primaryColor = account.cardColor || bank?.color || '#1F5FD6';
  const gradientEnd = bank?.gradientEnd || '#0E3EA3';

  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [showCvv, setShowCvv] = useState(false);

  const copyToClipboard = (e: React.MouseEvent, text: string, itemKey: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedItem(itemKey);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const panDigits = BankKit.cleanDigits(account.cardNumber);
  const displayPan = panDigits.length === 16
    ? BankKit.formatCardNumber(panDigits)
    : panDigits.length > 0
    ? panDigits.match(/.{1,4}/g)?.join(' ') || panDigits
    : '•••• •••• •••• ••••';

  if (variant === 'mini') {
    return (
      <div
        onClick={onClick}
        role="button"
        tabIndex={0}
        className="w-[146px] h-[134px] rounded-[20px] p-3 flex flex-col justify-between shrink-0 relative overflow-hidden border border-white/20 shadow-card cursor-pointer active:scale-95 transition-transform text-white select-none"
        style={{
          background: `radial-gradient(75% 60% at 20% 0%, rgba(255,255,255,0.45), transparent 70%), linear-gradient(150deg, ${primaryColor} 0%, ${gradientEnd} 100%)`,
        }}
      >
        <div className="flex items-center justify-between z-10">
          <BankLogoBadge bank={bank} size={30} />
          {account.last4 && (
            <div className="text-[10px] px-2 py-0.5 rounded-[8px] bg-white/20 font-mono tracking-wider font-semibold">
              *{Money.fa(account.last4)}
            </div>
          )}
        </div>

        <div className="z-10 mt-auto">
          <div className="text-[11px] opacity-90 truncate font-semibold">
            {account.name}
          </div>
          <div className="text-base font-extrabold mt-0.5 tracking-tight">
            {hidden ? Money.HIDDEN : Money.group(Math.floor(account.balance / 10))}
            <span className="text-[10px] font-normal opacity-75 mr-1">تومان</span>
          </div>
        </div>
      </div>
    );
  }

  // Realistic Large Bank Card variant
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className="w-full rounded-[26px] p-5 flex flex-col justify-between relative overflow-hidden border border-white/30 shadow-[0_18px_36px_rgba(8,25,80,0.5)] cursor-pointer text-white select-none transition-all active:scale-[0.99]"
      style={{
        background: `radial-gradient(85% 65% at 15% 0%, rgba(255,255,255,0.45), transparent 75%), linear-gradient(145deg, ${primaryColor} 0%, ${gradientEnd} 100%)`,
      }}
    >
      {/* 1. Header: Logo, Name & Contactless Wave */}
      <div className="flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <BankLogoBadge bank={bank} size={40} />
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>{bank ? `بانک ${bank.name}` : account.name}</span>
            </div>
            {bank && account.name !== bank.name && (
              <div className="text-[11px] text-white/80">{account.name}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              title="ویرایش مشخصات کارت"
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-all active:scale-95 border border-white/25 shadow-sm"
            >
              <Edit2 size={13} />
              <span>ویرایش</span>
            </button>
          )}
          {/* Contactless / NFC indicator */}
          <div className="flex items-center gap-1 text-white/80" title="Contactless / شتاب">
            <Radio size={22} className="rotate-90" />
          </div>
        </div>
      </div>

      {/* 2. Chip & Shetab Row */}
      <div className="flex items-center justify-between z-10 mt-4 mb-2">
        <EmvChip className="w-11 h-8 shadow-sm" />
        <span className="text-xs font-bold text-white/80 tracking-wider">شتاب</span>
      </div>

      {/* 3. Embossed 16-Digit Card Number with Copy Action */}
      <div className="z-10 my-2">
        <div
          onClick={(e) => panDigits.length >= 16 && copyToClipboard(e, panDigits, 'pan')}
          className="flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-white/10 active:bg-white/20 transition-colors"
        >
          <div className="font-mono text-xl sm:text-[22px] tracking-[3px] text-white font-extrabold dir-ltr">
            {Money.fa(displayPan)}
          </div>
          {panDigits.length >= 16 && (
            <button className="text-white/80 hover:text-white mr-2">
              {copiedItem === 'pan' ? <Check size={16} className="text-lime" /> : <Copy size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* 4. Bottom Info: Expiry, CVV2, Card Type */}
      <div className="flex items-end justify-between z-10 pt-2 border-t border-white/15">
        <div className="flex items-center gap-4">
          {account.cardExpiry && (
            <div>
              <span className="text-[9px] text-white/70 block font-medium">انقضا</span>
              <span className="text-xs font-bold font-mono dir-ltr">
                {Money.fa(BankKit.formatExpiry(account.cardExpiry))}
              </span>
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
                  {showCvv ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
              </div>
              <span
                onClick={(e) => copyToClipboard(e, account.cardCvv2!, 'cvv')}
                className="text-xs font-bold font-mono dir-ltr cursor-pointer hover:underline"
              >
                {showCvv ? Money.fa(account.cardCvv2) : '•••'}
              </span>
            </div>
          )}
        </div>

        <div>
          <span className="text-[9.5px] text-white/75 font-mono uppercase tracking-widest block">
            {account.type === 'BANK' ? 'DEBIT CARD' : account.type}
          </span>
        </div>
      </div>

      {/* 5. Optional IBAN bar */}
      {account.iban && (
        <div
          onClick={(e) => copyToClipboard(e, `IR${BankKit.cleanDigits(account.iban)}`, 'iban')}
          className="z-10 mt-3 pt-2 border-t border-white/15 flex items-center justify-between text-xs font-mono text-white/90 dir-ltr px-1 hover:bg-white/5 rounded-lg transition-colors"
        >
          <span>{BankKit.formatIban(account.iban)}</span>
          <button className="text-white/80 ml-2">
            {copiedItem === 'iban' ? <Check size={14} className="text-lime" /> : <Copy size={14} />}
          </button>
        </div>
      )}

      {/* 6. Usable Balance */}
      <div className="z-10 mt-3 pt-2 border-t border-white/20 flex items-baseline justify-between">
        <span className="text-[11px] text-white/80">موجودی حساب</span>
        <div className="text-lg font-black dir-ltr">
          {hidden ? Money.HIDDEN : Money.group(Math.floor(account.balance / 10))}
          <span className="text-[10px] font-normal text-white/80 mr-1.5">تومان</span>
        </div>
      </div>
    </div>
  );
}
