import { z } from 'zod';
import { ApiError } from '../http/errors';
import { AllProvidersFailed, aiHub } from '../ai/hub';
import {
  DEFAULT_CONSTRAINTS,
  citedFactIds,
  renderGrounding,
  seal,
  type GroundingFact,
  type GroundingPacket,
  type UserContext,
} from '../ai/handoff';
import * as prompts from '../ai/prompts';
import {
  BLOCKED_REPLY,
  MAX_INPUT,
  UNKNOWN_REPLY,
  checkInput,
  checkOutput,
  normalizeFa,
  scrubPii,
} from './mentor';
import { GLOBAL_SCOPE, searchKnowledge, scopeForUser, type RetrievedChunk } from './retrieval';
import type { KnowledgeKind } from './knowledge';
import { getPolicy, track, type Deps } from './context';
import type { ChatMessage, User } from '../domain/types';
import type { Doc } from '../store/types';
import { DAY, dayKey } from '../lib/time';
import { evaluateBehavior } from './behavior';
import {
  PART_FA,
  checkChatOutput,
  classifySocial,
  dropUnsupportedSentences,
  firstName,
  looksUnknown,
  naturalUnknown,
  partOfDay,
  socialFallback,
  type SocialKind,
} from './mentor-persona';

/**
 * Grounded mentor pipeline (the "answer" stage of the AI chain).
 *
 *  question → guardrail → retrieval (hybrid, scoped) → grounding packet → prompt library →
 *  provider router (Gemini ⇄ Groq with failover) → output guard → numeric-claim check →
 *  persist + telemetry
 *
 * Two rules keep the answer quality high:
 *  • Below the retrieval confidence bar we answer «نمی‌دانم» **without calling any model** — the
 *    cheapest way to never hallucinate is not to ask.
 *  • A reply that mentions a number which is not present in the retrieved sources is treated as
 *    unsupported: we re-ask the judge model to rewrite it, and if that fails we fall back to the
 *    deterministic extractive answer built from the approved text.
 */
export interface AnswerOptions {
  question: string;
  packageId?: string | null;
  /** Spoken answers are shorter and skip markdown (they are read by TTS). */
  spoken?: boolean;
  mode?: 'text' | 'voice' | 'coach';
  /** Recent turns (oldest first) used only for tone/continuity, never as a fact source. */
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  /** Skip the extra behaviour lookup when the caller already has it (voice turns). */
  behavior?: Awaited<ReturnType<typeof evaluateBehavior>>;
  /** Persist the exchange into chat_messages (voice transcript endpoint does this once). */
  persist?: boolean;
}

export interface AnswerResult {
  reply: string;
  sources: Array<{
    type: 'package' | 'section' | 'product' | 'brand' | 'faq' | 'play' | 'policy' | 'media';
    id: string;
    title: string;
  }>;
  outcome: 'answered' | 'unknown' | 'blocked' | 'fallback';
  provider: string;
  latencyMs: number;
  /** Ids of the grounding facts the reply actually cited (proves grounding). */
  cited: string[];
  messageId?: string;
  /** Handy for the UI: what the mentor suggests doing right now. */
  nextAction?: { label: string; actionRef: string | null } | null;
}

export const askSchema = z.object({
  text: z.string().min(1, 'سؤال خود را بنویسید.').max(2000),
  packageId: z.string().max(80).nullable().optional(),
  spoken: z.boolean().optional(),
});

export const groundSchema = z.object({
  query: z.string().min(2).max(300),
  packageId: z.string().max(80).nullable().optional(),
});

const MAX_SOURCES = 4;
const ANSWER_KINDS: KnowledgeKind[] = [
  'brand',
  'product',
  'package',
  'section',
  'policy',
  'play',
  'faq',
  'media',
];

function toFact(chunk: RetrievedChunk): GroundingFact {
  const item = chunk.item;
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    text: chunk.snippet,
    ref: item.ref,
    score: chunk.score,
  };
}

function sourceTypeOf(kind: string): AnswerResult['sources'][number]['type'] {
  switch (kind) {
    case 'package':
      return 'package';
    case 'section':
      return 'section';
    case 'product':
      return 'product';
    case 'brand':
      return 'brand';
    case 'faq':
      return 'faq';
    case 'play':
      return 'play';
    case 'policy':
      return 'policy';
    default:
      return 'media';
  }
}

