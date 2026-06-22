import { Router } from 'express';
import { getAuthUrl, exchangeCode, isAuthenticated } from '../services/msGraph.js';

const router = Router();

router.get('/ms', (_req, res) => {
  res.redirect(getAuthUrl());
});

router.get('/ms/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');
  try {
    await exchangeCode(code as string);
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:3000');
  } catch (err: any) {
    console.error('MS auth callback error:', err.response?.data || err.message);
    res.status(500).send('Authentication failed');
  }
});

router.get('/status', (_req, res) => {
  res.json({ microsoft: isAuthenticated() });
});

export default router;
