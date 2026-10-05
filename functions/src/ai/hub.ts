import type { AppConfig } from '../config';
import type { LlmClient } from '../llm/types';
import { GeminiProvider } from './gemini';
import { GroqProvider } from './groq';
import { LegacyLlmProvider, LocalProvider } from './local';
import {
  AiError,
  type AiCall,
  type AiProvider,
  type AiProviderId,
  type AiTask,
  type ChatRequest,
  type ChatResult,
  type RealtimeOffer,
  type SpeechResult,
  type SynthesizeRequest,
  type TranscribeRequest,
  type TranscriptResult,
  type VisionRequest,
  type VisionResult,
} from './types';

/**
 * Task → provider preference. This is the single place where "which AI does what" is decided:
 *  • Persian speech in  → Groq Whisper (fast, free, accurate for `fa`); Gemini audio when no Groq key.
 *  • Persian speech out → Gemini TTS (Groq has no Persian voice; Azure/ElevenLabs can be plugged in
 *    as extra providers without touching a line of business logic).
 *  • Images / PDF / video / audio understanding and embeddings → Gemini (native multimodality).
 *  • Short classification & latency-critical voice turns → Groq (gpt-oss/qwen, < 1 s).
 *  • Long, citation-heavy answers → Gemini first (better Persian instruction-following at 1M ctx).
 */
export const TASK_PREFERENCE: Record<AiTask, AiProviderId[]> = {
  chat: ['gemini', 'groq', 'legacy'],
  classify: ['groq', 'gemini', 'legacy'],
  vision: ['gemini'],
  transcribe: ['groq', 'gemini'],
  synthesize: ['gemini'],
  embed: ['gemini', 'local'],
  realtime: ['gemini'],
};

export interface AiRunOptions {
  /** Override the default preference order (e.g. force the fast lane inside a voice turn). */
  prefer?: AiProviderId[];
  /** Extra providers to attempt after the preferred ones. */
  fallback?: AiProviderId[];
}

export interface AiRunResult<T> {
  value: T;
  call: AiCall;
  /** All attempts in order — the audit trail of a failover chain. */
  attempts: AiCall[];
}

type ChatFn = (req: ChatRequest) => Promise<ChatResult>;
type VisionFn = (req: VisionRequest) => Promise<VisionResult>;
type TranscribeFn = (req: TranscribeRequest) => Promise<TranscriptResult>;
type SynthesizeFn = (req: SynthesizeRequest) => Promise<SpeechResult>;
type EmbedFn = (texts: readonly string[]) => Promise<number[][]>;
type RealtimeFn = (opts: { systemInstruction: string; voice?: string }) => Promise<RealtimeOffer>;

export class AllProvidersFailed extends Error {
  constructor(
    readonly task: AiTask,
    readonly errors: Array<{ provider: AiProviderId; error: string }>,
  ) {
    super(
      `هیچ ارائهدهندهای برای «${task}» پاسخ نداد: ${errors.map((e) => `${e.provider}: ${e.error}`).join(' | ')}`,
    );
  }
}

export class AiHub {
  constructor(readonly providers: AiProvider[]) {}

  byId(id: AiProviderId): AiProvider | undefined {
    return this.providers.find((p) => p.id === id);
  }

  has(task: AiTask): boolean {
    return this.providers.some((p) => p.supports(task));
  }

