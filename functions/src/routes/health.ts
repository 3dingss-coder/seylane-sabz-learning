import { Router, type LightRouter } from '../http/router';
import type { AppConfig } from '../config';

/** Lightweight dependency probes. Each resolves true when the dependency answers, false otherwise. */
export interface HealthProbes {
  d1?: () => Promise<boolean>;
  r2?: () => Promise<boolean>;
}

const PROBE_TIMEOUT_MS = 3000;

async function runProbe(probe: () => Promise<boolean>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      probe(),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), PROBE_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Asks Google which models this key can see. Returns only status + Google's error reason, never the key. */
async function probeGemini(
  key: string,
): Promise<{ ok: boolean; status: number | string; reason?: string; message?: string }> {
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
      headers: { 'x-goog-api-key': key },
    });
    if (res.ok) return { ok: true, status: res.status };
    let reason: string | undefined;
    let message: string | undefined;
    try {
      const body = (await res.json()) as {
        error?: { status?: string; message?: string; details?: { reason?: string }[] };
      };
      reason = body.error?.details?.find((d) => d.reason)?.reason ?? body.error?.status;
      message = body.error?.message?.slice(0, 200);
    } catch {
      /* non-JSON error body */
    }
    return { ok: false, status: res.status, reason, message };
  } catch (err) {
    return { ok: false, status: err instanceof Error ? err.name : 'error' };
  }
}

export function healthRouter(config: AppConfig, probes: HealthProbes = {}): LightRouter {
  const router = Router();
  router.get('/health', async (req, res) => {
    const key = config.geminiApiKey;
    res.setHeader('Cache-Control', 'no-store');
    const dependencies: { d1?: boolean; r2?: boolean } = {};
    if (probes.d1) dependencies.d1 = await runProbe(probes.d1);
    if (probes.r2) dependencies.r2 = await runProbe(probes.r2);
    const degraded = dependencies.d1 === false;
    const base = {
      status: degraded ? 'degraded' : 'ok',
      service: 'seylane-sabz-learning-api',
      version: config.version,
      env: config.env,
      backend: config.backend,
      time: new Date().toISOString(),
      dependencies,
      // Booleans only: never expose key length or content.
      ai: {
        geminiConfigured: Boolean(key),
        groqConfigured: Boolean(config.groqApiKey),
      },
    };
    // `/v1/health?probe=1` makes one free models.list call to Google to verify the key works.
    const probe = req.query?.probe === '1' && key ? await probeGemini(key) : undefined;
    if (degraded) res.status(503);
    res.json({ data: probe ? { ...base, ai: { ...base.ai, geminiProbe: probe } } : base });
  });
  return router;
}
