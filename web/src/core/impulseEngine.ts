import { Money } from './money';
import type { ImpulseSession, PurchaseMotivation } from './db';

export interface ImpulseConfig {
  smallMaxToman: number; // default: 2,000,000
  mediumMaxToman: number; // default: 10,000,000
  largeMaxToman: number; // default: 50,000,000
  smallDelayMinutes: number; // default: 10
  mediumDelayMinutes: number; // default: 30
  largeDelayMinutes: number; // default: 1440 (24h)
  veryLargeDelayMinutes: number; // default: 4320 (72h)
  tiredStressForceWait: boolean; // default: true
}

export const DEFAULT_IMPULSE_CONFIG: ImpulseConfig = {
  smallMaxToman: 2_000_000,
  mediumMaxToman: 10_000_000,
  largeMaxToman: 50_000_000,
  smallDelayMinutes: 10,
  mediumDelayMinutes: 30,
  largeDelayMinutes: 1440,
  veryLargeDelayMinutes: 4320,
  tiredStressForceWait: true,
};

const CONFIG_STORAGE_KEY = 'jibeman_impulse_brake_config';

export function getImpulseConfig(): ImpulseConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_IMPULSE_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Failed to parse impulse config', e);
  }
  return DEFAULT_IMPULSE_CONFIG;
}

export function saveImpulseConfig(config: ImpulseConfig) {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save impulse config', e);
  }
}

export const MOTIVATION_LABELS: Record<PurchaseMotivation, { title: string; desc: string; icon: string; risk: 'low' | 'medium' | 'high' }> = {
  REAL_NEED: {
    title: 'نیاز واقعی و ضروری',
    desc: 'کالایی که به آن نیاز مبرم دارم و نبودش کارم را مختل می‌کند',
    icon: 'CheckCircle',
    risk: 'low',
  },
  REPLACEMENT: {
    title: 'جایگزینی کالای خراب یا فرسوده',
    desc: 'وسیله قبلی از کار افتاده و نیاز به جایگزین دارد',
    icon: 'RefreshCw',
    risk: 'low',
  },
  SPECIAL_DISCOUNT: {
    title: 'تخفیف یا پیشنهاد ویژه فروشگاه',
    desc: 'قیمت مناسبی دارد و تخفیف خورده است',
    icon: 'Percent',
    risk: 'medium',
  },
  EXCITEMENT: {
    title: 'هیجان و علاقه شخصی',
    desc: 'ظاهر یا حس آن را دوست دارم و هیجان‌زده‌ام',
    icon: 'Sparkles',
    risk: 'high',
  },
  PEER_PRESSURE: {
    title: 'چشم و هم‌چشمی یا توصیه دیگران',
    desc: 'چون دیگران دارند یا می‌خواهم از بقیه عقب نمانم',
    icon: 'Users',
    risk: 'high',
  },
  FEEL_GOOD_ESCAPE: {
    title: 'خستگی و نیاز به حال خوب',
    desc: 'روز سختی داشتم و می‌خواهم با خرید حالم بهتر شود',
    icon: 'HeartCrack',
    risk: 'high',
  },
  FOMO: {
    title: 'ترس از دست دادن فرصت (FOMO)',
    desc: 'می‌ترسم تمام شود یا فردا گران‌تر شود',
    icon: 'Flame',
    risk: 'high',
  },
  SELLER_RECOMMENDATION: {
    title: 'پیشنهاد و اصرار فروشنده',
    desc: 'فروشنده خیلی تعریف کرد و اصرار به خرید دارد',
    icon: 'Megaphone',
    risk: 'high',
  },
  OTHER: {
    title: 'سایر دلایل',
    desc: 'دلیل دیگری برای خرید دارم',
    icon: 'HelpCircle',
    risk: 'medium',
  },
};

/**
 * Calculates the recommended delay in minutes based on purchase amount (in Rial) and emotional state.
 */
