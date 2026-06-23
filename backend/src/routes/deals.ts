import { Router } from 'express';
import { getDeals, postDealNote, calcUrgency } from '../services/hubspot.js';
import { synthesizeDealUpdates } from '../services/anthropic.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const { deals: allDeals, activitiesMap } = await getDeals();

    const EXCLUDED_PIPELINES = /^(Cold Calling Pipeline|SDR Pipeline)$/i;
    const deals = allDeals.filter(d => !EXCLUDED_PIPELINES.test(d.pipeline));

    // Run synthesis only on active deals to keep it fast
    const activeDeals = deals.filter(d => !/(closed|disqualified|dead)/i.test(d.stage));
    const aiResults = await synthesizeDealUpdates(activeDeals, activitiesMap);

    const enriched = deals.map(d => {
      const ai = aiResults[d.id];
      const dealUpdate = ai?.synthesis ?? null;
      const suggestedNextStep = ai?.nextStep ?? null;

      const activityDays = d.lastActivityDate
        ? Math.floor((Date.now() - new Date(d.lastActivityDate).getTime()) / 86_400_000)
        : 999;
      const { score, level, breakdown } = calcUrgency(d.value, activityDays, dealUpdate, suggestedNextStep);

      return {
        ...d,
        dealUpdate,
        suggestedNextStep,
        urgencyScore: score,
        urgencyLevel: level,
        urgencyBreakdown: breakdown,
      };
    });

    res.json(enriched);
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
