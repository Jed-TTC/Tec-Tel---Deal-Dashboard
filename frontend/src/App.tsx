import React, { useState } from 'react';
import { DealsTab } from './pages/DealsTab';
import { PartnerQueueTab } from './pages/PartnerQueueTab';

type Tab = 'deals' | 'partners';

const tabs: { id: Tab; label: string }[] = [
  { id: 'deals', label: 'Deals' },
  { id: 'partners', label: 'Partner Updates' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('deals');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page)' }}>
      <header style={{
        background: 'var(--paper)',
        borderBottom: '2px solid var(--green)',
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        {/* Logo row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '14px 34px 0' }}>
          <a href="https://tec-tel.com" target="_blank" rel="noopener noreferrer">
            <img src="/tectel-logo.png" alt="Tec-Tel" style={{ height: 30, width: 'auto', display: 'block' }} />
          </a>
          <div style={{ width: 1, height: 24, background: 'var(--hair-strong)' }} />
          <div style={{
            fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: '0.2em',
            textTransform: 'uppercase', fontWeight: 700, color: 'var(--ink)',
          }}>
            Hot Deal Dashboard
          </div>
        </div>

        {/* Tab nav */}
        <div style={{ display: 'flex', padding: '0 26px' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                fontFamily: 'var(--sans)', fontSize: 11, letterSpacing: '0.15em',
                textTransform: 'uppercase', fontWeight: 600,
                color: activeTab === t.id ? 'var(--ink)' : 'var(--label)',
                background: 'none', border: 'none',
                borderBottom: activeTab === t.id ? '2px solid var(--green)' : '2px solid transparent',
                padding: '10px 10px 8px',
                cursor: 'pointer',
                marginBottom: -2,
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main style={{ maxWidth: 1320, margin: '0 auto', padding: '26px 34px 64px' }}>
        {activeTab === 'deals' && <DealsTab />}
        {activeTab === 'partners' && <PartnerQueueTab />}
      </main>
    </div>
  );
}
