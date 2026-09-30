import { Router, type LightRouter } from '../http/router';
import type { AppConfig } from '../config';

/** Asks Google which models this key can see. Returns only an HTTP status, never the key. */
async function probeGemini(key: string): Promise<{ ok: boolean; status: number | string }> {
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
      headers: { 'x-goog-api-key': key },
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: err instanceof Error ? err.name : 'error' };
  }
}

export function healthRouter(config: AppConfig): LightRouter {
  const router = Router();
  router.get('/health', async (req, res) => {
    const key = config.geminiApiKey;
    const base = {
      status: 'ok',
      service: 'seylane-sabz-learning-api',
      version: config.version,
      env: config.env,
      backend: config.backend,
      time: new Date().toISOString(),
      // Booleans only: lets you see from a browser whether the secrets reached the Worker.
      ai: {
        geminiConfigured: Boolean(key),
        geminiKeyFormatLooksValid: key.startsWith('AIza'),
        groqConfigured: Boolean(config.groqApiKey),
      },
    };
    // `/v1/health?probe=1` makes one free models.list call to Google to verify the key works.
    const probe = req.query?.probe === '1' && key ? await probeGemini(key) : undefined;
    res.json({ data: probe ? { ...base, ai: { ...base.ai, geminiProbe: probe } } : base });
  });
  return router;
}
