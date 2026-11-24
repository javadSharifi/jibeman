import type { CompareSession, CompareItem, CompareCriterion, CompareCheck } from './db';
import { Money } from './money';

export type CheckState = 'PASS' | 'FAIL' | 'UNKNOWN';

export type SortMode = 'RECOMMENDED' | 'MATCH' | 'PRICE_ASC' | 'PRICE_DESC' | 'VALUE';

export interface ItemStats {
  itemId: number;
  pass: number;
  fail: number;
  unknown: number;
  total: number;
  strictFails: CompareCriterion[];
  hasStrictFailure: boolean;
  weightedPassedScore: number;
  maxPossibleWeightedScore: number;
  matchPercent: number; // 0 to 100
  valueForMoneyIndex: number; // 0 to 100
  budgetDiff?: number; // positive = under budget, negative = over budget
  budgetStatus: 'UNDER' | 'EXACT' | 'OVER' | 'NONE';
}

export interface CriterionDiff {
  criterion: CompareCriterion;
  stateA: CheckState;
  stateB: CheckState;
  winner: 'A' | 'B' | 'TIE';
}

export interface TwoItemsComparison {
  itemA: CompareItem;
  itemB: CompareItem;
  statsA: ItemStats;
  statsB: ItemStats;
  diffs: CriterionDiff[];
  winsA: number;
  winsB: number;
  ties: number;
  priceDiff?: number; // priceA - priceB
  overallWinner: 'A' | 'B' | 'TIE';
}

export interface TemplateCriterion {
  title: string;
  why?: string;
  strict: boolean;
  weight: number; // 3 = بسیار مهم, 1 = معمولی, 0.5 = کم‌اهمیت
}

export interface CompareTemplate {
  id: string;
  title: string;
  categoryName: string;
  iconName: string;
  description: string;
  criteria: TemplateCriterion[];
}

