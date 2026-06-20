import React, { useEffect, useState, useMemo } from 'react';
import { CheckCircle, Circle, Mail, Users } from 'lucide-react';
import { ActionItem } from '../types';
import { api } from '../api';
import { Badge } from '../components/Badge';
import { Spinner } from '../components/Spinner';

function relativeDate(dateStr: string) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ActionItemsTab() {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.getActionItems()
      .then(setItems)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function toggleDone(id: string, current: boolean) {
    setToggling(t => new Set(t).add(id));
    try {
      await api.markDone(id, !current);
      setItems(prev => prev.map(i => i.id === id ? { ...i, done: !current } : i));
    } finally {
      setToggling(t => { const n = new Set(t); n.delete(id); return n; });
    }
  }

  const filtered = useMemo(() => {
    const list = showDone ? items : items.filter(i => !i.done);
    // Group by deal
    const map = new Map<string, ActionItem[]>();
    for (const item of list) {
      const key = item.dealId || item.dealName;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [items, showDone]);

  const pending = items.filter(i => !i.done).length;

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (error) return <div className="text-red-600 py-10 text-center">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-slate-700">
            {pending} pending action{pending !== 1 ? 's' : ''}
          </h2>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer select-none">
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)}
            className="rounded border-slate-300 text-brand-500 focus:ring-brand-500" />
          Show completed
        </label>
      </div>

      {filtered.size === 0 && (
        <div className="text-center py-16 text-slate-400">No action items{!showDone ? ' pending' : ''}.</div>
      )}

      {[...filtered.entries()].map(([key, dealItems]) => (
        <div key={key} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="font-semibold text-slate-700 text-sm">{dealItems[0].dealName || 'Unknown Deal'}</h3>
          </div>
          <ul className="divide-y divide-slate-100">
            {dealItems.map(item => (
              <li key={item.id} className={`flex items-start gap-3 px-4 py-3 ${item.done ? 'opacity-50' : ''}`}>
                <button
                  onClick={() => toggleDone(item.id, item.done)}
                  disabled={toggling.has(item.id)}
                  className="mt-0.5 flex-shrink-0 text-slate-400 hover:text-brand-500 transition-colors">
                  {item.done
                    ? <CheckCircle className="h-5 w-5 text-green-500" />
                    : <Circle className="h-5 w-5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm text-slate-800 ${item.done ? 'line-through' : ''}`}>
                    {item.description}
                  </p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <Badge variant={item.source} label={item.source === 'fellow' ? 'Fellow' : 'Outlook'} />
                    {item.meetingTitle && (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Users className="h-3 w-3" />{item.meetingTitle}
                      </span>
                    )}
                    {item.emailSubject && (
                      <span className="text-xs text-slate-400 flex items-center gap-1 truncate max-w-xs">
                        <Mail className="h-3 w-3 flex-shrink-0" />{item.emailSubject}
                      </span>
                    )}
                    <span className="text-xs text-slate-400 ml-auto">{relativeDate(item.identifiedAt)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
