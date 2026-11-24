import React, { useState } from 'react';
import {
  X,
  ShieldAlert,
  AlertOctagon,
  CheckCircle2,
  Sliders,
  BookOpen,
  Calendar,
  AlertTriangle,
  Flame,
  Scale,
} from 'lucide-react';
import { db, type CompareSession } from '../../core/db';
import { Money } from '../../core/money';

interface DealGuardModalProps {
  session: CompareSession;
  onClose: () => void;
  onRefresh: () => void;
}

type GuardTab = 'FLAGS' | 'SCORECARD' | 'RULES';

interface RedFlagItem {
  id: string;
  title: string;
  desc: string;
  rule: string;
}

const RED_FLAGS: RedFlagItem[] = [
  {
    id: 'flag-lie',
    title: 'دروغ یا تناقض اثبات‌شده در مشخصات کالا',
    desc: 'فروشنده موردی را خلاف واقع یا نادرست ادعا کرد و خودتان مچ آن را گرفتید.',
    rule: 'قانون طلایی: یک دروغ اثبات‌شده، اعتبار تمام ادعاهای تأییدنشده دیگر فروشنده را باطل می‌کند.',
  },
  {
    id: 'flag-no-test',
    title: 'ممانعت از تست مستقل یا مخالفت با کارشناس شما',
    desc: 'فروشنده اصرار دارد به کارشناس خودش مراجعه کنید یا اجازه تست در محل نمی‌دهد.',
    rule: 'قانون طلایی: هرگونه مانع‌تراشی در برابر تست مستقل، یعنی ایراد بزرگی پنهان شده است؛ فوراً معامله را ترک کنید.',
  },
  {
    id: 'flag-rush',
    title: 'اصرار غیرعادی به خرید فوری و ایجاد استرس زمانی',
    desc: 'گفتن جملاتی مثل: «همین الان مشتری پاش نشسته»، «تا نیم ساعت دیگه قیمت عوض میشه»، «عجله کن».',
    rule: 'قانون طلایی: هیچ‌وقت تحت فشار زمانی و هیجان تصمیم نگیرید؛ این شگرد رایج برای فرار از تست فنی است.',
  },
  {
    id: 'flag-deposit',
    title: 'درخواست بیعانه قبل از بررسی و تست کامل',
    desc: 'فروشنده اصرار دارد قبل از بازدید حضوری، تست کالا یا رویت مدارک بیعانه واریز کنید.',
    rule: 'قانون طلایی: هرگز قبل از بررسی کامل، کارشناسی و توافق مکتوب، حتی یک ریال پرداخت نکنید.',
  },
  {
    id: 'flag-evade',
    title: 'طفره رفتن از پاسخ به سوالات درباره ایراد یا سابقه کالا',
    desc: 'به جای پاسخ شفاف می‌گوید: «این مشکل طبیعیه»، «خیالت راحت»، «همه این مدل‌ها همینجورین» بدون مدرک.',
    rule: 'قانون طلایی: اگر ادعای مهمی را بدون مدرک مطرح کرد یا طفره رفت، آن را نشانه جدی خرابی بدانید.',
  },
  {
    id: 'flag-unreal-price',
    title: 'قیمت غیرمنطقی و وسوسه‌انگیز بسیار پایین‌تر از بازار',
    desc: 'کالا را به طرز مشکوکی ارزان‌تر از تمام فروشندگان بازار قیمت‌گذاری کرده است.',
    rule: 'قانون طلایی: پنیر مجانی فقط در تله‌موش است! تخفیف عجیب معمولاً پنهان‌کننده ایراد فنی یا حقوقی سنگین است.',
  },
  {
    id: 'flag-no-receipt',
    title: 'امتناع از فاکتور معتبر، درج مشخصات دقیق و تست مهلت‌دار',
    desc: 'حاضر نیست فاکتور رسمی، شماره سریال یا ضمانت بازگشت وجه را کتباً بنویسد و امضا کند.',
    rule: 'قانون طلایی: تمام توافقات مهم، تعهدات سلامت و مهلت تست باید دقیقاً مکتوب شوند.',
  },
  {
    id: 'flag-incompetent',
    title: 'بی‌اطلاعی فروشنده یا ادعاهای متناقض با سایت رسمی سازنده',
    desc: 'فروشنده اطلاعات فنی غلط می‌دهد یا ادعاهایی می‌کند که با مشخصات کارخانه تضاد دارد.',
    rule: 'قانون طلایی: به تشخیص فروشنده‌ای که خودش جنسش را نمی‌شناسد اعتماد نکنید؛ با سوالات فنی راستی‌آزمایی کنید.',
  },
];