async function saveMessage(
  d: Deps,
  user: Doc<User>,
  role: 'user' | 'assistant',
  text: string,
  extra: Partial<ChatMessage> = {},
): Promise<string> {
  const id = d.store.newId();
  const now = d.clock();
  const msg: ChatMessage = {
    userId: user.id,
    role,
    text,
    packageId: null,
    sources: [],
    outcome: null,
    feedback: null,
    createdAt: new Date(now.getTime() + (role === 'assistant' ? 1 : 0)).toISOString(),
    expireAt: new Date(now.getTime() + 180 * DAY),
    ...extra,
  };
  await d.store.set(`chat_messages/${id}`, msg as unknown as Record<string, unknown>);
  return id;
}

function behaviorContext(
  brief: Awaited<ReturnType<typeof evaluateBehavior>>,
  user: Doc<User>,
): UserContext {
  return {
    userId: user.id,
    displayName: user.name,
    progress: `${brief.state.momentum} · سلامت ${brief.state.health}٪ · فشار مهلت ${brief.state.pressure}٪`,
    state: brief.state.reason,
    nextAction: brief.nextAction?.actionRef ?? null,
  };
}

/**
 * Deterministic numeric-claim check: every number/percentage in the reply must exist in the
 * grounding text. Cheap (no extra model call) and catches the most damaging class of error —
 * an invented price, dosage or percentage.
 */
export function unsupportedNumbers(reply: string, facts: GroundingFact[]): string[] {
  const corpus = normalizeFa(facts.map((f) => `${f.title} ${f.text}`).join(' '));
  const found =
    reply.match(
      /[\d۰-۹]+(?:[.,][\d۰-۹]+)?\s*(?:هزار|میلیون|میلیارد|صد|دویست|پانصد)?\s*(?:٪|%|درصد|تومان|ریال|ساعت|دقیقه|روز|هفته|ماه|سال|گرم|کیلوگرم|میلی‌گرم|میلی‌لیتر|لیتر|عدد|نفر)/g,
    ) ?? [];
  const bad: string[] = [];
  for (const raw of found) {
    const digits = normalizeFa(raw)
      .replace(/[^\d.,]/g, '')
      .replace(/[.,]$/, '');
    if (!digits) continue;
    if (!corpus.includes(digits)) bad.push(raw.trim());
  }
  return bad;
}

/** Retrieval → grounding packet (shared by the chat pipeline and the Live voice tool). */
export async function buildGrounding(
  d: Deps,
  user: Doc<User>,
  opts: { query: string; packageId?: string | null; k?: number },
): Promise<{
  packet: GroundingPacket;
  sources: AnswerResult['sources'];
  strategy: string;
  confident: boolean;
}> {
  const baseScope = await scopeForUser(d, user);
  const scope = opts.packageId
    ? { ...baseScope, packageIds: new Set([...(baseScope.packageIds ?? []), opts.packageId]) }
    : baseScope;
  const result = await searchKnowledge(d, {
    query: opts.query,
    // Quiz stems and options are assessment material, not knowledge: quoting them back as an
    // "answer" confuses learners and leaks quiz content, so they never ground a reply.
    scope: { ...(scope.packageIds ? scope : GLOBAL_SCOPE), kinds: ANSWER_KINDS },
    k: opts.k ?? MAX_SOURCES,
  });
  const facts = result.chunks.map(toFact);
  const sources: AnswerResult['sources'] = result.chunks.map((c) => ({
    type: sourceTypeOf(c.item.kind),
    id: c.item.scope.sectionId ?? c.item.scope.packageId ?? c.item.id,
    title: c.item.title,
  }));
  const packet: GroundingPacket = {
    facts,
    user: null,
    strategy: result.strategy,
    confident: result.confident,
  };
  return { packet, sources, strategy: result.strategy, confident: result.confident };
}

