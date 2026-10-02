import { z } from 'zod';
import { ApiError } from '../http/errors';
import { AiError } from '../ai/types';
import { AllProvidersFailed, aiHub } from '../ai/hub';
import * as prompts from '../ai/prompts';
import { getPolicy, track, type Deps } from './context';
import { checkInput, normalizeFa } from './mentor';
import { answerQuestion, consumeVoiceQuota, recentTurns, type AnswerResult } from './mentor-ai';
import { PART_FA, firstName, partOfDay } from './mentor-persona';
import { evaluateBehavior } from './behavior';
import type { ChatMessage, User } from '../domain/types';
import type { Doc } from '../store/types';
import { allBrands } from './catalog-cache';
import { DAY } from '../lib/time';

/**
 * Voice mentor (تماس صوتی) — two transports, one brain:
 *
 *  A) `turn`  — the default and the one that works everywhere with zero extra infrastructure:
 *               the app records one utterance → POST /me/mentor/voice/turn → server does
 *               STT (Groq Whisper, Persian) → grounded answer (same RAG pipeline as chat) →
 *               TTS (Gemini, Persian) → returns text + audio + sources. Barge-in is client-side
 *               (recording stops playback). Latency budget: ~1.2 s STT + ~1.0 s answer + ~1.2 s TTS.
 *
 *  B) `live`  — full duplex via the Gemini Live API. The server mints a single-use ephemeral
 *               token so the browser can open the audio WebSocket **without ever seeing our API
 *               key**, and product facts still arrive only through our `/me/mentor/voice/ground`
 *               tool — the model cannot invent a product claim even if it is jailbroken.
 *
 * Both paths share the guardrails, the quota accounting and the transcript log.
 */

export const voiceTurnSchema = z.object({
  /** Base64 audio of one utterance (webm/opus from MediaRecorder, or m4a/wav). */
  audio: z.string().min(16).max(6_000_000),
  mime: z.string().max(80).default('audio/webm'),
  packageId: z.string().max(80).nullable().optional(),
  /** Seconds of audio sent, used for the voice-minute quota. */
  durationSec: z.number().min(0).max(300).optional(),
  /** Set when the caller already transcribed the turn locally (browser speech recognition). */
  transcript: z.string().max(600).optional(),
});

export const voiceSessionSchema = z.object({
  packageId: z.string().max(80).nullable().optional(),
  /** 'turn' forces the request/response pipeline even when Live is configured. */
  transport: z.enum(['auto', 'turn', 'live']).default('auto'),
});

export const voiceTranscriptSchema = z.object({
  sessionId: z.string().min(4).max(120),
  turns: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        text: z.string().max(2000),
        at: z.string().max(40).optional(),
      }),
    )
    .min(1)
    .max(120),
  durationSec: z.number().min(0).max(3600).optional(),
  /** Consent flag: the caller can opt out of storing the spoken transcript (spec §24). */
  storeTranscript: z.boolean().default(true),
});

export interface VoiceTurnResult {
  /** What the marketer said (server-side STT). */
  transcript: string;
  /** The spoken answer (same text as `answer.reply`). */
  reply: string;
  /** Null when the TTS provider failed — the client then falls back to the browser voice. */
  audio: { base64: string; mime: string; provider: string } | null;
  sources: AnswerResult['sources'];
  outcome: AnswerResult['outcome'];
  nextAction: AnswerResult['nextAction'];
  provider: string;
  latency: { sttMs: number; answerMs: number; ttsMs: number; totalMs: number };
}

/**
 * Vocabulary hint for Whisper: brand + product names the model would otherwise mangle.
 * This single line is the difference between «آیس بابل» and «اس بیبل» in the transcript.
 */
export async function sttVocabulary(d: Deps, limit = 60): Promise<string> {
  const brands = await allBrands(d);
  const products = await d.store.query<{ name: string }>({
    collection: 'products',
    where: [['archived', '==', false]],
    limit: 200,
  });
  const names = [
    ...brands.slice(0, 12).map((b) => b.name),
    ...products.slice(0, limit).map((p) => p.name),
    'سیلانه سبز',
  ];
  return nameList(names, 700);
}

export function nameList(names: string[], maxLen: number): string {
  const out: string[] = [];
  let len = 0;
  for (const n of names) {
    const clean = n.replace(/[«»\n]/g, ' ').trim();
    if (!clean || len + clean.length + 2 > maxLen) continue;
    out.push(clean);
    len += clean.length + 2;
  }
  return `واژه‌های تخصصی: ${out.join('، ')}.`;
}

