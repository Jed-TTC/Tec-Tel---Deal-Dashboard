import { Router } from 'express';
import { getDeals, postDealNote } from '../services/hubspot.js';
import { getRecentEmailThreads, isAuthenticated } from '../services/msGraph.js';
import { getMeetings } from '../services/fellow.js';
import { buildQueueFromEmails, buildQueueFromMeetings } from '../services/anthropic.js';
import { QueueItem } from '../types.js';

const router = Router();

// In-memory queue store
let queueItems: QueueItem[] = [];
let lastRefreshed: number | null = null;
const AUTO_POST = false; // Future toggle: set true to skip review

router.get('/', async (_req, res) => {
  try {
    // Return cached items unless stale (>10 min)
    if (lastRefreshed && Date.now() - lastRefreshed < 600_000) {
      return res.json(queueItems);
    }

    const deals = await getDeals();
    const newItems: QueueItem[] = [];

    if (isAuthenticated()) {
      const threads = await getRecentEmailThreads(7);
      const emailItems = await buildQueueFromEmails(threads, deals);
      newItems.push(...emailItems);
    }

    const meetings = await getMeetings(7);
    const meetingItems = await buildQueueFromMeetings(meetings, deals);
    newItems.push(...meetingItems);

    // Merge: keep existing statuses for items already in queue
    const existingMap = new Map(queueItems.map(i => [i.id, i]));
    queueItems = newItems.map(item => existingMap.get(item.id) || item);
    lastRefreshed = Date.now();

    if (AUTO_POST) {
      // Future: auto-approve all
      for (const item of queueItems.filter(i => i.status === 'pending')) {
        await postDealNote(item.dealId, item.suggestedNote);
        item.status = 'approved';
      }
    }

    res.json(queueItems);
  } catch (err: any) {
    console.error('GET /queue error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/refresh', async (_req, res) => {
  lastRefreshed = null;
  res.json({ ok: true });
});

router.patch('/:id', async (req, res) => {
  const { action, note } = req.body; // action: 'approve' | 'reject' | 'edit'
  const item = queueItems.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  try {
    if (action === 'approve') {
      const finalNote = note || item.suggestedNote;
      await postDealNote(item.dealId, finalNote);
      item.status = 'approved';
      item.suggestedNote = finalNote;
    } else if (action === 'reject') {
      item.status = 'rejected';
    } else if (action === 'edit') {
      item.suggestedNote = note;
    }
    res.json(item);
  } catch (err: any) {
    console.error('PATCH /queue/:id error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
