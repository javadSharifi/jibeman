import { Money } from './money';

export interface JDate {
  y: number;
  m: number;
  d: number;
}

export const Jalali = {
  MONTHS: [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
  ],
  WEEKDAYS: ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'],

  g2j(gy: number, gm: number, gd: number): JDate {
    const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    const gy2 = gm > 2 ? gy + 1 : gy;
    let days = 355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + gdm[gm - 1];
    let jy = -1595 + 33 * Math.floor(days / 12053);
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
      jy += Math.floor((days - 1) / 365);
      days = (days - 1) % 365;
    }
    return days < 186
      ? { y: jy, m: 1 + Math.floor(days / 31), d: 1 + (days % 31) }
      : { y: jy, m: 7 + Math.floor((days - 186) / 30), d: 1 + ((days - 186) % 30) };
  },

  j2g(jy: number, jm: number, jd: number): [number, number, number] {
    const jy2 = jy + 1595;
    let days = -355668 + 365 * jy2 + Math.floor(jy2 / 33) * 8 + Math.floor(((jy2 % 33) + 3) / 4) + jd +
      (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
    let gy = 400 * Math.floor(days / 146097);
    days %= 146097;
    if (days > 36524) {
      days--;
      gy += 100 * Math.floor(days / 36524);
      days %= 36524;
      if (days >= 365) days++;
    }
    gy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
      gy += Math.floor((days - 1) / 365);
      days = (days - 1) % 365;
    }
    let gd = days + 1;
    const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
    const sal = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let gm = 0;
    while (gm < 13 && gd > sal[gm]) {
      gd -= sal[gm];
      gm++;
    }
    return [gy, gm, gd];
  },

  of(ms: number): JDate {
    const d = new Date(ms);
    return this.g2j(d.getFullYear(), d.getMonth() + 1, d.getDate());
  },

  millis(y: number, m: number, d: number, hour = 0, minute = 0): number {
    const [gy, gm, gd] = this.j2g(y, m, d);
    const date = new Date(gy, gm - 1, gd, hour, minute, 0, 0);
    return date.getTime();
  },

  monthRange(y: number, m: number): [number, number] {
    const start = this.millis(y, m, 1);
    const end = m === 12 ? this.millis(y + 1, 1, 1) : this.millis(y, m + 1, 1);
    return [start, end];
  },

  dayStart(ms: number): number {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  },

  addDays(ms: number, n: number): number {
    const d = new Date(ms);
    d.setDate(d.getDate() + n);
    return d.getTime();
  },

  weekday(ms: number): string {
    const day = new Date(ms).getDay(); // Sunday = 0
    return this.WEEKDAYS[day];
  },

  time(ms: number): string {
    const d = new Date(ms);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return Money.fa(`${h}:${m}`);
  },

  monthTitle(y: number, m: number): string {
    return `${this.MONTHS[m - 1]} ${Money.fa(String(y))}`;
  },

  longDate(ms: number, now = Date.now()): string {
    const j = this.of(ms);
    const curJ = this.of(now);
    const year = j.y !== curJ.y ? ` ${Money.fa(String(j.y))}` : '';
    return `${this.weekday(ms)} ${Money.fa(String(j.d))} ${this.MONTHS[j.m - 1]}${year}`;
  },

  dayLabel(ms: number, now = Date.now()): string {
    const d = this.dayStart(ms);
    const today = this.dayStart(now);
    if (d === today) return `امروز · ${this.longDate(ms, now)}`;
    if (d === this.dayStart(this.addDays(today, -1))) return `دیروز · ${this.longDate(ms, now)}`;
    return this.longDate(ms, now);
  },

  shortDateTime(ms: number, now = Date.now()): string {
    const d = this.dayStart(ms);
    const today = this.dayStart(now);
    let dayStr = '';
    if (d === today) {
      dayStr = 'امروز';
    } else if (d === this.dayStart(this.addDays(today, -1))) {
      dayStr = 'دیروز';
    } else {
      const j = this.of(ms);
      dayStr = `${Money.fa(String(j.d))} ${this.MONTHS[j.m - 1]}`;
    }
    return `${dayStr} · ${this.time(ms)}`;
  }
};
