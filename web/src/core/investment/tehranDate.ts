import { Jalali, type JDate } from '../jalali';
import { Money } from '../money';

const TEHRAN_TIMEZONE = 'Asia/Tehran';
// Iran permanently fixed standard time at UTC+03:30 (210 minutes)
const TEHRAN_OFFSET_MS = 210 * 60 * 1000;

const tehranPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TEHRAN_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export interface TehranCalendarDate {
  gy: number;
  gm: number;
  gd: number;
  jalali: JDate;
  dayKey: string; // YYYY-MM-DD in Asia/Tehran
  jalaliKey: string; // jYYYY-jMM-jDD
}

/**
 * Converts a UTC epoch millisecond timestamp into the exact Asia/Tehran calendar date,
 * independent of the host/device timezone.
 */
export function getTehranDateParts(utcMs: number): TehranCalendarDate {
  const parts = tehranPartsFormatter.formatToParts(new Date(utcMs));
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const gy = Number(map.year);
  const gm = Number(map.month);
  const gd = Number(map.day);
  const jalali = Jalali.g2j(gy, gm, gd);
  const dayKey = `${String(gy).padStart(4, '0')}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
  const jalaliKey = `${jalali.y}-${String(jalali.m).padStart(2, '0')}-${String(jalali.d).padStart(2, '0')}`;
  return { gy, gm, gd, jalali, dayKey, jalaliKey };
}

/**
 * Returns UTC millisecond bounds [startMs, endMs] for a given Asia/Tehran Gregorian day.
 */
export function getTehranDayBoundsUtc(gy: number, gm: number, gd: number): {
  startMs: number;
  endMs: number;
} {
  const utcMidnight = Date.UTC(gy, gm - 1, gd, 0, 0, 0, 0);
  const startMs = utcMidnight - TEHRAN_OFFSET_MS;
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return { startMs, endMs };
}

export function getTehranDayBoundsFromUtc(utcMs: number): {
  startMs: number;
  endMs: number;
  info: TehranCalendarDate;
} {
  const info = getTehranDateParts(utcMs);
  const bounds = getTehranDayBoundsUtc(info.gy, info.gm, info.gd);
  return { ...bounds, info };
}

/**
 * Generates an ordered list of N Asia/Tehran market days ending at `endUtcMs`.
 */
export function listTehranMarketDays(
  endUtcMs: number,
  days: number
): Array<{
  dayKey: string;
  jalaliKey: string;
  jalali: JDate;
  labelFa: string;
  startMs: number;
  endMs: number;
}> {
  const endInfo = getTehranDateParts(endUtcMs);
  const endBounds = getTehranDayBoundsUtc(endInfo.gy, endInfo.gm, endInfo.gd);
  const result: Array<{
    dayKey: string;
    jalaliKey: string;
    jalali: JDate;
    labelFa: string;
    startMs: number;
    endMs: number;
  }> = [];

  for (let i = days - 1; i >= 0; i--) {
    const sampleUtc = endBounds.startMs - i * 24 * 60 * 60 * 1000 + 12 * 3600_000;
    const info = getTehranDateParts(sampleUtc);
    const bounds = getTehranDayBoundsUtc(info.gy, info.gm, info.gd);
    result.push({
      dayKey: info.dayKey,
      jalaliKey: info.jalaliKey,
      jalali: info.jalali,
      labelFa: `${Money.fa(String(info.jalali.d))} ${Jalali.MONTHS[info.jalali.m - 1]}`,
      startMs: bounds.startMs,
      endMs: bounds.endMs,
    });
  }
  return result;
}

export function formatTehranJalaliDate(utcMs: number): string {
  const { jalali } = getTehranDateParts(utcMs);
  return `${Money.fa(String(jalali.d))} ${Jalali.MONTHS[jalali.m - 1]} ${Money.fa(String(jalali.y))}`;
}
