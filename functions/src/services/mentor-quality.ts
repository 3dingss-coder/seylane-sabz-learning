import type { Doc } from '../store/types';
import { aiHub } from '../ai/hub';
import { DAY } from '../lib/time';
import { track, type Deps } from './context';
import { knowledgeStats } from './knowledge';

/**
 * AI quality dashboard (admin).
 *
 * Answers "is the assistant actually good?" with numbers instead of vibes:
 *  • outcome mix (answered / unknown / blocked / fallback) — the honest accuracy proxy,
 *  • provider utilisation + how often we failed over (a rising failover rate means a vendor is
 *    degrading long before users complain),
 *  • latency per stage of a voice turn (STT / answer / TTS),
 *  • 👍/👎 satisfaction and the knowledge index health.
 */
export interface AiQualityReport {
  days: number;
  answers: {
    total: number;
    answered: number;
    unknown: number;
    blocked: number;
    fallback: number;
    unknownRate: number | null;
    avgLatencyMs: number | null;
    spoken: number;
  };
  providers: Array<{
    provider: string;
    calls: number;
    failovers: number;
    avgLatencyMs: number | null;
  }>;
  voice: {
    turns: number;
    sessions: number;
    minutes: number;
    avgSttMs: number | null;
    avgAnswerMs: number | null;
    avgTtsMs: number | null;
    ttsFallback: number;
  };
  behavior: {
    interventions: number;
    byRule: Record<string, number>;
    escalations: number;
  };
  satisfaction: { up: number; down: number; score: number | null };
  knowledge: {
    live: number;
    embedded: number;
    builtAt: string | null;
    embeddingProvider: string | null;
  };
  /** What each configured provider can do right now (empty = running without any API key). */
  health: ReturnType<ReturnType<typeof aiHub>['describe']>;
}

interface EventDoc {
  name: string;
  userId: string | null;
  props: Record<string, unknown>;
  ts: string;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function avg(list: number[]): number | null {
  return list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null;
}

export async function aiQualityReport(d: Deps, days = 30): Promise<AiQualityReport> {
  const since = new Date(d.clock().getTime() - days * DAY).toISOString();
  const names = [
    'mentor_ai_answer',
    'mentor_ai_call',
    'mentor_voice_turn',
    'mentor_voice_session_started',
    'mentor_voice_session_ended',
    'mentor_voice_tts_failed',
    'mentor_intervention_planned',
    'mentor_escalated_to_manager',
    'mentor_feedback',
  ];
  const events: Array<Doc<EventDoc>> = [];
  for (const name of names) {
    const rows = await d.store.query<EventDoc>({
      collection: 'analytics_events',
      where: [
        ['name', '==', name],
        ['ts', '>=', since],
      ],
      limit: 5000,
    });
    events.push(...rows);
  }

  const byName = (name: string) => events.filter((e) => e.name === name);
  const answers = byName('mentor_ai_answer');
  const outcomes = { answered: 0, unknown: 0, blocked: 0, fallback: 0 };
  const latencies: number[] = [];
  let spoken = 0;
  for (const a of answers) {
    const outcome = String(a.props.outcome ?? '');
    if (outcome in outcomes) outcomes[outcome as keyof typeof outcomes]++;
    const lat = num(a.props.latencyMs);
    if (lat !== null) latencies.push(lat);
    if (a.props.spoken === true) spoken++;
  }

  const providerMap = new Map<string, { calls: number; failovers: number; latencies: number[] }>();
  for (const call of byName('mentor_ai_call')) {
    const key = String(call.props.provider ?? 'unknown');
    const entry = providerMap.get(key) ?? { calls: 0, failovers: 0, latencies: [] };
    entry.calls++;
    if (call.props.fallbackFrom) entry.failovers++;
    const lat = num(call.props.latencyMs);
    if (lat !== null) entry.latencies.push(lat);
    providerMap.set(key, entry);
  }

  const turns = byName('mentor_voice_turn');
  const sttMs: number[] = [];
  const answerMs: number[] = [];
  const ttsMs: number[] = [];
  let ttsFallback = 0;
  for (const t of turns) {
    const s = num(t.props.sttMs);
    const a = num(t.props.answerMs);
    const v = num(t.props.ttsMs);
    if (s !== null) sttMs.push(s);
    if (a !== null) answerMs.push(a);
    if (v !== null) ttsMs.push(v);
    if (String(t.props.ttsProvider ?? '').includes('client-fallback')) ttsFallback++;
  }
  ttsFallback += byName('mentor_voice_tts_failed').length;

  const interventions = byName('mentor_intervention_planned');
  const byRule: Record<string, number> = {};
  for (const iv of interventions) {
    const rule = String(iv.props.ruleId ?? '?');
    byRule[rule] = (byRule[rule] ?? 0) + 1;
  }

  const feedback = byName('mentor_feedback');
  const up = feedback.filter((f) => f.props.feedback === 'up').length;
  const down = feedback.filter((f) => f.props.feedback === 'down').length;

  const minutes = byName('mentor_voice_session_ended').reduce(
    (sum, e) => sum + (num(e.props.durationSec) ?? 0) / 60,
    0,
  );
  const knowledge = await knowledgeStats(d);

  const total = answers.length;
  return {
    days,
    answers: {
      total,
      ...outcomes,
      unknownRate: total ? Number(((outcomes.unknown / total) * 100).toFixed(1)) : null,
      avgLatencyMs: avg(latencies),
      spoken,
    },
    providers: [...providerMap.entries()]
      .map(([provider, v]) => ({
        provider,
        calls: v.calls,
        failovers: v.failovers,
        avgLatencyMs: avg(v.latencies),
      }))
      .sort((a, b) => b.calls - a.calls),
    voice: {
      turns: turns.length,
      sessions: byName('mentor_voice_session_started').length,
      minutes: Math.round(minutes),
      avgSttMs: avg(sttMs),
      avgAnswerMs: avg(answerMs),
      avgTtsMs: avg(ttsMs),
      ttsFallback,
    },
    behavior: {
      interventions: interventions.length,
      byRule,
      escalations: byName('mentor_escalated_to_manager').length,
    },
    satisfaction: {
      up,
      down,
      score: up + down ? Math.round((up / (up + down)) * 100) : null,
    },
    knowledge: {
      live: knowledge.live,
      embedded: knowledge.embedded,
      builtAt: knowledge.builtAt ?? null,
      embeddingProvider: knowledge.embeddingProvider ?? null,
    },
    health: aiHub(d).describe(),
  };
}

/** Records which prompt version produced an answer (helps bisect a quality regression). */
export async function trackPromptVersion(d: Deps, userId: string, version: string): Promise<void> {
  await track(d, 'mentor_prompt_version', userId, { version });
}
