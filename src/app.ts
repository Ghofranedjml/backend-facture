import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config } from './config/env';
import { errorHandler } from './middlewares/error.middleware';
import { logger } from './config/logger';

import invoiceRoutes from './routes/invoices.routes';
import clientRoutes from './routes/clients.routes';
import quotationRoutes from './routes/quotations.routes';
import dashboardRoutes from './routes/dashboard.routes';

const app = express();

// ── Security ────────────────────────────────
app.use(helmet());

app.use(
  cors({
    origin: config.ALLOWED_ORIGINS,
    credentials: true,
  }),
);

// ── Rate limiting ───────────────────────────
app.use(
  rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Trop de requêtes, réessayez dans un moment',
      },
    },
  }),
);

// ── Body parsing ────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// ── HTTP logging ────────────────────────────
if (config.NODE_ENV !== 'test') {
  app.use(
    morgan('combined', {
      stream: { write: (msg) => logger.info(msg.trim()) },
    }),
  );
}

// ── Health check ────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'etafakna-billing', timestamp: new Date() });
});

// ── API Routes ──────────────────────────────
const router = express.Router();

router.use('/invoices', invoiceRoutes);
router.use('/clients', clientRoutes);
router.use('/quotations', quotationRoutes);
router.use('/dashboard', dashboardRoutes);

router.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      message: 'E-Tafakna Billing API',
      version: '1.0.0',
      endpoints: ['/invoices', '/invoices/stats', '/clients', '/quotations', '/dashboard/stats'],
    },
  });
});

app.use(config.API_PREFIX, router);

// ── 404 ─────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route introuvable' },
  });
});

// ── Global error handler ────────────────────
app.use(errorHandler);

export default app;
