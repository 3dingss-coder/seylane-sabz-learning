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
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawEnv = env.APP_ENV ?? (env.NODE_ENV === 'test' ? 'test' : 'dev');
  const appEnv: AppEnv = rawEnv === 'prod' || rawEnv === 'test' ? rawEnv : 'dev';
  const allowedOrigins = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  return {
    env: appEnv,
    version: env.APP_VERSION ?? '0.2.0',
    allowedOrigins,
    backend: env.DATA_BACKEND === 'memory' ? 'memory' : 'firestore',
    localSecret: env.LOCAL_AUTH_SECRET ?? 'local-dev-secret-change-me',
    firebaseWebApiKey: env.FIREBASE_WEB_API_KEY ?? '',
    storageBucket: env.STORAGE_BUCKET ?? '',
    geminiApiKey: env.GEMINI_API_KEY ?? '',
    geminiModel: env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite',
    dataDir: env.LOCAL_DATA_DIR ?? '.local-data',
  };
}