export const COMPARE_TEMPLATES: CompareTemplate[] = [
  {
    id: 'smartphone',
    title: 'خرید گوشی هوشمند',
    categoryName: 'دیجیتال و موبایل',
    iconName: 'Smartphone',
    description: 'معیارهای اصالت، پردازنده، دوربین، باتری و گارانتی معتبر',
    criteria: [
      { title: 'رجیستر قانونی و گارانتی معتبر شرکتی ۱۸ ماهه', why: 'جلوگیری از قطع شبکه و تضمین خدمات پس از فروش', strict: true, weight: 3 },
      { title: 'کیفیت دوربین اصلی با لرزشگیر اپتیکال (OIS) و وضوح در شب', why: 'ثبت عکس‌های بدون تاری و باکیفیت در نور کم', strict: false, weight: 3 },
      { title: 'ظرفیت باتری حداقل ۵۰۰۰ میلی‌آمپر و سرعت شارژ مناسب', why: 'شارژدهی یک روز کامل بدون نگرانی', strict: false, weight: 3 },
      { title: 'صفحه‌نمایش OLED یا AMOLED با نرخ نوسازی ۱۲۰Hz', why: 'روشنایی بالا زیر نور آفتاب و روانی انیمیشن‌ها', strict: false, weight: 1 },
      { title: 'حافظه رم حداقل ۸ گیگابایت و حافظه داخلی ۲۵۶ گیگ', why: 'روانی در اجرای همزمان برنامه‌ها و فضای کافی عکس و فیلم', strict: false, weight: 1 },
      { title: 'تضمین آپدیت نرم‌افزاری و امنیتی حداقل ۳ تا ۴ سال', why: 'طول عمر مفید گوشی و امنیت اطلاعات بانکی', strict: false, weight: 1 },
      { title: 'پایداری دمایی و عدم داغ شدن در استفاده روزمره', why: 'حفظ سلامت باتری و جلوگیری از کندی', strict: false, weight: 1 },
      { title: 'خوش‌دستی و وزن سبک (زیر ۲۰۰ گرم)', why: 'عدم خستگی مچ دست در استفاده طولانی', strict: false, weight: 0.5 },
    ],
  },
  {
    id: 'laptop',
    title: 'خرید لپ‌تاپ',
    categoryName: 'رایانه و تجهیزات',
    iconName: 'Laptop',
    description: 'معیارهای پردازشی، رم، حافظه SSD، سلامت باتری و بدنه',
    criteria: [
      { title: 'وجود گارانتی رسمی و معتبر سخت‌افزاری', why: 'تضمین تعویض یا تعمیر قطعات اصلی', strict: true, weight: 3 },
      { title: 'پردازنده نسل جدید و متناسب با نیاز کاری', why: 'سرعت پردازش و پشتیبانی از نرم‌افزارهای سنگین', strict: false, weight: 3 },
      { title: 'حافظه SSD پرسرعت NVMe با حجم حداقل ۵۱۲ گیگابایت', why: 'سرعت بالای بوت و اجرای برنامه‌ها', strict: false, weight: 3 },
      { title: 'حافظه رم حداقل ۱۶ گیگابایت (ترجیحاً با قابلیت ارتقا)', why: 'اجرای راحت چند برنامه همزمان بدون لگ', strict: false, weight: 1 },
      { title: 'کیفیت و وضوح صفحه‌نمایش (حداقل FHD با پنل IPS)', why: 'زاویه دید عالی و جلوگیری از خستگی چشم', strict: false, weight: 1 },
      { title: 'شارژدهی باتری حداقل ۵ ساعت کاربری اداری', why: 'امکان جابجایی و کار در کافه و جلسات', strict: false, weight: 1 },
      { title: 'پورت‌های ارتباطی کامل (Type-C / HDMI / USB-A)', why: 'عدم نیاز دائمی به دانگل‌های جانبی', strict: false, weight: 1 },
      { title: 'کیفیت بدنه، کیبورد ارگونومیک و وزن زیر ۱٫۸ کیلو', why: 'حمل آسان و راحتی تایپ مداوم', strict: false, weight: 0.5 },
    ],
  },
  {
    id: 'appliances',
    title: 'لوازم خانگی و برقی',
    categoryName: 'خانه و آشپزخانه',
    iconName: 'Home',
    description: 'مصرف انرژی، وفور قطعات در ایران، صدای کم و ابعاد',
    criteria: [
      { title: 'اصالت کالا، خدمات پس از فروش و در دسترس بودن قطعات در ایران', why: 'عدم بلاتکلیفی در صورت خرابی یا نیاز به سرویس', strict: true, weight: 3 },
      { title: 'رده مصرف انرژی کم (A+ یا بالاتر)', why: 'کاهش قابل توجه قبض برق ماهانه', strict: false, weight: 3 },
      { title: 'کیفیت ساخت موتور (اینورتر / کم‌صدا)', why: 'عمر طولانی موتور و آرامش فضای خانه', strict: false, weight: 3 },
      { title: 'تناسب دقیق ابعاد فیزیکی با محل نصب در خانه', why: 'جلوگیری از عدم جاگیری در کابینت یا ورودی', strict: true, weight: 3 },
      { title: 'سهولت کاربری، نظافت آسان و منوی واضح', why: 'راحتی تمام افراد خانواده در استفاده', strict: false, weight: 1 },
      { title: 'تناسب ظرفیت با تعداد اعضای خانواده', why: 'بهره‌وری حداکثری و مصرف بهینه', strict: false, weight: 1 },
    ],
  },
  {
    id: 'vehicle',
    title: 'خرید خودرو یا موتور',
    categoryName: 'وسایل نقلیه',
    iconName: 'Car',
    description: 'سلامت شاسی، وضعیت فنی موتور، مدارک، بیمه و بازار دست‌دوم',
    criteria: [
      { title: 'شاسی کاملاً سالم، بدون ضربه و جوشکاری، و سند آماده انتقال', why: 'ایمنی جانی و عدم افت فاحش قیمت و مشکلات قانونی', strict: true, weight: 3 },
      { title: 'سلامت کامل موتور، گیربکس و عدم روغن‌ریزی/دود', why: 'جلوگیری از هزینه‌های سرسام‌آور تعمیرگاه', strict: false, weight: 3 },
      { title: 'کارکرد واقعی و منطقی نسبت به سال ساخت', why: 'عمر مفید قطعات مصرفی و جلوبندی', strict: false, weight: 3 },
      { title: 'وفور لوازم یدکی و دسترسی آسان به تعمیرکار ماهر', why: 'عدم معطلی برای قطعه و هزینه نگهداری معقول', strict: false, weight: 1 },
      { title: 'اعتبار بیمه شخص ثالث و معاینه فنی معتبر', why: 'اطمینان از مجوز تردد و صرفه‌جویی اولیه', strict: false, weight: 1 },
      { title: 'بازار خرید و فروش دست دوم روان و تقاضای بالا', why: 'نقدشوندگی سریع در زمان نیاز به فروش', strict: false, weight: 1 },
      { title: 'مصرف سوخت و اصطکاک اقتصادی', why: 'کاهش هزینه‌های ماهیانه رانندگی', strict: false, weight: 0.5 },
    ],
  },
  {
    id: 'shoes',
    title: 'کفش و پوشاک ورزشی',
    categoryName: 'پوشاک و ورزش',
    iconName: 'Footprints',
    description: 'راحتی کفی طبی، دوام دوخت، تنفس‌پذیری و ارگونومی',
    criteria: [
      { title: 'اندازه کاملاً دقیق پا بدون فشار به انگشتان و پاشنه', why: 'حفظ سلامت ستون فقرات و عدم تاول پا', strict: true, weight: 3 },
      { title: 'کفی طبی ضربه‌گیر (Cushioning) و ارگونومیک', why: 'جذب ضربات گام‌برداری در پیاده‌روی طولانی', strict: false, weight: 3 },
      { title: 'رویه تنفس‌پذیر با گردش هوای مناسب', why: 'جلوگیری از تعریق بیش از حد و بوی نامطبوع', strict: false, weight: 1 },
      { title: 'دوام دوخت و مقاومت زیره در برابر سایش', why: 'ماندگاری طولانی کفش در استفاده روزمره', strict: false, weight: 1 },
      { title: 'طراحی شیک و قابلیت ست شدن با لباس‌ها', why: 'استفاده در استایل‌های مختلف', strict: false, weight: 0.5 },
    ],
  },
  {
    id: 'audio',
    title: 'هدفون و گجت صوتی',
    categoryName: 'لوازم دیجیتال صوتی',
    iconName: 'Headphones',
    description: 'کیفیت صدا، حذف نویز (ANC)، شارژدهی و میکروفون مکالمه',
    criteria: [
      { title: 'اصالت قطعی محصول و گارانتی معتبر تعویض', why: 'جلوگیری از خرید نمونه‌های فیک و های‌کپی بازار', strict: true, weight: 3 },
      { title: 'کیفیت و وضوح تفکیک صدا و بیس متوازن', why: 'لذت واقعی از موسیقی و پادکست', strict: false, weight: 3 },
      { title: 'حذف نویز فعال (Active Noise Cancellation - ANC)', why: 'سکوت دلنشین در مترو، خیابان و محیط کار', strict: false, weight: 3 },
      { title: 'کیفیت میکروفون و شفافیت انتقال صدا در مکالمه', why: 'شنیده شدن واضح صدا توسط مخاطب پشت خط', strict: false, weight: 1 },
      { title: 'شارژدهی باتری گوشی‌ها حداقل ۶ ساعت مداوم', why: 'عدم نیاز به شارژ مکرر در طول روز', strict: false, weight: 1 },
      { title: 'راحتی قرارگیری در گوش و عدم افتادن در حرکت', why: 'امکان ورزش و استفاده طولانی بدون گوش‌درد', strict: false, weight: 1 },
    ],
  },
];

