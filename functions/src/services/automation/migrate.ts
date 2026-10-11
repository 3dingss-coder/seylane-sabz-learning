/**
 * v1 ↔ v2: reading an old rule with the new engine, without rewriting the store.
 *
 * The catalogue and every rule saved before the rule engine exist as *v1* documents: a flat
 * `trigger.conditions` array of at most six `field/op/value` entries, and cadence imposed globally by
 * `push_automation_settings`. Rather than a migration job that flips rows (and could flip one into
 * sending), the upgrade happens where a rule is *read*: `withDefaults()` returns the same rule with a
 * `when` tree and a `repeatPolicy` filled in, so the new code has one shape to deal with and the old
 * rows keep exactly the behaviour they had.
 *
 * Two deliberate choices:
 *  • A v1 rule keeps its conditions only where they were honoured: `kind: 'condition'`. For an
 *    `event`/`schedule` rule the flat list was always ignored by the engine, so migrating it into
 *    `when` would *change* behaviour — possibly starting sends that never happened. `deadConditions()`
 *    reports those rules instead, so the panel can say it out loud and an admin can decide, per rule.
 *  • The legacy caps are copied into `repeatPolicy` (`policyFromLegacySettings`), never dropped. A
 *    migrated rule sends as often as it did before; loosening it is a separate, visible edit.
 */

import type {
  AutomationCondition,
  PushAutomation,
  PushAutomationSettings,
  RepeatPolicy,
  RuleLeaf,
  RuleNode,
} from '../../domain/types';
import { policyFromLegacySettings } from './repeat';

/** The v1 ops are a subset of the operator registry, with the same ids — so the map is a rename. */
const V1_OPS = new Set(['gte', 'lte', 'eq', 'neq']);

export function conditionsToExpr(
  conditions: AutomationCondition[] | null | undefined,
): RuleNode | null {
  const leaves: RuleLeaf[] = [];
  for (const c of conditions ?? []) {
    if (!c || typeof c.field !== 'string' || !V1_OPS.has(c.op)) continue;
    leaves.push({ type: 'leaf', field: c.field, operator: c.op, value: c.value });
  }
  if (leaves.length === 0) return null;
  return leaves.length === 1
    ? (leaves[0] as RuleLeaf)
    : { type: 'group', op: 'and', children: leaves };
}

/**
 * The read-time upgrade. Idempotent: running it on a v2 document returns it unchanged, so it is safe
 * in `loadAutomations` *and* in a re-read inside the same request.
 */
export function withDefaults<T extends PushAutomation>(a: T): T {
  if (a.schemaVersion === 2) return a;
  return {
    ...a,
    schemaVersion: 1,
    // A v1 row is *not* given a `when` tree here: `matchesTrigger` already evaluates its flat
    // conditions for the one kind that ever consulted them, and re-expressing them through a new code
    // path would be a behaviour change disguised as a read. The `/migrate` endpoint converts a rule
    // explicitly, per rule, and reports what it did.
    when: a.when ?? null,
    repeatPolicy: a.repeatPolicy ?? null,
    audience: { ...a.audience, filter: a.audience.filter ?? null },
  };
}

export function withDefaultsForAll<T extends PushAutomation>(list: T[]): T[] {
  return list.map(withDefaults);
}

/**
 * Conditions a v1 rule carries but its trigger kind never evaluates. Not an error — the engine only
 * ever consulted `trigger.conditions` for `kind: 'condition'` — but a panel must not pretend the rule
 * is "limited to six conditions" when the real answer is "these were dead".
 */
export function deadConditions(a: PushAutomation): AutomationCondition[] {
  if (a.schemaVersion === 2) return [];
  if (a.trigger.kind === 'condition') return [];
  return (a.trigger.conditions ?? []).slice();
}

/** The policy that governs one rule: its own, or the legacy global numbers copied for it. */
export function repeatPolicyOf(
  a: PushAutomation,
  settings: Pick<PushAutomationSettings, 'maxPerUserPerDay' | 'maxPerUserPerWeek' | 'minGapMs'>,
): RepeatPolicy {
  return a.repeatPolicy ?? policyFromLegacySettings(settings);
}

/** Whether this rule's cadence is still the inherited one (what the list row's «بی‌سقف» badge needs). */
export function usesInheritedPolicy(a: PushAutomation): boolean {
  return !a.repeatPolicy;
}
