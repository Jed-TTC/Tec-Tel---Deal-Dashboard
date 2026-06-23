import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';

import dealsRouter from './routes/deals.js';
import authRouter from './routes/auth.js';
import pipelinesRouter from './routes/pipelines.js';
import partnerQueueRouter from './routes/partnerQueue.js';

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

app.use('/api/deals', dealsRouter);
app.use('/api/auth', authRouter);
app.use('/api/pipelines', pipelinesRouter);
app.use('/api/partner-queue', partnerQueueRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