/** Refuses politely (Persian) when the voice quota is exhausted. */
async function quotaOrThrow(d: Deps, userId: string, seconds: number): Promise<void> {
  const verdict = await consumeVoiceQuota(d, userId, seconds);
  if (verdict === 'ok') return;
  const policy = await getPolicy(d);
  if (verdict === 'disabled') throw new ApiError('FORBIDDEN', 'تماس صوتی فعلاً خاموش است.');
  if (verdict === 'user')
    throw new ApiError(
      'RATE_LIMIT',
      `سقف ${policy.mentorVoiceMinutesPerUser} دقیقه تماس صوتی امروز تمام شد. فردا دوباره تماس بگیر.`,
    );
  throw new ApiError('RATE_LIMIT', 'منتور امروز خیلی شلوغ است. کمی بعد دوباره تلاش کن.');
}

/** Transcribes one utterance with the fastest Persian-capable provider (Groq Whisper). */
export async function transcribeTurn(
  d: Deps,
  input: { base64: string; mime: string; language?: string },
): Promise<{ text: string; provider: string; ms: number }> {
  const hub = aiHub(d);
  const started = Date.now();
  const prompt = await sttVocabulary(d);
  try {
    const run = await hub.transcribe({
      base64: input.base64,
      mime: input.mime,
      language: input.language ?? 'fa',
      prompt,
    });
    return {
      text: normalizeFa(run.value.text),
      provider: `${run.call.provider}:${run.call.model}`,
      ms: Date.now() - started,
    };
  } catch (e) {
    const msg =
      e instanceof AllProvidersFailed ? 'سرویس تبدیل گفتار در دسترس نیست' : (e as Error).message;
    throw new ApiError('INTERNAL', `صدا را متوجه نشدم (${msg}). دوباره بگو یا متن را بنویس.`);
  }
}

/** Synthesises a Persian voice reply; returns null so the client can fall back to its own TTS. */
export async function synthesizeReply(
  d: Deps,
  text: string,
  opts: { voice?: string; style?: string } = {},
): Promise<{ base64: string; mime: string; provider: string; ms: number } | null> {
  const hub = aiHub(d);
  const started = Date.now();
  try {
    const run = await hub.synthesize({
      text: text.slice(0, 900),
      language: 'fa-IR',
      voice: opts.voice,
      style: opts.style ?? 'لحن گرم، دوستانه و آرام یک مربی فروش فارسی‌زبان',
    });
    // Gemini returns raw PCM (`audio/L16;rate=24000`). Browsers and Android cannot play raw PCM,
    // so it is wrapped in a 44-byte WAV header here — one place, every client benefits.
    const wrapped = wrapPcmAsWav(run.value.base64, run.value.mime);
    return {
      base64: wrapped.base64,
      mime: wrapped.mime,
      provider: `${run.call.provider}:${run.call.model}`,
      ms: Date.now() - started,
    };
  } catch (e) {
    const reason = e instanceof AiError ? e.message : (e as Error).message;
    console.warn('[voice] TTS unavailable, client will use the browser voice', reason);
    await track(d, 'mentor_voice_tts_failed', null, { reason: reason.slice(0, 120) });
    return null;
  }
}

/**
 * Wraps raw little-endian 16-bit PCM in a WAV container so any client can play it.
 * Non-PCM payloads (e.g. an mp3 from a future provider) are returned untouched.
 */
export function wrapPcmAsWav(base64: string, mime: string): { base64: string; mime: string } {
  const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);
  if (!/l16|pcm/i.test(mime)) return { base64, mime };
  const pcm = Buffer.from(base64, 'base64');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); // byte rate (16-bit mono)
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return { base64: Buffer.concat([header, pcm]).toString('base64'), mime: 'audio/wav' };
}

