/**
 * Runtime configuration. Values come from environment variables only
 * (Firebase Functions params / GitHub Secrets) — never hard-coded secrets.
 */
export type AppEnv = 'dev' | 'prod' | 'test';
export type DataBackend = 'memory' | 'firestore';

export interface AppConfig {
  env: AppEnv;
  version: string;
  allowedOrigins: string[];
  backend: DataBackend;
  /** HMAC secret for the memory auth provider + local signed URLs (local/test only). */
  localSecret: string;
  firebaseWebApiKey: string;
  storageBucket: string;
  geminiApiKey: string;
  geminiModel: string;
  dataDir: string;
  /**
   * Wall-clock playback budget (anti-cheat). Can only be disabled on the in-memory backend
   * (`PLAYBACK_BUDGET=off`, used by the E2E suite to simulate playback quickly) — never on Firestore.
   */
  playbackBudget: boolean;
  /**
   * Proxy hops in front of the API whose X-Forwarded-For entry is trusted (TRUST_PROXY_HOPS,
   * default 1 = Google front end of Cloud Functions/Run; 2 if Cloudflare proxies the API).
   * Never `true`: that trusts the client-supplied left-most entry and lets anyone bypass per-IP
   * rate limits (login brute force, §24).
   */
  trustProxyHops: number;
  /** Rate-limit multiplier, memory backend only (RATE_LIMIT_SCALE, used by the E2E suite). */
  rateLimitScale: number;
  /** SMTP connection URL for the weekly manager digest email (optional). */
  smtpUrl: string;
  /** Public URL of the web app (links in emails). */
  appUrl: string;
  mailFrom: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawEnv = env.APP_ENV ?? (env.NODE_ENV === 'test' ? 'test' : 'dev');
  const appEnv: AppEnv = rawEnv === 'prod' || rawEnv === 'test' ? rawEnv : 'dev';
  const allowedOrigins = [
    ...(env.ALLOWED_ORIGINS ?? '').split(','),
    env.URL ?? '',
    env.DEPLOY_PRIME_URL ?? '',
    env.DEPLOY_URL ?? '',
  ]
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter((o) => o.length > 0);
  const backend: DataBackend = env.DATA_BACKEND === 'memory' ? 'memory' : 'firestore';
  return {
    env: appEnv,
    version: env.APP_VERSION ?? '0.2.0',
    allowedOrigins,
    backend,
    localSecret: env.LOCAL_AUTH_SECRET ?? 'local-dev-secret-change-me',
    firebaseWebApiKey: env.FIREBASE_WEB_API_KEY ?? '',
    storageBucket: env.STORAGE_BUCKET ?? '',
    geminiApiKey: env.GEMINI_API_KEY ?? '',
    geminiModel: env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite',
    dataDir: env.LOCAL_DATA_DIR ?? '.local-data',
    playbackBudget: !(backend === 'memory' && env.PLAYBACK_BUDGET === 'off'),
    trustProxyHops: Math.max(0, Math.min(5, Number.parseInt(env.TRUST_PROXY_HOPS ?? '1', 10) || 0)),
    rateLimitScale:
      backend === 'memory' ? Math.max(1, Number.parseInt(env.RATE_LIMIT_SCALE ?? '1', 10) || 1) : 1,
    smtpUrl: env.SMTP_URL ?? '',
    appUrl: (env.APP_URL ?? env.URL ?? env.DEPLOY_PRIME_URL ?? '').replace(/\/$/, ''),
    mailFrom: env.MAIL_FROM ?? 'سیلانه‌سبز لرنینگ <no-reply@seylane-sabz.local>',
  };
}
