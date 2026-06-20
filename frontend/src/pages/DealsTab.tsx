import React, { useEffect, useState, useMemo } from 'react';
import { ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { Deal } from '../types';
import { api } from '../api';
import { Badge } from '../components/Badge';
import { Spinner } from '../components/Spinner';

type SortKey = 'name' | 'owner' | 'stage' | 'value' | 'urgencyScore' | 'lastActivityDate';
type SortDir = 'asc' | 'desc';

function fmt(n: number, cur: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
}

function relativeDate(dateStr: string | null) {
  if (!dateStr) return '—';
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function DealsTab() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('urgencyScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    api.getDeals()
      .then(setDeals)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const owners = useMemo(() => [...new Set(deals.map(d => d.owner))].sort(), [deals]);
  const stages = useMemo(() => [...new Set(deals.map(d => d.stage))].sort(), [deals]);

  const sorted = useMemo(() => {
    let list = [...deals];
    if (ownerFilter) list = list.filter(d => d.owner === ownerFilter);
    if (stageFilter) list = list.filter(d => d.stage === stageFilter);
    if (urgencyFilter) list = list.filter(d => d.urgencyLevel === urgencyFilter);

    list.sort((a, b) => {
      let va: any = a[sortKey as keyof Deal];
      let vb: any = b[sortKey as keyof Deal];
      if (sortKey === 'lastActivityDate') {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
      }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [deals, ownerFilter, stageFilter, urgencyFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 text-slate-400 ml-1" />;
    return sortDir === 'desc'
      ? <ChevronDown className="h-3 w-3 text-brand-500 ml-1" />
      : <ChevronUp className="h-3 w-3 text-brand-500 ml-1" />;
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (error) return <div className="text-red-600 py-10 text-center">{error}</div>;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">All Owners</option>
          {owners.map(o => <option key={o}>{o}</option>)}
        </select>
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">All Stages</option>
          {stages.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={urgencyFilter} onChange={e => setUrgencyFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">All Urgency</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <span className="ml-auto text-sm text-slate-500">{sorted.length} deal{sorted.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {([
                ['name', 'Deal Name'],
                ['owner', 'Owner'],
                ['stage', 'Stage'],
                ['value', 'Value'],
                ['lastActivityDate', 'Last Activity'],
                ['urgencyScore', 'Urgency'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <th key={key}
                  className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort(key)}>
                  <span className="inline-flex items-center">
                    {label}<SortIcon k={key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map(deal => (
              <tr key={deal.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-800 max-w-xs truncate">{deal.name}</td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{deal.owner}</td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                  <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-xs font-medium">
                    {deal.stage}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap">
                  {deal.value ? fmt(deal.value, deal.currency) : '—'}
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {relativeDate(deal.lastActivityDate)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={deal.urgencyLevel} label={deal.urgencyLevel.charAt(0).toUpperCase() + deal.urgencyLevel.slice(1)} />
                    <div className="w-16 bg-slate-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${deal.urgencyLevel === 'high' ? 'bg-red-500' : deal.urgencyLevel === 'medium' ? 'bg-amber-500' : 'bg-green-500'}`}
                        style={{ width: `${deal.urgencyScore}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400">{deal.urgencyScore}</span>
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={6} className="text-center py-12 text-slate-400">No deals match the selected filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
