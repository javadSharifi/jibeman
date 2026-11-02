import React, { useState, useEffect } from 'react';
import { seedInitialDataIfNeeded } from './core/db';
import { startSync } from './core/sync';
import { Dock } from './components/Dock';
import { QuickAdd } from './components/QuickAdd';
import { SmartPaste } from './components/SmartPaste';

// Pages
import { Home } from './pages/Home';
import { Transactions } from './pages/Transactions';
import { Accounts } from './pages/Accounts';
import { More } from './pages/More';
import { Loans } from './pages/Loans';
import { Debts } from './pages/Debts';
import { Goals } from './pages/Goals';
import { Splits } from './pages/Splits';
import { Categories } from './pages/Categories';
import { Backup } from './pages/Backup';
import { People } from './pages/People';
import { Rules } from './pages/Rules';
import { Security } from './pages/Security';
import { LockScreen } from './components/LockScreen';
import { isLockEnabled, shouldLock, recordActivity } from './core/security';

export function App() {
  const [activeTab, setActiveTab] = useState(0);
  const [subRoute, setSubRoute] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<number | undefined>();

  // Modals
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddType, setQuickAddType] = useState<'EXPENSE' | 'INCOME' | 'TRANSFER'>('EXPENSE');
  const [isSmartPasteOpen, setIsSmartPasteOpen] = useState(false);

  // Hidden privacy toggle
  const [hidden, setHidden] = useState<boolean>(() => {
    return localStorage.getItem('jibeman_privacy_hidden') === 'true';
  });

  const toggleHidden = () => {
    setHidden(prev => {
      const next = !prev;
      localStorage.setItem('jibeman_privacy_hidden', String(next));
      return next;
    });
  };

  // Lock state
  const [isLocked, setIsLocked] = useState(() => isLockEnabled());

  useEffect(() => {
    seedInitialDataIfNeeded();
    const cleanupSync = startSync();

    const handleVisibility = () => {
      if (document.hidden) {
        recordActivity();
      } else {
        if (shouldLock()) {
          setIsLocked(true);
        }
      }
    };

    const handleUserActivity = () => {
      recordActivity();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('click', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);

    return () => {
      cleanupSync();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('click', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
    };
  }, []);

  const handleOpenQuickAdd = (type: 'EXPENSE' | 'INCOME' | 'TRANSFER' = 'EXPENSE') => {
    setQuickAddType(type);
    setIsQuickAddOpen(true);
  };

  const handleTabChange = (tab: number) => {
    setSubRoute(null);
    setSelectedAccountId(undefined);
    setActiveTab(tab);
  };

  const handleSelectAccount = (id: number) => {
    setSelectedAccountId(id);
    setActiveTab(1); // switch to transactions filtered by this account
  };

  const renderContent = () => {
    if (subRoute === 'loans') return <Loans onBack={() => setSubRoute(null)} hidden={hidden} />;
    if (subRoute === 'debts') return <Debts onBack={() => setSubRoute(null)} hidden={hidden} />;
    if (subRoute === 'goals') return <Goals onBack={() => setSubRoute(null)} hidden={hidden} />;
    if (subRoute === 'splits') return <Splits onBack={() => setSubRoute(null)} hidden={hidden} />;
    if (subRoute === 'categories') return <Categories onBack={() => setSubRoute(null)} />;
    if (subRoute === 'backup') return <Backup onBack={() => setSubRoute(null)} />;
    if (subRoute === 'people') return <People onBack={() => setSubRoute(null)} hidden={hidden} />;
    if (subRoute === 'rules') return <Rules onBack={() => setSubRoute(null)} />;
    if (subRoute === 'security') return <Security onBack={() => setSubRoute(null)} />;

    switch (activeTab) {
      case 0:
        return (
          <Home
            hidden={hidden}
            onToggleHidden={toggleHidden}
            onOpenQuickAdd={handleOpenQuickAdd}
            onOpenSmartPaste={() => setIsSmartPasteOpen(true)}
            onNavigateTab={handleTabChange}
            onOpenAccountDetail={handleSelectAccount}
          />
        );
      case 1:
        return <Transactions hidden={hidden} initialAccountId={selectedAccountId} />;
      case 2:
        return <Accounts hidden={hidden} onSelectAccount={handleSelectAccount} />;
      case 3:
        return <More onNavigate={(r) => setSubRoute(r)} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-bg text-white max-w-md mx-auto relative flex flex-col selection:bg-lime selection:text-onLime">
      {/* App Lock Screen Overlay */}
      {isLocked && <LockScreen onUnlock={() => setIsLocked(false)} />}

      {/* Page Content */}
      <main className="flex-1">
        {renderContent()}
      </main>

      {/* Floating Bottom Dock (only on main tabs) */}
      {!subRoute && (
        <Dock
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onAddClick={() => handleOpenQuickAdd('EXPENSE')}
        />
      )}

      {/* Quick Add Sheet */}
      <QuickAdd
        isOpen={isQuickAddOpen}
        defaultType={quickAddType}
        onClose={() => setIsQuickAddOpen(false)}
        onSuccess={() => {
          // Trigger re-render of current view
          setActiveTab(t => t);
        }}
      />

      {/* Smart SMS Paste Modal */}
      <SmartPaste
        isOpen={isSmartPasteOpen}
        onClose={() => setIsSmartPasteOpen(false)}
        onSuccess={() => {
          setActiveTab(t => t);
        }}
      />
    </div>
  );
}