/** State of one criterion for one item. Defaults to 'UNKNOWN' if missing. */
export function stateOf(itemId: number, criterionId: number, checks: CompareCheck[]): CheckState {
  const match = checks.find(c => c.itemId === itemId && c.criterionId === criterionId);
  return match?.state ?? 'UNKNOWN';
}

/** Note of one check for an item and criterion. */
export function noteOf(itemId: number, criterionId: number, checks: CompareCheck[]): string | undefined {
  return checks.find(c => c.itemId === itemId && c.criterionId === criterionId)?.note;
}

/** Calculate comprehensive item stats with weighting and budget checks */
export function calculateItemStats(
  item: CompareItem,
  criteria: CompareCriterion[],
  checks: CompareCheck[],
  budget?: number,
): ItemStats {
  const itemId = item.id!;
  const itemChecks = checks.filter(c => c.itemId === itemId);
  const checkMap = new Map(itemChecks.map(c => [c.criterionId, c.state]));

  let pass = 0;
  let fail = 0;
  let unknown = 0;
  let weightedPassed = 0;
  let maxPossibleWeight = 0;
  const strictFails: CompareCriterion[] = [];

  for (const c of criteria) {
    const s = checkMap.get(c.id!) ?? 'UNKNOWN';
    const weight = c.weight || 1;
    maxPossibleWeight += weight;

    if (s === 'PASS') {
      pass++;
      weightedPassed += weight;
    } else if (s === 'FAIL') {
      fail++;
      if (c.strict) {
        strictFails.push(c);
      }
    } else {
      unknown++;
    }
  }

  const matchPercent = maxPossibleWeight > 0 ? Math.round((weightedPassed / maxPossibleWeight) * 100) : 0;

  // Budget status calculation
  let budgetStatus: ItemStats['budgetStatus'] = 'NONE';
  let budgetDiff: number | undefined = undefined;

  if (budget && item.price !== undefined && budget > 0) {
    budgetDiff = budget - item.price;
    if (item.price < budget) budgetStatus = 'UNDER';
    else if (item.price === budget) budgetStatus = 'EXACT';
    else budgetStatus = 'OVER';
  }

  // Value for money calculation: match percent relative to price
  let valueForMoneyIndex = 50;
  if (item.price && item.price > 0 && maxPossibleWeight > 0) {
    // Score based on match percent and reasonable price scaling
    const priceInMillions = item.price / 10_000_000;
    const efficiency = matchPercent / Math.max(1, Math.log10(priceInMillions + 2));
    valueForMoneyIndex = Math.min(100, Math.max(10, Math.round(efficiency * 1.5)));
  } else {
    valueForMoneyIndex = matchPercent;
  }

  return {
    itemId,
    pass,
    fail,
    unknown,
    total: criteria.length,
    strictFails,
    hasStrictFailure: strictFails.length > 0,
    weightedPassedScore: weightedPassed,
    maxPossibleWeightedScore: maxPossibleWeight,
    matchPercent,
    valueForMoneyIndex,
    budgetDiff,
    budgetStatus,
  };
}