export async function answerQuestion(
  d: Deps,
  user: Doc<User>,
  opts: AnswerOptions,
): Promise<AnswerResult> {
  const started = Date.now();
  const policy = await getPolicy(d);
  const mode = opts.mode ?? (opts.spoken ? 'voice' : 'text');
  const persist = opts.persist !== false;

  if (!policy.mentorChatEnabled)
    throw new ApiError('FORBIDDEN', 'چت منتور فعلاً خاموش است. سؤالت را از مدیر بپرس.');

  const verdict = checkInput(opts.question);
  if (!verdict.ok) {
    const reply =
      verdict.reason === 'too_long'
        ? `سؤال خیلی طولانی است. لطفاً کوتاه‌تر (حداکثر ${MAX_INPUT} نویسه) بپرس.`
        : BLOCKED_REPLY;
    const messageId = persist
      ? await saveMessage(d, user, 'assistant', reply, { outcome: 'blocked', mode })
      : undefined;
    return {
      reply,
      sources: [],
      outcome: 'blocked',
      provider: 'guardrail',
      latencyMs: Date.now() - started,
      cited: [],
      messageId,
      nextAction: null,
    };
  }

  const name = firstName(user.name);
  const part = partOfDay(d.clock());
  const seed = started + verdict.text.length;
  // Read the recent turns *before* saving the new one so the model sees the conversation so far.
  const turns = opts.history ?? (await recentTurns(d, user.id, 8));
  const brief = opts.behavior ?? (await evaluateBehavior(d, user));
  const userCtx = behaviorContext(brief, user);
  const nextAction = brief.nextAction
    ? { label: brief.nextAction.label, actionRef: brief.nextAction.actionRef }
    : null;

  /** Free conversation turn: no retrieval, no facts — a warm, attentive colleague. */
  const converse = async (kind: SocialKind | null): Promise<AnswerResult> => {
    let reply = '';
    let provider = 'fallback-social';
    try {
      const hub = aiHub(d);
      const run = await hub.chat(
        {
          system: prompts.chatSystem({
            name,
            partFa: PART_FA[part],
            continuing: turns.length > 0,
            spoken: !!opts.spoken,
            progress: userCtx.progress,
            nextAction: brief.nextAction?.label ?? '',
          }),
          messages: toMessages(turns),
          prompt: verdict.text,
          maxTokens: opts.spoken ? 140 : 260,
          temperature: 0.8,
        },
        opts.spoken ? { prefer: ['groq' as const, 'gemini' as const, 'legacy' as const] } : {},
      );
      const checked = checkChatOutput(run.value.text, { spoken: !!opts.spoken });
      if (checked.ok) {
        // Only figures from the learner's own status may appear; drop any invented number.
        const own: GroundingFact[] = [
          {
            id: 'self',
            kind: 'user',
            title: '',
            text: `${userCtx.progress} ${nextAction?.label ?? ''}`,
            ref: '',
            score: 1,
          },
        ];
        reply = dropUnsupportedSentences(checked.text, (sn) => unsupportedNumbers(sn, own));
        provider = `${run.call.provider}:${run.call.model}`;
        await track(d, 'mentor_ai_call', user.id, {
          task: 'chat',
          provider: run.call.provider,
          model: run.call.model,
          latencyMs: run.call.latencyMs,
          approxTokens: run.value.approxTokens,
          mode,
          conversational: true,
        });
      }
    } catch (e) {
      console.warn('[mentor-ai] conversational reply failed', (e as Error).message);
    }
    if (!reply)
      reply = socialFallback(kind ?? 'ack', {
        name,
        part,
        seed,
        nextActionLabel: nextAction?.label ?? null,
      });
    const messageId = persist
      ? await saveMessage(d, user, 'assistant', reply, {
          outcome: 'answered',
          mode,
          provider,
          latencyMs: Date.now() - started,
        })
      : undefined;
    await track(d, 'mentor_ai_answer', user.id, {
      outcome: 'answered',
      provider,
      strategy: 'conversation',
      latencyMs: Date.now() - started,
      spoken: !!opts.spoken,
    });
    return {
      reply,
      sources: [],
      outcome: 'answered',
      provider,
      latencyMs: Date.now() - started,
      cited: [],
      messageId,
      nextAction: kind === 'progress' ? nextAction : null,
    };
  };

  const saveUserTurn = async () => {
    if (persist)
      await saveMessage(d, user, 'user', scrubPii(verdict.text), {
        packageId: opts.packageId ?? null,
        mode,
      });
    await track(d, 'mentor_message_sent', user.id, { mode, packageId: opts.packageId ?? null });
  };

  // ── Small talk (greeting, thanks, feelings, "what now?") never needs the knowledge base ──
  const social = classifySocial(verdict.text);
  if (social) {
    await saveUserTurn();
    return converse(social);
  }

  const { packet, sources, confident } = await buildGrounding(d, user, {
    query: verdict.text,
    packageId: opts.packageId ?? null,
  });
  packet.user = userCtx;
  await saveUserTurn();

  // ── Below the confidence bar: never guess. Chit-chat still gets a human answer; real
  //    company questions get an honest, natural "I don't have that" without any model text. ──
  if (!confident) {
    if (await isChitChat(d, verdict.text)) return converse(null);
    const reply = naturalUnknown({ name, hintTitle: sources[0]?.title, seed });
    const messageId = persist
      ? await saveMessage(d, user, 'assistant', reply, {
          outcome: 'unknown',
          mode,
          provider: 'retrieval',
        })
      : undefined;
    await track(d, 'mentor_ai_answer', user.id, {
      outcome: 'unknown',
      strategy: packet.strategy,
      questionChars: verdict.text.length,
    });
    return {
      reply,
      sources: [],
      outcome: 'unknown',
      provider: 'retrieval',
      latencyMs: Date.now() - started,
      cited: [],
      messageId,
      nextAction,
    };
  }

  const grounding = renderGrounding(packet);
  const history = turns
    .slice(-6)
    .map((h) => `${h.role === 'user' ? 'کاربر' : 'منتور'}: ${h.text.slice(0, 240)}`)
    .join('\n');
  const constraints = { ...DEFAULT_CONSTRAINTS, maxSentences: 4, spoken: !!opts.spoken };
  const envelope = seal({
    traceId: `${user.id}-${started}`,
    stage: 'answer',
    createdBy: 'retrieval:hybrid',
    grounding: packet,
    payload: { question: verdict.text },
    constraints,
    confidence: packet.facts[0]?.score ?? 0,
    consumers: ['gemini', 'groq'],
  });

  const hub = aiHub(d);
  const system = opts.spoken ? prompts.VOICE_SYSTEM : prompts.answerSystem(constraints);
  const prompt = opts.spoken
    ? prompts.voiceAnswerPrompt({
        grounding,
        userContext: packet.user?.progress ?? '',
        history,
        question: envelope.payload.question,
      })
    : prompts.answerPrompt({
        grounding,
        userContext: packet.user?.progress ?? '',
        history,
        question: envelope.payload.question,
      });

  let reply: string;
  let provider = 'none';
  let rawReply = '';
  try {
    // Voice turns prefer Groq's low-latency lane; text answers prefer Gemini's long context.
    const runOptions = opts.spoken
      ? { prefer: ['groq' as const, 'gemini' as const, 'legacy' as const] }
      : {};
    const run = await hub.chat(
      {
        system,
        prompt,
        maxTokens: opts.spoken ? 170 : 380,
        temperature: opts.spoken ? 0.45 : 0.35,
      },
      runOptions,
    );
    rawReply = run.value.text;
    provider = `${run.call.provider}:${run.call.model}`;
    await track(d, 'mentor_ai_call', user.id, {
      task: 'chat',
      provider: run.call.provider,
      model: run.call.model,
      latencyMs: run.call.latencyMs,
      approxTokens: run.value.approxTokens,
      fallbackFrom: run.call.fallbackFrom ?? null,
      mode,
    });
  } catch (e) {
    const error = e instanceof AllProvidersFailed ? 'all-providers-failed' : (e as Error).message;
    console.warn('[mentor-ai] answer failed', error);
    reply = extractiveReply(packet);
    const fallbackId = persist
      ? await saveMessage(d, user, 'assistant', reply, {
          outcome: 'fallback',
          sources,
          mode,
          provider: 'fallback',
        })
      : undefined;
    await track(d, 'mentor_ai_answer', user.id, { outcome: 'fallback', error, mode });
    return {
      reply,
      sources,
      outcome: 'fallback',
      provider: 'fallback',
      latencyMs: Date.now() - started,
      cited: [],
      messageId: fallbackId,
      nextAction,
    };
  }

  // ── Output guardrails ─────────────────────────────────────────────────────
  const guard = checkChatOutput(rawReply, { spoken: !!opts.spoken, keepCitations: true });
  let finalText = guard.ok ? guard.text : '';
  const saidUnknown =
    !!finalText && looksUnknown(finalText) && citedFactIds(finalText, packet.facts).length === 0;
  if (!finalText || saidUnknown) {
    reply = saidUnknown
      ? naturalUnknown({ name, hintTitle: sources[0]?.title, seed })
      : extractiveReply(packet);
    const guardedId = persist
      ? await saveMessage(d, user, 'assistant', reply, {
          outcome: saidUnknown ? 'unknown' : 'fallback',
          sources,
          mode,
          provider,
        })
      : undefined;
    return {
      reply,
      sources: saidUnknown ? [] : sources,
      outcome: saidUnknown ? 'unknown' : 'fallback',
      provider,
      latencyMs: Date.now() - started,
      cited: [],
      messageId: guardedId,
      nextAction,
    };
  }

  // Numeric claims must exist in the sources (deterministic hallucination catch).
  const bad = unsupportedNumbers(finalText, packet.facts);
  if (bad.length) {
    const verified = await verifyNumbers(d, packet, finalText, bad);
    if (verified) finalText = verified;
    else {
      finalText = extractiveReply(packet);
      provider = `${provider}|verified-extractive`;
    }
  }

  const cited = citedFactIds(finalText, packet.facts);
  const usedSources = cited.length
    ? sources.filter((_, idx) => cited.includes(packet.facts[idx]?.id ?? ''))
    : sources.slice(0, 2);
  // Citation markers are for the system; the learner sees sources as chips under the message.
  finalText = finalText.replace(/\s*\[[\d۰-۹]+\]/g, '').trim();

  const messageId = persist
    ? await saveMessage(d, user, 'assistant', finalText, {
        outcome: 'answered',
        sources: usedSources,
        mode,
        packageId: opts.packageId ?? null,
        provider,
        latencyMs: Date.now() - started,
      })
    : undefined;

  await track(d, 'mentor_ai_answer', user.id, {
    outcome: 'answered',
    provider,
    strategy: packet.strategy,
    cited: cited.length,
    sources: usedSources.length,
    latencyMs: Date.now() - started,
    spoken: !!opts.spoken,
  });

  return {
    reply: finalText,
    sources: usedSources,
    outcome: 'answered',
    provider,
    latencyMs: Date.now() - started,
    cited,
    messageId,
    nextAction,
  };
}

