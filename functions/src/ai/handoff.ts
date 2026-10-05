import { z } from 'zod';

/**
 * AI↔AI hand-off contract.
 *
 * The failure mode of multi-model pipelines is *telephone-game drift*: model B paraphrases model A,
 * the paraphrase drops a number, and the final answer contradicts the approved content. We avoid it
 * with one rule:
 *
 *   **Models never exchange free text. They exchange a sealed envelope that always carries the
 *   original, verbatim grounding facts forward — and the orchestrator re-sends that grounding to
 *   every stage that generates user-visible text.**
 *
 * So the "hand-off" between (say) Gemini the image extractor and Groq the voice answerer contains
 * the *source sentences*, not Gemini's summary of them. Each stage adds its own typed payload
 * (transcript, labels, draft) plus provenance, and can only ever *narrow* the facts (a `consumers`
 * field), never invent new ones.
 */
export const ENVELOPE_VERSION = 1 as const;

export interface GroundingFact {
  /** Knowledge item id (`product:p123`, `section:s9`, …) — always traceable to the CMS. */
  id: string;
  kind: string;
  title: string;
  /** Verbatim text from the approved source. Never model-generated. */
  text: string;
  /** Deep-link the app can open so the marketer sees the source. */
  ref: string;
  score: number;
}

export interface UserContext {
  userId: string;
  displayName: string;
  /** Progress sentence, e.g. «آموزش پوست خشک: ۴۰٪». */
  progress: string;
  /** Current behaviour state from the behaviour engine (see services/behavior.ts). */
  state: string;
  nextAction: string | null;
}

export interface GroundingPacket {
  facts: GroundingFact[];
  user: UserContext | null;
  /** Retrieval strategy that produced the facts (audited for quality). */
  strategy: 'hybrid-kw-vector' | 'keyword-only' | 'exact';
  /** Below-threshold retrieval must answer «نمی‌دانم» instead of guessing. */
  confident: boolean;
}

export interface EnvelopeConstraints {
  locale: 'fa-IR';
  maxSentences: number;
  /** Hard ban list kept in code (not only in the prompt) — see guardrails. */
  noPii: true;
  noAnswerKeys: true;
  /** Spoken tone for TTS turns (shorter, no markdown). */
  spoken: boolean;
}

export interface AiEnvelope<T = unknown> {
  v: typeof ENVELOPE_VERSION;
  traceId: string;
  /** Pipeline stage that produced `payload`. */
  stage: 'ingest' | 'retrieve' | 'classify' | 'answer' | 'voice' | 'coach' | 'behavior' | 'judge';
  createdBy: string;
  createdAt: string;
  grounding: GroundingPacket;
  constraints: EnvelopeConstraints;
  payload: T;
  confidence: number;
  /** Providers that may still read this envelope (least privilege for multi-vendor pipelines). */
  consumers: string[];
}

export const DEFAULT_CONSTRAINTS: EnvelopeConstraints = {
  locale: 'fa-IR',
  maxSentences: 3,
  noPii: true,
  noAnswerKeys: true,
  spoken: false,
};

export function seal<T>(
  input: Pick<AiEnvelope<T>, 'traceId' | 'stage' | 'createdBy' | 'grounding' | 'payload'> &
    Partial<Pick<AiEnvelope<T>, 'confidence' | 'consumers' | 'constraints'>>,
  now: Date = new Date(),
): AiEnvelope<T> {
  return {
    v: ENVELOPE_VERSION,
    traceId: input.traceId,
    stage: input.stage,
    createdBy: input.createdBy,
    createdAt: now.toISOString(),
    grounding: input.grounding,
    constraints: input.constraints ?? DEFAULT_CONSTRAINTS,
    payload: input.payload,
    confidence: input.confidence ?? (input.grounding.confident ? 0.8 : 0.2),
    consumers: input.consumers ?? [],
  };
}

/** The next stage inherits provenance and constraints verbatim; only `payload`/`stage` change. */
export function nextStage<P, T>(
  env: AiEnvelope<P>,
  input: { stage: AiEnvelope<T>['stage']; createdBy: string; payload: T; confidence?: number },
  now: Date = new Date(),
): AiEnvelope<T> {
  return seal(
    {
      traceId: env.traceId,
      stage: input.stage,
      createdBy: input.createdBy,
      grounding: env.grounding,
      constraints: env.constraints,
      payload: input.payload,
      confidence: input.confidence ?? env.confidence,
      consumers: env.consumers,
    },
    now,
  );
}

const factSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  title: z.string(),
  text: z.string(),
  ref: z.string(),
  score: z.number(),
});

export const envelopeSchema = z.object({
  v: z.literal(ENVELOPE_VERSION),
  traceId: z.string().min(1),
  stage: z.enum([
    'ingest',
    'retrieve',
    'classify',
    'answer',
    'voice',
    'coach',
    'behavior',
    'judge',
  ]),
  createdBy: z.string().min(1),
  createdAt: z.string(),
  grounding: z.object({
    facts: z.array(factSchema).max(50),
    user: z
      .object({
        userId: z.string(),
        displayName: z.string(),
        progress: z.string(),
        state: z.string(),
        nextAction: z.string().nullable(),
      })
      .nullable(),
    strategy: z.enum(['hybrid-kw-vector', 'keyword-only', 'exact']),
    confident: z.boolean(),
  }),
  constraints: z.object({
    locale: z.literal('fa-IR'),
    maxSentences: z.number().int().min(1).max(80),
    noPii: z.literal(true),
    noAnswerKeys: z.literal(true),
    spoken: z.boolean(),
  }),
  payload: z.unknown(),
  confidence: z.number().min(0).max(1),
  consumers: z.array(z.string()),
});

/**
 * Validated crossing point between stages. Anything that comes back from a model is re-validated
 * here before a downstream model is allowed to read it.
 */
export function openEnvelope(raw: unknown): AiEnvelope {
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) throw new Error('پاکت داده‌ای بین مدل‌ها نامعتبر است.');
  return parsed.data as AiEnvelope;
}

/**
 * Renders the grounding packet for a prompt. Facts are quoted with their source title so the model
 * can cite them and so the output guard can verify every claim against `[n]`.
 */
export function renderGrounding(packet: GroundingPacket, maxCharsPerFact = 900): string {
  if (!packet.facts.length) return '(هیچ منبع تأییدشده‌ای پیدا نشد)';
  return packet.facts
    .map((f, i) => {
      // Behaviour boxes are the source of truth. Flattening them into one line, or cutting them
      // at 900–1600 characters, drops the approved product document before the model ever sees it.
      const guide = f.kind === 'guide';
      const cap = guide
        ? Math.max(maxCharsPerFact, maxCharsPerFact >= 1000 ? 40_000 : 6_000)
        : maxCharsPerFact;
      const text = guide
        ? f.text
            .replace(/[ \t\u00a0]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
            .slice(0, cap)
        : f.text.replace(/\s+/g, ' ').trim().slice(0, cap);
      return `[${i + 1}] (${f.kind}) ${f.title}\n«${text}»`;
    })
    .join('\n\n');
}

/** Ids of the facts a reply actually cited — used to prove grounding, not to trust the model. */
export function citedFactIds(reply: string, facts: GroundingFact[]): string[] {
  const used: string[] = [];
  // Models answer in Persian, so markers usually look like [۱]; accept both digit sets.
  for (const m of reply.matchAll(/\[([\d۰-۹]+)\]/g)) {
    const latin = (m[1] ?? '').replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
    const idx = Number(latin) - 1;
    const fact = facts[idx];
    if (fact && !used.includes(fact.id)) used.push(fact.id);
  }
  return used;
}
