import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  Flame,
  ShieldAlert,
  CheckCircle2,
  HelpCircle,
  TrendingDown,
  Info,
} from 'lucide-react';
import type { CompareItem } from '../../core/db';
import type { ItemStats } from '../../core/compareEngine';
import { Money } from '../../core/money';

interface CheapPriceTrapModalProps {
  item: CompareItem;
  stats: ItemStats;
  onClose: () => void;
}

interface TrapCheck {
  id: string;
  title: string;
  desc: string;
}

const TRAP_CHECKS: TrapCheck[] = [
  {
    id: 'trap-deposit',
    title: 'فروشنده درخواست بیعانه فوری نکرده است؟',
    desc: 'شگرد ۹۰٪ کلاهبرداران دیوار و شیپور: «چون قیمتم پایینه مشتری پاش نشسته، ۵۰۰ تومن بیعانه بزن تا نگهش دارم». حتی یک ریال هم نباید بیعانه داد.',
  },
  {
    id: 'trap-stolen',
    title: 'کالا سرقتی، قاچاق یا بدون جعبه و مدارک معتبر نیست؟',
    desc: 'کارتن فابریک، شماره سریال، سند یا فاکتور خرید معتبر دارد و در سامانه‌های رسمی (همتا/پلیس) استعلام سفید دارد.',
  },
  {
    id: 'trap-fake-parts',
    title: 'قطعات اصلی با نمونه فیک تعویض نشده است؟',
    desc: 'صفحه نمایش با پنل کپی درجه ۳، باتری فیک، چیپ گرافیک حرارت‌دیده یا موتور تعمیری جایگزین نشده باشد.',
  },
  {
    id: 'trap-hidden-defect',
    title: 'ایراد فنی پنهان حاد ندارد؟',
    desc: 'مشکلاتی مثل آب‌خوردگی، ری‌استارت خودکار زیر فشار، ترک خوردن شاسی/لولا یا تاب داشتن فریم که در نگاه اول مشخص نیستند.',
  },
  {
    id: 'trap-repack',
    title: 'کالا ریپک، ریفربیشد یا طرح فیک چینی نیست؟',
    desc: 'برخی فروشندگان گوشی یا لپ‌تاپ‌های تعمیری را با جعبه جدید به عنوان در حد نو یا آکبند ارزان می‌فروشند.',
  },
  {
    id: 'trap-free-test',
    title: 'فروشنده اجازه تست حضوری حداقل ۳۰ دقیقه‌ای و کارشناسی بدون محدودیت می‌دهد؟',
    desc: 'اگر گفت: «عجله دارم»، «همین الان تست کن ببر»، یا مانع بردن پیش کارشناس شد، فوراً معامله را ترک کنید.',
  },
  {
    id: 'trap-seller-excuse',
    title: 'دلیل ارزانی فروشنده واقعاً منطقی و قابل اثبات است؟',
    desc: 'ادعای مبهم «پول لازمم» دلیل کافی نیست؛ آیا مدرک و چک برگشتی نشان می‌دهد یا فقط برای فروش سریع جنس معیوب این را می‌گوید؟',
  },
];

