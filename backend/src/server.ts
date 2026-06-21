import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import dealsRouter from './routes/deals.js';
import actionItemsRouter from './routes/actionItems.js';
import queueRouter from './routes/queue.js';
import authRouter from './routes/auth.js';

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

app.use('/api/deals', dealsRouter);
app.use('/api/action-items', actionItemsRouter);
app.use('/api/queue', queueRouter);
app.use('/api/auth', authRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
