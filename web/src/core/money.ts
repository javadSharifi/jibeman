const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';
const LRI = '\u2066';
const PDI = '\u2069';

export const Money = {
  HIDDEN: '••••••',

  fa(s: string): string {
    return s.replace(/\d/g, (d) => FA[parseInt(d, 10)]);
  },

  ascii(s: string): string {
    let res = '';
    for (const c of s) {
      const fi = FA.indexOf(c);
      const ai = AR.indexOf(c);
      if (fi >= 0) {
        res += String(fi);
      } else if (ai >= 0) {
        res += String(ai);
      } else if (c === ',' || c === '٬') {
        // drop thousands separator
      } else {
        res += c;
      }
    }
    return res;
  },

  normalizeAmountInput(s: string, maxDigits = 13, allowNegative = false): string | null {
    const raw = this.ascii(s).replace(/\s/g, '').replace('٫', '.').replace('−', '-');
    const unsigned = allowNegative && raw.startsWith('-') ? raw.slice(1) : raw;
    return /^\d*(?:\.\d?)?$/.test(unsigned) && unsigned.split('.')[0].length <= maxDigits ? raw : null;
  },

  formatAmountInput(raw: string): string {
    const [whole, fraction] = raw.split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return fraction === undefined ? grouped : `${grouped}.${fraction}`;
  },

  /** Converts toman to integer rial, including one optional fractional digit. */
  parseToman(s: string, allowNegative = false): number | null {
    const raw = this.normalizeAmountInput(s, 13, allowNegative);
    if (!raw || !/^-?(?:\d+|\d*\.\d)$/.test(raw)) return null;
    const magnitude = raw.startsWith('-') ? raw.slice(1) : raw;
    const [whole, fraction] = magnitude.split('.');
    const rial = Number(whole) * 10 + Number(fraction ?? 0);
    return raw.startsWith('-') ? -rial : rial;
  },

  /** Format stored integer rial as an editable amount in toman without rounding. */
  tomanInput(rial: number): string {
    const magnitude = Math.abs(rial);
    const whole = Math.floor(magnitude / 10);
    const remainder = magnitude % 10;
    return `${rial < 0 ? '-' : ''}${whole}${remainder ? `.${remainder}` : ''}`;
  },

  amountWords(rial: number): string {
    const magnitude = Math.abs(rial);
    const whole = this.words(Math.floor(magnitude / 10));
    const remainder = magnitude % 10;
    return `${rial < 0 ? 'منفی ' : ''}${whole} تومان${remainder ? ` و ${this.words(remainder)} ریال` : ''}`;
  },

  group(n: number): string {
    const s = Math.abs(Math.floor(n)).toString();
    let res = '';
    for (let i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) res += '٬';
      res += s[i];
    }
    return this.fa(res);
  },

  /** rial -> "۱۸۵٬۰۰۰" toman */
  toman(rial: number, plus = false): string {
    const sign = rial < 0 ? '−' : plus && rial > 0 ? '+' : '';
    const [whole, remainder] = this.tomanInput(Math.abs(rial)).split('.');
    const fraction = remainder ? `٫${this.fa(remainder)}` : '';
    return `${LRI}${sign}${this.group(Number(whole))}${fraction}${PDI}`;
  },

  /** rial -> "۳۲٫۵ میلیون" / "۸۵۰ هزار" (toman) */
  short(rial: number): string {
    const t = Math.abs(Math.floor(rial / 10));
    let body = '';
    if (t >= 1_000_000_000) {
      body = this.one(t, 1_000_000_000) + ' میلیارد';
    } else if (t >= 1_000_000) {
      body = this.one(t, 1_000_000) + ' میلیون';
    } else if (t >= 1_000) {
      body = this.one(t, 1_000) + ' هزار';
    } else {
      body = this.group(t);
    }
    return rial < 0 ? `${LRI}−${PDI}${body}` : body;
  },

  one(t: number, unit: number): string {
    const tenths = Math.round((t * 10.0) / unit);
    const s = tenths % 10 === 0 ? String(Math.floor(tenths / 10)) : `${Math.floor(tenths / 10)}٫${tenths % 10}`;
    return this.fa(s);
  },

  /** 185000 -> "صد و هشتاد و پنج هزار" */
  words(n: number): string {
    if (n === 0) return 'صفر';
    if (n < 0) return 'منفی ' + this.words(-n);

    const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
    const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
    const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
    const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
    const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'هزار میلیارد'];

    const three = (num: number): string => {
      const p: string[] = [];
      if (Math.floor(num / 100) > 0) p.push(HUNDREDS[Math.floor(num / 100)]);
      const r = num % 100;
      if (r >= 10 && r <= 19) {
        p.push(TEENS[r - 10]);
      } else {
        if (Math.floor(r / 10) > 0) p.push(TENS[Math.floor(r / 10)]);
        if (r % 10 > 0) p.push(ONES[r % 10]);
      }
      return p.join(' و ');
    };

    const parts: string[] = [];
    let x = Math.floor(n);
    let i = 0;
    while (x > 0 && i < SCALES.length) {
      const g = x % 1000;
      if (g > 0) {
        const w = three(g);
        parts.unshift(i === 0 ? w : i === 1 && g === 1 ? 'هزار' : `${w} ${SCALES[i]}`);
      }
      x = Math.floor(x / 1000);
      i++;
    }
    return parts.join(' و ');
  }
};
