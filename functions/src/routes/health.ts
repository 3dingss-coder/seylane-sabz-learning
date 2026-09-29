import { Router, type LightRouter } from '../http/router';
import type { AppConfig } from '../config';

export function healthRouter(config: AppConfig): LightRouter {
  const router = Router();
  router.get('/health', (_req, res) => {
    res.json({
      data: {
        status: 'ok',
        service: 'seylane-sabz-learning-api',
        version: config.version,
        env: config.env,
        backend: config.backend,
        time: new Date().toISOString(),
      },
    });
  });
  return router;
}