/** Transport A: one voice turn end-to-end. */
export async function voiceTurn(
  d: Deps,
  user: Doc<User>,
  input: z.infer<typeof voiceTurnSchema>,
): Promise<VoiceTurnResult> {
  const started = Date.now();
  const policy = await getPolicy(d);
  if (!policy.mentorVoiceEnabled) throw new ApiError('FORBIDDEN', 'تماس صوتی فعلاً خاموش است.');

  // Quota uses the audio length the client reports; a turn is at least 1 second.
  const seconds = Math.max(1, Math.round(input.durationSec ?? 15));
  await quotaOrThrow(d, user.id, seconds);

  let transcript = input.transcript?.trim() ?? '';
  let sttProvider = 'client';
  let sttMs = 0;
  if (!transcript) {
    const stt = await transcribeTurn(d, { base64: input.audio, mime: input.mime });
    transcript = stt.text;
    sttProvider = stt.provider;
    sttMs = stt.ms;
  }
  if (!transcript.trim()) throw new ApiError('VALIDATION', 'چیزی نشنیدم. لطفاً دوباره بگو.');

  const verdict = checkInput(transcript);
  if (!verdict.ok) {
    const reply =
      'من فقط درباره‌ی محتوای آموزش‌ها می‌توانم کمک کنم. سؤال دیگری درباره‌ی محصول داشتی؟';
    const audio = await synthesizeReply(d, reply);
    return {
      transcript,
      reply,
      audio: audio ? { base64: audio.base64, mime: audio.mime, provider: audio.provider } : null,
      sources: [],
      outcome: 'blocked',
      nextAction: null,
      provider: `guardrail+${sttProvider}`,
      latency: { sttMs, answerMs: 0, ttsMs: audio?.ms ?? 0, totalMs: Date.now() - started },
    };
  }

  const [behavior, history] = await Promise.all([
    evaluateBehavior(d, user),
    recentTurns(d, user.id),
  ]);
  const answerStarted = Date.now();
  const answer = await answerQuestion(d, user, {
    question: verdict.text,
    packageId: input.packageId ?? null,
    spoken: true,
    mode: 'voice',
    history,
    behavior,
  });
  const answerMs = Date.now() - answerStarted;

  const tts = await synthesizeReply(d, answer.reply);
  await track(d, 'mentor_voice_turn', user.id, {
    sttProvider,
    answerProvider: answer.provider,
    ttsProvider: tts?.provider ?? 'client-fallback',
    outcome: answer.outcome,
    seconds,
    sttMs,
    answerMs,
    ttsMs: tts?.ms ?? 0,
  });

  return {
    transcript,
    reply: answer.reply,
    audio: tts ? { base64: tts.base64, mime: tts.mime, provider: tts.provider } : null,
    sources: answer.sources,
    outcome: answer.outcome,
    nextAction: answer.nextAction ?? null,
    provider: `${sttProvider} → ${answer.provider} → ${tts?.provider ?? 'browser-tts'}`,
    latency: { sttMs, answerMs, ttsMs: tts?.ms ?? 0, totalMs: Date.now() - started },
  };
}

// ─── Transport B: duplex Live session ───────────────────────────────────────

export interface VoiceSessionOffer {
  transport: 'live' | 'turn';
  sessionId: string;
  /** The voice persona the model must follow (audited server-side after the call). */
  systemInstruction: string;
  /** Present for `live` only. */
  live?: {
    url: string;
    token: string;
    model: string;
    expiresAt: string;
    input: { mime: string; sampleRate: number };
    output: { mime: string; sampleRate: number };
  };
  /** Fallback instructions for `turn` transport. */
  fallback?: { transcribe: string; ground: string; finalize: string };
}

export async function createVoiceSession(
  d: Deps,
  user: Doc<User>,
  input: z.infer<typeof voiceSessionSchema>,
): Promise<VoiceSessionOffer> {
  const policy = await getPolicy(d);
  if (!policy.mentorVoiceEnabled) throw new ApiError('FORBIDDEN', 'تماس صوتی فعلاً خاموش است.');

  const brief = await evaluateBehavior(d, user);
  const sessionId = `${user.id}-${d.clock().getTime().toString(36)}`;
  const systemInstruction = `${prompts.VOICE_SYSTEM}

اسم کاربر: ${firstName(user.name) || 'نامشخص'} — الان ${PART_FA[partOfDay(d.clock())]} است (وقت تهران). اولین جمله‌ات را مثل یک سلام و احوال‌پرسی کوتاه و طبیعی بگو، نه یک معرفی رسمی.
وضعیت فعلی کاربر: ${brief.state.reason}
قدم بعدی پیشنهادی: ${brief.nextAction?.label ?? 'ادامه‌ی آموزش‌های باز'}

ابزارهای تو:
۱) پیش از هر جمله‌ای که عدد، قیمت، ترکیبات یا ادعای محصولی دارد، ابزار ground را با پرسش فارسی صدا بزن و فقط بر اساس خروجی آن حرف بزن.
۲) اگر ابزار چیزی پیدا نکرد، صریح بگو در آموزش نیست و کاربر را به مدیرش ارجاع بده.
۳) اگر کاربر خواست تمرین فروش کند، ابزار startCoach را صدا بزن.

جلسه: ${sessionId}`;

  await d.store.set(`voice_sessions/${sessionId}`, {
    userId: user.id,
    startedAt: d.clock().toISOString(),
    transport: 'pending',
    packageId: input.packageId ?? null,
    status: 'open',
    expireAt: new Date(d.clock().getTime() + 7 * DAY),
  } as unknown as Record<string, unknown>);

  const hub = aiHub(d);
  const wantsLive = input.transport !== 'turn';
  if (wantsLive && policy.mentorChatEnabled && hub.has('realtime')) {
    try {
      const run = await hub.realtime({ systemInstruction, voice: 'Kore' });
      await d.store.update(`voice_sessions/${sessionId}`, { transport: 'live' });
      await track(d, 'mentor_voice_session_started', user.id, { transport: 'live' });
      return {
        transport: 'live',
        sessionId,
        systemInstruction,
        live: {
          url: run.value.url,
          token: run.value.token,
          model: run.value.model,
          expiresAt: run.value.expiresAt,
          input: run.value.input,
          output: run.value.output,
        },
      };
    } catch (e) {
      console.warn(
        '[voice] Live session unavailable, falling back to turn mode',
        (e as Error).message,
      );
    }
  }

  await d.store.update(`voice_sessions/${sessionId}`, { transport: 'turn' });
  await track(d, 'mentor_voice_session_started', user.id, { transport: 'turn' });
  return {
    transport: 'turn',
    sessionId,
    systemInstruction,
    fallback: {
      transcribe: '/v1/me/mentor/voice/turn',
      ground: '/v1/me/mentor/voice/ground',
      finalize: '/v1/me/mentor/voice/transcript',
    },
  };
}

