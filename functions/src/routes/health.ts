import { Router } from 'express';
import type { AppConfig } from '../config';

export function healthRouter(config: AppConfig): Router {
  const router = Router();
  router.get('/health', (_req, res) => {
    res.json({
      data: {
        status: 'ok',
        service: 'seylane-sabz-learning-api',
        version: config.version,
        env: config.env,
        time: new Date().toISOString(),
      },
    });
  });
  return router;
}
