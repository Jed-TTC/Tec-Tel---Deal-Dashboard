import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Deal } from '../types';
import { api, Pipeline } from '../api';

type SortKey = 'name' | 'owner' | 'stage' | 'value' | 'urgencyScore' | 'lastActivityDate';
type SortDir = 'asc' | 'desc';

const EXCLUDED_STAGES = /(closed|disqualified|dead|hot lead|inactive deal|new lead|nonresponsive|unresponsive|to call|not connected)/i;

function fmt(n: number, cur: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
}

function relativeDate(dateStr: string | null): { text: string; cls: 'today' | 'stale' | '' } {
  if (!dateStr) return { text: '—', cls: '' };
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (days === 0) return { text: 'Today', cls: 'today' };
  if (days === 1) return { text: 'Yesterday', cls: '' };
  if (days < 30) return { text: `${days}d ago`, cls: '' };
  if (days < 365) return { text: `${Math.floor(days / 30)}mo ago`, cls: 'stale' };
  return { text: `${Math.floor(days / 365)}y ago`, cls: 'stale' };
}

function initials(name: string): string {
  const parts = name.split(/[\s·\-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

function stageDotColor(stage: string): string {
  const s = stage.toLowerCase();
  if (s.includes('quote signed') || s.includes('quote received')) return 'var(--green)';
  if (s.includes('pitched') || s.includes('proposal')) return 'var(--green-deep)';
  if (s.includes('connected') || s.includes('call back') || s.includes('scheduled')) return 'var(--amber)';
  if (s.includes('fallout') || s.includes('lost') || s.includes('dead')) return 'var(--red)';
  return 'var(--label-soft)';
}

function formatTimestamp(d: Date): string {
  const totalMins = -d.getTimezoneOffset();
  const sign = totalMins >= 0 ? '+' : '-';
  const h = Math.floor(Math.abs(totalMins) / 60);
  const m = Math.abs(totalMins) % 60;
  const gmt = `GMT${sign}${h}${m > 0 ? `:${String(m).padStart(2, '0')}` : ''}`;
  const date = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date} · ${gmt} (${time})`;
}

export function DealsTab() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [pipelinesConfig, setPipelinesConfig] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pipelineFilter, setPipelineFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('urgencyScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [toast, setToast] = useState<{ msg: string; visible: boolean }>({ msg: '', visible: false });

  const showToast = useCallback((msg: string) => {
    setToast({ msg, visible: true });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 2200);
  }, []);

  const fetchAll = async (background = false) => {
    if (background) setRefreshing(true);
    try {
      const [d, p] = await Promise.all([api.getDeals(), api.getPipelines()]);
      setDeals(d);
      setPipelinesConfig(p);
      setLastUpdated(new Date());
      setError(null);
      if (background) showToast('Records updated');
    } catch (e: any) {
      if (!background) setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => fetchAll(true), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const activeDeals = useMemo(() => deals.filter(d => !EXCLUDED_STAGES.test(d.stage)), [deals]);
  const pipelines = useMemo(() => [...new Set(activeDeals.map(d => d.pipeline))].sort(), [activeDeals]);
  const stages = useMemo(() => {
    if (pipelineFilter) {
      const pipeline = pipelinesConfig.find(p => p.name === pipelineFilter);
      if (pipeline) return pipeline.stages.map(s => s.name).filter(n => !EXCLUDED_STAGES.test(n));
    }
    return [...new Set(activeDeals.map(d => d.stage))].sort();
  }, [activeDeals, pipelineFilter, pipelinesConfig]);
  const owners = useMemo(() => [...new Set(activeDeals.map(d => d.owner))].sort(), [activeDeals]);

  const sorted = useMemo(() => {
    let list = activeDeals;
    if (pipelineFilter) list = list.filter(d => d.pipeline === pipelineFilter);
    if (ownerFilter) list = list.filter(d => d.owner === ownerFilter);
    if (stageFilter) list = list.filter(d => d.stage === stageFilter);
    if (urgencyFilter) list = list.filter(d => d.urgencyLevel === urgencyFilter);
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      let va: any = sortKey === 'lastActivityDate'
        ? (a.lastActivityDate ? new Date(a.lastActivityDate).getTime() : 0)
        : a[sortKey as keyof Deal];
      let vb: any = sortKey === 'lastActivityDate'
        ? (b.lastActivityDate ? new Date(b.lastActivityDate).getTime() : 0)
        : b[sortKey as keyof Deal];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [activeDeals, pipelineFilter, ownerFilter, stageFilter, urgencyFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function SortArrow({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span style={{ marginLeft: 6, color: 'var(--label-soft)', fontSize: 8 }}></span>;
    return <span style={{ marginLeft: 6, color: 'var(--green)', fontSize: 8 }}>{sortDir === 'desc' ? '▾' : '▴'}</span>;
  }

  const urgencyBand = (level: string) => {
    if (level === 'high') return { label: 'High', color: '#943f3a', border: 'var(--red)', fill: 'var(--red)' };
    if (level === 'medium') return { label: 'Medium', color: '#8a6315', border: 'var(--amber)', fill: 'var(--amber)' };
    return { label: 'Low', color: 'var(--green-deep)', border: 'var(--green)', fill: 'var(--green)' };
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
        <svg style={{ width: 32, height: 32, animation: 'spin 0.7s linear infinite', color: 'var(--green)' }}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v4h-4" />
        </svg>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return <div style={{ color: 'var(--red)', padding: '40px 0', textAlign: 'center', fontFamily: 'var(--serif)' }}>{error}</div>;
  }

  const selWrapStyle: React.CSSProperties = { position: 'relative' };
  const selectStyle: React.CSSProperties = {
    fontFamily: 'var(--serif)', fontSize: 14, color: 'var(--ink)',
    background: 'var(--paper)', border: '1px solid var(--hair-strong)',
    padding: '9px 38px 9px 13px', minWidth: 178, cursor: 'pointer', borderRadius: 0,
    appearance: 'none',
  };
  const chevron = (
    <span style={{
      position: 'absolute', right: 13, top: '50%', width: 7, height: 7,
      borderRight: '1.5px solid var(--ink-soft)', borderBottom: '1.5px solid var(--ink-soft)',
      transform: 'translateY(-65%) rotate(45deg)', pointerEvents: 'none',
      display: 'block',
    }} />
  );

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          {[
            { id: 'pipeline', label: 'Pipeline', value: pipelineFilter, options: pipelines, onChange: (v: string) => { setPipelineFilter(v); setStageFilter(''); } },
            { id: 'stage', label: 'Stage', value: stageFilter, options: stages, onChange: (v: string) => setStageFilter(v) },
            { id: 'owner', label: 'Owner', value: ownerFilter, options: owners, onChange: (v: string) => setOwnerFilter(v) },
          ].map(f => (
            <div key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={{ fontFamily: 'var(--sans)', fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--label)' }}>
                {f.label}
              </label>
              <div style={selWrapStyle}>
                <select style={selectStyle} value={f.value} onChange={e => f.onChange(e.target.value)}>
                  <option value="">All {f.label}s</option>
                  {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {chevron}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <label style={{ fontFamily: 'var(--sans)', fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--label)' }}>
              Urgency
            </label>
            <div style={selWrapStyle}>
              <select style={selectStyle} value={urgencyFilter} onChange={e => setUrgencyFilter(e.target.value)}>
                <option value="">All Urgency</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              {chevron}
            </div>
          </div>
        </div>

        {/* Meta */}
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 11 }}>
          {lastUpdated && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--label)', letterSpacing: '0.02em' }}>
              {formatTimestamp(lastUpdated)}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <button
              onClick={() => fetchAll(true)}
              disabled={refreshing}
              style={{
                fontFamily: 'var(--sans)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                fontWeight: 600, cursor: refreshing ? 'default' : 'pointer', background: 'none',
                border: '1px solid var(--hair-strong)', color: 'var(--ink)',
                padding: '9px 16px 8px', display: 'inline-flex', alignItems: 'center', gap: 9,
                opacity: refreshing ? 0.5 : 1,
              }}
            >
              <span style={{ display: 'inline-block', animation: refreshing ? 'spin 0.7s linear infinite' : 'none' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 12, height: 12 }}>
                  <path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v4h-4" />
                </svg>
              </span>
              {refreshing ? 'Updating…' : 'Update Records'}
            </button>
            <div style={{ fontFamily: 'var(--sans)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--ink)' }}>
              <b style={{ color: 'var(--green-deep)' }}>{sorted.length}</b> deals
            </div>
          </div>
        </div>
      </div>

      {/* Table card */}
      <div style={{ background: 'var(--paper)', border: '1px solid var(--hair)', marginTop: 24 }}>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 190px)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}>
            <thead>
              <tr>
                {([
                  ['name', 'Name', '20%'],
                  ['owner', 'Owner', '13%'],
                ] as [SortKey, string, string][]).map(([key, label, w]) => (
                  <th key={key} onClick={() => toggleSort(key)}
                    style={{ ...thStyle, width: w, cursor: 'pointer', position: 'sticky', top: 0, background: 'var(--paper)', zIndex: 5 }}>
                    {label}<SortArrow k={key} />
                  </th>
                ))}
                <th style={{ ...thStyle, width: '12%', position: 'sticky', top: 0, background: 'var(--paper)', zIndex: 5 }}>Contact</th>
                <th style={{ ...thStyle, width: '11%', position: 'sticky', top: 0, background: 'var(--paper)', zIndex: 5 }}>Company</th>
                {([
                  ['stage', 'Stage', '13%'],
                ] as [SortKey, string, string][]).map(([key, label, w]) => (
                  <th key={key} onClick={() => toggleSort(key)}
                    style={{ ...thStyle, width: w, cursor: 'pointer', position: 'sticky', top: 0, background: 'var(--paper)', zIndex: 5 }}>
                    {label}<SortArrow k={key} />
                  </th>
                ))}
                <th onClick={() => toggleSort('value')}
                  style={{ ...thStyle, textAlign: 'right', width: '9%', cursor: 'pointer', position: 'sticky', top: 0, background: 'var(--paper)', zIndex: 5 }}>
                  Value<SortArrow k="value" />
                </th>
                <th onClick={() => toggleSort('lastActivityDate')}
                  style={{ ...thStyle, width: '9%', cursor: 'pointer', position: 'sticky', top: 0, background: 'var(--paper)', zIndex: 5 }}>
                  Last Activity<SortArrow k="lastActivityDate" />
                </th>
                <th onClick={() => toggleSort('urgencyScore')}
                  style={{ ...thStyle, width: '12%', cursor: 'pointer', position: 'sticky', top: 0, background: 'var(--paper)', zIndex: 5 }}>
                  Urgency<SortArrow k="urgencyScore" />
                </th>
                <th style={{ ...thStyle, width: '8%', position: 'sticky', top: 0, background: 'var(--paper)', zIndex: 5 }}>Deal Update</th>
                <th style={{ ...thStyle, width: '8%', position: 'sticky', top: 0, background: 'var(--paper)', zIndex: 5 }}>Next Step</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '60px 18px', textAlign: 'center', fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--label)', fontSize: 15 }}>
                    No deals match the current filters.
                  </td>
                </tr>
              ) : sorted.map(deal => {
                const act = relativeDate(deal.lastActivityDate);
                const band = urgencyBand(deal.urgencyLevel);
                const contactNames = deal.contacts.map(c =>
                  [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email
                );
                return (
                  <tr key={deal.id} style={{ borderBottom: '1px solid var(--hair)', transition: 'background 0.12s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fafaf9')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>

                    {/* Deal name */}
                    <td style={tdStyle}>
                      <div style={{ fontFamily: 'var(--serif)', fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.005em', color: 'var(--ink)', lineHeight: 1.25 }}>
                        {deal.name}
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--label)', letterSpacing: '0.04em', marginTop: 3 }}>
                        {deal.pipeline}
                      </div>
                    </td>

                    {/* Owner */}
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <span style={{
                          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'var(--sans)', fontSize: 10, fontWeight: 600, letterSpacing: '0.03em',
                          background: deal.owner === 'Unassigned' ? 'none' : 'var(--green-tint)',
                          color: deal.owner === 'Unassigned' ? 'var(--label-soft)' : 'var(--green-deep)',
                          border: deal.owner === 'Unassigned' ? '1px dashed var(--hair-strong)' : 'none',
                        }}>
                          {deal.owner === 'Unassigned' ? '?' : initials(deal.owner)}
                        </span>
                        <span style={{
                          fontFamily: 'var(--serif)', fontSize: 14,
                          color: deal.owner === 'Unassigned' ? 'var(--label)' : 'var(--ink)',
                          fontStyle: deal.owner === 'Unassigned' ? 'italic' : 'normal',
                        }}>
                          {deal.owner || 'Unassigned'}
                        </span>
                      </div>
                    </td>

                    {/* Contacts */}
                    <td style={tdStyle}>
                      {contactNames.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {contactNames.map((n, i) => (
                            <span key={i} style={{ fontFamily: 'var(--serif)', fontSize: 13.5, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{n}</span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontFamily: 'var(--serif)', fontSize: 13.5, color: 'var(--label-soft)', fontStyle: 'italic' }}>—</span>
                      )}
                    </td>

                    {/* Company */}
                    <td style={tdStyle}>
                      {deal.companies[0] ? (
                        <span style={{ fontFamily: 'var(--serif)', fontSize: 13.5, color: 'var(--ink-soft)' }}>{deal.companies[0].name}</span>
                      ) : (
                        <span style={{ fontFamily: 'var(--serif)', fontSize: 13.5, color: 'var(--label-soft)', fontStyle: 'italic' }}>—</span>
                      )}
                    </td>

                    {/* Stage */}
                    <td style={tdStyle}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: stageDotColor(deal.stage) }} />
                        <span style={{ fontFamily: 'var(--sans)', fontSize: 9.5, letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--ink-soft)' }}>
                          {deal.stage}
                        </span>
                      </span>
                    </td>

                    {/* Value */}
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <span style={{
                        fontFamily: 'var(--serif)', fontSize: 15, fontWeight: deal.value ? 700 : 400,
                        color: deal.value ? 'var(--ink)' : 'var(--label-soft)',
                        whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                      }}>
                        {deal.value ? fmt(deal.value, deal.currency) : '—'}
                      </span>
                    </td>

                    {/* Last Activity */}
                    <td style={tdStyle}>
                      <span style={{
                        fontFamily: 'var(--serif)', fontSize: 13.5, whiteSpace: 'nowrap',
                        color: act.cls === 'today' ? 'var(--green-deep)' : act.cls === 'stale' ? 'var(--label)' : 'var(--ink-soft)',
                        fontWeight: act.cls === 'today' ? 600 : 400,
                        fontStyle: act.cls === 'today' ? 'italic' : 'normal',
                      }}>
                        {act.text}
                      </span>
                    </td>

                    {/* Urgency */}
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{
                          fontFamily: 'var(--sans)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
                          fontWeight: 700, padding: '3px 9px 2px', border: `1px solid ${band.border}`,
                          borderRadius: 2, whiteSpace: 'nowrap', minWidth: 62, textAlign: 'center',
                          color: band.color,
                        }}>
                          {band.label}
                        </span>
                        <div style={{ flex: 1, height: 4, background: 'var(--hair)', minWidth: 54, position: 'relative' }}>
                          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${deal.urgencyScore}%`, background: band.fill }} />
                        </div>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-soft)', width: 24, textAlign: 'right', flexShrink: 0 }}>
                          {deal.urgencyScore}
                        </span>
                      </div>
                    </td>

                    {/* Deal Update */}
                    <td style={{ ...tdStyle, maxWidth: 240 }}>
                      {deal.dealUpdate ? (
                        <div>
                          <div style={{ fontFamily: 'var(--sans)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--label)', marginBottom: 4 }}>
                            {deal.lastUpdateDate
                              ? new Date(deal.lastUpdateDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : '—'}
                          </div>
                          <div style={{ fontFamily: 'var(--serif)', fontSize: 13, lineHeight: 1.35, color: 'var(--ink-soft)', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                            title={deal.dealUpdate}>
                            {deal.dealUpdate}
                          </div>
                        </div>
                      ) : deal.lastUpdateDate ? (
                        <span style={{ fontFamily: 'var(--serif)', fontSize: 13, color: 'var(--amber)', fontWeight: 600, fontStyle: 'italic' }}>
                          Needs AI Credits
                        </span>
                      ) : (
                        <span style={{ fontFamily: 'var(--serif)', fontSize: 13, color: 'var(--label)', fontStyle: 'italic' }}>
                          No recent activity
                        </span>
                      )}
                    </td>

                    {/* Next Step */}
                    <td style={{ ...tdStyle, maxWidth: 240 }}>
                      {deal.suggestedNextStep ? (
                        <div style={{ fontFamily: 'var(--serif)', fontSize: 13, lineHeight: 1.35, color: 'var(--ink-soft)', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                          title={deal.suggestedNextStep}>
                          {deal.suggestedNextStep}
                        </div>
                      ) : deal.lastUpdateDate ? (
                        <span style={{ fontFamily: 'var(--serif)', fontSize: 13, color: 'var(--amber)', fontWeight: 600, fontStyle: 'italic' }}>
                          Needs AI Credits
                        </span>
                      ) : (
                        <span style={{ fontFamily: 'var(--serif)', fontSize: 13, color: 'var(--label-soft)' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toast */}
      <div style={{
        position: 'fixed', bottom: 26, left: '50%',
        transform: `translateX(-50%) translateY(${toast.visible ? 0 : 20}px)`,
        background: 'var(--ink)', color: '#fff',
        fontFamily: 'var(--sans)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500,
        padding: '12px 20px', opacity: toast.visible ? 1 : 0,
        pointerEvents: 'none', transition: 'opacity 0.2s, transform 0.2s', zIndex: 50,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
        {toast.msg}
      </div>
    </>
  );
}

const thStyle: React.CSSProperties = {
  fontFamily: 'var(--sans)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
  fontWeight: 600, color: 'var(--label)', textAlign: 'left',
  padding: '16px 18px 13px', borderBottom: '1px solid var(--hair-strong)',
  whiteSpace: 'nowrap', userSelect: 'none',
};

const tdStyle: React.CSSProperties = {
  padding: '15px 18px', verticalAlign: 'middle',
};
