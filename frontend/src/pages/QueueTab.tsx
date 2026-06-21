import React, { useEffect, useState } from 'react';
import { Check, X, Pencil, RefreshCw, Mail, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { QueueItem } from '../types';
import { api } from '../api';
import { Badge } from '../components/Badge';
import { Spinner } from '../components/Spinner';

function relativeDate(dateStr: string) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function QueueCard({ item, onUpdate }: { item: QueueItem; onUpdate: (updated: QueueItem) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.suggestedNote);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function approve() {
    setBusy(true);
    try {
      const updated = await api.approveQueueItem(item.id, draft !== item.suggestedNote ? draft : undefined);
      onUpdate(updated);
    } finally { setBusy(false); }
  }

  async function reject() {
    setBusy(true);
    try {
      const updated = await api.rejectQueueItem(item.id);
      onUpdate(updated);
    } finally { setBusy(false); }
  }

  async function saveEdit() {
    setBusy(true);
    try {
      const updated = await api.editQueueItem(item.id, draft);
      onUpdate(updated);
      setEditing(false);
    } finally { setBusy(false); }
  }

  const isPending = item.status === 'pending';

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${
      item.status === 'approved' ? 'border-green-200' :
      item.status === 'rejected' ? 'border-slate-200 opacity-60' :
      'border-slate-200'
    }`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={item.sourceType} label={item.sourceType === 'email' ? 'Email' : 'Meeting'} />
            <Badge variant={item.status} label={item.status.charAt(0).toUpperCase() + item.status.slice(1)} />
            <span className="text-xs text-slate-400">{relativeDate(item.sourceDate)}</span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-700 truncate">{item.sourceTitle}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Deal: <span className="font-semibold text-slate-700">{item.dealName}</span>
          </p>
        </div>
        {item.status !== 'pending' && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            item.status === 'approved' ? 'text-green-700 bg-green-50' : 'text-slate-500 bg-slate-100'
          }`}>
            {item.status === 'approved' ? 'Posted to HubSpot' : 'Dismissed'}
          </span>
        )}
      </div>

      {/* Confidence reasoning */}
      <button
        className="w-full px-4 py-2 text-left flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
        onClick={() => setExpanded(e => !e)}>
        <span className="text-xs text-slate-500 flex items-center gap-1.5">
          <Badge variant={item.confidenceLevel} label={`${item.confidenceLevel} confidence`} />
          {!expanded && <span className="text-slate-400 truncate max-w-xs">{item.confidenceReason}</span>}
        </span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
      </button>
      {expanded && (
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs text-slate-600">
          {item.confidenceReason}
        </div>
      )}

      {/* Note content */}
      <div className="px-4 py-3">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Suggested HubSpot Note</label>
        {editing ? (
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={4}
            className="mt-1.5 w-full text-sm border border-brand-500 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          />
        ) : (
          <p className="mt-1.5 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{draft}</p>
        )}
      </div>

      {/* Actions */}
      {isPending && (
        <div className="px-4 pb-3 flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={saveEdit} disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors">
                <Check className="h-4 w-4" /> Save
              </button>
              <button onClick={() => { setEditing(false); setDraft(item.suggestedNote); }}
                className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={approve} disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                {busy ? <Spinner size="sm" /> : <Check className="h-4 w-4" />} Approve & Post
              </button>
              <button onClick={() => setEditing(true)} disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                <Pencil className="h-4 w-4" /> Edit
              </button>
              <button onClick={reject} disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-500 rounded-lg text-sm font-medium hover:bg-slate-50 hover:text-red-600 transition-colors ml-auto">
                <X className="h-4 w-4" /> Reject
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function QueueTab() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api.getQueue()
      .then(setItems)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      await api.refreshQueue();
      const fresh = await api.getQueue();
      setItems(fresh);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }

  function updateItem(updated: QueueItem) {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
  }

  const pending = items.filter(i => i.status === 'pending');
  const reviewed = items.filter(i => i.status !== 'pending');
  const visible = showAll ? items : pending;

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (error) return <div className="text-red-600 py-10 text-center">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-700">
            {pending.length} item{pending.length !== 1 ? 's' : ''} pending review
          </h2>
          {reviewed.length > 0 && (
            <button onClick={() => setShowAll(s => !s)} className="text-xs text-brand-500 hover:underline mt-0.5">
              {showAll ? 'Hide' : 'Show'} {reviewed.length} reviewed
            </button>
          )}
        </div>
        <button onClick={refresh} disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {visible.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          {items.length === 0 ? 'No items in the queue. Click Refresh to check for new emails and meetings.' : 'All items reviewed.'}
        </div>
      )}

      <div className="space-y-3">
        {visible.map(item => (
          <QueueCard key={item.id} item={item} onUpdate={updateItem} />
        ))}
      </div>
    </div>
  );
}
