import React, { useState } from 'react';
import {
  Building2,
  HandCoins,
  Target,
  Users,
  Tags,
  Database,
  Smartphone,
  ChevronLeft,
  X,
  Share,
  PlusSquare,
  UserCheck,
  Wand2,
  Shield,
  ShieldAlert,
  Scale,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { pwaManager } from '../core/pwa';

interface MoreProps {
  onNavigate: (route: string) => void;
}

export function More({ onNavigate }: MoreProps) {
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateStatus('در حال بررسی سرور...');
    try {
      const hasNew = await pwaManager.checkForUpdate();
      if (hasNew) {
        setUpdateStatus('نسخه جدید دریافت شد! در حال اعمال...');
        setTimeout(() => {
          pwaManager.applyUpdate();
        }, 800);
      } else {
        setUpdateStatus('برنامه شما به‌روز است (نسخه ۱.۰.۰)');
        setTimeout(() => setUpdateStatus(null), 4000);
      }
    } catch (_) {
      setUpdateStatus('خطا در بررسی؛ لطفاً اتصال اینترنت را چک کنید.');
      setTimeout(() => setUpdateStatus(null), 3000);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const menuItems = [
    { id: 'impulse', label: 'ترمز خرید هیجانی (خرید آگاهانه)', desc: 'قانون خروج از فروشگاه، تایمر تأخیر و داشبورد صرفه‌جویی', icon: ShieldAlert, color: 'bg-amber-500/20 text-amber-300', badge: 'جدید' },
    { id: 'compare', label: 'مقایسه خرید هوشمند', desc: 'دستیار انتخاب کالا، بررسی خط قرمزها، مقایسه دو کالا و ارزش خرید', icon: Scale, color: 'bg-emerald-500/20 text-emerald-300' },
    { id: 'loans', label: 'وام و اقساط', desc: 'مدیریت وام‌ها، جدول بازپرداخت و یادآور', icon: Building2, color: 'bg-sky/15 text-sky' },
    { id: 'debts', label: 'بدهی و طلب', desc: 'پیگیری بدهکاران و طلبکاران با امکان ثبت تسویه', icon: HandCoins, color: 'bg-ok/15 text-ok' },
    { id: 'people', label: 'اشخاص و مخاطبین', desc: 'دفترچه کارت‌های بانکی، تلفن و وضعیت بی‌حسابی', icon: UserCheck, color: 'bg-purple-500/20 text-purple-300' },
    { id: 'goals', label: 'اهداف پس‌انداز', desc: 'قلک‌های مالی، برنامه‌ریزی خرید و پس‌انداز', icon: Target, color: 'bg-lime/15 text-lime' },
    { id: 'splits', label: 'محاسبه دنگ (هزینه گروهی)', desc: 'تقسیم مخارج در سفر، مهمانی و کارهای مشترک', icon: Users, color: 'bg-primary/20 text-sky' },
    { id: 'rules', label: 'قوانین خودکار پیامک و تراکنش', desc: 'دسته‌بندی هوشمند خودکار براساس متن و کلمات', icon: Wand2, color: 'bg-amber-500/20 text-amber-300' },
    { id: 'categories', label: 'دسته‌بندی‌ها', desc: 'شخصی‌سازی دسته‌های هزینه و درآمد', icon: Tags, color: 'bg-pink-500/20 text-pink-300' },
    { id: 'security', label: 'امنیت و قفل', desc: 'رمز پین و اثر انگشت برای حفاظت از اطلاعات', icon: Shield, color: 'bg-emerald-500/20 text-emerald-300' },
    { id: 'backup', label: 'پشتیبان‌گیری و بازیابی', desc: 'خروجی اکسل و JSON بدون وابستگی به سرور', icon: Database, color: 'bg-warn/15 text-warn' },
  ];

  return (
    <div className="flex flex-col pb-28 pt-4 px-4 max-w-md mx-auto">
      <div className="mb-4">
        <h1 className="text-lg font-black text-white">امکانات بیشتر</h1>
        <span className="text-xs text-muted">ابزارهای مدیریت بدهی، وام‌ها، دونگی و تنظیمات</span>
      </div>

      {/* iOS PWA Install Banner */}
      <div
        onClick={() => setShowIosGuide(true)}
        className="p-4 rounded-[22px] bg-gradient-to-r from-[#1B3883] to-surface border border-white/10 mb-2.5 cursor-pointer active:scale-98 transition-transform"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-lime text-onLime flex items-center justify-center font-bold">
            <Smartphone size={22} />
          </div>
          <div className="flex-1">
            <span className="text-xs font-bold text-white block">نصب روی صفحه اصلی آیفون (PWA)</span>
            <span className="text-[10px] text-white/70">راهنمای اضافه کردن آیکون برنامه به صفحه اصلی</span>
          </div>
          <ChevronLeft size={18} className="text-white/60" />
        </div>
      </div>

      {/* Check PWA Update Card */}
      <div className="p-3.5 rounded-[22px] bg-surface border border-line mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-lime/15 text-lime flex items-center justify-center shrink-0">
            <RefreshCw size={19} className={checkingUpdate ? 'animate-spin' : ''} />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-bold text-white block truncate">بررسی به‌روزرسانی (PWA)</span>
            <span className="text-[10px] text-muted block truncate">
              {updateStatus || 'بررسی و بارگذاری آخرین نسخه بدون حذف برنامه'}
            </span>
          </div>
        </div>

        <button
          onClick={handleCheckUpdate}
          disabled={checkingUpdate}
          className="px-3.5 py-1.5 bg-lime text-onLime hover:bg-lime/90 active:scale-95 text-xs font-bold rounded-xl transition-all shrink-0 disabled:opacity-50 shadow"
        >
          {checkingUpdate ? 'در حال بررسی...' : 'بررسی نسخه'}
        </button>
      </div>

      {/* Menu List */}
      <div className="space-y-2.5">
        {menuItems.map(item => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="p-3.5 rounded-[22px] bg-surface hover:bg-surface2 border border-line flex items-center justify-between cursor-pointer active:scale-98 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${item.color}`}>
                  <Icon size={20} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">{item.label}</h3>
                  <p className="text-[10px] text-muted mt-0.5">{item.desc}</p>
                </div>
              </div>

              <ChevronLeft size={16} className="text-muted" />
            </div>
          );
        })}
      </div>

      {/* About Box */}
      <div className="mt-8 text-center text-muted text-[11px] space-y-1">
        <div className="font-bold text-white/70">برنامه «جیب من» نسخه وب ۱.۰</div>
        <div>کاملاً آفلاین · بدون سرور · امن و رمزنگاری‌شده در حافظه دستگاه</div>
      </div>

      {/* iOS Install Guide Modal */}
      {showIosGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 className="text-sm font-bold text-white">نحوه نصب روی آیفون</h2>
              <button onClick={() => setShowIosGuide(false)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs text-white/90 leading-relaxed">
              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-lime text-onLime font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                  ۱
                </div>
                <div>
                  این صفحه را در مرورگر <strong>Safari (سافاری)</strong> آیفون باز کنید.
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-lime text-onLime font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                  ۲
                </div>
                <div>
                  دکمه <strong>Share</strong> (مربع با فلش رو به بالا <Share size={14} className="inline mx-1 text-sky" />) در پایین مرورگر را بزنید.
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-lime text-onLime font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                  ۳
                </div>
                <div>
                  گزینه <strong>Add to Home Screen</strong> (<PlusSquare size={14} className="inline mx-1 text-sky" /> افزودن به صفحه اصلی) را انتخاب کنید.
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-lime text-onLime font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                  ۴
                </div>
                <div>
                  کار تمام است! آیکون «جیب من» در کنار بقیه برنامه‌های آیفون قرار می‌گیرد و بدون اینترنت هم سریع و تمام‌صفحه باز می‌شود.
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIosGuide(false)}
              className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs shadow-fab"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
