import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { loadConfig, type AppConfig } from './config';
import { errorHandler, notFoundHandler } from './http/middleware';
import { healthRouter } from './routes/health';

/**
 * Builds the versioned REST API (spec §21). All routes live under `/v1`.
 * Kept free of Firebase runtime specifics so it can be unit-tested with supertest.
 */
export function createApp(config: AppConfig = loadConfig()): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  // Security headers (spec §24): CSP, HSTS, X-Frame-Options, Referrer-Policy.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: { maxAge: 31536000, includeSubDomains: true },
      frameguard: { action: 'deny' },
    }),
  );

  // Strict CORS allowlist. Requests without an Origin (server-to-server, curl) pass.
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || config.allowedOrigins.includes(origin)) cb(null, true);
        else cb(null, false);
      },
      allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      maxAge: 600,
    }),
  );

  // Payload limit ≤ 1MB (spec §24). Media uploads use a dedicated multipart route.
  app.use(express.json({ limit: '1mb' }));

  const v1 = express.Router();
  v1.use(healthRouter(config));
  app.use('/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