/** Deterministic fallback built from approved text (never generated). */
export function extractiveReply(packet: GroundingPacket, max = 2): string {
  const sentences = packet.facts
    .flatMap((f) => f.text.split(/(?<=[.!؟?])\s+/))
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 20 && !/[؟?]$/.test(s))
    .slice(0, max);
  if (!sentences.length) return UNKNOWN_REPLY;
  const title = packet.facts[0]?.title ?? '';
  return scrubPii(`طبق محتوای آموزش: ${sentences.join(' ')}${title ? ` (منبع: ${title})` : ''}`);
}

/** Asks the judge model to rewrite (or drop) unsupported numeric claims, quoting sources only. */
async function verifyNumbers(
  d: Deps,
  packet: GroundingPacket,
  reply: string,
  bad: string[],
): Promise<string | null> {
  const hub = aiHub(d);
  try {
    const run = await hub.chat(
      {
        system: prompts.JUDGE_SYSTEM,
        prompt: `منابع:\n${renderGrounding(packet, 400)}\n\nپاسخ پیشنهادی: ${reply}\n\nاعداد مشکوک: ${bad.join('، ')}\n\nپاسخ را طوری بازنویسی کن که فقط ادعاهای موجود در منابع باقی بماند و اعداد بدون منبع حذف شوند. اگر کل پاسخ بی‌پشتوانه است فقط بنویس: نمی‌دانم.`,
        maxTokens: 220,
        temperature: 0,
      },
      { prefer: ['groq', 'gemini', 'legacy'] },
    );
    const text = checkOutput(run.value.text);
    if (!text.ok) return null;
    if (/نمی[\s‌]?دانم/.test(text.text)) return null;
    return unsupportedNumbers(text.text, packet.facts).length ? null : text.text;
  } catch {
    return null;
  }
}

