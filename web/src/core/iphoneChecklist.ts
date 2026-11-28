export type IphoneCheckStatus = 'PENDING' | 'PASS' | 'FAIL';

export interface IphoneChecklistLink {
  label: string;
  url: string;
}

export interface IphoneChecklistItem {
  id: string;
  sectionId: string;
  title: string;
  guide: string;
  passCriteria?: string;
  critical: boolean;
  codeChips?: string[];
  links?: IphoneChecklistLink[];
  hasScreenTest?: boolean;
  hasReceiptTemplate?: boolean;
}

export type IphoneSectionAccent = 'bad' | 'warn' | 'sky' | 'ok' | 'primary';

export type IphoneSectionIcon =
  | 'ShieldCheck'
  | 'Wrench'
  | 'Cpu'
  | 'Monitor'
  | 'BatteryCharging'
  | 'Camera'
  | 'LockKeyhole';

export interface IphoneChecklistSection {
  id: string;
  numberFa: string;
  badge: string;
  title: string;
  subtitle?: string;
  accent: IphoneSectionAccent;
  iconName: IphoneSectionIcon;
}

export interface IphoneInspectionItemState {
  status: IphoneCheckStatus;
  note?: string;
  updatedAt: number;
}

export interface IphoneInspection {
  id: string;
  title: string;
  modelVariant: string;
  priceToman: string;
  batteryHealth: string;
  cycleCount: string;
  partNumber: string;
  sellerNote: string;
  items: Record<string, IphoneInspectionItemState>;
  createdAt: number;
  updatedAt: number;
}

export interface IphoneInspectionStore {
  activeId: string;
  inspections: IphoneInspection[];
}

export const IPHONE_CHECKLIST_SECTIONS: IphoneChecklistSection[] = [
  {
    id: 'authenticity',
    numberFa: '۱',
    badge: 'بسیار حیاتی',
    title: 'اصالت، قفل نبودن و شرایط «بدون کد»',
    subtitle:
      'چون گوشی بدون کد (رجیستر نشده) است، انتقال مالکیت در سامانه همتا وجود ندارد؛ پس این مراحل ضامن امنیت خرید شماست.',
    accent: 'bad',
    iconName: 'ShieldCheck',
  },
  {
    id: 'physical',
    numberFa: '۲',
    badge: 'روش تعمیرکاران',
    title: 'بررسی ظاهری و تشخیص بازشدگی گوشی',
    accent: 'warn',
    iconName: 'Wrench',
  },
  {
    id: 'diagnostics',
    numberFa: '۳',
    badge: 'سابقه قطعات و برد',
    title: 'دیاگ رسمی اپل و بررسی سابقه قطعات',
    accent: 'sky',
    iconName: 'Cpu',
  },
  {
    id: 'display',
    numberFa: '۴',
    badge: 'پنل و لمس',
    title: 'تست صفحه‌نمایش و تاچ',
    accent: 'primary',
    iconName: 'Monitor',
  },
  {
    id: 'battery',
    numberFa: '۵',
    badge: 'تشخیص دستکاری',
    title: 'تست باتری و داغ شدن',
    subtitle: 'بسیار مهم برای تشخیص باتری پروگرم‌شده یا ضعیف.',
    accent: 'warn',
    iconName: 'BatteryCharging',
  },
  {
    id: 'hardware',
    numberFa: '۶',
    badge: 'عملکرد سخت‌افزار',
    title: 'تست دوربین، صدا، سنسورها و پورت‌ها',
    accent: 'ok',
    iconName: 'Camera',
  },
  {
    id: 'iran-security',
    numberFa: '۷',
    badge: 'ویژه بازار ایران',
    title: 'تست‌های امنیتی، آنتن‌دهی و رسید معامله',
    subtitle: 'تست‌های فنی و امنیتی تکمیلی که هنگام خرید آیفون بدون کد جلوی ضررهای سنگین را می‌گیرد.',
    accent: 'bad',
    iconName: 'LockKeyhole',
  },
];