  /** Ordered candidate list for a task (supports() is enforced here, never at the call site). */
  candidates(task: AiTask, opts: AiRunOptions = {}): AiProvider[] {
    const order = opts.prefer ?? TASK_PREFERENCE[task];
    const ids = [...order, ...(opts.fallback ?? []), ...TASK_PREFERENCE[task]];
    const seen = new Set<AiProviderId>();
    const out: AiProvider[] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const p = this.byId(id);
      if (p?.supports(task)) out.push(p);
    }
    // Last resort: any other configured provider that advertises the task. This is what lets an
    // injected test provider (or a future Azure/ElevenLabs voice provider) take over a task the
    // default order does not mention — without ever weakening the preferred order above.
    for (const p of this.providers) {
      if (!seen.has(p.id) && p.supports(task)) out.push(p);
    }
    return out;
  }

  /** Typed wrapper: picks the provider method for a task, or fails over with a clear Persian error. */
  private pick<T>(task: AiTask, provider: AiProvider, name: keyof AiProvider): T {
    const method = provider[name];
    if (typeof method !== 'function')
      throw new AiError(
        `ارائه‌دهنده «${provider.id}» از «${task}» پشتیبانی نمی‌کند.`,
        provider.id,
        task,
        false,
      );
    return (method as unknown as (...args: unknown[]) => T).bind(provider) as T;
  }

  chat(req: ChatRequest, opts: AiRunOptions = {}): Promise<AiRunResult<ChatResult>> {
    return this.run('chat', (p) => this.pick<ChatFn>('chat', p, 'chat')(req), opts);
  }

  classify(req: ChatRequest, opts: AiRunOptions = {}): Promise<AiRunResult<ChatResult>> {
    return this.run('classify', (p) => this.pick<ChatFn>('classify', p, 'chat')(req), opts);
  }

  vision(req: VisionRequest, opts: AiRunOptions = {}): Promise<AiRunResult<VisionResult>> {
    return this.run('vision', (p) => this.pick<VisionFn>('vision', p, 'vision')(req), opts);
  }

  transcribe(
    req: TranscribeRequest,
    opts: AiRunOptions = {},
  ): Promise<AiRunResult<TranscriptResult>> {
    return this.run(
      'transcribe',
      (p) => this.pick<TranscribeFn>('transcribe', p, 'transcribe')(req),
      opts,
    );
  }

  synthesize(req: SynthesizeRequest, opts: AiRunOptions = {}): Promise<AiRunResult<SpeechResult>> {
    return this.run(
      'synthesize',
      (p) => this.pick<SynthesizeFn>('synthesize', p, 'synthesize')(req),
      opts,
    );
  }

  /** Embeddings: the first provider that answers wins (providers are never mixed within an index). */
  embed(texts: readonly string[], opts: AiRunOptions = {}): Promise<AiRunResult<number[][]>> {
    return this.run('embed', (p) => this.pick<EmbedFn>('embed', p, 'embed')(texts), opts);
  }

  realtime(
    opts: { systemInstruction: string; voice?: string },
    run: AiRunOptions = {},
  ): Promise<AiRunResult<RealtimeOffer>> {
    return this.run('realtime', (p) => this.pick<RealtimeFn>('realtime', p, 'realtime')(opts), run);
  }

  /**
   * Runs `fn` against the first provider that answers. Every failure is captured and reported in
   * Persian so an admin can see exactly which vendor degraded.
   */
  async run<T>(
    task: AiTask,
    fn: (provider: AiProvider) => Promise<T>,
    opts: AiRunOptions = {},
  ): Promise<AiRunResult<T>> {
    const candidates = this.candidates(task, opts);
    if (!candidates.length) throw new AllProvidersFailed(task, []);
    const attempts: AiCall[] = [];
    let previous: AiProviderId | undefined;
    for (const provider of candidates) {
      const started = Date.now();
      try {
        const value = await fn(provider);
        const call: AiCall = {
          task,
          provider: provider.id,
          model: provider.model,
          latencyMs: Date.now() - started,
          ok: true,
          ...(previous ? { fallbackFrom: previous } : {}),
        };
        attempts.push(call);
        return { value, call, attempts };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        attempts.push({
          task,
          provider: provider.id,
          model: provider.model,
          latencyMs: Date.now() - started,
          ok: false,
          error,
          ...(previous ? { fallbackFrom: previous } : {}),
        });
        if (e instanceof AiError && !e.retryable) {
          // A capability refusal (e.g. "no Persian voice") is expected — move on quietly.
        } else {
          console.warn(`[ai] ${task} failed on ${provider.id}: ${error}`);
        }
        previous = provider.id;
      }
    }
    throw new AllProvidersFailed(
      task,
      attempts.map((a) => ({ provider: a.provider, error: a.error ?? 'unknown' })),
    );
  }

  /** Cheap health snapshot for `GET /v1/health` and the admin quality report. */
  describe(): Array<{ provider: AiProviderId; model: string; labelFa: string; tasks: AiTask[] }> {
    return this.providers.map((p) => ({
      provider: p.id,
      model: p.model,
      labelFa: p.labelFa,
      tasks: (
        ['chat', 'classify', 'vision', 'transcribe', 'synthesize', 'embed', 'realtime'] as AiTask[]
      ).filter((t) => p.supports(t)),
    }));
  }
}

const cache = new WeakMap<object, AiHub>();

export interface AiHubInput {
  config: AppConfig;
  llm: LlmClient | null;
}

export function buildAiHub({ config, llm }: AiHubInput): AiHub {
  const providers: AiProvider[] = [];
  if (config.geminiApiKey) {
    providers.push(
      new GeminiProvider(config.geminiApiKey, config.geminiChatModel, {
        visionModel: config.geminiVisionModel,
        ttsModel: config.geminiTtsModel,
        embedModel: config.geminiEmbedModel,
        liveModel: config.mentorVoiceRealtime ? config.geminiLiveModel : '',
      }),
    );
  }
  if (config.groqApiKey) {
    providers.push(
      new GroqProvider(config.groqApiKey, config.groqChatModel, {
        sttModel: config.groqSttModel,
        fastModel: config.groqFastModel,
      }),
    );
  }
  if (llm) providers.push(new LegacyLlmProvider(llm));
  providers.push(new LocalProvider());
  return new AiHub(providers);
}

/**
 * Returns the hub for these deps. `deps.ai` (when present) wins so tests can inject a deterministic
 * hub; otherwise the hub is built once per process from config and the legacy LLM client.
 */
export function aiHub(d: { config: AppConfig; llm: LlmClient | null; ai?: AiHub }): AiHub {
  if (d.ai) return d.ai;
  const cached = cache.get(d);
  if (cached) return cached;
  const hub = buildAiHub({ config: d.config, llm: d.llm });
  cache.set(d, hub);
  return hub;
}
