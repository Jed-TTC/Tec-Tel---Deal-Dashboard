import { Router } from 'express';
import { getQueueItems, approveQueueItem, skipQueueItem } from '../services/partnerQueue.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const items = await getQueueItems();
    res.json(items);
  } catch (err: any) {
    console.error('GET /partner-queue error:', err.message);
    res.status(500).json({ error: 'Failed to fetch partner queue' });
  }
});

router.post('/:threadId/approve', async (req, res) => {
  const { threadId } = req.params;
  const { dealId, noteText } = req.body as { dealId?: string; noteText?: string };
  if (!dealId || !noteText?.trim()) {
    res.status(400).json({ error: 'dealId and noteText are required' });
    return;
  }
  try {
    await approveQueueItem(threadId, dealId, noteText);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('POST /partner-queue/approve error:', err.message);
    res.status(500).json({ error: 'Failed to approve queue item' });
  }
});

router.post('/:threadId/skip', async (req, res) => {
  const { threadId } = req.params;
  try {
    await skipQueueItem(threadId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('POST /partner-queue/skip error:', err.message);
    res.status(500).json({ error: 'Failed to skip queue item' });
  }
});

export default router;