export const IPHONE_CHECKLIST_ITEMS: IphoneChecklistItem[] = [
  // بخش اول: بررسی اصالت، قفل نبودن و شرایط «بدون کد»
  {
    id: 'auth-imei-box',
    sectionId: 'authenticity',
    title: 'تطبیق IMEI و جعبه اصلی (پک اصلی)',
    guide:
      'در صفحه شماره‌گیر گوشی کد *#06# را بزنید. شماره IMEI و Serial Number نمایش‌داده‌شده را رقم‌به‌رقم با برچسب پشت کارتن مطابقت دهید. کیفیت چاپ جعبه را هم ببینید (در پک اصلی تصویر گوشی کمی برجستگی دارد و برچسب پشت صاف و تراز است). هرگز آیفون بدون کد را بدون جعبه اصلی نخرید.',
    passCriteria: 'تطابق کامل رقم‌به‌رقم IMEI و سریال گوشی با برچسب پشت جعبه اصلی.',
    critical: true,
    codeChips: ['*#06#'],
  },
  {
    id: 'auth-apple-coverage',
    sectionId: 'authenticity',
    title: 'استعلام در سایت رسمی اپل',
    guide:
      'سریال گوشی را از Settings > General > About کپی کرده و در سایت رسمی اپل (checkcoverage.apple.com) وارد کنید تا از اصالت و تاریخ اولین فعال‌سازی گوشی مطمئن شوید.',
    passCriteria: 'نمایش صحیح مدل دستگاه و تاریخ فعال‌سازی معتبر در سایت اپل.',
    critical: true,
    codeChips: ['Settings > General > About'],
    links: [{ label: 'checkcoverage.apple.com', url: 'https://checkcoverage.apple.com' }],
  },
  {
    id: 'auth-model-number',
    sectionId: 'authenticity',
    title: 'بررسی ریفربیشد نبودن (Model Number)',
    guide:
      'در بخش About به حرف اول Model Number نگاه کنید. اگر با M شروع شود یعنی گوشی نو و استاندارد وارد بازار شده است؛ اگر با F شروع شود یعنی گوشی تعمیرشده کارخانه (Refurbished) است و ارزش خرید کمتری دارد.',
    passCriteria: 'حرف اول Model Number باید M باشد (شروع با F نشانه ریفربیشد است).',
    critical: true,
    codeChips: ['Model Number: M...'],
  },
  {
    id: 'auth-carrier-lock',
    sectionId: 'authenticity',
    title: 'بررسی قفل نبودن سیم‌کارت (Carrier Lock)',
    guide:
      'در بخش About به پایین اسکرول کنید. روبه‌روی Carrier Lock حتماً باید عبارت No SIM restrictions نوشته شده باشد. اگر چیز دیگری نوشته بود یعنی گوشی لاک اپراتور خارجی است و در ایران حتی با وجود آنتن موقت یا روش‌های جانبی مشکل خواهد داشت.',
    passCriteria: 'مقابل Carrier Lock دقیقاً عبارت No SIM restrictions درج شده باشد.',
    critical: true,
    codeChips: ['No SIM restrictions'],
  },
  {
    id: 'auth-icloud-reset',
    sectionId: 'authenticity',
    title: 'خروج کامل از iCloud و ریست فکتوری',
    guide:
      'در پایان تست‌ها و قبل از واریز پول، فروشنده باید وارد اپل‌آیدی شود، Find My iPhone را خاموش کند، Sign Out بزند و گوشی را از مسیر Settings > General > Transfer or Reset iPhone > Erase All Content and Settings کامل ریست کند.',
    passCriteria: 'خاموش شدن Find My، خروج کامل از اپل‌آیدی و انجام Erase All Content and Settings.',
    critical: true,
    codeChips: ['Erase All Content and Settings'],
  },

  // بخش دوم: بررسی ظاهری و تشخیص بازشدگی گوشی
  {
    id: 'phys-remove-case',
    sectionId: 'physical',
    title: 'جدا کردن قاب و گلس',
    guide:
      'با اجازه فروشنده کاور و گلس محافظ صفحه را بردارید تا خط‌وخش‌های عمیق روی نمایشگر یا ضربه‌خوردگی فریم زیر آن‌ها پنهان نمانده باشد.',
    critical: false,
  },
  {
    id: 'phys-air-seal',
    sectionId: 'physical',
    title: 'تست کیپ بودن بدنه (فوت کردن در خشاب سیم‌کارت)',
    guide:
      'مخصوص پارت‌نامبرهای دارای خشاب مثل CH و ZAA: سوزن را بزنید و خشاب سیم‌کارت را درآورید. داخل شیار سیم‌کارت فوت کنید؛ آیفون پلمپ کاملاً کیپ است. اگر احساس کردید هوا از کنار دکمه‌ها، اسپیکر یا لبه‌های قاب خارج می‌شود، یعنی گوشی قبلاً باز شده و چسب آب‌بندی آن از بین رفته است.',
    passCriteria: 'بدنه کاملاً کیپ باشد و هیچ هوایی از کنار دکمه‌ها، اسپیکر یا لبه‌های قاب خارج نشود.',
    critical: true,
  },
  {
    id: 'phys-lci',
    sectionId: 'physical',
    title: 'بررسی نشانگر آب‌خوردگی (LCI)',
    guide:
      'با چراغ‌قوه به داخل دیواره شیار سیم‌کارت نگاه کنید. یک نوار کوچک وجود دارد؛ در حالت سالم سفید است. اگر صورتی یا قرمز شده باشد یعنی داخل گوشی آب نفوذ کرده است.',
    passCriteria: 'نوار نشانگر داخل دیواره شیار سیم‌کارت باید کاملاً سفید باشد (نه صورتی یا قرمز).',
    critical: true,
  },
  {
    id: 'phys-screws',
    sectionId: 'physical',
    title: 'بررسی پیچ‌های پایین گوشی',
    guide:
      'به دو پیچ کنار پورت Type-C نگاه کنید. هیچ وسیله‌ای به‌طور طبیعی با آن‌ها تماس ندارد؛ هرگونه رنگ‌رفتگی یا خط افتادن داخل شیار پیچ نشانه آچار خوردن و باز شدن گوشی است.',
    passCriteria: 'شیار و رنگ دو پیچ کنار پورت Type-C کاملاً سالم و بدون آثار آچارخوردگی باشد.',
    critical: false,
  },
  {
    id: 'phys-lenses-back',
    sectionId: 'physical',
    title: 'بررسی لنزهای دوربین و قاب پشت',
    guide:
      'لنزهای دوربین پشت و سلفی را تمیز کنید و با دقت زیر نور ببینید؛ وجود کوچک‌ترین پرز، مو یا گردوغبار زیر شیشه دوربین نشانه باز شدن گوشی است. لبه‌های شیشه پشت هم باید کاملاً یکنواخت و بدون رد چسب یا فاصله باشد.',
    passCriteria: 'عدم وجود گردوغبار یا پرز زیر شیشه لنزها و یکنواختی کامل لبه‌های شیشه پشت.',
    critical: false,
  },

  // بخش سوم: دیاگ رسمی اپل و بررسی سابقه قطعات
  {
    id: 'diag-apple',
    sectionId: 'diagnostics',
    title: 'اجرای دیاگ رسمی اپل (iOS 18 به بالا)',
    guide:
      'گوشی را خاموش کنید. دکمه‌های ولوم بالا و پایین را همزمان نگه دارید و در همین حال گوشی را به شارژر یا پاوربانک وصل کنید. با دیدن لوگوی اپل دکمه‌ها را رها کنید. گوشی را به اینترنت (هات‌اسپات) وصل کنید تا تست عیب‌یابی اجرا شود.',
    passCriteria: 'همه بخش‌ها تیک سبز بگیرند (هشدار زرد معمولاً فقط به خاطر آپدیت نبودن iOS است).',
    critical: true,
  },
  {
    id: 'diag-unknown-part',
    sectionId: 'diagnostics',
    title: 'بررسی پیام قطعه غیراصل در تنظیمات',
    guide:
      'به Settings > General > About بروید. اگر قطعه‌ای غیراصل تعویض شده باشد، پیامی تحت عنوان Unknown Part در این صفحه نمایش داده می‌شود.',
    passCriteria: 'عدم نمایش هیچ‌گونه پیام Unknown Part در بخش About.',
    critical: true,
    codeChips: ['Unknown Part', 'Settings > General > About'],
  },
  {
    id: 'diag-panic-log',
    sectionId: 'diagnostics',
    title: 'بررسی خطاهای سخت‌افزاری برد (Panic Log)',
    guide:
      'وارد Settings > Privacy & Security > Analytics & Improvements > Analytics Data شوید. در کادر جستجوی بالا کلمه panic را تایپ کنید. اگر حتی یک فایل panic-full وجود داشت، گوشی مشکل برد و خاموشی ناگهانی دارد و اصلاً نخرید.',
    passCriteria: 'نبودن حتی یک فایل panic-full در گزارش‌های Analytics Data.',
    critical: true,
    codeChips: ['panic', 'panic-full'],
  },
  {
    id: 'diag-3utools',
    sectionId: 'diagnostics',
    title: 'تست با کامپیوتر (در صورت دسترسی به لپ‌تاپ)',
    guide:
      'گوشی را با کابل به برنامه 3uTools وصل کنید و وارد بخش Verification Report شوید؛ تمام قطعات باید سبز (Normal) باشند.',
    passCriteria: 'وضعیت سبز (Normal) برای تمام قطعات در گزارش Verification Report.',
    critical: false,
    codeChips: ['3uTools > Verification Report'],
  },

  // بخش چهارم: تست صفحه‌نمایش و تاچ
  {
    id: 'disp-oled',
    sectionId: 'display',
    title: 'تشخیص پنل OLED اصل از LCD تعویضی',
    guide:
      'در یک جای تاریک (مثلاً زیر لباس) یک عکس کاملاً مشکی باز کنید. در OLED اصل، صفحه کاملاً خاموش و تاریک است؛ اگر هاله نور سفید (بک‌لایت) دیدید، نمایشگر تعویض شده است.',
    passCriteria: 'سیاهی مطلق صفحه در تاریکی بدون هیچ هاله نور سفید (Backlight).',
    critical: true,
    hasScreenTest: true,
  },
  {
    id: 'disp-truetone',
    sectionId: 'display',
    title: 'بررسی گزینه True Tone',
    guide:
      'کنترل‌سنتر را پایین بکشید و روی نوار روشنایی (Brightness) نگه دارید؛ گزینه True Tone باید در پایین نمایش داده شود و فعال باشد (نبودنش نشانه تعویض صفحه است).',
    passCriteria: 'وجود و فعال بودن گزینه True Tone زیر نوار روشنایی.',
    critical: false,
    codeChips: ['True Tone'],
  },
  {
    id: 'disp-glass-wave',
    sectionId: 'display',
    title: 'بررسی موج نداشتن گلس ال‌سی‌دی',
    guide:
      'صفحه را خاموش کنید و در نور کم با زاویه به بازتاب نور روی صفحه نگاه کنید؛ بازتاب باید صاف و آینه‌ای باشد (حالت موج‌دار نشانه تعویض گلس روی نمایشگر است).',
    passCriteria: 'بازتاب نور کاملاً صاف و آینه‌ای بدون موج‌دار بودن شیشه صفحه.',
    critical: false,
  },
  {
    id: 'disp-touch',
    sectionId: 'display',
    title: 'تست سلامت تاچ در تمام نقاط',
    guide:
      'یکی از آیکون‌های صفحه را نگه دارید تا بلرزد و آن را روی تمام لبه‌ها، گوشه‌ها و وسط صفحه بکشید (یا AssistiveTouch را فعال کنید و در کل صفحه بچرخانید). هیچ نقطه‌ای نباید از زیر انگشت شما رها شود.',
    passCriteria: 'عملکرد پیوسته لمس در تمام لبه‌ها، گوشه‌ها و مرکز صفحه بدون رها شدن آیکون.',
    critical: true,
    codeChips: ['AssistiveTouch'],
  },

  // بخش پنجم: تست باتری و داغ شدن
  {
    id: 'bat-health-cycle',
    sectionId: 'battery',
    title: 'بررسی درصد سلامت و تعداد شارژ (Cycle Count)',
    guide:
      'وارد Settings > Battery > Battery Health شوید. درصد سلامت ترجیحاً بالای ۸۵٪ باشد (زیر ۸۰٪ نیاز به تعویض دارد). در آیفون ۱۵ عدد Cycle Count هم نمایش داده می‌شود؛ مطمئن شوید با درصد باتری همخوانی دارد (مثلاً درصد ۱۰۰٪ با ۴۰۰ بار شارژ یعنی باتری پروگرم و دستکاری شده است).',
    passCriteria: 'سلامت باتری ترجیحاً بالای ۸۵٪ و تناسب منطقی بین درصد سلامت و Cycle Count.',
    critical: false,
    codeChips: ['Settings > Battery > Battery Health'],
  },
  {
    id: 'bat-camera-stress',
    sectionId: 'battery',
    title: 'تست استرس باتری با دوربین (تست ۱۰ دقیقه‌ای)',
    guide:
      'قبل از باز کردن دوربین درصد شارژ را یادداشت کنید. وارد دوربین شوید و ۵ تا ۱۰ دقیقه مداوم با کیفیت بالا فیلم بگیرید و عکس بیندازید. اگر باتری خراب یا دستکاری شده باشد، شارژ یک‌باره ۱۰ تا ۲۰ درصد افت می‌کند یا بالای گوشی بیش از حد داغ می‌شود.',
    passCriteria: 'عدم افت ناگهانی شارژ (۱۰ تا ۲۰ درصد) و عدم داغ شدن بیش از حد بالای گوشی.',
    critical: true,
  },

  // بخش ششم: تست دوربین، صدا، سنسورها و پورت‌ها
  {
    id: 'hw-cameras',
    sectionId: 'hardware',
    title: 'دوربین‌ها و فوکوس',
    guide:
      'هر دو لنز پشت (0.5x و 1x) و دوربین سلفی را تست کنید. دست خود را جلو و عقب ببرید تا سرعت فوکوس خودکار را بسنجید. روی عکس‌های گرفته‌شده زوم کنید تا مطمئن شوید تار (Blur) نیستند و لکه سیاه ندارند.',
    passCriteria: 'فوکوس سریع در لنزهای 0.5x، 1x و سلفی و نبود لکه سیاه یا تاری روی عکس‌ها.',
    critical: true,
  },
  {
    id: 'hw-flash',
    sectionId: 'hardware',
    title: 'چراغ قوه (Flash)',
    guide: 'فلش را روشن کنید؛ از کار افتادن فلش معمولاً نشانه خرابی مدار روی برد است.',
    passCriteria: 'روشن شدن کامل و بدون چشمک فلش دوربین.',
    critical: false,
  },
  {
    id: 'hw-speakers',
    sectionId: 'hardware',
    title: 'اسپیکرها (استریو)',
    guide:
      'یک موسیقی یا ویدیو پخش کنید و گوشی را یک‌بار از اسپیکر پایین و یک‌بار از اسپیکر مکالمه بالا نزدیک گوش بگیرید تا مطمئن شوید هر دو صدا را واضح و بدون خش‌خش پخش می‌کنند.',
    passCriteria: 'صدای شفاف، بلند و بدون خش‌خش در هر دو اسپیکر بالا و پایین.',
    critical: false,
  },
  {
    id: 'hw-mics',
    sectionId: 'hardware',
    title: 'میکروفون‌ها',
    guide:
      'در برنامه Voice Memos صدای خود را ضبط و پخش کنید. همچنین هنگام فیلم‌برداری با دوربین جلو و عقب صحبت کنید تا سلامت میکروفون‌های دیگر هم تست شود.',
    passCriteria: 'ضبط شفاف صدا در Voice Memos و فیلم‌برداری با دوربین جلو و عقب.',
    critical: false,
    codeChips: ['Voice Memos'],
  },
  {
    id: 'hw-faceid-buttons',
    sectionId: 'hardware',
    title: 'Face ID و دکمه‌ها',
    guide:
      'وارد Face ID & Passcode شوید و اسکن چهره را تست کنید. تمام دکمه‌های فیزیکی (ولوم، پاور و دکمه Action Button) را فشار دهید تا نرم و سالم باشند.',
    passCriteria: 'اسکن سریع و بدون خطای Face ID و عملکرد نرم تمام دکمه‌ها از جمله Action Button.',
    critical: true,
    codeChips: ['Face ID & Passcode', 'Action Button'],
  },
  {
    id: 'hw-taptic',
    sectionId: 'hardware',
    title: 'موتور ویبره (Taptic Engine)',
    guide:
      'در Settings > Sounds & Haptics > Ringtone > Haptics چند ویبره را امتحان کنید تا لرزش سالم و بدون صدای تق‌تق داشته باشد.',
    passCriteria: 'لرزش نرم، منظم و بدون صدای تق‌تق غیرعادی.',
    critical: false,
    codeChips: ['Settings > Sounds & Haptics > Ringtone > Haptics'],
  },
  {
    id: 'hw-connectivity-usbc',
    sectionId: 'hardware',
    title: 'وایفای، بلوتوث و پورت شارژ Type-C',
    guide:
      'به یک هات‌اسپات یا وای‌فای وصل شوید، بلوتوث را روشن کنید تا دستگاه‌های اطراف را ببیند و کابل شارژ را بزنید؛ کابل باید محکم جا برود (لق نباشد) و گوشی طی چند دقیقه درصد شارژ اضافه کند.',
    passCriteria: 'اتصال پایدار وای‌فای و بلوتوث، جا رفتن محکم کابل Type-C و افزایش واقعی درصد شارژ.',
    critical: true,
  },

  // بخش هفتم: تست‌های تکمیلی امنیتی و فنی ویژه بازار ایران
  {
    id: 'sec-blacklist',
    sectionId: 'iran-security',
    title: 'استعلام وضعیت دزدی و مفقودی (Blacklist Check)',
    guide:
      'چون گوشی بدون کد در سامانه همتا ثبت نیست، سارقان گاهی گوشی‌های دزدیده‌شده خارج از کشور را می‌فروشند. کد *#06# را بزنید، IMEI را بردارید و در یکی از سایت‌های رایگان استعلام جهانی مثل imeipro.info یا sickw.com وارد کنید.',
    passCriteria:
      'وضعیت Blacklist Status باید CLEAN باشد. اگر BLACKLISTED یا LOST / STOLEN بود گوشی سرقتی است و هرگز نخرید.',
    critical: true,
    codeChips: ['*#06#'],
    links: [
      { label: 'imeipro.info', url: 'https://www.imeipro.info' },
      { label: 'sickw.com', url: 'https://sickw.com' },
    ],
  },
  {
    id: 'sec-bypass-mdm',
    sectionId: 'iran-security',
    title: 'تشخیص گوشی «بایپس‌شده» (Bypass / MDM)',
    guide:
      'برخی آیفون‌ها قفل آیکلود یا قفل سازمانی (MDM) دارند و به‌صورت موقت دور زده شده‌اند؛ با اولین آپدیت یا ریست، گوشی برای همیشه قفل می‌شود. قبل از پرداخت پول حتماً گوشی را از مسیر Settings > General > Transfer or Reset iPhone > Erase All Content and Settings کامل پاک کنید و از نو راه‌اندازی (Setup) کنید.',
    passCriteria:
      'گوشی باید بدون درخواست رمز آیکلود قبلی یا پیام پیکربندی شرکتی (Remote Management) بالا بیاید و وارد صفحه اصلی شود.',
    critical: true,
    codeChips: ['Erase All Content and Settings', 'Remote Management'],
  },
  {
    id: 'sec-baseband-antenna',
    sectionId: 'iran-security',
    title: 'تست آنتن‌دهی موقت و سلامت مودم (Baseband)',
    guide:
      'حتی اگر گوشی بدون کد باشد، در مهلت ۳۰ روزه آنتن‌دهی (یا اگر قبلاً سیم‌کارت نخورده باشد) باید سیم‌کارت را بخواند؛ ضمن اینکه خرابی چیپ مودم یکی از گران‌ترین ایرادهای برد است. همان لحظه سیم‌کارت خودتان را داخل گوشی بیندازید و با *#06# مطمئن شوید علاوه بر شماره سریال، اعداد IMEI و IMEI 2 نمایش داده می‌شوند.',
    passCriteria:
      'نام اپراتور (همراه اول یا ایرانسل) بالای صفحه ظاهر شود و نمایش هر دو IMEI در *#06# سلامت چیپ بیس‌بند را تایید کند.',
    critical: true,
    codeChips: ['*#06#', 'IMEI & IMEI 2'],
  },
  {
    id: 'sec-proximity-ambient',
    sectionId: 'iran-security',
    title: 'تست سنسور مجاورت (Proximity) و نور محیط',
    guide:
      'یک تماس صوتی برقرار کنید (یا در تلگرام/واتساپ یک ویس پخش کنید) و کف دست خود را روی قسمت بالای صفحه (اطراف داینامیک آیلند) بگیرید. همچنین گزینه Auto-Brightness را در Settings > Accessibility > Display & Text Size روشن کنید و نور چراغ‌قوه گوشی دیگری را به بالای صفحه بتابانید.',
    passCriteria:
      'با گرفتن دست روی بالای صفحه نمایشگر بلافاصله خاموش شود و با تاباندن نور، روشنایی صفحه خودبه‌خود بالا برود.',
    critical: false,
    codeChips: ['Settings > Accessibility > Display & Text Size'],
  },
  {
    id: 'sec-motion-gps',
    sectionId: 'iran-security',
    title: 'تست سنسورهای حرکتی (ژیروسکوپ، قطب‌نما و GPS)',
    guide:
      'برنامه Compass (قطب‌نما) را باز کنید و به چپ سوایپ کنید تا تراز (Level) باز شود. گوشی را بچرخانید و روی سطح صاف بگذارید. همچنین برنامه Apple Maps یا Google Maps را باز کنید و موقعیت‌یابی را بزنید.',
    passCriteria:
      'عقربه قطب‌نما روان بچرخد، تراز روی سطح صاف عدد 0° را نشان دهد و نقشه موقعیت دقیق شما را بدون پرش پیدا کند.',
    critical: false,
    codeChips: ['Compass > Level (0°)'],
  },
  {
    id: 'sec-wireless-magsafe',
    sectionId: 'iran-security',
    title: 'تست شارژ بی‌سیم (MagSafe / Wireless Charging)',
    guide:
      'در آیفون ۱۵ سیم‌پیچ شارژ وایرلس پشت قاب قرار دارد و اگر قاب پشت تعویض یا تعمیر شده باشد ممکن است قطع شده باشد. اگر پاوربانک مگ‌سیف یا شارژر وایرلس در دسترس است، گوشی را روی آن قرار دهید.',
    passCriteria: 'انیمیشن شارژ روی صفحه ظاهر شود و گوشی شروع به شارژ شدن کند.',
    critical: false,
  },
  {
    id: 'sec-receipt-contract',
    sectionId: 'iran-security',
    title: 'نوشتن مبایعه‌نامه یا رسید دستی (مخصوص خرید از شخص)',
    guide:
      'از آنجا که گوشی بدون کد انتقال مالکیت رسمی در همتا ندارد، تنها سند مالکیت شما جعبه گوشی و رسید معامله است. هنگام خرید از شخص در دیوار، حتماً یک رسید دستی با ذکر مشخصات کامل دستگاه (مدل، ظرفیت، رنگ، شماره سریال و هر دو IMEI)، مبلغ معامله و تایید سلامت و عدم سرقتی بودن بنویسید، امضا بگیرید و کارت ملی فروشنده را با مشخصات رسید تطبیق دهید.',
    passCriteria:
      'دریافت رسید امضاشده با تمام مشخصات دستگاه، مبلغ و تطابق دقیق کارت ملی فروشنده.',
    critical: true,
    hasReceiptTemplate: true,
  },
];

