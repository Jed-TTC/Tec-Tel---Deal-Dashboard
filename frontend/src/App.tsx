import React, { useState, useEffect } from 'react';
import { LayoutDashboard, ListChecks, Inbox, AlertCircle, ExternalLink } from 'lucide-react';
import { Tab } from './types';
import { DealsTab } from './pages/DealsTab';
import { ActionItemsTab } from './pages/ActionItemsTab';
import { QueueTab } from './pages/QueueTab';
import { api } from './api';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'deals', label: 'Deals Overview', icon: LayoutDashboard },
  { id: 'actions', label: 'Action Items', icon: ListChecks },
  { id: 'queue', label: 'Review Queue', icon: Inbox },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('deals');
  const [msAuth, setMsAuth] = useState<boolean | null>(null);

  useEffect(() => {
    api.getAuthStatus().then(s => setMsAuth(s.microsoft)).catch(() => setMsAuth(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top nav */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="h-7 w-7 bg-brand-500 rounded-lg flex items-center justify-center">
                <LayoutDashboard className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold text-slate-800 text-sm">Deal Dashboard</span>
            </div>

            {/* Auth status */}
            {msAuth === false && (
              <a href="/api/auth/ms"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors">
                <AlertCircle className="h-3.5 w-3.5" />
                Connect Outlook
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {msAuth === true && (
              <span className="text-xs text-green-600 flex items-center gap-1.5">
                <span className="h-2 w-2 bg-green-500 rounded-full inline-block" />
                Outlook connected
              </span>
            )}
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 -mb-px">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    active
                      ? 'border-brand-500 text-brand-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}>
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {tab === 'deals' && <DealsTab />}
        {tab === 'actions' && <ActionItemsTab />}
        {tab === 'queue' && <QueueTab />}
      </main>
    </div>
  );
}
