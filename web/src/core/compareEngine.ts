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
  marketDiff?: number; // marketPrice - price
  belowMarketPercent?: number; // e.g. 25% below market
  isSuspiciouslyCheap: boolean; // true if >= 18% below market
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
    id: 'smartphone-full-risk',
    title: 'چک‌لیست جامع کارشناسی گوشی (سطح ریسک)',
    categoryName: 'موبایل و کارشناسی سلامت',
    iconName: 'Smartphone',
    description: 'کامل‌ترین چک‌لیست: تمام خطوط قرمز نخر، موارد احتیاط، تست قطعات و اصالت',
    criteria: [
      // ۱. رجیستری، مالکیت و نرم‌افزار (نخر قطعی)
      { title: 'تطابق کامل IMEI استعلام‌شده در همتا با مدل واقعی و جعبه گوشی', why: 'عدم قطع آنتن و اصالت قانونی گوشی (نخر قطعی)', strict: true, weight: 3 },
      { title: 'انتقال مالکیت در سامانه همتا و فعال‌سازی با سیم‌کارت شما در محل', why: 'اثبات مالکیت قطعی و جلوگیری از خرید گوشی سرقتی/مسدودی (نخر قطعی)', strict: true, weight: 3 },
      { title: 'خروج کامل از حساب‌ها و عدم وجود قفل iCloud / Apple ID / FRP گوگل', why: 'وجود قفل باعث غیرقابل استفاده شدن گوشی پس از ریست می‌شود (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم قفل اپراتوری (SIM Lock / Carrier Lock) و رجیستر قانونی', why: 'کارکرد دائمی سیم‌کارت‌های همراه اول، ایرانسل و رایتل (نخر قطعی)', strict: true, weight: 3 },
      { title: 'تطابق سخت‌افزار (مدل پردازنده، رم و حافظه) با مشخصات اصلی', why: 'جلوگیری از خرید گوشی‌های فیک، کپی و طرح چینی (نخر قطعی)', strict: true, weight: 3 },

      // ۲. نمایشگر و تاچ (نخر قطعی)
      { title: 'عدم وجود حتی یک پیکسل سوخته یا لکه روشن غیرعادی در نمایشگر', why: 'احتمال گسترش آسیب و نشانه ضربه به کریستال پنل (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم وجود هرگونه خط عمودی یا افقی (سبز، صورتی، سفید، سیاه) روی صفحه', why: 'شکستگی خطوط فلت پنل که حتماً بدتر می‌شود و نیاز به تعویض کامل دارد (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم وجود لکه سیاه، بنفش یا جوهری روی پنل نمایشگر', why: 'نشتی مایع OLED/LCD که حتماً گسترش یافته و پنل را سیاه می‌کند (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عملکرد دقیق و پیوسته لمس (تاچ) در تمام نقاط صفحه و عدم پرپر زدن', why: 'خرابی دیجیتایزر یا مدار تغذیه ال‌سی‌دی (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم وجود سایه تصویر شدید یا سوختگی پیکسل دائمی (Burn-in)', why: 'افت کیفیت شدید صفحه و سوختگی برگشت‌ناپذیر پنل (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم فاصله افتادن صفحه از فریم یا آثار نفوذ مایعات و چسب‌کاری غیرفابریک', why: 'نشانه آب‌خوردگی یا بادکردگی شدید باتری (نخر قطعی)', strict: true, weight: 3 },

      // ۳. باتری و مدار تغذیه (نخر قطعی)
      { title: 'عدم بادکردگی باتری (بلند نشدن قاب پشت یا فشار به صفحه نمایش)', why: 'خطر آتش‌سوزی، انفجار و شکستن قطعات داخلی (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم خاموشی یا ری‌استارت ناگهانی و بدون دلیل حین کار', why: 'شوک ولتاژ باتری یا خرابی هارد/سی‌پی‌یو مادربرد (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم افت ناگهانی و غیرعادی درصد باتری (مثلاً از ۴۰٪ به ۵٪)', why: 'فساد کامل سلول‌های ذخیره انرژی باتری (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم داغ شدن بیش از حد در استفاده معمولی و عدم وجود بوی نشتی', why: 'اتصالی در مدار تغذیه یا خطر سوراخ شدن باتری (نخر قطعی)', strict: true, weight: 3 },

      // ۴. بدنه، فریم و دوربین (نخر قطعی)
      { title: 'فریم و شاسی کاملاً صاف، بدون تاب‌برداشتگی و بدون له‌شدگی شدید', why: 'تاب فریم به مادربرد فشار آورده و باعث خرابی مدارها می‌شود (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم وجود آثار نفوذ آب، رطوبت، یا بخار و قطره داخل شیشه دوربین', why: 'سولفاته شدن قطعات الکترونیکی و از بین رفتن عایق ضدآب (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عملکرد بی‌نقص فوکوس خودکار دوربین و عدم لرزش و صدای ویزویز (OIS)', why: 'شکستگی آهنربای لرزشگیر یا سوختن موتور فوکوس لنز (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم وجود لکه سیاه یا گردوغبار دائمی روی عکس‌های ثبت‌شده دوربین', why: 'سوختگی پیکسل‌های سنسور یا نفوذ گردوغبار به ماژول بسته (نخر قطعی)', strict: true, weight: 3 },

      // ۵. مادربرد و ارتباطات (نخر قطعی)
      { title: 'پایداری کامل آنتن‌دهی و شناسایی سیم‌کارت بدون پرش آنتن', why: 'خرابی آی‌سی بیس‌باند (Baseband) مادربرد که قابل تعمیر مطمئن نیست (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عملکرد سخت‌افزاری کامل Wi-Fi و بلوتوث (روشن شدن و اتصال فوری)', why: 'سوختن چیپ وای‌فای مادربرد (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم سابقه تعمیر برد، هیت‌گرفتن یا دستکاری غیرتخصصی هارد', why: 'بردهای تعمیری عمر بسیار کوتاهی دارند (نخر قطعی)', strict: true, weight: 3 },

      // ۶. حسگرهای امنیتی (نخر قطعی)
      { title: 'عملکرد سریع و بدون خطای Face ID یا حسگر اثر انگشت (Touch ID)', why: 'در آیفون، خرابی Face ID ناشی از ضربه شدید بوده و غیرقابل تعمیر است (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عملکرد صحیح سنسور مجاورت (خاموش شدن صفحه هنگام چسباندن به گوش)', why: 'جلوگیری از قطع تصادفی تماس‌ها (نخر قطعی)', strict: true, weight: 3 },

      // ۷. بخش احتیاط (ضریب ۳ / نیاز به بررسی تخصصی یا کسر تخفیف سنگین)
      { title: 'درصد سلامت باتری (Health بالای ۸۰٪ یا عدم نیاز فوری به تعویض)', why: 'باتری ضعیف نیازمند کسر هزینه تعویض (حداقل ۱ تا ۳ میلیون تومان) است (احتیاط)', strict: false, weight: 3 },
      { title: 'فابریک بودن نمایشگر و عدم تعویض با پنل غیراصل (تست True Tone و رنگ)', why: 'نمایشگر فیک کیفیت نور، تاچ و ارزش گوشی را ۳۰٪ کاهش می‌دهد (احتیاط)', strict: false, weight: 3 },
      { title: 'پیچ‌های زیر گوشی دست‌نخورده و بدون آثار آچارخوردگی باشند', why: 'نشان‌دهنده باز شدن دستگاه و تعویض قطعه (احتیاط)', strict: false, weight: 3 },
      { title: 'عملکرد صحیح شارژ سریع و عدم لقی درگاه سوکت USB', why: 'سوکت لق هزینه تعمیر و تعویض فلت دارد (احتیاط)', strict: false, weight: 2 },
      { title: 'کیفیت و شفافیت تمام اسپیکرها، میکروفون‌ها و موتور ویبره', why: 'صدای خش‌خش یا خفگی نیاز به تعمیر بلندگو دارد (احتیاط)', strict: false, weight: 2 },
      { title: 'عدم وجود خط‌وخش‌های عمیق روی شیشه نمایشگر یا لنز دوربین', why: 'احتمال شکستگی بعدی و افت کیفیت عکاسی (احتیاط)', strict: false, weight: 2 },
      { title: 'عدم روت بودن گوشی یا باز نبودن Bootloader (اجرای برنامه‌های بانکی)', why: 'محدودیت امنیتی و کاربری در نرم‌افزارهای حساس (احتیاط)', strict: false, weight: 2 },
      { title: 'داشتن فاکتور معتبر خرید فروشگاهی و جعبه فابریک', why: 'تضمین اصالت و سهولت در فروش بعدی (احتیاط)', strict: false, weight: 2 },

      // ۸. بخش قابل قبول (ایرادات جزئی که مانع خرید نیستند)
      { title: 'خط‌وخش‌های جزئی و سطحی روی فریم یا قاب پشت بدنه', why: 'استهلاک طبیعی استفاده روزمره و بدون ریسک فنی (قابل قبول)', strict: false, weight: 0.5 },
      { title: 'رنگ‌رفتگی خفیف دور سوکت شارژ ناشی از کابل', why: 'طبیعی در گوشی‌های کارکرده (قابل قبول)', strict: false, weight: 0.5 },
    ],
  },
  {
    id: 'smartphone-quick-test',
    title: 'تست سریع ۱۵ دقیقه‌ای خرید گوشی (۱۲ مرحله)',
    categoryName: 'موبایل و کارشناسی سلامت',
    iconName: 'Smartphone',
    description: 'ترتیب اولویت‌دار تست حضوری زمانی که در مغازه وقت محدودی دارید',
    criteria: [
      { title: '۱. استعلام اصالت IMEI در سامانه همتا (*7777#)', why: 'اطمینان از قانونی و غیرمسدودی بودن گوشی', strict: true, weight: 3 },
      { title: '۲. انتقال مالکیت آنی و فعال‌سازی با سیم‌کارت خودت', why: 'اثبات مالکیت قانونی در حضور فروشنده', strict: true, weight: 3 },
      { title: '۳. خروج کامل از حساب‌های قبلی (iCloud / Google) و ریست', why: 'اطمینان از عدم وجود رمز امنیتی مخفی', strict: true, weight: 3 },
      { title: '۴. تست نمایشگر با تصویر تمام‌سفید، تمام‌مشکی، سبز و قرمز', why: 'کشف سریع پیکسل سوخته، خطوط پنل و لکه جوهری', strict: true, weight: 3 },
      { title: '۵. تست کامل لمس (تاچ) در تمام گوشه‌ها و تایپ کیبورد', why: 'سلامت کامل دیجیتایزر صفحه', strict: true, weight: 3 },
      { title: '۶. تست دوربین اصلی، سلفی و فوکوس دور و نزدیک', why: 'سلامت ماژول‌های عکاسی و لرزشگیر', strict: true, weight: 3 },
      { title: '۷. تماس واقعی با سیم‌کارت خودت و تست آنتن و مکالمه', why: 'سلامت شبکه، اسپیکر گوش و میکروفون', strict: true, weight: 3 },
      { title: '۸. تست اتصال شارژر و درگاه USB و شارژ سریع', why: 'سلامت مدار شارژ و سوکت', strict: true, weight: 3 },
      { title: '۹. تست سلامت Face ID یا سنسور اثر انگشت', why: 'سلامت سنسورهای بیومتریک امنیتی', strict: true, weight: 3 },
      { title: '۱۰. بررسی داغ شدن غیرعادی و عدم ری‌استارت ناگهانی', why: 'سلامت آی‌سی تغذیه و هارد برد اصلی', strict: true, weight: 3 },
      { title: '۱۱. بررسی بدنه، صاف بودن فریم و بادکردگی باتری', why: 'اطمینان از عدم ضربه‌خوردگی شدید و سلامت فیزیکی', strict: true, weight: 3 },
      { title: '۱۲. تست Wi-Fi و بلوتوث و اتصال به مودم', why: 'سلامت چیپ ارتباطات بی‌سیم', strict: true, weight: 3 },
    ],
  },
  {
    id: 'laptop-full-risk',
    title: 'چک‌لیست جامع کارشناسی و خرید لپ‌تاپ (سطح ریسک)',
    categoryName: 'رایانه، لپ‌تاپ و تجهیزات',
    iconName: 'Laptop',
    description: 'کامل‌ترین چک‌لیست خرید لپ‌تاپ: خط قرمزهای نخر، تست استرس GPU/CPU، سلامت لولا، باتری و مادربرد',
    criteria: [
      // ۱. اصالت و قفل‌ها (نخر قطعی)
      { title: 'تطابق دقیق مشخصات با نرم‌افزارهای CPU-Z و GPU-Z (نسل پردازنده، رم و گرافیک)', why: 'فروش لپ‌تاپ با مدل پایین‌تر یا گرافیک جعلی و آنبورد به جای اختصاصی (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم وجود رمز پسورد روی BIOS و عدم وجود قفل شرکتی/سازمانی (MDM / Computrace)', why: 'قفل بایوس مانع بوت و نصب ویندوز می‌شود و قفل سازمانی دستگاه را از راه دور مسدود می‌کند (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم وجود قفل Activation Lock یا Apple ID (در صورت خرید مک‌بوک)', why: 'دستگاه قفل‌شده غیرقابل بازیابی و آجر می‌شود (نخر قطعی)', strict: true, weight: 3 },
      { title: 'تطابق شماره سریال دستگاه (Serial Number) در بایوس، پشت بدنه و جعبه', why: 'کشف لپ‌تاپ‌های سرقتی، ریفربیشد نامعتبر یا جعبه تعویضی (نخر قطعی)', strict: true, weight: 3 },

      // ۲. پایداری، مادربرد و گرافیک (نخر قطعی)
      { title: 'پایداری کامل زیر استرس تست (عدم خاموشی ناگهانی یا ری‌استارت حین فشار Cinebench/FurMark)', why: 'سوختن مدار تغذیه، نیم‌سوز بودن پردازنده یا نقص چیپ گرافیک (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم وجود هرگونه خطوط نویز، برفک یا آرتیفکت گرافیکی (Artifact) در تصویر', why: 'خرابی و سوختگی چیپست گرافیک (VRAM/GPU) که نیازمند تعویض کامل مادربرد است (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم وجود آثار آب‌خوردگی، هیت‌گرفتن چیپ‌ها، شست‌وشو یا لحیم‌کاری دستی روی مادربرد', why: 'بردهای حرارت‌دیده (ریبال‌شده) فقط چند هفته دوام می‌آورند (نخر قطعی)', strict: true, weight: 3 },
      { title: 'دمای نرمال حین تست استرس (عدم افزایش دما به بالای ۹۵ درجه و عدم تراتلینگ شدید)', why: 'خرابی لوله‌های مسی انتقال حرارت (Heatpipe) یا خفگی سیستم خنک‌کننده (نخر قطعی)', strict: true, weight: 3 },

      // ۳. شاسی، لولا و اتصالات فیزیکی (نخر قطعی)
      { title: 'سلامت کامل لولاهای نمایشگر (بدون شکستگی شاسی، بدون لقی شدید و بدون صدای خردشدگی)', why: 'شکستن لولا شاسی، فلت تصویر و صفحه نمایش را خرد می‌کند و هزینه سنگینی دارد (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم بادکردگی باتری (بررسی برآمدگی تاچ‌پد، فاصله افتادن قاب زیرین یا لق شدن کلیک‌ها)', why: 'خطر فوری انفجار و آتش‌سوزی سلول‌های پلیمری (نخر قطعی)', strict: true, weight: 3 },

      // ۴. نمایشگر (نخر قطعی)
      { title: 'عدم وجود خطوط عمودی یا افقی در نمایشگر و عدم پرش و چشمک زدن تصویر', why: 'خرابی فلت یا کریستال مایع پنل که تعویض آن بسیار پرخرج است (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم وجود لکه‌های فشاری سفید پرنور (White Spot) یا پیکسل‌های سوخته متعدد', why: 'آسیب مستقیم به لایه‌های انتشار نور ال‌سی‌دی (نخر قطعی)', strict: true, weight: 3 },

      // ۵. بخش ریسک بالا / احتیاط (ضریب ۳ / نیاز به بررسی دقیق و کسر تخفیف)
      { title: 'سلامت هارد SSD بالای ۸۰٪ و عدم وجود خطاهای بحرانی SMART در CrystalDiskInfo', why: 'هارد مستهلک نیازمند تعویض فوری و کسر هزینه از قیمت است (احتیاط)', strict: false, weight: 3 },
      { title: 'سلامت باتری در Battery Report (نسبت Full Charge به Design بالای ۷۰٪)', why: 'افت شارژدهی و نیاز به تعویض باتری داخلی (احتیاط)', strict: false, weight: 3 },
      { title: 'شارژر اصلی فابریک با توان خروجی استاندارد وات و آمپر دستگاه', why: 'شارژر فیک به آی‌سی شارژ و مدار تغذیه مادربرد آسیب می‌زند (احتیاط)', strict: false, weight: 3 },
      { title: 'تست سلامت کامل تمام کلیدهای کیبورد (عدم کار نکردن یا گیر کردن دکمه‌ها)', why: 'تعویض کیبوردهای پرسی لپ‌تاپ‌های جدید بسیار سخت و گران است (احتیاط)', strict: false, weight: 2 },
      { title: 'عملکرد تمام پورت‌های USB، تایپ سی (Type-C)، درگاه خروجی HDMI و شارژ', why: 'تعمیر پورت‌های شکسته روی برد اصلی نیاز به لحیم‌کاری دقیق دارد (احتیاط)', strict: false, weight: 2 },
      { title: 'صدای شفاف و بدون خش‌خش اسپیکرها، عملکرد جک صدا، وب‌کم و میکروفون', why: 'هزینه تعویض بلندگوها یا ماژول وبکم (احتیاط)', strict: false, weight: 2 },
      { title: 'عملکرد روان فن‌های خنک‌کننده بدون صدای زوزه، لقی یا خِرخِر بلبرینگ', why: 'نیاز به سرویس، روغن‌کاری یا تعویض فن (احتیاط)', strict: false, weight: 2 },
      { title: 'عملکرد صحیح و اتصال پایدار کارت Wi-Fi و بلوتوث', why: 'سلامت ماژول شبکه بی‌سیم (احتیاط)', strict: false, weight: 2 },

      // ۶. بخش عادی و قابل قبول (ضریب ۰٫۵)
      { title: 'خط‌وخش‌های جزئی و سطحی روی قاب پشت یا لبه‌های بدنه', why: 'استهلاک طبیعی حمل‌ونقل و استفاده روزمره بدون ریسک فنی (عادی)', strict: false, weight: 0.5 },
      { title: 'براق شدن تدریجی برخی کلیدهای پرکاربرد کیبورد (مثل Space یا حروف)', why: 'طبیعی در اثر سایش انگشتان دست (عادی)', strict: false, weight: 0.5 },
    ],
  },
  {
    id: 'laptop-quick-test',
    title: 'تست سریع ۲۰ دقیقه‌ای لپ‌تاپ (فیلترهای سر معامله)',
    categoryName: 'رایانه، لپ‌تاپ و تجهیزات',
    iconName: 'Laptop',
    description: 'ترتیب اولویت‌دار تست زمانی که پای میز معامله وقت محدودی دارید',
    criteria: [
      { title: '۱. ورود به BIOS و اطمینان از عدم وجود پسورد و تطابق مدل و سریال', why: 'قفل بایوس خطرناک‌ترین ایراد امنیتی لپ‌تاپ است', strict: true, weight: 3 },
      { title: '۲. بررسی مشخصات در CPU-Z و Device Manager (تطابق پردازنده و کارت گرافیک)', why: 'اطمینان از اصالت کانفیگ اعلامی', strict: true, weight: 3 },
      { title: '۳. بررسی سلامت هارد با CrystalDiskInfo (بررسی درصد سلامت و خطای سکتور)', why: 'اطمینان از عدم سوختن زودهنگام حافظه', strict: true, weight: 3 },
      { title: '۴. گرفتن گزارش باتری در CMD (powercfg /batteryreport) و مقایسه ظرفیت', why: 'محاسبه میزان فرسودگی باتری', strict: true, weight: 3 },
      { title: '۵. باز و بسته کردن نمایشگر و بررسی لقی، سفتی لولا و عدم پرپر تصویر', why: 'سلامت مکانیکی لولا و فلت صفحه', strict: true, weight: 3 },
      { title: '۶. تست نمایشگر با سایت EIZO Test با صفحات سفید، مشکی و رنگی', why: 'کشف پیکسل سوخته، هاله نور و لکه فشار', strict: true, weight: 3 },
      { title: '۷. تست استرس ۵ دقیقه‌ای CPU و GPU با Cinebench یا FurMark', why: 'اطمینان از عدم خاموشی زیر فشار و عدم آرتیفکت', strict: true, weight: 3 },
      { title: '۸. تست آنلاین کیبورد (Keyboard Tester) و عملکرد تمام کلیدها و تاچ‌پد', why: 'اطمینان از سالم بودن تمام دکمه‌ها', strict: true, weight: 3 },
      { title: '۹. اتصال فلش مموری به تک‌تک پورت‌های USB و تست خروجی تصویر HDMI', why: 'سلامت مسیرهای ارتباطی ورودی/خروجی', strict: true, weight: 3 },
      { title: '۱۰. جدا کردن کابل شارژ و اطمینان از روشن ماندن دستگاه روی باتری', why: 'اطمینان از عدم مرگ ناگهانی باتری', strict: true, weight: 3 },
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
    id: 'vehicle-full-risk',
    title: 'چک‌لیست جامع کارشناسی و خرید خودرو (سطح ریسک)',
    categoryName: 'وسایل نقلیه و خودرو',
    iconName: 'Car',
    description: 'کامل‌ترین چک‌لیست خرید خودرو: خطوط قرمز نخر، اصالت مدارک، شاسی، موتور و گیربکس',
    criteria: [
      // ۱. اصالت و مدارک قانونی (نخر قطعی)
      { title: 'تطابق کامل شماره شاسی (VIN) و شماره موتور با مدارک بدون آثار سنگ‌خوردگی یا جوش', why: 'دستکاری شماره شاسی جرم کیفری است و خودرو غیرقابل پلاک‌گذاری می‌شود (نخر قطعی)', strict: true, weight: 3 },
      { title: 'اصالت مالکیت، استعلام رسمی راهور و عدم وجود توقیف، بازداشت یا منع معامله', why: 'جلوگیری از کلاهبرداری و توقیف خودرو توسط مراجع قضایی (نخر قطعی)', strict: true, weight: 3 },
      { title: 'حضور مالک رسمی یا وکالت‌نامه معتبر و تام با حق تعویض پلاک بدون تاریخ گذشته', why: 'عدم امکان تعویض پلاک و درگیری‌های اداری و دادگاهی (نخر قطعی)', strict: true, weight: 3 },
      { title: 'تسویه کامل خلافی، عوارض شهرداری، مالیات نقل‌وانتقال و عدم رهن لیزینگ', why: 'بدهی‌های معوق به عهده خریدار خواهد افتاد (نخر قطعی)', strict: true, weight: 3 },

      // ۲. شاسی، ستون‌ها و آسیب سازه‌ای (نخر قطعی)
      { title: 'شاسی جلو و عقب کاملاً پلمپ، بدون ضربه، کشیدگی، جوشکاری یا موم‌کشی دستی', why: 'آسیب به شاسی هندلینگ خودرو را خراب کرده و ایمنی جانی ندارد (نخر قطعی)', strict: true, weight: 3 },
      { title: 'ستون‌های A و B و C کاملاً سالم و فابریک بدون برش، دوتکه بودن یا جوشکاری', why: 'نشانه تصادف فوق‌سنگین و کاهش شدید مقاومت اتاق در تصادف (نخر قطعی)', strict: true, weight: 3 },
      { title: 'سقف خودرو فابریک، بدون رنگ، بدون بتونه‌کاری و بدون آثار چپ‌شدگی', why: 'چپ‌شدگی شدیدترین افت قیمت را دارد و شاسی را از حالت استاندارد خارج می‌کند (نخر قطعی)', strict: true, weight: 3 },
      { title: 'کف صندوق عقب و سینی جلو فاقد چروکیدگی، ضربه و صافکاری سنگین', why: 'آسیب مستقیم ضربه تصادف به اسکلت خودرو (نخر قطعی)', strict: true, weight: 3 },

      // ۳. موتور و سرسیلندر (نخر قطعی)
      { title: 'عدم وجود کوبش داخلی موتور (صدای یاتاقان، شاتون یا پیستون در دورهای مختلف)', why: 'نیاز به تعمیر اساسی کامل موتور با هزینه‌های بسیار سنگین (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم مخلوط شدن آب و روغن (عدم وجود مایع شیری‌رنگ زیر درب روغن یا رادیاتور)', why: 'سوختن واشر سرسیلندر یا ترکیدگی بلوک سیلندر (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم خروج دود آبی مداوم از اگزوز هنگام گاز دادن', why: 'روغن‌سوزی شدید و خرابی رینگ و پیستون یا لاستیک سوپاپ‌ها (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم خروج دود سفید غلیظ و مداوم پس از گرم شدن خودرو', why: 'ورود مستقیم آب رادیاتور به محفظه احتراق (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم داغ کردن غیرعادی و پایداری دمای آب در ترافیک و درجا (عملکرد صحیح فن)', why: 'نقص جدی سیستم خنک‌کننده و خطر تاب برداشتن سرسیلندر (نخر قطعی)', strict: true, weight: 3 },

      // ۴. گیربکس و انتقال قدرت (نخر قطعی)
      { title: 'گیربکس اتوماتیک بدون تقه شدید، بدون لغزش دور موتور و بدون تاخیر درگیر شدن D و R', why: 'هزینه تعمیر گیربکس اتوماتیک بسیار سرسام‌آور است (نخر قطعی)', strict: true, weight: 3 },
      { title: 'گیربکس دستی: جا رفتن نرم تمام دنده‌ها بدون زوزه کشیدن یا پس زدن دنده', why: 'خرابی دنده‌های برنجی و کشویی‌های گیربکس (نخر قطعی)', strict: true, weight: 3 },

      // ۵. ایمنی، ایربگ و سلامت اتاق (نخر قطعی)
      { title: 'سلامت کامل ایربگ‌ها و عدم شبیه‌سازی با مقاومت در دیاگ تخصصی SRS', why: 'ایربگ بازشده در تصادف بعدی عمل نکرده و جان سرنشینان در خطر است (نخر قطعی)', strict: true, weight: 3 },
      { title: 'عدم وجود سابقه سیل‌زدگی یا غرق‌شدگی در گل‌ولای (بررسی زیر موکت کف و داشبورد)', why: 'پوسیدگی پنهان تمام سیم‌کشی‌ها و خرابی همیشگی کامپیوترها (نخر قطعی)', strict: true, weight: 3 },

      // ۶. بخش احتیاط (ضریب ۳ / نیاز به کارشناسی دقیق و کسر تخفیف متناسب)
      { title: 'کارکرد کیلومتر واقعی (بررسی سوابق ECU، استهلاک فرمان، پدال‌ها و صندلی)', why: 'دستکاری کیلومتر برای پنهان کردن استهلاک واقعی (احتیاط)', strict: false, weight: 3 },
      { title: 'سلامت و آب‌بندی کامل سیستم خنک‌کننده، رادیاتور و واترپمپ بدون نشتی', why: 'خطر کم شدن آب و سوختن موتور در اولین سفر (احتیاط)', strict: false, weight: 3 },
      { title: 'سلامت جلوبندی، جعبه فرمان و کمک‌فنرها (عدم کشش فرمان به یک سمت)', why: 'نیاز به هزینه تعویض سیبک، بوش و طبق (احتیاط)', strict: false, weight: 2 },
      { title: 'سلامت دیسک و صفحه کلاچ (شتاب‌گیری مناسب بدون بالا رفتن هرز دور موتور)', why: 'نیاز به تعویض صفحه کلاچ در آینده نزدیک (احتیاط)', strict: false, weight: 2 },
      { title: 'عملکرد سیستم ترمز و سلامت بوستر و سیستم ABS و پمپ ترمز', why: 'ایمنی ترمزگیری در شرایط اضطراری (احتیاط)', strict: false, weight: 3 },
      { title: 'عدم وجود خطاهای پایدار و سنسورهای خراب در دیاگ کامل ECU', why: 'خرابی سنسور اکسیژن، دریچه گاز یا کوئل‌ها (احتیاط)', strict: false, weight: 2 },
      { title: 'تعداد قطعات رنگ‌شده یا تعویضی بدنه (به شرط سلامت کامل شاسی و ستون)', why: 'کاهش قیمت خودرو متناسب با عرف بازار (احتیاط)', strict: false, weight: 2 },
      { title: 'عملکرد سالم و خنک‌کنندگی مناسب کولر و بخاری درجا و حرکت', why: 'هزینه تعمیر کمپرسور و شارژ گاز کولر (احتیاط)', strict: false, weight: 2 },

      // ۷. بخش قابل قبول / هزینه‌های مصرفی (ضریب ۰٫۵)
      { title: 'عاج لاستیک‌ها بالای ۶۰٪ و تاریخ تولید استاندارد (زیر ۴ سال)', why: 'هزینه خرید ۴ حلقه لاستیک در صورت فرسودگی (مصرفی)', strict: false, weight: 0.5 },
      { title: 'خط‌وخش‌های جزئی روی سپرها، فلاپ‌ها یا لبه درها', why: 'استهلاک طبیعی رانندگی شهری و پارک (قابل قبول)', strict: false, weight: 0.5 },
      { title: 'زمان باقیمانده بیمه شخص ثالث و معاینه فنی معتبر', why: 'هزینه تمدید بیمه‌نامه (مصرفی)', strict: false, weight: 0.5 },
    ],
  },
  {
    id: 'vehicle-quick-filter',
    title: 'فیلتر اولیه و بازدید حضوری خودرو (قبل از هزینه کارشناسی)',
    categoryName: 'وسایل نقلیه و خودرو',
    iconName: 'Car',
    description: 'چک‌لیست ۱۰ دقیقه‌ای سر معامله برای جلوگیری از هدر رفتن هزینه کارشناسی',
    criteria: [
      { title: '۱. استعلام پیامکی و مطابقت کارت ماشین با پلاک و هویت فروشنده', why: 'اطمینان از قانونی بودن معامله', strict: true, weight: 3 },
      { title: '۲. بررسی چشمی سرشاسی‌ها و سینی جلو و عقب در نور مناسب', why: 'کشف تصادف سنگین پیش از پرداخت هزینه کارشناس', strict: true, weight: 3 },
      { title: '۳. استارت در حالت کاملاً سرد موتور (بدون استارت طولانی و صدای تق‌تق)', why: 'سلامت اولیه استارت و موتور', strict: true, weight: 3 },
      { title: '۴. بررسی خروجی اگزوز (عدم وجود دود آبی یا دود سفید غلیظ مداوم)', why: 'کشف روغن‌سوزی یا آب‌روغن قاطی کردن', strict: true, weight: 3 },
      { title: '۵. بررسی زیر درب روغن و رادیاتور (عدم وجود کف شیری و رسوب زرد)', why: 'سلامت واشر سرسیلندر', strict: true, weight: 3 },
      { title: '۶. بررسی سلامت فابریک سقف و ستون‌ها و موم‌های فابریک کارخانه', why: 'کشف چپی بودن خودرو', strict: true, weight: 3 },
      { title: '۷. تست سلامت تعویض دنده‌ها و درگیر شدن بدون تقه در گیربکس', why: 'سلامت اولیه گیربکس', strict: true, weight: 3 },
      { title: '۸. بررسی چراغ چک، روغن و ایربگ (روشن شدن با سوئیچ و خاموش شدن بعد استارت)', why: 'اطمینان از عدم دستکاری چراغ‌های هشدار', strict: true, weight: 3 },
      { title: '۹. تست رانندگی کوتاه و بررسی کشیدن فرمان به طرفین هنگام ترمز', why: 'سلامت شاسی و جلوبندی', strict: true, weight: 3 },
      { title: '۱۰. توافق کتبی با فروشنده برای تقبل هزینه کارشناسی در صورت مغایرت ادعا', why: 'تعهد به سلامت و راستگویی فروشنده', strict: true, weight: 3 },
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

  // Market reference price comparison (detect suspiciously cheap prices)
  let marketDiff: number | undefined = undefined;
  let belowMarketPercent: number | undefined = undefined;
  let isSuspiciouslyCheap = false;

  if (item.marketPrice && item.price && item.marketPrice > 0 && item.price < item.marketPrice) {
    marketDiff = item.marketPrice - item.price;
    belowMarketPercent = Math.round((marketDiff / item.marketPrice) * 100);
    if (belowMarketPercent >= 18) {
      isSuspiciouslyCheap = true;
    }
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
    marketDiff,
    belowMarketPercent,
    isSuspiciouslyCheap,
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
