/**
 * Runtime configuration. Values come from environment variables only
 * (Firebase Functions params / GitHub Secrets) — never hard-coded secrets.
 */
export type AppEnv = 'dev' | 'prod' | 'test';

export interface AppConfig {
  env: AppEnv;
  version: string;
  allowedOrigins: string[];
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
    version: env.APP_VERSION ?? '0.1.0',
    allowedOrigins,
  };
}
