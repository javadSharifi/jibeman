import React from 'react';
import {
  ArrowRight,
  Utensils,
  Car,
  ShoppingBag,
  Zap,
  Smartphone,
  Home,
  Heart,
  Gift,
  BookOpen,
  Building2,
  Tag,
  Briefcase,
  PlusCircle,
  type LucideIcon,
} from 'lucide-react';

export const CAT_COLORS = [
  { bg: 'rgba(106, 158, 250, 0.14)', text: '#8DB6FF' }, // 0: sky
  { bg: 'rgba(255, 178, 122, 0.14)', text: '#FFB27A' }, // 1: orange/food
  { bg: 'rgba(245, 154, 200, 0.14)', text: '#F59AC8' }, // 2: pink/shop
  { bg: 'rgba(123, 227, 176, 0.14)', text: '#7BE3B0' }, // 3: green/income
  { bg: 'rgba(232, 252, 180, 0.14)', text: '#E8FCB4' }, // 4: lime
  { bg: 'rgba(185, 174, 255, 0.14)', text: '#B9AEFF' }, // 5: purple
  { bg: 'rgba(255, 201, 119, 0.14)', text: '#FFC977' }, // 6: yellow/bill
  { bg: 'rgba(255, 138, 154, 0.14)', text: '#FF8A9A' }, // 7: red/health
];

const ICON_MAP: Record<string, LucideIcon> = {
  Utensils,
  Car,
  ShoppingBag,
  Zap,
  Smartphone,
  Home,
  Heart,
  Gift,
  BookOpen,
  Building2,
  Tag,
  Briefcase,
  PlusCircle,
};

export function CategoryIcon({
  icon,
  colorIdx = 0,
  size = 20,
  className = '',
}: {
  icon?: string;
  colorIdx?: number;
  size?: number;
  className?: string;
}) {
  const color = CAT_COLORS[colorIdx % CAT_COLORS.length];
  const IconComponent = (icon && ICON_MAP[icon]) || Tag;

  return (
    <div
      className={`w-10 h-10 rounded-[13px] flex items-center justify-center shrink-0 ${className}`}
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      <IconComponent size={size} strokeWidth={1.75} />
    </div>
  );
}

export function LimeButton({
  children,
  onClick,
  icon: Icon,
  className = '',
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: any;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-12 px-6 rounded-2xl bg-lime text-onLime font-bold text-sm flex items-center justify-center gap-2 shadow-fab active:scale-[0.98] transition-transform disabled:opacity-50 ${className}`}
    >
      {Icon && <Icon size={18} strokeWidth={2.4} />}
      <span>{children}</span>
    </button>
  );
}

export function ActionPill({
  title,
  onClick,
  icon: Icon,
  className = '',
}: {
  title: string;
  onClick?: () => void;
  icon: any;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 h-12 rounded-full bg-primaryStrong flex items-center gap-2.5 px-2 text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] active:scale-[0.98] transition-transform ${className}`}
    >
      <div className="w-[34px] h-[34px] rounded-full bg-lime text-onLime flex items-center justify-center shrink-0">
        <Icon size={17} strokeWidth={2.2} />
      </div>
      <span className="truncate">{title}</span>
    </button>
  );
}

export function HeaderBar({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      {onBack ? (
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-2xl bg-surface border border-line flex items-center justify-center text-white active:scale-95"
        >
          <ArrowRight size={20} />
        </button>
      ) : (
        <div className="w-10" />
      )}
      <h1 className="text-base font-bold text-white">{title}</h1>
      <div className="w-10 flex justify-end">{action || null}</div>
    </div>
  );
}
