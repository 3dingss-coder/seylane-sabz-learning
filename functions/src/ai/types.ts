/**
 * Multi-provider AI layer (mentor assistant).
 *
 * Design rules that keep answer quality high when several vendors are stitched together:
 *  1. Every provider is a *stateless worker* behind one interface — the orchestrator (our server)
 *     owns state, retrieval and guardrails. Models never talk to each other directly.
 *  2. Tasks are declared explicitly (`AiTask`); the router may only send a task to a provider that
 *     advertises it. A provider that cannot do Persian speech synthesis must say so instead of
 *     silently returning garbage.
 *  3. Every call reports `AiCall` telemetry (provider, model, latency, tokens, fallback reason) so
 *     cost and quality can be audited per task.
 */
export type AiProviderId = 'gemini' | 'groq' | 'legacy' | 'local';

/** What we ask a model to do. Routing is per task, never per vendor. */
export type AiTask =
  | 'chat' // text answer generation (RAG-grounded)
  | 'classify' // short label / intent / routing decisions
  | 'vision' // image, PDF, video-frame or document understanding
  | 'transcribe' // speech → text
  | 'synthesize' // text → speech
  | 'embed' // text → vector
  | 'realtime'; // duplex speech-to-speech session

export const AI_TASKS: AiTask[] = [
  'chat',
  'classify',
  'vision',
  'transcribe',
  'synthesize',
  'embed',
  'realtime',
];

export interface AiCall {
  task: AiTask;
  provider: AiProviderId;
  model: string;
  latencyMs: number;
  ok: boolean;
  /** Set when this provider was reached because an earlier one failed (failover chain). */
  fallbackFrom?: AiProviderId;
  error?: string;
  approxTokens?: number;
}

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  system: string;
  /** Conversation turns (oldest first). `prompt` is appended as the final user turn. */
  messages?: AiMessage[];
  prompt: string;
  maxTokens: number;
  temperature?: number;
  /** Ask for strict JSON output where the provider supports a JSON mode. */
  json?: boolean;
}

export interface ChatResult {
  text: string;
  model: string;
  provider: AiProviderId;
  approxTokens: number;
}

export type MediaKind = 'image' | 'audio' | 'video' | 'pdf' | 'text';

export interface MediaPart {
  kind: MediaKind;
  mime: string;
  /** Base64 payload (no data-URL prefix) — the only shape every vendor accepts. */
  base64: string;
  /** Optional hint, e.g. a section title, kept out of the model's user-visible prompt. */
  label?: string;
}

export interface VisionRequest {
  system: string;
  prompt: string;
  parts: MediaPart[];
  maxTokens: number;
  json?: boolean;
}

export interface VisionResult {
  text: string;
  model: string;
  provider: AiProviderId;
  approxTokens: number;
}

export interface TranscribeRequest {
  base64: string;
  mime: string;
  /** BCP-47 hint. Persian is the default for this product. */
  language?: string;
  /** Domain vocabulary shown to the model to fix product/brand names. */
  prompt?: string;
}

export interface TranscriptResult {
  text: string;
  model: string;
  provider: AiProviderId;
  language?: string;
  durationSec?: number;
}

export interface SynthesizeRequest {
  text: string;
  /** BCP-47 language of `text` — `fa-IR` for the marketer app. */
  language: string;
  voice?: string;
  /** Speaking style hint (e.g. «آرام و دوستانه»). */
  style?: string;
}

export interface SpeechResult {
  /** Base64 audio payload. */
  base64: string;
  mime: string;
  model: string;
  provider: AiProviderId;
  durationSec?: number;
}

export interface RealtimeOffer {
  /** WebSocket endpoint the client connects to (never carries our API key). */
  url: string;
  /** Short-lived credential minted server-side (e.g. a Gemini ephemeral token). */
  token: string;
  model: string;
  expiresAt: string;
  /** Input/output audio formats the client must produce/consume. */
  input: { mime: string; sampleRate: number };
  output: { mime: string; sampleRate: number };
  /** Client-side system instruction shipped with the token (audited server-side). */
  systemInstruction: string;
  voice?: string;
}

export interface AiProvider {
  readonly id: AiProviderId;
  readonly model: string;
  /** Persian label used in admin reports and health output. */
  readonly labelFa: string;
  supports(task: AiTask): boolean;
  chat?(req: ChatRequest): Promise<ChatResult>;
  vision?(req: VisionRequest): Promise<VisionResult>;
  transcribe?(req: TranscribeRequest): Promise<TranscriptResult>;
  synthesize?(req: SynthesizeRequest): Promise<SpeechResult>;
  embed?(texts: readonly string[]): Promise<number[][]>;
  /** Mints a duplex session offer (real-time voice). */
  realtime?(opts: { systemInstruction: string; voice?: string }): Promise<RealtimeOffer>;
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly provider: AiProviderId,
    readonly task: AiTask,
    readonly retryable = true,
  ) {
    super(message);
  }
}

/** Rough token estimate used for cost logging (Persian is ~3.5 chars/token for these models). */
export function approxTokens(chars: number): number {
  return Math.max(1, Math.round(chars / 3.5));
}
