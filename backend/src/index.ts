import './config/env';
import path from 'path';
import fs from 'fs';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { config } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { assetsRouter } from './routes/assets';
import { incomeRouter } from './routes/income';
import { expensesRouter } from './routes/expenses';
import { settingsRouter } from './routes/settings';
import { fireRouter } from './routes/fire';
import { refiRouter } from './routes/refi';
import { taxRouter } from './routes/tax';

export const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(
  cors({
    origin: config.FRONTEND_ORIGIN,
    credentials: true,
  }),
);

app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    skip: () => process.env.NODE_ENV === 'test',
  }),
);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/income', incomeRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/fire', fireRouter);
app.use('/api/refi', refiRouter);
app.use('/api/tax', taxRouter);

app.use(errorHandler);

// Serve the built React app in production (no-op in dev since Vite handles it)
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

if (process.env.NODE_ENV !== 'test') {
  const PORT = config.PORT;
  app.listen(PORT, () => {
    console.log(`Firemaxxer backend listening on port ${PORT}`);
  });
}
