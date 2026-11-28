import React, { useState, useEffect } from 'react';
import { seedInitialDataIfNeeded } from './core/db';
import { startSync } from './core/sync';
import { Dock } from './components/Dock';
import { QuickAdd, type QuickAddType } from './components/QuickAdd';
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
import { ShoppingCompare } from './pages/ShoppingCompare';
import { ImpulseBrakeDashboard } from './pages/ImpulseBrakeDashboard';
import { Investments } from './pages/Investments';
import { MonthlyReport } from './pages/MonthlyReport';
import { ActiveBrakeBanner } from './components/impulse/ActiveBrakeBanner';
import { ImpulseBrakeModal } from './components/impulse/ImpulseBrakeModal';
import { LockScreen } from './components/LockScreen';
import { PwaUpdateBanner } from './components/PwaUpdateBanner';
import { isLockEnabled, shouldLock, recordActivity } from './core/security';

export function App() {
  const [activeTab, setActiveTab] = useState(0);
  const [subRoute, setSubRoute] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<number | undefined>();
  const [reportAccountId, setReportAccountId] = useState<number | undefined>();

  // Modals
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddType, setQuickAddType] = useState<QuickAddType>('EXPENSE');
  const [quickAddAccountId, setQuickAddAccountId] = useState<number | undefined>();
  const [isSmartPasteOpen, setIsSmartPasteOpen] = useState(false);

  // Hidden privacy toggle
  const [hidden, setHidden] = useState<boolean>(() => {
    return localStorage.getItem('jibeman_privacy_hidden') === 'true';
  });

  // Impulse Brake Modal State
  const [activeBrakeSessionId, setActiveBrakeSessionId] = useState<number | null>(null);
  const [isBrakeModalOpen, setIsBrakeModalOpen] = useState(false);

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

  const handleOpenQuickAdd = (type: QuickAddType = 'EXPENSE', accountId?: number) => {
    setQuickAddType(type);
    setQuickAddAccountId(accountId);
    setIsQuickAddOpen(true);
  };

  const handleTabChange = (tab: number) => {
    setSubRoute(null);
    setSelectedAccountId(undefined);
    setReportAccountId(undefined);
    setActiveTab(tab);
  };

  const handleSelectAccount = (id: number) => {
    setSelectedAccountId(id);
    setActiveTab(1); // switch to transactions filtered by this account
  };

  const handleOpenMonthlyReport = (accountId?: number) => {
    setReportAccountId(accountId);
    setSubRoute('report');
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
    if (subRoute === 'compare') return <ShoppingCompare onBack={() => setSubRoute(null)} hidden={hidden} />;
    if (subRoute === 'impulse') return <ImpulseBrakeDashboard onBack={() => setSubRoute(null)} hidden={hidden} />;
    if (subRoute === 'investments') return <Investments onBack={() => setSubRoute(null)} hidden={hidden} />;
    if (subRoute === 'report') {
      return (
        <MonthlyReport
          hidden={hidden}
          onToggleHidden={toggleHidden}
          initialAccountId={reportAccountId}
          onBack={() => setSubRoute(null)}
          onOpenTransactions={(accId) => {
            setSubRoute(null);
            setSelectedAccountId(accId);
            setActiveTab(1);
          }}
        />
      );
    }

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
            onOpenMonthlyReport={handleOpenMonthlyReport}
            onNavigateSubRoute={(r) => setSubRoute(r)}
          />
        );
      case 1:
        return <Transactions hidden={hidden} initialAccountId={selectedAccountId} />;
      case 2:
        return (
          <Accounts
            hidden={hidden}
            onSelectAccount={handleSelectAccount}
            onQuickAddForAccount={(accountId, type = 'INCOME') => handleOpenQuickAdd(type, accountId)}
            onOpenMonthlyReport={handleOpenMonthlyReport}
          />
        );
      case 3:
        return <More onNavigate={(r) => setSubRoute(r)} />;
      default:
        return null;
    }
  };

  if (isLocked) return <LockScreen onUnlock={() => setIsLocked(false)} />;

  return (
    <div className="min-h-screen bg-bg text-white max-w-md mx-auto relative flex flex-col selection:bg-lime selection:text-onLime">
      {/* PWA Update Banner */}
      <PwaUpdateBanner />

      {/* Page Content */}
      <main className="flex-1 safe-top">
        {/* Active Cooling Brake Banner */}
        {subRoute !== 'impulse' && (
          <ActiveBrakeBanner
            onOpenSession={id => {
              setActiveBrakeSessionId(id);
              setIsBrakeModalOpen(true);
            }}
          />
        )}
        {renderContent()}
      </main>

      {/* Impulse Brake Modal */}
      <ImpulseBrakeModal
        isOpen={isBrakeModalOpen}
        sessionId={activeBrakeSessionId}
        onClose={() => {
          setIsBrakeModalOpen(false);
          setActiveBrakeSessionId(null);
        }}
        onSuccess={() => {
          setActiveTab(t => t);
        }}
      />

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
        defaultAccountId={quickAddAccountId}
        onClose={() => {
          setIsQuickAddOpen(false);
          setQuickAddAccountId(undefined);
        }}
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
