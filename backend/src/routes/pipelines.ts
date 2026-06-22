import { Router } from 'express';
import { fetchPipelinesConfig } from '../services/hubspot.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const pipelines = await fetchPipelinesConfig();
    res.json(pipelines);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