export function DealGuardModal({
  session,
  onClose,
  onRefresh,
}: DealGuardModalProps) {
  const [activeTab, setActiveTab] = useState<GuardTab>('FLAGS');
  const [flags, setFlags] = useState<string[]>(session.sellerFlags || []);

  const [scorecard, setScorecard] = useState({
    needFit: session.scorecard?.needFit ?? 12,
    valueForPrice: session.scorecard?.valueForPrice ?? 15,
    quality: session.scorecard?.quality ?? 16,
    sellerTrust: session.scorecard?.sellerTrust ?? 12,
    marketResearch: session.scorecard?.marketResearch ?? 8,
    warranty: session.scorecard?.warranty ?? 8,
    maintenanceCost: session.scorecard?.maintenanceCost ?? 8,
  });

  const totalScore =
    scorecard.needFit +
    scorecard.valueForPrice +
    scorecard.quality +
    scorecard.sellerTrust +
    scorecard.marketResearch +
    scorecard.warranty +
    scorecard.maintenanceCost;

  const handleToggleFlag = async (flagId: string) => {
    const nextFlags = flags.includes(flagId)
      ? flags.filter(f => f !== flagId)
      : [...flags, flagId];

    setFlags(nextFlags);
    await db.compareSessions.update(session.id!, {
      sellerFlags: nextFlags,
      updatedAt: Date.now(),
    });
    onRefresh();
  };

  const handleScoreChange = async (key: keyof typeof scorecard, val: number) => {
    const nextScorecard = { ...scorecard, [key]: val };
    setScorecard(nextScorecard);
    await db.compareSessions.update(session.id!, {
      scorecard: nextScorecard,
      updatedAt: Date.now(),
    });
    onRefresh();
  };

  const getDecisionRecommendation = () => {
    if (flags.length > 0) {
      return {
        label: 'خرید نکنید (رد قطعی)',
        color: 'text-danger bg-danger/15 border-danger/40',
        desc: 'حداقل یک خط قرمز جدی در رفتار یا صداقت فروشنده دیده شده است. معامله دارای ریسک کلاهبرداری یا خرید جنس معیوب است.',
      };
    }
    if (totalScore >= 85) {
      return {
        label: 'خرید بسیار مناسب و مطمئن (۸۵ تا ۱۰۰)',
        color: 'text-ok bg-ok/15 border-ok/40',
        desc: 'این خرید از تمام فیلترهای منطقی، تحقیقات بازار و اعتبارسنجی با نمره عالی عبور کرده است.',
      };
    }
    if (totalScore >= 70) {
      return {
        label: 'خرید با بررسی و احتیاط بیشتر (۷۰ تا ۸۴)',
        color: 'text-sky bg-sky/15 border-sky/40',
        desc: 'خرید قابل قبولی است، اما روی بخش‌های با نمره پایین‌تر (مثل ضمانت یا تخفیف) بیشتر مذاکره کنید.',
      };
    }
    if (totalScore >= 50) {
      return {
        label: 'ریسک بالا / نیازمند تخفیف سنگین (۵۰ تا ۶۹)',
        color: 'text-warn bg-warn/15 border-warn/40',
        desc: 'ریسک عدم رضایت یا ضرر بالاست. تنها با کسر تخفیف متناسب و کارشناسی تخصصی توجیه‌پذیر است.',
      };
    }
    return {
      label: 'خرید نکنید (امتیاز زیر ۵۰)',
      color: 'text-danger bg-danger/15 border-danger/40',
      desc: 'احتمال پشیمانی و ضرر مالی بسیار زیاد است. گزینه‌های دیگر را جایگزین کنید.',
    };
  };

  const rec = getDecisionRecommendation();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/85 backdrop-blur-md animate-fade-in p-3">
      <div className="w-full max-w-md bg-sheet rounded-[28px] border border-line shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-line bg-surface/50">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
              flags.length > 0 ? 'bg-danger/20 text-danger animate-pulse' : 'bg-lime/20 text-lime'
            }`}>
              <ShieldAlert size={18} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-black text-white">سپر امنیتی معامله و سنجش فروشنده</h2>
                {flags.length > 0 && (
                  <span className="text-[9px] font-black bg-danger text-white px-1.5 py-0.2 rounded-full">
                    {Money.fa(String(flags.length))} اخطار قرمز!
                  </span>
                )}
              </div>
              <span className="text-[10px] text-muted">پروتکل طلایی قبل از پرداخت پول (Pre-Purchase Protocol)</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface2 border border-line flex items-center justify-center text-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs Bar */}
        <div className="p-2 border-b border-line bg-surface flex items-center gap-1 text-xs">
          <button
            onClick={() => setActiveTab('FLAGS')}
            className={`flex-1 h-8 rounded-xl font-bold flex items-center justify-center gap-1 transition-all ${
              activeTab === 'FLAGS'
                ? 'bg-danger text-white shadow-sm'
                : 'text-muted hover:text-white'
            }`}
          >
            <Flame size={13} />
            خطوط قرمز فروشنده ({Money.fa(String(flags.length))})
          </button>

          <button
            onClick={() => setActiveTab('SCORECARD')}
            className={`flex-1 h-8 rounded-xl font-bold flex items-center justify-center gap-1 transition-all ${
              activeTab === 'SCORECARD'
                ? 'bg-lime text-onLime shadow-sm'
                : 'text-muted hover:text-white'
            }`}
          >
            <Scale size={13} />
            نمره خرید (۱۰۰ نمره)
          </button>

          <button
            onClick={() => setActiveTab('RULES')}
            className={`flex-1 h-8 rounded-xl font-bold flex items-center justify-center gap-1 transition-all ${
              activeTab === 'RULES'
                ? 'bg-sky/20 text-sky shadow-sm'
                : 'text-muted hover:text-white'
            }`}
          >
            <BookOpen size={13} />
            ۱۰ قانون طلایی
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          {/* TAB 1: SELLER RED FLAGS */}
          {activeTab === 'FLAGS' && (
            <div className="space-y-3">
              {/* Alert Banner if any flags triggered */}
              {flags.length > 0 ? (
                <div className="p-3.5 rounded-2xl bg-danger/15 border-2 border-danger/60 text-danger space-y-1.5 animate-pulse">
                  <div className="flex items-center gap-2 font-black text-xs">
                    <AlertOctagon size={18} />
                    <span>خطر جدی: {Money.fa(String(flags.length))} خط قرمز فروشنده فعال شده است!</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-danger/90">
                    طبق قانون طلایی خرید: <strong>یک دروغ یا مانع‌تراشی اثبات‌شده، اعتبار تمام ادعاهای دیگر را ساقط می‌کند.</strong> توصیه اکید می‌شود خرید را متوقف کنید یا فقط با کارشناسی مکتوب و مستقل جلو بروید.
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-surface border border-line text-[11px] text-muted flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-ok shrink-0" />
                  <span>اگر در حین مکالمه یا معامله متوجه هریک از موارد مشکوک زیر شدید، تیک آن را بزنید تا سیستم هشدار دهد.</span>
                </div>
              )}

              {/* Red Flags Checkable List */}
              <div className="space-y-2">
                {RED_FLAGS.map(item => {
                  const isChecked = flags.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleToggleFlag(item.id)}
                      className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-danger/10 border-danger text-white ring-1 ring-danger/40'
                          : 'bg-surface hover:bg-surface2 border-line text-white/90'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                            isChecked
                              ? 'bg-danger border-danger text-white'
                              : 'border-muted/60 bg-surface2'
                          }`}
                        >
                          {isChecked && <X size={14} strokeWidth={3} />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className={`text-xs font-bold leading-tight ${isChecked ? 'text-danger' : 'text-white'}`}>
                            {item.title}
                          </h4>
                          <p className="text-[10px] text-muted mt-1 leading-relaxed">
                            {item.desc}
                          </p>
                          <div className="mt-2 text-[10px] text-amber-300/90 bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/20">
                            💡 {item.rule}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: SMART 100-POINT SCORECARD */}
          {activeTab === 'SCORECARD' && (
            <div className="space-y-4">
              {/* Total Score & Recommendation Card */}
              <div className="p-4 rounded-2xl bg-surface border border-line space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-muted block">نمره کل این تصمیم خرید:</span>
                    <div className="text-2xl font-black text-white mt-0.5">
                      {Money.fa(String(totalScore))}{' '}
                      <span className="text-xs font-normal text-muted">از ۱۰۰ امتیاز</span>
                    </div>
                  </div>

                  <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold text-center ${rec.color}`}>
                    {rec.label}
                  </div>
                </div>

                <p className="text-[11px] text-muted leading-relaxed border-t border-line/40 pt-2">
                  {rec.desc}
                </p>
              </div>

              {/* Sliders for the 7 Factors */}
              <div className="space-y-3 bg-surface p-3.5 rounded-2xl border border-line">
                <h3 className="text-xs font-bold text-white border-b border-line/50 pb-2">
                  ارزیابی ۷ فاکتور کلیدی خرید:
                </h3>

                {/* 1. Need Fit (Max 15) */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/90">۱. تناسب با نیاز واقعی:</span>
                    <span className="font-bold text-lime">{Money.fa(String(scorecard.needFit))} از ۱۵</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={15}
                    value={scorecard.needFit}
                    onChange={e => handleScoreChange('needFit', Number(e.target.value))}
                    className="w-full accent-lime h-1.5 bg-surface2 rounded-lg cursor-pointer"
                  />
                  <span className="text-[9px] text-muted block">آیا واقعاً این ویژگی‌ها و مشخصات به کارم می‌آیند؟</span>
                </div>

                {/* 2. Value for Price (Max 20) */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/90">۲. ارزش خرید نسبت به قیمت:</span>
                    <span className="font-bold text-lime">{Money.fa(String(scorecard.valueForPrice))} از ۲۰</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    value={scorecard.valueForPrice}
                    onChange={e => handleScoreChange('valueForPrice', Number(e.target.value))}
                    className="w-full accent-lime h-1.5 bg-surface2 rounded-lg cursor-pointer"
                  />
                  <span className="text-[9px] text-muted block">آیا با این بودجه گزینه بهتری در بازار وجود ندارد؟</span>
                </div>

                {/* 3. Quality & Health (Max 20) */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/90">۳. کیفیت و سلامت فنی کالا:</span>
                    <span className="font-bold text-lime">{Money.fa(String(scorecard.quality))} از ۲۰</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    value={scorecard.quality}
                    onChange={e => handleScoreChange('quality', Number(e.target.value))}
                    className="w-full accent-lime h-1.5 bg-surface2 rounded-lg cursor-pointer"
                  />
                  <span className="text-[9px] text-muted block">سلامت قطعات، عدم تعمیرات پنهان و ظاهر کالا.</span>
                </div>

                {/* 4. Seller Trust (Max 15) */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/90">۴. اعتبار و صداقت فروشنده:</span>
                    <span className="font-bold text-lime">{Money.fa(String(scorecard.sellerTrust))} از ۱۵</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={15}
                    value={scorecard.sellerTrust}
                    onChange={e => handleScoreChange('sellerTrust', Number(e.target.value))}
                    className="w-full accent-lime h-1.5 bg-surface2 rounded-lg cursor-pointer"
                  />
                  <span className="text-[9px] text-muted block">پاسخگویی شفاف، اجازه تست، خوش‌نامی و عدم اصرار مشکوک.</span>
                </div>

                {/* 5. Market Research (Max 10) */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/90">۵. تحقیق و شناخت بازار:</span>
                    <span className="font-bold text-lime">{Money.fa(String(scorecard.marketResearch))} از ۱۰</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={scorecard.marketResearch}
                    onChange={e => handleScoreChange('marketResearch', Number(e.target.value))}
                    className="w-full accent-lime h-1.5 bg-surface2 rounded-lg cursor-pointer"
                  />
                  <span className="text-[9px] text-muted block">استعلام قیمت از حداقل ۳ تا ۵ فروشگاه و خواندن نظرات کاربران.</span>
                </div>

                {/* 6. Warranty & Return (Max 10) */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/90">۶. ضمانت، مهلت تست و فاکتور:</span>
                    <span className="font-bold text-lime">{Money.fa(String(scorecard.warranty))} از ۱۰</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={scorecard.warranty}
                    onChange={e => handleScoreChange('warranty', Number(e.target.value))}
                    className="w-full accent-lime h-1.5 bg-surface2 rounded-lg cursor-pointer"
                  />
                  <span className="text-[9px] text-muted block">گارانتی معتبر شرکتی، مهلت تست مکتوب و فاکتور چاپی.</span>
                </div>

                {/* 7. Maintenance Cost (Max 10) */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/90">۷. هزینه نگهداری و افت قیمت در بلندمدت:</span>
                    <span className="font-bold text-lime">{Money.fa(String(scorecard.maintenanceCost))} از ۱۰</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={scorecard.maintenanceCost}
                    onChange={e => handleScoreChange('maintenanceCost', Number(e.target.value))}
                    className="w-full accent-lime h-1.5 bg-surface2 rounded-lg cursor-pointer"
                  />
                  <span className="text-[9px] text-muted block">قیمت لوازم یدکی و قطعات مصرفی و نقدشوندگی بازار دست دوم.</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: 10 GOLDEN RULES & 5-DAY PROTOCOL */}
          {activeTab === 'RULES' && (
            <div className="space-y-4">
              {/* 5-Day Purchasing Protocol Card */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-sky/15 to-surface border border-sky/30 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-sky">
                  <Calendar size={15} />
                  <span>پروتکل ۵ روزه خرید هوشمند (خرید را در یک روز نکنید)</span>
                </div>
                <div className="space-y-1.5 text-[11px] text-white/90 pt-1">
                  <div><strong>روز ۱ (شناخت بازار):</strong> پیدا کردن مدل‌ها، استعلام قیمت‌ها و لیست فروشندگان.</div>
                  <div><strong>روز ۲ (مقایسه تخصصی):</strong> بررسی نقاط ضعف، خرابی‌های شایع و نظرات خریداران قبلی.</div>
                  <div><strong>روز ۳ (انتخاب نهایی):</strong> انتخاب ۲ تا ۳ گزینه برتر و تماس مجدد برای قیمت نهایی.</div>
                  <div><strong>روز ۴ (بازدید و کارشناسی):</strong> تست فیزیکی، استعلام مدارک و سنجش صداقت فروشنده.</div>
                  <div><strong>روز ۵ (تصمیم و معامله):</strong> بررسی نهایی، توافق مکتوب، پرداخت و تحویل.</div>
                </div>
              </div>

              {/* 10 Non-Negotiable Rules */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-white mb-1">۱۰ قانون طلایی غیرقابل مذاکره:</h3>

                {[
                  '۱. هیچ ادعای مهمی را بدون مدرک و فاکتور قبول نکن.',
                  '۲. یک دروغ اثبات‌شده یعنی تمام ادعاهای دیگر فروشنده باطل است.',
                  '۳. هرگز قبل از شناخت کامل بازار، وارد معامله نشو.',
                  '۴. همیشه حداقل سه گزینه جایگزین در ذهنت داشته باش.',
                  '۵. هیچ‌وقت تحت فشار زمانی و استرس خرید نکن.',
                  '۶. فروشنده را با دانش فنی‌اش بسنج، نه چرب‌زبانی و اعتمادبه‌نفسش.',
                  '۷. هزینه نگهداری و لوازم مصرفی را جزئی از قیمت خرید بدان.',
                  '۸. تست مستقل را همیشه به توضیحات و تعریف‌های فروشنده ترجیح بده.',
                  '۹. قبل از بررسی کامل و توافق مکتوب، حتی یک ریال بیعانه پرداخت نکن.',
                  '۱۰. اگر شک جدی داری، بدون رودربایستی معامله را ترک کن.',
                ].map((rule, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-surface border border-line text-xs text-white/90 flex items-start gap-2"
                  >
                    <span className="w-4 h-4 rounded-full bg-lime/20 text-lime text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      ✓
                    </span>
                    <span className="leading-relaxed">{rule}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-line bg-surface/60 flex items-center justify-between text-xs">
          <span className="text-[11px] text-muted">
            {flags.length > 0 ? (
              <span className="text-danger font-bold">⚠️ معامله دارای {Money.fa(String(flags.length))} خط قرمز مشکوک است!</span>
            ) : (
              <span className="text-ok font-bold">✓ خط قرمز فعالی برای این معامله ثبت نشده است</span>
            )}
          </span>
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-xl bg-lime text-onLime font-black text-xs shadow-fab active:scale-95"
          >
            بستن و بازگشت
          </button>
        </div>
      </div>
    </div>
  );
}