export const IPHONE_BUYING_TIP =
  'با توجه به رنج قیمتی آیفون ۱۵، بد نیست هنگام جستجو نگاهی هم به آگهی‌های آیفون ۱۵ پرو بدون کد یا آیفون ۱۴ پرو بدون کد بیندازید؛ چون در بعضی موارد با اختلاف قیمت کم می‌توانید نمایشگر ۱۲۰ هرتزی و دوربین تله‌فوتو هم داشته باشید.';

export const TOTAL_IPHONE_CHECKS = IPHONE_CHECKLIST_ITEMS.length;
export const CRITICAL_IPHONE_CHECKS = IPHONE_CHECKLIST_ITEMS.filter((i) => i.critical).length;

const STORAGE_KEY = 'jibeman_iphone_inspections_v1';
const UPDATE_EVENT = 'jibeman-iphone-store-updated';

function generateId(): string {
  return `iph_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createInspection(title = 'آیفون ۱۵ بدون کد — بررسی اول'): IphoneInspection {
  const now = Date.now();
  return {
    id: generateId(),
    title,
    modelVariant: '',
    priceToman: '',
    batteryHealth: '',
    cycleCount: '',
    partNumber: '',
    sellerNote: '',
    items: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function loadIphoneStore(): IphoneInspectionStore {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<IphoneInspectionStore>;
        if (
          parsed &&
          Array.isArray(parsed.inspections) &&
          parsed.inspections.length > 0 &&
          typeof parsed.activeId === 'string'
        ) {
          const hasActive = parsed.inspections.some((i) => i?.id === parsed.activeId);
          return {
            activeId: hasActive ? parsed.activeId : parsed.inspections[0].id,
            inspections: parsed.inspections.map((ins) => ({
              id: ins.id || generateId(),
              title: ins.title || 'بررسی آیفون',
              modelVariant: ins.modelVariant || '',
              priceToman: ins.priceToman || '',
              batteryHealth: ins.batteryHealth || '',
              cycleCount: ins.cycleCount || '',
              partNumber: ins.partNumber || '',
              sellerNote: ins.sellerNote || '',
              items: ins.items && typeof ins.items === 'object' ? ins.items : {},
              createdAt: ins.createdAt || Date.now(),
              updatedAt: ins.updatedAt || Date.now(),
            })),
          };
        }
      }
    }
  } catch {
    // ignore corrupted storage and fall back to fresh inspection
  }

  const initial = createInspection();
  return {
    activeId: initial.id,
    inspections: [initial],
  };
}

export function saveIphoneStore(store: IphoneInspectionStore): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
    }
  } catch {
    // ignore storage quota failure
  }
}

export function subscribeIphoneStore(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => listener();
  window.addEventListener(UPDATE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(UPDATE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function getActiveInspection(store: IphoneInspectionStore): IphoneInspection {
  return store.inspections.find((i) => i.id === store.activeId) ?? store.inspections[0];
}

export type InspectionVerdict = 'DANGER' | 'CAUTION' | 'READY' | 'IN_PROGRESS';

export interface InspectionStats {
  total: number;
  passed: number;
  failed: number;
  pending: number;
  checkedCount: number;
  progressPercent: number;
  criticalFailedItems: IphoneChecklistItem[];
  nonCriticalFailedItems: IphoneChecklistItem[];
  verdict: InspectionVerdict;
}

export function getInspectionStats(inspection: IphoneInspection): InspectionStats {
  let passed = 0;
  let failed = 0;
  const criticalFailedItems: IphoneChecklistItem[] = [];
  const nonCriticalFailedItems: IphoneChecklistItem[] = [];

  for (const item of IPHONE_CHECKLIST_ITEMS) {
    const status = inspection.items[item.id]?.status ?? 'PENDING';
    if (status === 'PASS') {
      passed++;
    } else if (status === 'FAIL') {
      failed++;
      if (item.critical) criticalFailedItems.push(item);
      else nonCriticalFailedItems.push(item);
    }
  }

  const total = IPHONE_CHECKLIST_ITEMS.length;
  const checkedCount = passed + failed;
  const pending = total - checkedCount;
  const progressPercent = total > 0 ? Math.round((checkedCount / total) * 100) : 0;

  let verdict: InspectionVerdict = 'IN_PROGRESS';
  if (criticalFailedItems.length > 0) {
    verdict = 'DANGER';
  } else if (nonCriticalFailedItems.length > 0) {
    verdict = 'CAUTION';
  } else if (passed === total) {
    verdict = 'READY';
  }

  return {
    total,
    passed,
    failed,
    pending,
    checkedCount,
    progressPercent,
    criticalFailedItems,
    nonCriticalFailedItems,
    verdict,
  };
}

export function getActiveIphoneSummary(): {
  title: string;
  checkedCount: number;
  total: number;
  failedCount: number;
  criticalFailedCount: number;
} {
  const store = loadIphoneStore();
  const active = getActiveInspection(store);
  const stats = getInspectionStats(active);
  return {
    title: active.title,
    checkedCount: stats.checkedCount,
    total: stats.total,
    failedCount: stats.failed,
    criticalFailedCount: stats.criticalFailedItems.length,
  };
}

export function buildReceiptTemplate(inspection: IphoneInspection): string {
  const model = [inspection.title, inspection.modelVariant].filter(Boolean).join(' · ') || 'آیفون ۱۵ (بدون کد)';
  const price = inspection.priceToman ? `${inspection.priceToman} تومان` : '................ تومان';
  return [
    'بسمه تعالی — رسید و مبایعه‌نامه خرید گوشی کارکرده',
    '',
    `اینجانب ....................... با کد ملی ....................... و شماره تماس .......................، یک دستگاه گوشی موبایل با مشخصات زیر را به آقای/خانم ....................... با کد ملی ....................... فروختم:`,
    `- مدل و ظرفیت و رنگ: ${model}`,
    `- پارت‌نامبر: ${inspection.partNumber || '................'}`,
    '- شماره سریال (Serial): ........................',
    '- شماره IMEI 1: ........................',
    '- شماره IMEI 2: ........................',
    `- مبلغ معامله: ${price}`,
    '',
    'فروشنده ضمن تحویل جعبه اصلی، خروج کامل از اپل‌آیدی (iCloud / Find My) و ریست فکتوری دستگاه، اصالت قانونی، عدم سرقتی بودن (Clean) و سلامت ظاهری و فنی گوشی را در زمان تحویل تایید و تضمین می‌نماید.',
    '',
    'تاریخ: ..../..../۱۴۰....',
    'امضاء و اثر انگشت فروشنده: ................    امضاء خریدار: ................',
  ].join('\n');
}

export function formatInspectionReport(inspection: IphoneInspection): string {
  const stats = getInspectionStats(inspection);
  const lines: string[] = [
    `گزارش کارشناسی خرید آیفون: ${inspection.title}`,
    `پیشرفت: ${stats.checkedCount} از ${stats.total} | تایید: ${stats.passed} | ایراد: ${stats.failed}`,
  ];

  const meta: string[] = [];
  if (inspection.modelVariant) meta.push(`مدل/حافظه: ${inspection.modelVariant}`);
  if (inspection.partNumber) meta.push(`پارت: ${inspection.partNumber}`);
  if (inspection.batteryHealth) meta.push(`باتری: ${inspection.batteryHealth}%`);
  if (inspection.cycleCount) meta.push(`سایکل: ${inspection.cycleCount}`);
  if (inspection.priceToman) meta.push(`قیمت: ${inspection.priceToman} تومان`);
  if (meta.length > 0) lines.push(meta.join(' | '));
  if (inspection.sellerNote) lines.push(`یادداشت: ${inspection.sellerNote}`);

  if (stats.criticalFailedItems.length > 0) {
    lines.push('', 'ایرادات خط قرمز (نخر):');
    for (const item of stats.criticalFailedItems) {
      const note = inspection.items[item.id]?.note;
      lines.push(`- [رد] ${item.title}${note ? ` (${note})` : ''}`);
    }
  }

  if (stats.nonCriticalFailedItems.length > 0) {
    lines.push('', 'سایر موارد دارای ایراد / احتیاط:');
    for (const item of stats.nonCriticalFailedItems) {
      const note = inspection.items[item.id]?.note;
      lines.push(`- [احتیاط] ${item.title}${note ? ` (${note})` : ''}`);
    }
  }

  const notedItems = IPHONE_CHECKLIST_ITEMS.filter(
    (item) => inspection.items[item.id]?.status !== 'FAIL' && inspection.items[item.id]?.note
  );
  if (notedItems.length > 0) {
    lines.push('', 'یادداشت تست‌ها:');
    for (const item of notedItems) {
      lines.push(`- ${item.title}: ${inspection.items[item.id]?.note}`);
    }
  }

  return lines.join('\n');
}
