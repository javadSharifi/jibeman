import { Jalali } from './jalali';

export interface ParsedSms {
  bank: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amount: number; // in Rial
  balance?: number; // in Rial
  occurredAt: number; // epoch ms
  card4?: string;
  accountNo?: string;
  description?: string;
  rawText: string;
}

const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

export function normalizeSmsText(s: string): string {
  let res = '';
  for (const c of s) {
    const fi = FA.indexOf(c);
    const ai = AR.indexOf(c);
    if (fi >= 0) {
      res += String(fi);
    } else if (ai >= 0) {
      res += String(ai);
    } else if (c === 'ي') {
      res += 'ی';
    } else if (c === 'ك') {
      res += 'ک';
    } else if (c === '‌') {
      res += ' ';
    } else {
      res += c;
    }
  }
  // drop comma separators between digits
  res = res.replace(/(?<=\d)[,٬](?=\d)/g, '');
  return res.split('\n').map(l => l.trim()).join('\n').trim();
}

export function parseBankSms(raw: string, sender = ''): ParsedSms | null {
  const norm = normalizeSmsText(raw);
  const now = Date.now();

  // 1. Blu Bank
  if (norm.includes('نشست') || norm.includes('پرید') || sender.includes('9999987641') || norm.includes('بلو')) {
    const isIncome = norm.includes('نشست');
    const amtMatch = norm.match(/(\d+)\s*ریال\s*(?:به حساب|بابت|از حساب)/);
    const balMatch = norm.match(/موجودی:\s*(\d+)\s*ریال/);
    const descMatch = norm.match(/بابت\s+(.+?)\s+از حساب/);

    if (amtMatch) {
      const amount = parseInt(amtMatch[1], 10);
      const balance = balMatch ? parseInt(balMatch[1], 10) : undefined;
      return {
        bank: 'blu',
        type: isIncome ? 'INCOME' : 'EXPENSE',
        amount,
        balance,
        occurredAt: now,
        description: descMatch ? descMatch[1].trim() : (isIncome ? 'واریز به حساب بلو' : 'برداشت از حساب بلو'),
        rawText: raw,
      };
    }
  }

  // 2. Keshavarzi Bank
  if (norm.includes('bki. ir') || sender.toUpperCase().includes('KESHAVARZI') || norm.includes('کشاورزی')) {
    const isIncome = /واریز/i.test(norm);
    const isExpense = /برداشت/i.test(norm);
    const amtMatch = norm.match(/(?:برداشت|واریز)[^\d\n]*(\d+)/);
    const balMatch = norm.match(/مانده\s*(\d+)/);
    const cardMatch = norm.match(/کارت\s*(\d{4})\*/);
    const accMatch = norm.match(/^(\d{6,})$/m);

    if (amtMatch && (isIncome || isExpense)) {
      const amount = parseInt(amtMatch[1], 10);
      const balance = balMatch ? parseInt(balMatch[1], 10) : undefined;
      return {
        bank: 'keshavarzi',
        type: isIncome ? 'INCOME' : 'EXPENSE',
        amount,
        balance,
        occurredAt: now,
        card4: cardMatch ? cardMatch[1] : undefined,
        accountNo: accMatch ? accMatch[1] : undefined,
        description: isIncome ? 'واریز کشاورزی' : 'برداشت کشاورزی',
        rawText: raw,
      };
    }
  }

  // 3. Mellat Bank
  if (norm.includes('ملت') || norm.includes('mellat') || sender.toUpperCase().includes('MELLAT')) {
    const isIncome = norm.includes('واریز') || norm.includes('+');
    const isExpense = norm.includes('برداشت') || norm.includes('خرید') || norm.includes('-');
    const amtMatch = norm.match(/(\d+)\s*(?:ریال|ريال)/) || norm.match(/(?:مبلغ|واریز|برداشت)[:\s]*(\d+)/);
    const balMatch = norm.match(/مانده[:\s]*(\d+)/);
    const cardMatch = norm.match(/(\d{4})\*/);

    if (amtMatch && (isIncome || isExpense)) {
      return {
        bank: 'mellat',
        type: isIncome ? 'INCOME' : 'EXPENSE',
        amount: parseInt(amtMatch[1], 10),
        balance: balMatch ? parseInt(balMatch[1], 10) : undefined,
        card4: cardMatch ? cardMatch[1] : undefined,
        occurredAt: now,
        description: isIncome ? 'واریز ملت' : 'خرید / برداشت ملت',
        rawText: raw,
      };
    }
  }

  // 4. Melli Bank (Bank Melli Iran)
  if (norm.includes('بانک ملی') || sender.toUpperCase().includes('MELLI')) {
    const isIncome = norm.includes('واریز') || norm.includes('+');
    const amtMatch = norm.match(/(?:مبلغ|واریز|برداشت)[:\s]*(\d+)/) || norm.match(/(\d+)\s*ریال/);
    const balMatch = norm.match(/مانده[:\s]*(\d+)/);
    const cardMatch = norm.match(/کارت\s*(\d{4})/);

    if (amtMatch) {
      return {
        bank: 'melli',
        type: isIncome ? 'INCOME' : 'EXPENSE',
        amount: parseInt(amtMatch[1], 10),
        balance: balMatch ? parseInt(balMatch[1], 10) : undefined,
        card4: cardMatch ? cardMatch[1] : undefined,
        occurredAt: now,
        description: isIncome ? 'واریز بانک ملی' : 'برداشت بانک ملی',
        rawText: raw,
      };
    }
  }

  // 5. Generic Iranian Bank SMS fallback
  const isGenericIncome = /واریز|نشست|\+/.test(norm);
  const isGenericExpense = /برداشت|خرید|پرید|انتقال|-/.test(norm);
  const generalAmt = norm.match(/(?:مبلغ|واریز|برداشت|خرید|انتقال)[:\s]*(\d+)/) || norm.match(/(\d{4,})\s*(?:ریال|تومان)/);
  const generalBal = norm.match(/(?:مانده|موجودی)[:\s]*(\d+)/);
  const generalCard = norm.match(/(?:کارت|card)[^\d]*(\d{4})/i) || norm.match(/(\d{4})\*/);

  if (generalAmt && (isGenericIncome || isGenericExpense)) {
    let amt = parseInt(generalAmt[1], 10);
    // If text specifically says تومان, convert to Rial
    if (norm.includes('تومان')) {
      amt *= 10;
    }
    let bal = generalBal ? parseInt(generalBal[1], 10) : undefined;
    if (bal && norm.includes('تومان')) {
      bal *= 10;
    }

    return {
      bank: 'other',
      type: isGenericIncome ? 'INCOME' : 'EXPENSE',
      amount: amt,
      balance: bal,
      card4: generalCard ? generalCard[1] : undefined,
      occurredAt: now,
      description: isGenericIncome ? 'واریز بانکی' : 'پرداخت / هزینه بانکی',
      rawText: raw,
    };
  }

  return null;
}
