import { Router } from 'express';
import { getDeals, postDealNote } from '../services/hubspot';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const deals = await getDeals();
    res.json(deals);
  } catch (err: any) {
    console.error('GET /deals error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/notes', async (req, res) => {
  try {
    const { note } = req.body;
    if (!note) return res.status(400).json({ error: 'note is required' });
    await postDealNote(req.params.id, note);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('POST /deals/:id/notes error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
