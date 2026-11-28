import React from 'react';
import { Home, ArrowLeftRight, CreditCard, MoreHorizontal, Plus } from 'lucide-react';

interface DockProps {
  activeTab: number;
  onTabChange: (tab: number) => void;
  onAddClick: () => void;
}

export function Dock({ activeTab, onTabChange, onAddClick }: DockProps) {
  const tabs = [
    { label: 'خانه', icon: Home },
    { label: 'تراکنش‌ها', icon: ArrowLeftRight },
    { label: 'حساب‌ها', icon: CreditCard },
    { label: 'بیشتر', icon: MoreHorizontal },
  ];

  return (
    <div className="fixed left-3 right-3 bottom-5 z-40 max-w-md mx-auto">
      <div className="h-16 rounded-[24px] bg-dock/95 backdrop-blur-md border border-white/10 flex items-center justify-around px-2 shadow-dock relative">
        {/* Tab 0: Home */}
        <button
          onClick={() => onTabChange(0)}
          className={`flex flex-col items-center gap-0.5 w-14 transition-colors ${
            activeTab === 0 ? 'text-white font-semibold' : 'text-muted hover:text-white'
          }`}
        >
          <div className={`h-7 w-12 rounded-full flex items-center justify-center transition-all ${
            activeTab === 0 ? 'bg-sky/20 text-sky' : ''
          }`}>
            <Home size={20} strokeWidth={activeTab === 0 ? 2.2 : 1.75} />
          </div>
          <span className="text-[10px]">{tabs[0].label}</span>
        </button>

        {/* Tab 1: Transactions */}
        <button
          onClick={() => onTabChange(1)}
          className={`flex flex-col items-center gap-0.5 w-14 transition-colors ${
            activeTab === 1 ? 'text-white font-semibold' : 'text-muted hover:text-white'
          }`}
        >
          <div className={`h-7 w-12 rounded-full flex items-center justify-center transition-all ${
            activeTab === 1 ? 'bg-sky/20 text-sky' : ''
          }`}>
            <ArrowLeftRight size={20} strokeWidth={activeTab === 1 ? 2.2 : 1.75} />
          </div>
          <span className="text-[10px]">{tabs[1].label}</span>
        </button>

        {/* Center + FAB */}
        <div className="relative -top-5 flex flex-col items-center">
          <button
            onClick={onAddClick}
            aria-label="افزودن تراکنش، بدهی یا وام"
            className="w-14 h-14 rounded-[20px] bg-lime text-onLime flex items-center justify-center shadow-fab border-[5px] border-bg active:scale-95 transition-transform"
          >
            <Plus size={28} strokeWidth={2.8} />
          </button>
        </div>

        {/* Tab 2: Accounts */}
        <button
          onClick={() => onTabChange(2)}
          className={`flex flex-col items-center gap-0.5 w-14 transition-colors ${
            activeTab === 2 ? 'text-white font-semibold' : 'text-muted hover:text-white'
          }`}
        >
          <div className={`h-7 w-12 rounded-full flex items-center justify-center transition-all ${
            activeTab === 2 ? 'bg-sky/20 text-sky' : ''
          }`}>
            <CreditCard size={20} strokeWidth={activeTab === 2 ? 2.2 : 1.75} />
          </div>
          <span className="text-[10px]">{tabs[2].label}</span>
        </button>

        {/* Tab 3: More */}
        <button
          onClick={() => onTabChange(3)}
          className={`flex flex-col items-center gap-0.5 w-14 transition-colors ${
            activeTab === 3 ? 'text-white font-semibold' : 'text-muted hover:text-white'
          }`}
        >
          <div className={`h-7 w-12 rounded-full flex items-center justify-center transition-all ${
            activeTab === 3 ? 'bg-sky/20 text-sky' : ''
          }`}>
            <MoreHorizontal size={20} strokeWidth={activeTab === 3 ? 2.2 : 1.75} />
          </div>
          <span className="text-[10px]">{tabs[3].label}</span>
        </button>
      </div>
    </div>
  );
}
