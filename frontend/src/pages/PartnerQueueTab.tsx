import React, { useEffect, useState, useCallback } from 'react';
import { PartnerQueueItem } from '../types';
import { api } from '../api';

interface ItemEditState {
  selectedDealId: string;
  noteText: string;
  status: 'pending' | 'approving' | 'approved' | 'skipping' | 'skipped';
}

function buildInitialState(item: PartnerQueueItem): ItemEditState {
  return {
    selectedDealId: item.suggestedDeal?.id || item.allDeals[0]?.id || '',
    noteText: item.proposedNote,
    status: 'pending',
  };
}

function relativeDate(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const confidenceDotColor: Record<string, string> = {
  high: 'var(--green)',
  medium: 'var(--amber)',
  low: 'var(--label-soft)',
};

export function PartnerQueueTab() {
  const [items, setItems] = useState<PartnerQueueItem[]>([]);
  const [editStates, setEditStates] = useState<Record<string, ItemEditState>>({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setLoaded(false);
    try {
      const data = await api.getPartnerQueue();
      setItems(data);
      const states: Record<string, ItemEditState> = {};
      for (const item of data) {
        states[item.threadId] = buildInitialState(item);
      }
      setEditStates(states);
    } catch (err) {
      console.error('Failed to load partner queue:', err);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const handleApprove = async (threadId: string) => {
    const state = editStates[threadId];
    if (!state?.selectedDealId || !state?.noteText.trim()) return;
    setEditStates(prev => ({ ...prev, [threadId]: { ...prev[threadId], status: 'approving' } }));
    try {
      await api.approvePartnerQueueItem(threadId, state.selectedDealId, state.noteText);
      setEditStates(prev => ({ ...prev, [threadId]: { ...prev[threadId], status: 'approved' } }));
      setTimeout(() => setItems(prev => prev.filter(i => i.threadId !== threadId)), 1400);
    } catch {
      setEditStates(prev => ({ ...prev, [threadId]: { ...prev[threadId], status: 'pending' } }));
    }
  };

  const handleSkip = async (threadId: string) => {
    setEditStates(prev => ({ ...prev, [threadId]: { ...prev[threadId], status: 'skipping' } }));
    try {
      await api.skipPartnerQueueItem(threadId);
      setEditStates(prev => ({ ...prev, [threadId]: { ...prev[threadId], status: 'skipped' } }));
      setTimeout(() => setItems(prev => prev.filter(i => i.threadId !== threadId)), 600);
    } catch {
      setEditStates(prev => ({ ...prev, [threadId]: { ...prev[threadId], status: 'pending' } }));
    }
  };

  const visibleItems = items.filter(i => {
    const s = editStates[i.threadId]?.status;
    return s !== 'approved' && s !== 'skipped';
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 40px', gap: 18 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          border: '2px solid var(--hair-strong)', borderTopColor: 'var(--green)',
          animation: 'pq-spin 0.8s linear infinite',
        }} />
        <p style={{ fontFamily: 'var(--serif)', fontSize: 15, color: 'var(--ink-soft)', fontStyle: 'italic', margin: 0, textAlign: 'center' }}>
          Analyzing partner email threads with AI — this may take a moment…
        </p>
        <style>{`@keyframes pq-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (loaded && visibleItems.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 40px', gap: 12 }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <p style={{ fontFamily: 'var(--serif)', fontSize: 17, color: 'var(--ink)', margin: 0, fontWeight: 600 }}>
          Queue is clear
        </p>
        <p style={{ fontFamily: 'var(--serif)', fontSize: 13, color: 'var(--label)', fontStyle: 'italic', margin: 0, maxWidth: 440, textAlign: 'center', lineHeight: 1.6 }}>
          No partner email threads need review. Ensure partner companies in HubSpot have the{' '}
          <code style={{ fontFamily: 'var(--mono)', fontSize: 11, background: 'var(--hair)', padding: '1px 5px', borderRadius: 3 }}>
            is_partner
          </code>{' '}
          property set to <strong>true</strong>.
        </p>
        <button
          onClick={loadQueue}
          style={{
            marginTop: 8,
            fontFamily: 'var(--sans)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600,
            color: 'var(--ink)', background: 'none', border: '1px solid var(--hair-strong)',
            padding: '8px 18px', borderRadius: 4, cursor: 'pointer',
          }}
        >
          Refresh Queue
        </button>
      </div>
    );
  }

  if (!loaded) return null;

  return (
    <div>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
            Partner Updates
          </h2>
          <p style={{ fontFamily: 'var(--serif)', fontSize: 13, color: 'var(--label)', fontStyle: 'italic', margin: '4px 0 0' }}>
            {visibleItems.length} email thread{visibleItems.length !== 1 ? 's' : ''} awaiting review
          </p>
        </div>
        <button
          onClick={loadQueue}
          style={{
            fontFamily: 'var(--sans)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600,
            color: 'var(--label)', background: 'none', border: '1px solid var(--hair-strong)',
            padding: '7px 16px', borderRadius: 4, cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {visibleItems.map(item => {
          const state = editStates[item.threadId];
          if (!state) return null;
          const isApproving = state.status === 'approving';
          const isApproved = state.status === 'approved';
          const canApprove = !!state.selectedDealId && !!state.noteText.trim() && state.status === 'pending';

          return (
            <div
              key={item.threadId}
              style={{
                background: isApproved ? 'var(--green-tint)' : 'var(--paper)',
                border: `1px solid ${isApproved ? 'var(--green)' : 'var(--hair)'}`,
                borderRadius: 6,
                padding: '22px 24px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                transition: 'background 0.3s, border-color 0.3s',
              }}
            >
              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Partner badge + contact names */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
                    <span style={{
                      background: 'var(--green-tint)', color: 'var(--green-deep)',
                      fontFamily: 'var(--sans)', fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.12em', textTransform: 'uppercase',
                      padding: '2px 8px', borderRadius: 3,
                    }}>
                      {item.partnerCompany}
                    </span>
                    {item.partnerContacts.slice(0, 2).map((name, i) => (
                      <span key={i} style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--label)' }}>
                        {name}
                      </span>
                    ))}
                    {item.partnerContacts.length > 2 && (
                      <span style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--label-soft)' }}>
                        +{item.partnerContacts.length - 2} more
                      </span>
                    )}
                  </div>
                  {/* Thread subject */}
                  <div style={{
                    fontFamily: 'var(--serif)', fontSize: 17, fontWeight: 600,
                    color: 'var(--ink)', lineHeight: 1.3,
                  }}>
                    {item.subject || '(no subject)'}
                  </div>
                </div>
                {/* Date + count */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--label)' }}>
                    {relativeDate(item.latestDate)}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--label-soft)', marginTop: 2 }}>
                    {item.emailCount} email{item.emailCount !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              {/* AI synthesis */}
              {item.synthesis && (
                <div style={{
                  borderLeft: '3px solid var(--hair-strong)',
                  paddingLeft: 14,
                  marginBottom: 18,
                  fontFamily: 'var(--serif)', fontSize: 14,
                  color: 'var(--ink-soft)', fontStyle: 'italic',
                  lineHeight: 1.65,
                }}>
                  {item.synthesis}
                </div>
              )}

              {/* Deal attribution */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                  <span style={{
                    display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                    background: confidenceDotColor[item.confidence] || 'var(--label-soft)',
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontFamily: 'var(--sans)', fontSize: 10, color: 'var(--label)',
                    textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600,
                  }}>
                    {item.confidence} confidence · attributed to deal
                  </span>
                </div>
                {item.allDeals.length > 0 ? (
                  <select
                    value={state.selectedDealId}
                    onChange={e => setEditStates(prev => ({
                      ...prev,
                      [item.threadId]: { ...prev[item.threadId], selectedDealId: e.target.value },
                    }))}
                    style={{
                      fontFamily: 'var(--serif)', fontSize: 14, color: 'var(--ink)',
                      background: 'var(--page)', border: '1px solid var(--hair-strong)',
                      borderRadius: 4, padding: '6px 10px',
                      width: '100%', maxWidth: 520, cursor: 'pointer',
                    }}
                  >
                    <option value="">— Select a deal —</option>
                    {item.allDeals.map(deal => (
                      <option key={deal.id} value={deal.id}>
                        {deal.name}
                        {deal.pipeline ? ` · ${deal.pipeline}` : ''}
                        {deal.stage ? ` · ${deal.stage}` : ''}
                        {deal.value > 0 ? ` · $${deal.value.toLocaleString()}` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p style={{ fontFamily: 'var(--serif)', fontSize: 13, color: 'var(--label)', fontStyle: 'italic', margin: 0 }}>
                    No associated deals found for this thread.
                  </p>
                )}
              </div>

              {/* Proposed note editor */}
              <div style={{ marginBottom: 18 }}>
                <div style={{
                  fontFamily: 'var(--sans)', fontSize: 10, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: 'var(--label)', marginBottom: 6, fontWeight: 600,
                }}>
                  Proposed Note
                </div>
                <textarea
                  value={state.noteText}
                  onChange={e => setEditStates(prev => ({
                    ...prev,
                    [item.threadId]: { ...prev[item.threadId], noteText: e.target.value },
                  }))}
                  rows={4}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    fontFamily: 'var(--serif)', fontSize: 14, color: 'var(--ink)',
                    background: 'var(--page)', border: '1px solid var(--hair-strong)',
                    borderRadius: 4, padding: '10px 12px', lineHeight: 1.65,
                    resize: 'vertical', outline: 'none', transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--green)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--hair-strong)'; }}
                />
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleSkip(item.threadId)}
                  disabled={state.status !== 'pending'}
                  style={{
                    fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 600,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'var(--label)', background: 'none', border: '1px solid var(--hair-strong)',
                    padding: '8px 16px', borderRadius: 4,
                    cursor: state.status === 'pending' ? 'pointer' : 'not-allowed',
                    opacity: state.status === 'pending' ? 1 : 0.45,
                  }}
                >
                  Skip
                </button>
                <button
                  onClick={() => handleApprove(item.threadId)}
                  disabled={!canApprove}
                  style={{
                    fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 600,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: isApproved ? 'var(--green-deep)' : 'var(--paper)',
                    background: isApproved
                      ? 'var(--green-tint)'
                      : canApprove
                      ? 'var(--green)'
                      : 'var(--label-soft)',
                    border: 'none',
                    padding: '8px 20px', borderRadius: 4,
                    cursor: canApprove ? 'pointer' : 'not-allowed',
                    transition: 'background 0.2s',
                  }}
                >
                  {isApproved ? 'Saved ✓' : isApproving ? 'Saving…' : 'Approve & Log Note'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
