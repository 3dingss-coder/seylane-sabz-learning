/**
 * Runtime configuration. Values come from environment variables only
 * (Firebase Functions params / GitHub Secrets) — never hard-coded secrets.
 */
export type AppEnv = 'dev' | 'prod' | 'test';
export type DataBackend = 'memory' | 'firestore' | 'd1';

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
  /** Chat/answer model (long context, best Persian instruction-following). */
  geminiChatModel: string;
  /** Multimodal extraction model (images, PDF, audio, video) for the knowledge pipeline. */
  geminiVisionModel: string;
  /** Persian-capable speech synthesis model (voice replies). */
  geminiTtsModel: string;
  /** Embedding model for the hybrid retriever. */
  geminiEmbedModel: string;
  /** Duplex (Live API) speech-to-speech model — enables real phone-style calls. */
  geminiLiveModel: string;
  /** Groq: Persian speech-to-text + the fast lane for classification and short answers. */
  groqApiKey: string;
  groqChatModel: string;
  groqFastModel: string;
  groqSttModel: string;
  /** When off, the voice feature falls back to the turn-based pipeline (STT → answer → TTS). */
  mentorVoiceRealtime: boolean;
  /** Hard cap for one knowledge-index rebuild (protects the free tiers). */
  knowledgeRebuildLimit: number;
  dataDir: string;
  /**
   * Wall-clock playback budget (anti-cheat). Production always enforces it; only disposable
   * local/test backends may opt out (`PLAYBACK_BUDGET=off`) to speed up E2E playback.
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
  const backend: DataBackend =
    env.DATA_BACKEND === 'memory' ? 'memory' : env.DATA_BACKEND === 'd1' ? 'd1' : 'firestore';
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
    geminiChatModel: env.GEMINI_CHAT_MODEL ?? env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    geminiVisionModel: env.GEMINI_VISION_MODEL ?? env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    geminiTtsModel: env.GEMINI_TTS_MODEL ?? 'gemini-2.5-flash-preview-tts',
    geminiEmbedModel: env.GEMINI_EMBED_MODEL ?? 'gemini-embedding-001',
    geminiLiveModel: env.GEMINI_LIVE_MODEL ?? 'gemini-2.5-flash-native-audio-preview-12-2025',
    groqApiKey: env.GROQ_API_KEY ?? '',
    groqChatModel: env.GROQ_CHAT_MODEL ?? 'openai/gpt-oss-120b',
    groqFastModel: env.GROQ_FAST_MODEL ?? 'openai/gpt-oss-20b',
    groqSttModel: env.GROQ_STT_MODEL ?? 'whisper-large-v3-turbo',
    mentorVoiceRealtime: (env.MENTOR_VOICE_REALTIME ?? 'on') !== 'off',
    knowledgeRebuildLimit: Math.max(
      50,
      Math.min(5000, Number.parseInt(env.KNOWLEDGE_REBUILD_LIMIT ?? '1200', 10) || 1200),
    ),
    dataDir: env.LOCAL_DATA_DIR ?? '.local-data',
    playbackBudget:
      appEnv === 'prod' ||
      !((backend === 'memory' || backend === 'd1') && env.PLAYBACK_BUDGET === 'off'),
    trustProxyHops: Math.max(0, Math.min(5, Number.parseInt(env.TRUST_PROXY_HOPS ?? '1', 10) || 0)),
    rateLimitScale:
      appEnv !== 'prod' && (backend === 'memory' || backend === 'd1')
        ? Math.max(1, Number.parseInt(env.RATE_LIMIT_SCALE ?? '1', 10) || 1)
        : 1,
    smtpUrl: env.SMTP_URL ?? '',
    appUrl: (env.APP_URL ?? env.URL ?? env.DEPLOY_PRIME_URL ?? '').replace(/\/$/, ''),
    mailFrom: env.MAIL_FROM ?? 'آکادمی سیلانه <no-reply@seylane-sabz.local>',
  };
}
