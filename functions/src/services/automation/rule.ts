/**
 * How a rule reads the world.
 *
 * The evaluator (`expr.ts`) is deliberately ignorant of where a value comes from: it calls a
 * `ResolveActual`. This module is the implementation the engine hands it — facts from the in-memory
 * sweep, fields from the user row, event payload from the hook that fired. That indirection is the
 * whole reason a new field is a registry entry rather than an engine change: the engine supplies data,
 * the evaluator supplies semantics, and neither knows the other's list.
 *
 * Missing data is reported as `{ present: false }`, never as `0` or `''`: «this rule cannot see it» and
 * «the user has zero of it» are different facts, and only the first one must stop a send.
 */

import type { PushAutomation, RuleNode, User } from '../../domain/types';
import type { Doc } from '../../store/types';
import type { Facts } from '../push-automation-engine';
import { absent, fieldById, known, resolveFact, type Actual } from './fields';
import { evaluateRuleExpr, traceLeaves, type EvalResult } from './expr';

/** Anything a rule may be evaluated against. All of it optional: a dry-run may know only the user. */
export interface RuleData {
  facts?: Facts;
  user?: Doc<User> | null;
  /** The payload a hook passed (`score`, `passed`, `sectionId`, …), keyed without the `event.` prefix. */
  event?: Record<string, unknown> | null;
  /** Extra values a caller wants exposed to `event.*` fields that the hook did not send. */
  extra?: Record<string, unknown>;
  /** The run clock. Never `Date.now()` inside an operator: a sweep and its dry-run must agree. */
  now?: Date;
}

/** Derived user facts that are not columns of the user row. */
function derivedUser(id: string, user: Doc<User>): Actual | null {
  if (id === 'user.hasTeam') return user.teamId ? known(user.teamId) : absent;
  if (id === 'user.brandIds')
    return Array.isArray(user.brandIds) && user.brandIds.length > 0
      ? known(user.brandIds.length)
      : absent;
  return null;
}

function valueOf(raw: unknown): Actual {
  if (raw === null || raw === undefined) return absent;
  if (typeof raw === 'number') return Number.isFinite(raw) ? known(raw) : absent;
  if (typeof raw === 'boolean') return known(raw);
  if (typeof raw === 'string') return raw === '' ? absent : known(raw);
  if (Array.isArray(raw)) return raw.length ? known(raw.length) : absent;
  return known(String(raw).slice(0, 120));
}

/** Build the resolver for one evaluation. `now` is passed separately, so the clock stays injectable. */
export function resolveData(data: RuleData): (fieldId: string) => Actual {
  return (fieldId: string): Actual => {
    const field = fieldById(fieldId);
    if (!field) return absent;
    if (field.source === 'user') {
      if (!data.user) return absent;
      const derived = derivedUser(fieldId, data.user);
      if (derived) return derived;
      const key = fieldId.startsWith('user.') ? fieldId.slice('user.'.length) : fieldId;
      const raw = (data.user as unknown as Record<string, unknown>)[key];
      return valueOf(raw);
    }
    if (field.source === 'event') {
      const key = fieldId.startsWith('event.') ? fieldId.slice('event.'.length) : fieldId;
      const raw = data.event?.[key] ?? data.extra?.[key];
      return valueOf(raw);
    }
    // Everything else (learning facts, system-health numbers) is already in the flat fact record.
    return resolveFact(field, data.facts);
  };
}

/** Evaluate one tree against one user. An absent tree is a match, so `when: null` never blocks. */
export function evaluateFor(
  root: RuleNode | null | undefined,
  data: RuleData,
  now: Date = new Date(),
): EvalResult {
  return evaluateRuleExpr(root, resolveData(data), now);
}

/** The first condition that said no — the sentence a `why nothing was sent` log line should carry. */
export function firstFailure(result: EvalResult): string | null {
  if (result.ok) return null;
  const bad = traceLeaves(result.trace).find((t) => !t.ok);
  return bad ? bad.text.slice(0, 240) : null;
}

/** Every leaf verdict, for the trace/dry-run panel. `limit` keeps a stored detail bounded. */
export function explainFor(result: EvalResult, limit = 24): string[] {
  return traceLeaves(result.trace)
    .slice(0, limit)
    .map((t) => `${t.ok ? '✓' : '✗'} ${t.text}`);
}

/** Whether a rule's *audience filter* accepts this user right now (re-asked at the moment of sending). */
export function audienceAllows(
  a: PushAutomation,
  user: Doc<User>,
  now: Date = new Date(),
): EvalResult {
  return evaluateFor(a.audience.filter ?? null, { user }, now);
}