/**
 * Voice grounding tool — the Live API calls this from the browser between turns. The model can
 * never invent product facts because the *only* way it gets product facts is this server call.
 */
export async function groundForVoice(
  d: Deps,
  user: Doc<User>,
  input: z.infer<typeof groundSchema>,
): Promise<{ answer: string; sources: AnswerResult['sources']; confident: boolean }> {
  const { packet, sources, confident } = await buildGrounding(d, user, {
    query: input.query,
    packageId: input.packageId ?? null,
    k: 3,
  });
  if (!confident)
    return {
      answer:
        'در محتوای تأییدشده چیزی برای این پرسش پیدا نشد؛ صریح بگو نمی‌دانم و کاربر را به مدیرش ارجاع بده.',
      sources: [],
      confident: false,
    };
  return {
    answer: renderGrounding(packet, 500),
    sources,
    confident: true,
  };
}

// ─── Sales coaching (role-play) ─────────────────────────────────────────────

export const coachStartSchema = z.object({
  /** Optional: focus the drill on one product/brand. */
  packageId: z.string().max(80).nullable().optional(),
  objection: z.string().max(200).optional(),
  mood: z.enum(['مردد', 'بی‌حوصله', 'عجول', 'شکاک', 'دلسرد', 'بی‌اطلاع']).optional(),
  customerType: z.string().max(80).optional(),
});