export function calculateRequiredDelayMinutes(
  amountRial: number,
  isTired: boolean,
  isStressed: boolean,
  isRushing: boolean,
  isSellerPushing: boolean,
  config: ImpulseConfig = getImpulseConfig()
): number {
  const amountToman = Money.toToman(amountRial);
  let delay = config.smallDelayMinutes;

  if (amountToman > config.largeMaxToman) {
    delay = config.veryLargeDelayMinutes; // 72 hours
  } else if (amountToman > config.mediumMaxToman) {
    delay = config.largeDelayMinutes; // 24 hours
  } else if (amountToman > config.smallMaxToman) {
    delay = config.mediumDelayMinutes; // 30 minutes
  }

  // If user is tired, stressed, rushing or pushed by seller, minimum 30 minutes wait
  if (config.tiredStressForceWait && (isTired || isStressed || isRushing || isSellerPushing)) {
    delay = Math.max(delay, 30);
  }

  return delay;
}

/**
 * Checks if the purchase triggers high impulse brake warning
 */
export function evaluateImpulseRisk(
  isTired: boolean,
  isStressed: boolean,
  isRushing: boolean,
  isSellerPushing: boolean,
  isOverexcited: boolean,
  hasResearched: boolean,
  isPrePlanned: boolean,
  motivation?: PurchaseMotivation
): { isTriggered: boolean; reasons: string[]; riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' } {
  const reasons: string[] = [];

  if (isTired) reasons.push('احساس خستگی جسمی یا ذهنی');
  if (isStressed) reasons.push('استرس یا فشار روانی');
  if (isRushing) reasons.push('عجله و شتاب در خرید');
  if (isSellerPushing) reasons.push('اصرار فروشنده یا جو فوری فروشگاه');
  if (isOverexcited) reasons.push('هیجان‌زدگی بالا نسبت به محصول');
  if (!hasResearched) reasons.push('عدم تحقیق قبلی درباره مدل و قیمت');
  if (!isPrePlanned) reasons.push('خارج از برنامه مالی از پیش تعیین‌شده');

  if (motivation === 'FEEL_GOOD_ESCAPE') reasons.push('خرید درمانی ناشی از خستگی/حال بد');
  if (motivation === 'FOMO') reasons.push('ترس از دست رفتن فرصت');
  if (motivation === 'PEER_PRESSURE') reasons.push('فشار روانی مقایسه با دیگران');
  if (motivation === 'SELLER_RECOMMENDATION') reasons.push('تحت تأثیر تعریف فروشنده');

  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  if (reasons.length >= 3 || isTired || isStressed || isSellerPushing) {
    riskLevel = 'HIGH';
  } else if (reasons.length >= 1) {
    riskLevel = 'MEDIUM';
  }

  const isTriggered = reasons.length > 0;
  return { isTriggered, reasons, riskLevel };
}

/**
 * Human friendly format for minutes (e.g. 30 دقیقه, 24 ساعت, 72 ساعت)
 */
export function formatDelayDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} دقیقه`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} ساعت`;
  }
  const days = Math.round(hours / 24);
  return `${days} روز (${hours} ساعت)`;
}

/**
 * Formats remaining milliseconds into Persian countdown string
 */
export function formatTimeRemaining(remainingMs: number): {
  isFinished: boolean;
  text: string;
  hours: number;
  minutes: number;
  seconds: number;
} {
  if (remainingMs <= 0) {
    return { isFinished: true, text: 'پایان زمان انتظار', hours: 0, minutes: 0, seconds: 0 };
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let text = '';
  if (hours > 0) {
    text = `${hours} ساعت و ${minutes} دقیقه`;
  } else if (minutes > 0) {
    text = `${minutes} دقیقه و ${seconds} ثانیه`;
  } else {
    text = `${seconds} ثانیه`;
  }

  return { isFinished: false, text, hours, minutes, seconds };
}

/**
 * Request browser notification permission if available
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  }
  return false;
}

/**
 * Sends a notification when cooling off ends
 */
export function sendCoolingFinishedNotification(itemTitle: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      new Notification('فرصت ارزیابی خرید فرا رسید ✨', {
        body: `زمان انتظار برای خرید «${itemTitle}» به پایان رسید. اکنون می‌توانید با خیال آسوده و منطقی تصمیم بگیرید.`,
        icon: '/favicon.svg',
      });
    } catch (e) {
      console.warn('Could not dispatch notification', e);
    }
  }
}
