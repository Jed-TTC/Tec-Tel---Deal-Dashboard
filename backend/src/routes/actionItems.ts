import { Router } from 'express';
import { getDeals } from '../services/hubspot.js';
import { getAllActionItems, getMeetings } from '../services/fellow.js';
import { getRecentEmailThreads, isAuthenticated } from '../services/msGraph.js';
import { extractEmailActionItems } from '../services/anthropic.js';
import { ActionItem } from '../types.js';

const router = Router();

// In-memory done state (extend to DB as needed)
const doneSet = new Set<string>();

router.get('/', async (_req, res) => {
  try {
    const [deals, fellowItems] = await Promise.all([getDeals(), getAllActionItems()]);

    const emailContactMap: Record<string, { dealId: string; dealName: string }> = {};
    for (const deal of deals) {
      for (const c of deal.contacts) {
        if (c.email) emailContactMap[c.email.toLowerCase()] = { dealId: deal.id, dealName: deal.name };
      }
    }

    // Fellow action items
    const items: ActionItem[] = fellowItems.map(ai => ({
      id: ai.id,
      dealId: emailContactMap[ai.attendeeEmails[0]?.toLowerCase()]?.dealId || '',
      dealName: emailContactMap[ai.attendeeEmails[0]?.toLowerCase()]?.dealName || 'Unknown Deal',
      source: 'fellow' as const,
      description: ai.content,
      identifiedAt: ai.meetingDate,
      done: ai.completed || doneSet.has(ai.id),
      meetingTitle: ai.meetingTitle,
    }));

    // Outlook action items (only if authenticated)
    if (isAuthenticated()) {
      const threads = await getRecentEmailThreads(14);
      const emailItems: ActionItem[] = [];

      for (const thread of threads) {
        const matchedDeal = thread.participants
          .map(p => emailContactMap[p.toLowerCase()])
          .find(Boolean);

        if (matchedDeal) {
          const extracted = await extractEmailActionItems(thread, matchedDeal.dealId, matchedDeal.dealName);
          emailItems.push(...extracted.map(e => ({ ...e, done: doneSet.has(e.id) })));
        }
      }
      items.push(...emailItems);
    }

    res.json(items);
  } catch (err: any) {
    console.error('GET /action-items error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/done', (req, res) => {
  const { done } = req.body;
  if (done) doneSet.add(req.params.id);
  else doneSet.delete(req.params.id);
  res.json({ ok: true });
});

export default router;
