import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config';
import { LocalBlobStore } from './blob/local';
import { authenticate } from './http/auth';
import { errorHandler, notFoundHandler } from './http/middleware';
import { RateLimiter, rateLimit } from './http/rateLimit';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { localFilesRouter } from './routes/files';
import { healthRouter } from './routes/health';
import { managerRouter } from './routes/manager';
import { meRouter } from './routes/me';
import type { Deps } from './services/context';

export interface AppHandles {
  limiter: RateLimiter;
}

/**
 * Builds the versioned REST API (spec §21). All routes live under `/v1`.
 * Kept free of Firebase runtime specifics so it can be tested with supertest.
 */
export function createApp(deps: Deps, handles: Partial<AppHandles> = {}): Express {
  const config: AppConfig = deps.config;
  const limiter =
    handles.limiter ?? new RateLimiter(() => deps.clock().getTime(), deps.config.rateLimitScale);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', deps.config.trustProxyHops);

  // Security headers (spec §24): CSP, HSTS, X-Frame-Options, Referrer-Policy.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: { maxAge: 31536000, includeSubDomains: true },
      frameguard: { action: 'deny' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
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

  const v1 = express.Router();
  // Local blob endpoints are mounted before the JSON parser (streamed uploads).
  if (deps.blob instanceof LocalBlobStore) v1.use(localFilesRouter(deps.blob));
  // Payload limit ≤ 1MB (spec §24). Media goes straight to Storage via signed URLs.
  v1.use(express.json({ limit: '1mb' }));
  v1.use(healthRouter(config));
  v1.use(authRouter(deps, limiter));
  v1.use(
    ['/me', '/manager', '/admin'],
    authenticate(deps),
    rateLimit(limiter, 'general', 60, 60_000, (req) => req.user?.id ?? req.ip ?? 'anon'),
  );
  v1.use(meRouter(deps, limiter));
  v1.use(managerRouter(deps, limiter));
  v1.use(adminRouter(deps, limiter));
  app.use('/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