/** Sort items according to selected strategy */
export function orderCompareItems(
  items: CompareItem[],
  criteria: CompareCriterion[],
  checks: CompareCheck[],
  budget?: number,
  sortBy: SortMode = 'RECOMMENDED',
): CompareItem[] {
  const statsMap = new Map<number, ItemStats>();
  for (const item of items) {
    statsMap.set(item.id!, calculateItemStats(item, criteria, checks, budget));
  }

  return [...items].sort((a, b) => {
    const sa = statsMap.get(a.id!)!;
    const sb = statsMap.get(b.id!)!;

    switch (sortBy) {
      case 'MATCH':
        if (sb.matchPercent !== sa.matchPercent) return sb.matchPercent - sa.matchPercent;
        if (sb.pass !== sa.pass) return sb.pass - sa.pass;
        return sa.unknown - sb.unknown;

      case 'PRICE_ASC': {
        const pa = a.price;
        const pb = b.price;
        if (pa !== undefined && pb !== undefined) return pa - pb;
        if (pa !== undefined) return -1;
        if (pb !== undefined) return 1;
        return sb.matchPercent - sa.matchPercent;
      }

      case 'PRICE_DESC': {
        const pa = a.price;
        const pb = b.price;
        if (pa !== undefined && pb !== undefined) return pb - pa;
        if (pa !== undefined) return -1;
        if (pb !== undefined) return 1;
        return sb.matchPercent - sa.matchPercent;
      }

      case 'VALUE':
        if (sb.valueForMoneyIndex !== sa.valueForMoneyIndex) return sb.valueForMoneyIndex - sa.valueForMoneyIndex;
        return sb.matchPercent - sa.matchPercent;

      case 'RECOMMENDED':
      default: {
        // 1. Items without strict failures rank higher than items with strict failures
        if (sa.hasStrictFailure !== sb.hasStrictFailure) {
          return sa.hasStrictFailure ? 1 : -1;
        }
        // 2. Higher match percentage
        if (sb.matchPercent !== sa.matchPercent) return sb.matchPercent - sa.matchPercent;
        // 3. More passes
        if (sb.pass !== sa.pass) return sb.pass - sa.pass;
        // 4. Fewer unknowns
        if (sa.unknown !== sb.unknown) return sa.unknown - sb.unknown;
        // 5. Lower price
        const pa = a.price;
        const pb = b.price;
        if (pa !== undefined && pb !== undefined) return pa - pb;
        if (pa !== undefined) return -1;
        if (pb !== undefined) return 1;
        return 0;
      }
    }
  });
}

