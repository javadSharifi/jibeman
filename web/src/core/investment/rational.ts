export interface Rational {
  readonly num: bigint;
  readonly den: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0n ? 1n : x;
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizeNumericText(input: string): string {
  let out = '';
  for (const ch of input.trim()) {
    const fi = FA_DIGITS.indexOf(ch);
    const ai = AR_DIGITS.indexOf(ch);
    if (fi >= 0) out += String(fi);
    else if (ai >= 0) out += String(ai);
    else if (ch === '٬' || ch === ',' || ch === ' ' || ch === '_') continue;
    else if (ch === '٫') out += '.';
    else if (ch === '−') out += '-';
    else out += ch;
  }
  return out;
}

export function makeRational(num: bigint, den: bigint = 1n): Rational {
  if (den === 0n) throw new Error('Division by zero in Rational');
  if (num === 0n) return { num: 0n, den: 1n };
  let n = num;
  let d = den;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { num: n / g, den: d / g };
}

export const R_ZERO: Rational = { num: 0n, den: 1n };
export const R_ONE: Rational = { num: 1n, den: 1n };

export const R = {
  zero: R_ZERO,
  one: R_ONE,

  fromInt(v: number | bigint | string): Rational {
    if (typeof v === 'bigint') return makeRational(v, 1n);
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || !Number.isInteger(v)) {
        throw new Error(`Expected integer for R.fromInt, got ${v}`);
      }
      return makeRational(BigInt(v), 1n);
    }
    const norm = normalizeNumericText(v);
    if (!/^-?\d+$/.test(norm)) {
      throw new Error(`Invalid integer string: ${v}`);
    }
    return makeRational(BigInt(norm), 1n);
  },

  fromDecimal(v: string | number): Rational {
    const str = typeof v === 'number' ? String(v) : normalizeNumericText(v);
    if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(str)) {
      throw new Error(`Invalid decimal string: ${v}`);
    }
    const neg = str.startsWith('-');
    const body = neg ? str.slice(1) : str;
    const [whole = '0', frac = ''] = body.split('.');
    const den = 10n ** BigInt(frac.length);
    const num = BigInt((whole || '0') + frac);
    return makeRational(neg ? -num : num, den);
  },

  parse(v: string): Rational {
    const norm = normalizeNumericText(v);
    if (norm.includes('/')) {
      const parts = norm.split('/');
      if (parts.length !== 2) throw new Error(`Invalid rational string: ${v}`);
      return makeRational(BigInt(parts[0]), BigInt(parts[1]));
    }
    return R.fromDecimal(norm);
  },

  serialize(r: Rational): string {
    return r.den === 1n ? r.num.toString() : `${r.num.toString()}/${r.den.toString()}`;
  },

  add(a: Rational, b: Rational): Rational {
    return makeRational(a.num * b.den + b.num * a.den, a.den * b.den);
  },

  sub(a: Rational, b: Rational): Rational {
    return makeRational(a.num * b.den - b.num * a.den, a.den * b.den);
  },

  mul(a: Rational, b: Rational): Rational {
    return makeRational(a.num * b.num, a.den * b.den);
  },

  div(a: Rational, b: Rational): Rational {
    if (b.num === 0n) throw new Error('Division by zero');
    return makeRational(a.num * b.den, a.den * b.num);
  },

  neg(a: Rational): Rational {
    return { num: -a.num, den: a.den };
  },

  abs(a: Rational): Rational {
    return a.num < 0n ? { num: -a.num, den: a.den } : a;
  },

  cmp(a: Rational, b: Rational): -1 | 0 | 1 {
    const diff = a.num * b.den - b.num * a.den;
    if (diff < 0n) return -1;
    if (diff > 0n) return 1;
    return 0;
  },

  eq(a: Rational, b: Rational): boolean {
    return a.num === b.num && a.den === b.den;
  },

  isZero(a: Rational): boolean {
    return a.num === 0n;
  },

  isPos(a: Rational): boolean {
    return a.num > 0n;
  },

  isNeg(a: Rational): boolean {
    return a.num < 0n;
  },

  /**
   * Half-up integer rounding for rial outputs.
   * For positive values: floor((2*num + den) / (2*den)).
   * For negative values: symmetric half-away-from-zero.
   */
  roundHalfUp(r: Rational): bigint {
    if (r.num === 0n) return 0n;
    const sign = r.num < 0n ? -1n : 1n;
    const absNum = r.num < 0n ? -r.num : r.num;
    const rounded = (absNum * 2n + r.den) / (2n * r.den);
    return sign * rounded;
  },

  toSafeRialNumber(r: Rational): number {
    const rounded = R.roundHalfUp(r);
    const n = Number(rounded);
    if (!Number.isSafeInteger(n)) {
      throw new Error(`Rial amount outside Number.MAX_SAFE_INTEGER: ${rounded.toString()}`);
    }
    return n;
  },

  toDecimalString(r: Rational, maxDecimals = 6): string {
    if (r.num === 0n) return '0';
    const neg = r.num < 0n;
    const absNum = neg ? -r.num : r.num;
    const scale = 10n ** BigInt(maxDecimals);
    // Half-up rounding at maxDecimals
    const scaled = (absNum * scale * 2n + r.den) / (2n * r.den);
    const intPart = scaled / scale;
    const fracPart = scaled % scale;
    if (fracPart === 0n || maxDecimals === 0) {
      return `${neg ? '-' : ''}${intPart.toString()}`;
    }
    const fracStr = fracPart.toString().padStart(maxDecimals, '0').replace(/0+$/, '');
    return `${neg ? '-' : ''}${intPart.toString()}.${fracStr}`;
  },

  toNumber(r: Rational): number {
    return Number(r.num) / Number(r.den);
  },
};