export function CheapPriceTrapModal({
  item,
  stats,
  onClose,
}: CheapPriceTrapModalProps) {
  const [checkedIds, setCheckedIds] = useState<string[]>([]);

  const toggleCheck = (id: string) => {
    setCheckedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const discountPercent = stats.belowMarketPercent ?? 0;
  const marketPrice = item.marketPrice ?? 0;
  const sellerPrice = item.price ?? 0;
  const diff = stats.marketDiff ?? 0;

  const allPassed = checkedIds.length === TRAP_CHECKS.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/85 backdrop-blur-md animate-fade-in p-3">
      <div className="w-full max-w-md bg-sheet rounded-[28px] border-2 border-danger/60 shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header Alert */}
        <div className="p-4 border-b border-line bg-gradient-to-r from-danger/20 via-surface to-surface flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-danger text-white flex items-center justify-center font-bold animate-bounce shrink-0">
              <Flame size={20} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-black text-danger">هشدار: ارزانی مشکوک (هول نشو!)</h2>
                <span className="text-[10px] font-black bg-danger text-white px-2 py-0.2 rounded-full">
                  {Money.fa(String(discountPercent))}٪ زیر بازار
                </span>
              </div>
              <span className="text-[10px] text-muted truncate max-w-[220px] block">
                کالای: «{item.name}»
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface2 border border-line flex items-center justify-center text-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3.5">
          {/* Price Gap Summary Card */}
          <div className="p-3.5 rounded-2xl bg-surface border border-line space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs pb-2 border-b border-line/50">
              <div>
                <span className="text-[10px] text-muted block">قیمت عرف و واقعی بازار:</span>
                <span className="font-extrabold text-white text-sm">
                  {Money.toman(marketPrice)} تومان
                </span>
              </div>
              <div>
                <span className="text-[10px] text-danger font-bold block">قیمت پیشنهادی فروشنده:</span>
                <span className="font-black text-danger text-sm">
                  {Money.toman(sellerPrice)} تومان
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-0.5">
              <span className="text-white/80 font-medium">میزان اختلاف و ارزانی:</span>
              <span className="font-black text-danger flex items-center gap-1">
                <TrendingDown size={14} />
                {Money.toman(diff)} تومان ارزان‌تر ({Money.fa(String(discountPercent))}٪)
              </span>
            </div>
          </div>

          {/* Psychological Reality-Check Banner */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-1.5">
            <div className="flex items-center gap-1.5 font-black text-xs">
              <AlertTriangle size={15} />
              <span>قانون بی‌رحمانه بازار: هیچ ارزانی بی‌دلیل نیست!</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-200/90">
              اگر فروشنده می‌توانست این کالا را در کمتر از ۱۰ دقیقه به مغازه‌دار بازار به قیمت منصفانه بفروشد، چرا حاضر شده آن را <strong>{Money.toman(diff)} تومان ارزان‌تر</strong> به شما بدهد؟!
              <br />
              معمولاً دلیل این ارزانی یکی از این ۳ مورد است: <strong>۱. عیب و تعمیر پنهان حاد</strong>، <strong>۲. کالا سرقتی یا بدون کارتن</strong>، <strong>۳. شگرد دریافت بیعانه و فرار</strong>.
            </p>
          </div>

          {/* Anti-Scam Verification Checklist */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <ShieldAlert size={14} className="text-lime" />
                چک‌لیست ضد کلاهبرداری ارزانی ({Money.fa(String(checkedIds.length))} از {Money.fa(String(TRAP_CHECKS.length))})
              </h3>
              <span className="text-[10px] text-muted">تک‌تک تست و علامت بزنید</span>
            </div>

            <div className="space-y-2">
              {TRAP_CHECKS.map(check => {
                const isChecked = checkedIds.includes(check.id);
                return (
                  <div
                    key={check.id}
                    onClick={() => toggleCheck(check.id)}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                      isChecked
                        ? 'bg-ok/10 border-ok/40 text-white'
                        : 'bg-surface hover:bg-surface2 border-line text-white/90'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                          isChecked
                            ? 'bg-ok border-ok text-black font-black'
                            : 'border-muted/60 bg-surface2'
                        }`}
                      >
                        {isChecked && <CheckCircle2 size={14} />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className={`text-xs font-bold leading-tight ${isChecked ? 'text-ok' : 'text-white'}`}>
                          {check.title}
                        </h4>
                        <p className="text-[10px] text-muted mt-1 leading-relaxed">
                          {check.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 border-t border-line bg-surface/80 flex items-center justify-between gap-2">
          <div className="text-[11px] text-muted">
            {allPassed ? (
              <span className="text-ok font-bold">✓ تمام آزمون‌های ایمنی بررسی شدند</span>
            ) : (
              <span className="text-danger font-bold">قبل از پرداخت حتماً همه را بسنجید!</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="h-10 px-4 rounded-xl bg-lime text-onLime font-black text-xs shadow-fab active:scale-95"
          >
            متوجه شدم، مراقبم
          </button>
        </div>
      </div>
    </div>
  );
}