export const coachPersonaSchema = z.object({
  id: z.string().max(120).default(''),
  name: z.string().max(80),
  type: z.string().max(80),
  mood: z.string().max(40),
  objection: z.string().max(200),
  productName: z.string().max(120),
  packageId: z.string().max(80).nullable().optional(),
});

export interface CoachPersona {
  id: string;
  name: string;
  type: string;
  mood: string;
  objection: string;
  productName: string;
  packageId?: string | null;
}

export const coachTurnSchema = z.object({
  persona: coachPersonaSchema,
  message: z.string().min(1).max(1500),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(1500) }))
    .max(30)
    .default([]),
});

const CUSTOMER_NAMES = ['آقای رضایی', 'خانم موسوی', 'آقای کاظمی', 'خانم شریفی', 'آقای نوری'];
const CUSTOMER_TYPES = [
  'داروخانه‌دار',
  'فروشگاه لوازم آرایشی',
  'پخش‌کننده',
  'سالن زیبایی',
  'مشتری نهایی',
];

/** Picks a persona from the marketer's weakest area — coaching follows the gap analysis. */
export async function pickPersona(
  d: Deps,
  user: Doc<User>,
  input: z.infer<typeof coachStartSchema>,
): Promise<CoachPersona> {
  const brief = await evaluateBehavior(d, user);
  const weak = brief.signals.mastery[0];
  const seed = Number.parseInt(user.id.replace(/\D/g, '').slice(-4) || '7', 10);
  const objection =
    input.objection ??
    [
      'قیمت بالاست',
      'این محصول را نمی‌شناسم',
      'مشتری‌ها راضی نبودند',
      'رقیب ارزان‌تر دارد',
      'اینجا فروش نمی‌رود',
    ][seed % 5] ??
    'قیمت بالاست';
  return {
    id: `${user.id}-${Date.now().toString(36)}`,
    name: CUSTOMER_NAMES[seed % CUSTOMER_NAMES.length] ?? 'آقای رضایی',
    type: input.customerType ?? CUSTOMER_TYPES[seed % CUSTOMER_TYPES.length] ?? 'داروخانه‌دار',
    mood: input.mood ?? (brief.state.momentum === 'at_risk' ? 'بی‌حوصله' : 'مردد'),
    objection,
    productName: weak?.label ?? 'محصول پرفروش',
    packageId: input.packageId ?? null,
  };
}