/**
 * Post-call bookkeeping: stores the transcript (optional), extracts the action items the marketer
 * promised to do, and feeds the behaviour engine so the next nudge reflects the call.
 */
export async function finalizeVoiceSession(
  d: Deps,
  user: Doc<User>,
  input: z.infer<typeof voiceTranscriptSchema>,
): Promise<{ stored: boolean; actionItems: string[]; durationSec: number }> {
  const now = d.clock();
  const actionItems = extractActionItems(input.turns.map((t) => t.text).join('\n'));
  const session = await d.store.get<{ startedAt: string }>(`voice_sessions/${input.sessionId}`);
  await d.store.set(
    `voice_sessions/${input.sessionId}`,
    {
      userId: user.id,
      startedAt: session?.startedAt ?? now.toISOString(),
      endedAt: now.toISOString(),
      durationSec: input.durationSec ?? null,
      status: 'closed',
      actionItems,
      turnCount: input.turns.length,
      expireAt: new Date(now.getTime() + 7 * DAY),
    } as unknown as Record<string, unknown>,
    { merge: true },
  );

  let stored = false;
  if (input.storeTranscript) {
    const excerpt = input.turns
      .map((t) => `${t.role === 'user' ? 'کاربر' : 'منتور'}: ${t.text}`)
      .join('\n')
      .slice(0, 6000);
    const id = d.store.newId();
    const msg: ChatMessage = {
      userId: user.id,
      role: 'assistant',
      text: `خلاصه تماس صوتی:\n${excerpt}`,
      packageId: null,
      sources: [],
      outcome: 'answered',
      feedback: null,
      mode: 'voice',
      provider: 'voice-session',
      latencyMs: input.durationSec ? input.durationSec * 1000 : null,
      createdAt: now.toISOString(),
      expireAt: new Date(now.getTime() + 180 * DAY),
    };
    await d.store.set(`chat_messages/${id}`, msg as unknown as Record<string, unknown>);
    stored = true;
  }

  await track(d, 'mentor_voice_session_ended', user.id, {
    durationSec: input.durationSec ?? 0,
    turns: input.turns.length,
    storedTranscript: stored,
    actionItems: actionItems.length,
  });
  return { stored, actionItems, durationSec: input.durationSec ?? 0 };
}

/** Very small Persian intent extractor for "I will do X" statements from the call transcript. */
export function extractActionItems(transcript: string): string[] {
  const out: string[] = [];
  const patterns = [
    /(?:می‌?خوام|میخوام|قراره|باید|قصد دارم|تلاش می‌کنم)\s+([^.\n]{4,80})/g,
    /(?:فردا|امشب|این هفته|هفته بعد)\s+([^.\n]{4,80})/g,
  ];
  for (const re of patterns) {
    for (const m of transcript.matchAll(re)) {
      const item = (m[0] ?? '').replace(/\s+/g, ' ').trim();
      if (item.length >= 8 && !out.includes(item)) out.push(item);
      if (out.length >= 5) return out;
    }
  }
  return out;
}

/** Products referenced in a call — used for the admin quality report. */
export async function productsMentioned(d: Deps, text: string): Promise<string[]> {
  const products = await d.store.query<{ name: string }>({
    collection: 'products',
    where: [['archived', '==', false]],
    limit: 300,
  });
  const names = products.map((p) => p.name);
  const found = names.filter((n) => n.length >= 4 && text.includes(n));
  return found.slice(0, 5);
}
