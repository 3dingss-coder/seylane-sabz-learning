import {
  AiError,
  approxTokens,
  type AiProvider,
  type AiTask,
  type ChatRequest,
  type ChatResult,
  type MediaPart,
  type RealtimeOffer,
  type SpeechResult,
  type SynthesizeRequest,
  type VisionRequest,
  type VisionResult,
} from './types';

interface GeminiOptions {
  baseUrl?: string;
  /** Model for long-context / multimodal understanding (images, PDF, audio, video, transcripts). */
  visionModel?: string;
  /** Model for speech synthesis (TTS preview family). */
  ttsModel?: string;
  /** Embedding model for the knowledge index. */
  embedModel?: string;
  /** Live (duplex speech-to-speech) model. */
  liveModel?: string;
  timeoutMs?: number;
}

export const GEMINI_LIVE_WS =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

/**
 * Google Gemini client (REST — no SDK).
 *
 * Why Gemini in this product:
 *  • It is the only free-tier vendor here that understands **images, PDF, audio and video natively**
 *    with a 1M-token window — that is what turns "238 product images + media files + spreadsheets"
 *    into searchable knowledge without a separate OCR/ASR stack.
 *  • `gemini-*-tts` speaks **Persian**, which Groq cannot — so Persian voice output lives here.
 *  • Ephemeral auth tokens let the browser open a Live (duplex) voice session without ever seeing
 *    our API key.
 */
export class GeminiProvider implements AiProvider {
  readonly id = 'gemini' as const;
  private readonly tasks = new Set<AiTask>(['chat', 'classify', 'vision', 'embed', 'synthesize']);

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly opts: GeminiOptions = {},
  ) {
    if (opts.liveModel) this.tasks.add('realtime');
  }

  readonly labelFa = 'Gemini (چندوجهی — تصویر/فیلم/PDF و صدای فارسی)';

  private get base() {
    return (this.opts.baseUrl ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  }
  private get timeoutMs() {
    return this.opts.timeoutMs ?? 30_000;
  }

  supports(task: AiTask): boolean {
    return this.tasks.has(task);
  }

  private async post<T>(path: string, body: unknown, task: AiTask, version = 'v1beta'): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.base}/${version}/${path}`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = (await res.text().catch(() => '')).slice(0, 300);
        throw new AiError(
          `Gemini HTTP ${res.status} ${text}`,
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

  private static safety() {
    return [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ];
  }

  private static textOf(body: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  }): string {
    return (
      body.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('')
        .trim() ?? ''
    );
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const contents = [
      ...(req.messages ?? []).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: req.prompt }] },
    ];
    const body = await this.post<{
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }>(
      `models/${req.maxTokens <= 200 ? this.model : this.model}:generateContent`,
      {
        systemInstruction: { parts: [{ text: req.system }] },
        contents,
        generationConfig: {
          temperature: req.temperature ?? 0.2,
          maxOutputTokens: req.maxTokens,
          ...(req.json ? { responseMimeType: 'application/json' } : {}),
        },
        safetySettings: GeminiProvider.safety(),
      },
      'chat',
    );
    const text = GeminiProvider.textOf(body);
    if (!text) throw new AiError('Gemini returned an empty answer', this.id, 'chat');
    return {
      text,
      model: this.model,
      provider: this.id,
      approxTokens: approxTokens(
        req.system.length + req.prompt.length + text.length + (req.messages ?? []).length * 120,
      ),
    };
  }

  /** Multimodal understanding: images, audio, video and PDFs (used by the knowledge ingestion). */
  async vision(req: VisionRequest): Promise<VisionResult> {
    const model = this.opts.visionModel ?? this.model;
    const parts = [
      ...req.parts.map((p: MediaPart) => ({
        inlineData: { mimeType: p.mime, data: p.base64 },
      })),
      { text: req.prompt },
    ];
    const body = await this.post<{
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }>(
      `models/${model}:generateContent`,
      {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: req.maxTokens,
          ...(req.json ? { responseMimeType: 'application/json' } : {}),
        },
        safetySettings: GeminiProvider.safety(),
      },
      'vision',
    );
    const text = GeminiProvider.textOf(body);
    if (!text) throw new AiError('Gemini returned no extract', this.id, 'vision');
    return {
      text,
      model,
      provider: this.id,
      approxTokens: approxTokens(text.length + req.prompt.length + req.parts.length * 800),
    };
  }

  /**
   * Text → speech. Gemini TTS returns raw little-endian 16-bit PCM at 24 kHz, which every modern
   * browser can play through a WAV header (see `pcmToWav` on the web client).
   */
  async synthesize(req: SynthesizeRequest): Promise<SpeechResult> {
    const model = this.opts.ttsModel ?? 'gemini-2.5-flash-preview-tts';
    const prompt = req.style ? `${req.style}\n\n${req.text}` : req.text;
    const body = await this.post<{
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
      }>;
    }>(
      `models/${model}:generateContent`,
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: req.voice ?? 'Kore' },
            },
          },
        },
      },
      'synthesize',
    );
    const inline = body.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData?.data,
    )?.inlineData;
    if (!inline?.data) throw new AiError('Gemini returned no audio', this.id, 'synthesize');
    return {
      base64: inline.data,
      // Gemini reports `audio/L16;codec=pcm;rate=24000`; the client wraps it into WAV.
      mime: inline.mimeType ?? 'audio/L16;rate=24000',
      model,
      provider: this.id,
    };
  }

  /** Batch text embeddings for the hybrid knowledge index. */
  async embed(texts: readonly string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const model = this.opts.embedModel ?? 'gemini-embedding-001';
    const body = await this.post<{ embeddings?: Array<{ values?: number[] }> }>(
      `models/${model}:batchEmbedContents`,
      {
        requests: texts.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text: text.slice(0, 8000) }] },
        })),
      },
      'embed',
    );
    const out = (body.embeddings ?? []).map((e) => e.values ?? []);
    if (out.length !== texts.length)
      throw new AiError('Gemini embedding mismatch', this.id, 'embed');
    return out;
  }

  /**
   * Mints a single-use ephemeral token for the Gemini Live API so the browser can open a duplex
   * voice session without our API key. The token only ever authorises *speech*; every fact the
   * model may say still comes from our server through the grounding tool (see services/voice.ts).
   */
  async realtime(opts: { systemInstruction: string; voice?: string }): Promise<RealtimeOffer> {
    const model = this.opts.liveModel;
    if (!model) throw new AiError('Live model not configured', this.id, 'realtime', false);
    const now = Date.now();
    const body = await this.post<{ name?: string }>(
      'auth_tokens',
      {
        uses: 1,
        expireTime: new Date(now + 30 * 60_000).toISOString(),
        newSessionExpireTime: new Date(now + 2 * 60_000).toISOString(),
      },
      'realtime',
      'v1alpha',
    );
    if (!body.name) throw new AiError('Gemini returned no auth token', this.id, 'realtime');
    return {
      url: `${GEMINI_LIVE_WS}?access_token=${encodeURIComponent(body.name)}`,
      token: body.name,
      model,
      expiresAt: new Date(now + 30 * 60_000).toISOString(),
      input: { mime: 'audio/pcm;rate=16000', sampleRate: 16_000 },
      output: { mime: 'audio/pcm;rate=24000', sampleRate: 24_000 },
      systemInstruction: opts.systemInstruction,
      voice: opts.voice ?? 'Kore',
    };
  }
}
