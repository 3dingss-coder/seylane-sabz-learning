import {
  AiError,
  approxTokens,
  type AiProvider,
  type AiTask,
  type ChatRequest,
  type ChatResult,
  type SpeechResult,
  type SynthesizeRequest,
  type TranscribeRequest,
  type TranscriptResult,
} from './types';
import { base64ToBytes } from '../lib/crypto';

/**
 * Groq Cloud client (OpenAI-compatible REST, no SDK dependency).
 *
 * Why Groq in this product:
 *  • `whisper-large-v3-turbo` transcribes **Persian** at ~10× real time and its free tier
 *    (20 RPM / 2000 RPD) is enough for the MVP — this is our speech-to-text workhorse.
 *  • `openai/gpt-oss-*` / `qwen` chat models answer in < 1 s, which keeps voice turns snappy and
 *    is the cheap lane for intent classification.
 *  • Groq **does not ship a Persian TTS voice** (only English + Saudi Arabic), so `synthesize` is
 *    intentionally NOT advertised: the router falls through to Gemini/Azure/browser voices.
 *    Returning a wrong-language voice would be a quality bug, not a graceful degradation.
 */
export class GroqProvider implements AiProvider {
  readonly id = 'groq' as const;
  private readonly tasks = new Set<AiTask>(['chat', 'classify', 'transcribe']);

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly opts: {
      baseUrl?: string;
      sttModel?: string;
      fastModel?: string;
      timeoutMs?: number;
    } = {},
  ) {}

  readonly labelFa = 'Groq (سریع/رایگان — Whisper فارسی)';

  private get base() {
    return (this.opts.baseUrl ?? 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  }
  private get sttModel() {
    return this.opts.sttModel ?? 'whisper-large-v3-turbo';
  }
  private get timeoutMs() {
    return this.opts.timeoutMs ?? 20_000;
  }

  supports(task: AiTask): boolean {
    return this.tasks.has(task);
  }

  private async fetchJson<T>(path: string, init: RequestInit, task: AiTask): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.base}${path}`, { ...init, signal: ctrl.signal });
      if (!res.ok) {
        const body = (await res.text().catch(() => '')).slice(0, 300);
        // 429/5xx are worth retrying on another provider; 4xx (bad request) are not.
        throw new AiError(
          `Groq HTTP ${res.status} ${body}`,
          this.id,
          task,
          res.status === 429 || res.status >= 500,
        );
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const model =
      req.json || req.maxTokens <= 200 ? (this.opts.fastModel ?? this.model) : this.model;
    const messages = [
      { role: 'system' as const, content: req.system },
      ...(req.messages ?? []).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: req.prompt },
    ];
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens,
    };
    if (req.json) body.response_format = { type: 'json_object' };
    const data = await this.fetchJson<{
      choices?: Array<{ message?: { content?: string } }>;
    }>(
      '/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
      },
      'chat',
    );
    const text = (data.choices?.[0]?.message?.content ?? '').trim();
    if (!text) throw new AiError('Groq returned an empty answer', this.id, 'chat');
    return {
      text,
      model,
      provider: this.id,
      approxTokens: approxTokens(messages.reduce((n, m) => n + m.content.length, 0) + text.length),
    };
  }

  async transcribe(req: TranscribeRequest): Promise<TranscriptResult> {
    const bytes = base64ToBytes(req.base64);
    if (!bytes.length) throw new AiError('Empty audio payload', this.id, 'transcribe', false);
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: req.mime }), `turn.${extFor(req.mime)}`);
    form.append('model', this.sttModel);
    form.append('language', (req.language ?? 'fa').split('-')[0] ?? 'fa');
    form.append('response_format', 'json');
    form.append('temperature', '0');
    // Whisper accepts a domain prompt; feeding product names fixes brand spellings.
    if (req.prompt) form.append('prompt', req.prompt.slice(0, 800));

    const data = await this.fetchJson<{ text?: string; duration?: number }>(
      '/audio/transcriptions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
      },
      'transcribe',
    );
    const text = (data.text ?? '').trim();
    if (!text) throw new AiError('Empty transcript', this.id, 'transcribe');
    return {
      text,
      model: this.sttModel,
      provider: this.id,
      language: req.language,
      durationSec: data.duration,
    };
  }

  /** Declared only so the router can report *why* Groq cannot speak Persian. */
  synthesize(_req: SynthesizeRequest): Promise<SpeechResult> {
    return Promise.reject(
      new AiError('Groq has no Persian voice (English/Arabic only)', this.id, 'synthesize', false),
    );
  }
}

function extFor(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('flac')) return 'flac';
  return 'webm';
}
