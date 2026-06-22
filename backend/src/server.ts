import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';

import dealsRouter from './routes/deals';
import actionItemsRouter from './routes/actionItems';
import queueRouter from './routes/queue';
import authRouter from './routes/auth';

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

if (process.env.NODE_ENV === 'production') {
  const publicDir = path.join(__dirname, 'public');
  app.use(express.static(publicDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
