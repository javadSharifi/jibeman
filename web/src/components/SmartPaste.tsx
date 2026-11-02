import React, { useState } from 'react';
import { X, ClipboardPaste, CheckCircle2, AlertCircle, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { parseBankSms, type ParsedSms } from '../core/parser';
import { getBankByCode } from '../core/banks';
import { Money } from '../core/money';
import { db, type Account, type Category } from '../core/db';

interface SmartPasteProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function SmartPaste({ isOpen, onClose, onSuccess }: SmartPasteProps) {
  const [smsText, setSmsText] = useState('');
  const [parsed, setParsed] = useState<ParsedSms | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedAccId, setSelectedAccId] = useState<number | null>(null);
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setSmsText('');
      setParsed(null);
      Promise.all([
        db.accounts.filter(a => !a.archived).toArray(),
        db.categories.toArray(),
      ]).then(([accs, cats]) => {
        setAccounts(accs);
        setCategories(cats);
        if (accs.length > 0) setSelectedAccId(accs[0].id!);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleParse = (text: string) => {
    setSmsText(text);
    if (!text.trim()) {
      setParsed(null);
      return;
    }
    const res = parseBankSms(text);
    setParsed(res);

    if (res) {
      // Auto-match account by bank or last4
      if (res.card4) {
        db.cards.where('last4').equals(res.card4).first().then(card => {
          if (card) setSelectedAccId(card.accountId);
        });
      } else if (res.bank && res.bank !== 'other') {
        const matchingAcc = accounts.find(a => a.bankCode === res.bank);
        if (matchingAcc) setSelectedAccId(matchingAcc.id!);
      }

      // Auto-match category using smart rules or defaults
      db.rules.filter(r => r.enabled).toArray().then(rules => {
        const matchingRule = rules.find(r => r.contains && text.includes(r.contains));
        if (matchingRule && matchingRule.categoryId) {
          setSelectedCatId(matchingRule.categoryId);
        } else {
          const targetCats = categories.filter(c => c.kind === res.type);
          if (res.description?.includes('شارژ')) {
            const cat = targetCats.find(c => c.name.includes('شارژ'));
            if (cat) setSelectedCatId(cat.id!);
          } else if (targetCats.length > 0) {
            setSelectedCatId(targetCats[0].id!);
          }
        }
      });
    }
  };

  const handleReadClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handleParse(text);
      }
    } catch {
      // If clipboard permission is restricted by browser, user can paste into textarea
    }
  };

  const handleConfirm = async () => {
    if (!parsed || !selectedAccId) return;

    await db.txns.add({
      type: parsed.type,
      amount: parsed.amount,
      accountId: selectedAccId,
      categoryId: selectedCatId || undefined,
      title: parsed.description || (parsed.type === 'INCOME' ? 'واریز بانکی' : 'برداشت بانکی'),
      balanceAfter: parsed.balance,
      occurredAt: parsed.occurredAt,
      source: 'SMS',
      createdAt: Date.now(),
    });

    onClose();
    if (onSuccess) onSuccess();
  };

  const bank = parsed ? getBankByCode(parsed.bank) : null;
  const tomanAmt = parsed ? Math.floor(parsed.amount / 10) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-sheet rounded-[28px] border border-white/10 p-5 flex flex-col shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-line">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-lime/15 text-lime flex items-center justify-center">
              <ClipboardPaste size={18} />
            </div>
            <h2 className="text-sm font-bold text-white">ثبت پیامک بانکی (Smart Paste)</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Paste Box */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-muted">متن پیامک بانکی را وارد یا جای‌گذاری کنید:</span>
            <button
              onClick={handleReadClipboard}
              className="text-xs text-sky font-semibold flex items-center gap-1 active:opacity-70"
            >
              <ClipboardPaste size={14} />
              چسباندن از کلیپ‌بورد
            </button>
          </div>
          <textarea
            rows={3}
            value={smsText}
            onChange={(e) => handleParse(e.target.value)}
            placeholder="مثلاً: برداشت 322,000 مانده 100,186,745 کارت 9829*..."
            className="w-full p-3 rounded-2xl bg-surface border border-line text-white text-xs leading-relaxed focus:outline-none focus:border-sky resize-none placeholder:text-muted/60"
          />
        </div>

        {/* Parsed Result Card */}
        {parsed ? (
          <div className="mt-4 p-4 rounded-2xl bg-surface border border-line space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm text-white"
                  style={{ backgroundColor: bank?.color || '#3880F2' }}
                >
                  {bank?.letter || 'ب'}
                </div>
                <div>
                  <div className="text-xs font-bold text-white">{bank?.name || 'بانک شناسایی‌شده'}</div>
                  <div className="text-[10px] text-muted">{parsed.description}</div>
                </div>
              </div>

              <div className={`px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 ${
                parsed.type === 'INCOME' ? 'bg-ok/15 text-ok' : 'bg-bad/15 text-bad'
              }`}>
                {parsed.type === 'INCOME' ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                {parsed.type === 'INCOME' ? 'واریز' : 'برداشت'}
              </div>
            </div>

            {/* Extracted Amount */}
            <div className="pt-2 border-t border-line flex items-baseline justify-between">
              <span className="text-xs text-muted">مبلغ استخراج‌شده:</span>
              <div className="text-lg font-black text-white dir-ltr">
                {Money.group(tomanAmt)}
                <span className="text-[10px] text-muted font-normal mr-1">تومان</span>
              </div>
            </div>
            <div className="text-[11px] text-muted text-left dir-rtl">
              {Money.words(tomanAmt)} تومان
            </div>

            {/* Account Selector */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <div>
                <label className="text-[10px] text-muted block mb-1">اتصال به حساب</label>
                <select
                  value={selectedAccId || ''}
                  onChange={(e) => setSelectedAccId(Number(e.target.value))}
                  className="w-full h-9 rounded-xl bg-surface2 border border-line text-white text-xs px-2 focus:outline-none"
                >
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-muted block mb-1">دسته‌بندی</label>
                <select
                  value={selectedCatId || ''}
                  onChange={(e) => setSelectedCatId(Number(e.target.value))}
                  className="w-full h-9 rounded-xl bg-surface2 border border-line text-white text-xs px-2 focus:outline-none"
                >
                  {categories.filter(c => c.kind === parsed.type).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Confirm button */}
            <button
              onClick={handleConfirm}
              className="w-full h-11 mt-2 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-fab active:scale-95 transition-transform"
            >
              <CheckCircle2 size={16} />
              تأیید و ذخیره در تراکنش‌ها
            </button>
          </div>
        ) : smsText.trim() ? (
          <div className="mt-4 p-3 rounded-2xl bg-warn/10 border border-warn/20 flex items-center gap-2 text-warn text-xs">
            <AlertCircle size={18} className="shrink-0" />
            <span>متن واردشده با الگوی هیچ‌یک از بانک‌های پشتیبانی‌شده همخوانی نداشت.</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