export async function coachTurn(
  d: Deps,
  user: Doc<User>,
  opts: z.infer<typeof coachTurnSchema>,
): Promise<{ reply: string; provider: string }> {
  const { packet } = await buildGrounding(d, user, {
    query: `${opts.persona.productName} ${opts.persona.objection}`,
    packageId: opts.persona.packageId,
    k: 3,
  });
  const system = prompts.coachSystem({
    name: opts.persona.name,
    type: opts.persona.type,
    mood: opts.persona.mood,
    objection: opts.persona.objection,
    productName: opts.persona.productName,
  });
  const prompt = `<context>\n${renderGrounding(packet, 500)}\n</context>\n\nگفت‌وگو تا اینجا:\n${opts.history
    .slice(-6)
    .map((h) => `${h.role === 'user' ? 'بازاریاب' : 'مشتری'}: ${h.text}`)
    .join('\n')}\n\nبازاریاب: ${opts.message}\nمشتری:`;
  const hub = aiHub(d);
  try {
    const run = await hub.chat({ system, prompt, maxTokens: 160, temperature: 0.6 });
    return {
      reply: cleanSpoken(run.value.text),
      provider: `${run.call.provider}:${run.call.model}`,
    };
  } catch {
    return {
      reply: 'متوجه نشدم. می‌شود ساده‌تر توضیح بدهید که چرا این محصول برای من مناسب است؟',
      provider: 'fallback',
    };
  }
}

export const coachDebriefSchema = z.object({
  persona: coachPersonaSchema,
  turns: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(1500) }))
    .min(2)
    .max(40),
});

export interface CoachScorecard {
  score: number;
  listening: number;
  productAccuracy: number;
  objectionHandling: number;
  closing: number;
  strengths: string[];
  fixes: string[];
  nextDrill: string;
  provider: string;
}

export async function coachDebrief(
  d: Deps,
  user: Doc<User>,
  input: z.infer<typeof coachDebriefSchema>,
): Promise<CoachScorecard> {
  const { packet } = await buildGrounding(d, user, {
    query: `${input.persona.productName} ${input.persona.objection}`,
    packageId: input.persona.packageId ?? null,
    k: 3,
  });
  const transcript = input.turns
    .map((t) => `${t.role === 'user' ? 'بازاریاب' : 'مشتری'}: ${t.text}`)
    .join('\n');
  const hub = aiHub(d);
  const fallback: CoachScorecard = {
    score: 60,
    listening: 60,
    productAccuracy: 60,
    objectionHandling: 60,
    closing: 60,
    strengths: ['تمرین را تا آخر ادامه دادی'],
    fixes: ['روی پلی فروش همین اعتراض یک دور دیگر تمرین کن'],
    nextDrill: `اعتراض «${input.persona.objection}» را با یک جمله‌ی همدلی شروع کن و با عدد تمام کن.`,
    provider: 'fallback',
  };
  try {
    const run = await hub.chat({
      system: prompts.COACH_DEBRIEF_SYSTEM,
      prompt: `<context>\n${renderGrounding(packet, 400)}\n</context>\n\nمشتری: ${input.persona.name} (${input.persona.type}) — اعتراض اصلی: ${input.persona.objection}\n\n${transcript}\n\nکارنامه (JSON):`,
      maxTokens: 400,
      temperature: 0.2,
      json: true,
    });
    const parsed = scorecardSchema.safeParse(parseJsonLoose(run.value.text));
    if (!parsed.success) return { ...fallback, provider: `${run.call.provider}:${run.call.model}` };
    return { ...parsed.data, provider: `${run.call.provider}:${run.call.model}` };
  } catch {
    return fallback;
  }
}

const score0to100 = z.number().min(0).max(100);
const scorecardSchema = z.object({
  score: score0to100,
  listening: score0to100,
  productAccuracy: score0to100,
  objectionHandling: score0to100,
  closing: score0to100,
  strengths: z.array(z.string().max(200)).max(4),
  fixes: z.array(z.string().max(300)).max(4),
  nextDrill: z.string().max(300),
});