/** Head to head comparison between two items */
export function compareTwoItems(
  itemA: CompareItem,
  itemB: CompareItem,
  criteria: CompareCriterion[],
  checks: CompareCheck[],
  onlyDiff = false,
  budget?: number,
): TwoItemsComparison {
  const statsA = calculateItemStats(itemA, criteria, checks, budget);
  const statsB = calculateItemStats(itemB, criteria, checks, budget);

  const diffs: CriterionDiff[] = [];
  let winsA = 0;
  let winsB = 0;
  let ties = 0;

  for (const criterion of criteria) {
    const stateA = stateOf(itemA.id!, criterion.id!, checks);
    const stateB = stateOf(itemB.id!, criterion.id!, checks);

    let winner: 'A' | 'B' | 'TIE' = 'TIE';
    if (stateA === 'PASS' && stateB !== 'PASS') {
      winner = 'A';
      winsA++;
    } else if (stateB === 'PASS' && stateA !== 'PASS') {
      winner = 'B';
      winsB++;
    } else {
      winner = 'TIE';
      ties++;
    }

    if (!onlyDiff || stateA !== stateB) {
      diffs.push({ criterion, stateA, stateB, winner });
    }
  }

  let priceDiff: number | undefined = undefined;
  if (itemA.price !== undefined && itemB.price !== undefined) {
    priceDiff = itemA.price - itemB.price;
  }

  let overallWinner: 'A' | 'B' | 'TIE' = 'TIE';
  if (statsA.hasStrictFailure && !statsB.hasStrictFailure) {
    overallWinner = 'B';
  } else if (!statsA.hasStrictFailure && statsB.hasStrictFailure) {
    overallWinner = 'A';
  } else if (winsA > winsB) {
    overallWinner = 'A';
  } else if (winsB > winsA) {
    overallWinner = 'B';
  } else if (statsA.matchPercent > statsB.matchPercent) {
    overallWinner = 'A';
  } else if (statsB.matchPercent > statsA.matchPercent) {
    overallWinner = 'B';
  }

  return {
    itemA,
    itemB,
    statsA,
    statsB,
    diffs,
    winsA,
    winsB,
    ties,
    priceDiff,
    overallWinner,
  };
}

/** Generate a formatted text summary for sharing via Telegram, WhatsApp, SMS */
export function generateShareText(
  session: CompareSession,
  items: CompareItem[],
  criteria: CompareCriterion[],
  checks: CompareCheck[],
): string {
  const ordered = orderCompareItems(items, criteria, checks, session.budget, 'RECOMMENDED');
  const chosen = items.find(i => i.id === session.chosenItemId);

  const lines: string[] = [];
  lines.push(`📊 مقایسه خرید: ${session.title}`);

  if (session.budget) {
    lines.push(`💰 سقف بودجه: ${Money.toman(session.budget)} تومان`);
  }

  if (chosen) {
    lines.push('');
    lines.push(`🏆 گزینه برنده و انتخاب نهایی: ${chosen.name}`);
    if (chosen.price) lines.push(`💵 قیمت: ${Money.toman(chosen.price)} تومان`);
    if (session.decisionNote) lines.push(`📝 دلیل انتخاب: ${session.decisionNote}`);
  }

  lines.push('');
  lines.push(`🔍 گزینه‌های مورد بررسی (${Money.fa(String(items.length))} گزینه - ${Money.fa(String(criteria.length))} معیار):`);

  ordered.forEach((item, idx) => {
    const stats = calculateItemStats(item, criteria, checks, session.budget);
    const rank = Money.fa(String(idx + 1));
    const priceStr = item.price ? `${Money.toman(item.price)} تومان` : 'قیمت نامشخص';
    lines.push('');
    lines.push(`${rank}. ${item.name} · ${priceStr}`);
    if (item.storeName) lines.push(`   🏪 فروشگاه: ${item.storeName}`);
    lines.push(
      `   ⭐ تطابق: ${Money.fa(String(stats.matchPercent))}٪ (✓ ${Money.fa(String(stats.pass))} رعایت | ✕ ${Money.fa(String(stats.fail))} رد | ? ${Money.fa(String(stats.unknown))} نامشخص)`
    );

    if (stats.hasStrictFailure) {
      lines.push(`   ⚠️ خط قرمز نقض شده: ${stats.strictFails.map(c => c.title).join('، ')}`);
    }
  });

  lines.push('');
  lines.push('📱 تهیه شده با برنامه «جیب من» (مدیریت مالی شخصی و خرید هوشمند)');

  return lines.join('\n');
}
