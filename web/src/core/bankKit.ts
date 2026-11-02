import { Banks, findBankByCardPrefix, type Bank } from './banks';

export const CardPalettes = {
  presets: [
    { color: '#1E2024', name: 'مشکی آبنوسی' },
    { color: '#1F5FD6', name: 'آبی بلو' },
    { color: '#C8102E', name: 'قرمز ملت' },
    { color: '#1C7A4B', name: 'سبز کشاورزی' },
    { color: '#0B4F9C', name: 'سرمه‌ای ملی' },
    { color: '#B8860B', name: 'طلایی پاسارگاد' },
    { color: '#0A6EBD', name: 'فیروزه‌ای سامان' },
    { color: '#E65100', name: 'نارنجی مسکن' },
    { color: '#00796B', name: 'سبز رفاه' },
    { color: '#5B21B6', name: 'بنفش درباری' },
    { color: '#991B1B', name: 'یاقوتی' },
    { color: '#065F46', name: 'زمردی' },
    { color: '#B76E79', name: 'رز گلد' },
    { color: '#0F172A', name: 'دریایی عمیق' },
    { color: '#475569', name: 'تیتانیوم' },
  ]
};

export const BankKit = {
  cleanDigits(str?: string | null): string {
    if (!str) return '';
    const fa = '۰۱۲۳۴۵۶۷۸۹';
    const ar = '٠١٢٣٤٥٦٧٨٩';
    let res = '';
    for (const ch of str) {
      const fi = fa.indexOf(ch);
      const ai = ar.indexOf(ch);
      if (fi >= 0) res += String(fi);
      else if (ai >= 0) res += String(ai);
      else if (/\d/.test(ch)) res += ch;
    }
    return res;
  },

  validateCard(cardNumber?: string | null): boolean {
    const digits = this.cleanDigits(cardNumber);
    if (digits.length !== 16) return false;
    let sum = 0;
    for (let i = 0; i < 16; i++) {
      let d = parseInt(digits[i], 10);
      if (i % 2 === 0) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    return sum % 10 === 0;
  },

  formatCardNumber(value?: string | null): string {
    const digits = this.cleanDigits(value).slice(0, 16);
    if (!digits) return '';
    return digits.match(/.{1,4}/g)?.join(' ') || digits;
  },

  formatExpiry(value?: string | null): string {
    const digits = this.cleanDigits(value).slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
  },

  formatIban(value?: string | null): string {
    let raw = (value || '').toUpperCase().replace(/\s+/g, '');
    if (!raw.startsWith('IR')) raw = `IR${raw}`;
    const digits = this.cleanDigits(raw).slice(0, 24);
    if (!digits) return 'IR';

    const parts: string[] = [];
    if (digits.length >= 2) parts.push(digits.slice(0, 2));
    else parts.push(digits);

    let idx = 2;
    while (idx < digits.length) {
      const end = Math.min(idx + 4, digits.length);
      parts.push(digits.slice(idx, end));
      idx = end;
    }
    return `IR ${parts.join(' ')}`.trim();
  },

  detectByCard(cardNumber?: string | null): Bank | undefined {
    const digits = this.cleanDigits(cardNumber);
    if (digits.length < 6) return undefined;
    return findBankByCardPrefix(digits);
  }
};