/** Light cleanup for role-play lines (no "I don't know" normalisation — the customer never cites sources). */
function cleanSpoken(raw: string, max = 400): string {
  const text = raw
    .replace(/[*#`_>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return text.length >= 8 ? text : 'ببخشید، متوجه نشدم. می‌شود ساده‌تر توضیح بدهید؟';
}

/** Models sometimes wrap JSON in prose or code fences — unwrap before validating. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Intent classification (fast lane) used for routing, telemetry and off-topic deflection. */
export async function classifyIntent(
  d: Deps,
  question: string,
): Promise<{
  intent: string;
  needsKb: boolean;
  topics: string[];
  sentiment: string;
  provider: string;
}> {
  const hub = aiHub(d);
  const ruleFallback = {
    intent: 'product_fact',
    needsKb: true,
    topics: [] as string[],
    sentiment: 'neutral',
    provider: 'rules',
  };
  try {
    const run = await hub.classify({
      system: prompts.CLASSIFY_SYSTEM,
      prompt: question.slice(0, 400),
      maxTokens: 120,
      temperature: 0,
      json: true,
    });
    const parsed = z
      .object({
        intent: z.string().max(40),
        needsKb: z.boolean(),
        topics: z.array(z.string().max(60)).max(6).default([]),
        sentiment: z.string().max(20),
      })
      .safeParse(parseJsonLoose(run.value.text));
    if (!parsed.success) return ruleFallback;
    return { ...parsed.data, provider: `${run.call.provider}:${run.call.model}` };
  } catch {
    return ruleFallback;
  }
}

/** Voice minute accounting (policy-driven, per user and globally, per Tehran day). */
export async function consumeVoiceQuota(
  d: Deps,
  userId: string,
  seconds: number,
): Promise<'ok' | 'user' | 'global' | 'disabled'> {
  const policy = await getPolicy(d);
  if (!policy.mentorVoiceEnabled) return 'disabled';
  const day = dayKey(d.clock(), policy.timezone);
  const minutes = Math.max(1, Math.round(seconds / 60));
  const result = await d.store.runTransaction(async (tx) => {
    const g = await tx.get<{ minutes: number }>(`mentor_voice_usage/${day}`);
    const u = await tx.get<{ minutes: number }>(`mentor_voice_usage/${day}_${userId}`);
    if ((u?.minutes ?? 0) >= policy.mentorVoiceMinutesPerUser) return 'user' as const;
    if ((g?.minutes ?? 0) >= policy.mentorVoiceMinutesGlobal) return 'global' as const;
    tx.set(
      `mentor_voice_usage/${day}`,
      { minutes: (g?.minutes ?? 0) + minutes, day },
      { merge: true },
    );
    tx.set(
      `mentor_voice_usage/${day}_${userId}`,
      { minutes: (u?.minutes ?? 0) + minutes, day, userId },
      { merge: true },
    );
    return 'ok' as const;
  });
  return result;
}

/** Recent turns used as tone context (never as a fact source). */
export async function recentTurns(
  d: Deps,
  userId: string,
  limit = 4,
): Promise<Array<{ role: 'user' | 'assistant'; text: string }>> {
  const rows = await d.store.query<ChatMessage>({
    collection: 'chat_messages',
    where: [['userId', '==', userId]],
    orderBy: [['createdAt', 'desc']],
    limit,
  });
  return rows
    .slice()
    .reverse()
    .map((m) => ({ role: m.role, text: m.text }));
}

/** Conversation turns → provider messages (starts with a user turn, roles alternate). */
function toMessages(
  turns: Array<{ role: 'user' | 'assistant'; text: string }>,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const t of turns.slice(-8)) {
    const content = t.text.slice(0, 400);
    if (!content) continue;
    const last = out[out.length - 1];
    if (!out.length && t.role === 'assistant') continue;
    if (last && last.role === t.role) last.content = `${last.content}\n${content}`;
    else out.push({ role: t.role, content });
  }
  return out;
}

/** Cheap classifier: is this message small talk rather than a company-knowledge question? */
async function isChitChat(d: Deps, text: string): Promise<boolean> {
  try {
    const run = await aiHub(d).classify(
      {
        system: prompts.CLASSIFY_SYSTEM,
        prompt: `پیام کاربر: ${text}`,
        maxTokens: 80,
        temperature: 0,
        json: true,
      },
      { prefer: ['groq', 'gemini', 'legacy'] },
    );
    const m = /\{[\s\S]*\}/.exec(run.value.text);
    if (!m) return false;
    const parsed = JSON.parse(m[0]) as { intent?: string };
    return parsed.intent === 'smalltalk';
  } catch {
    return false;
  }
}
