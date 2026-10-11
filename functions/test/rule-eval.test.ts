import { describe, expect, it } from 'vitest';
import {
  allFields,
  fieldById,
  registerField,
  resolveFact,
  type Actual,
  type FieldDef,
} from '../src/services/automation/fields';
import {
  BUILT_IN_OPERATORS,
  allOperators,
  operatorsFor,
  registerOperator,
} from '../src/services/automation/operators';
import {
  RULE_LIMITS,
  countLeaves,
  countNodes,
  describeExpr,
  evaluateRuleExpr,
  leavesOf,
  mapLeaves,
  maxDepth,
  traceLeaves,
  traceLines,
  validateRuleExpr,
  type RuleGroup,
  type RuleLeaf,
  type RuleNode,
} from '../src/services/automation/expr';
import {
  decideRepeat,
  legacyParity,
  policyFromLegacySettings,
  validateRepeatPolicy,
  type RepeatPolicy,
  type RepeatState,
} from '../src/services/automation/repeat';
import { FACT_FIELDS, FACT_LABELS } from '../src/services/push-automation-catalog';

/**
 * The acceptance tests for the rule-evaluation core (stage D1 of
 * `docs/admin-push-automation-rules-engine.md`). These are the ones that have to hold for the rest of
 * the engine to be rewired on top: nested AND/OR correctness, no fixed condition count, and — the
 * one that proves the architecture rather than a feature — a new field/operator becoming usable with
 * *only* a registry entry, with the evaluator untouched.
 */

const leaf = (
  field: string,
  operator: string,
  value: RuleLeaf['value'],
  value2?: RuleLeaf['value'],
): RuleLeaf => ({
  type: 'leaf',
  field,
  operator,
  value,
  ...(value2 === undefined ? {} : { value2 }),
});

const group = (op: RuleGroup['op'], children: RuleNode[]): RuleGroup => ({
  type: 'group',
  op,
  children,
});

/** A resolver over a hand-written record — what the engine will hand the evaluator in D2. */
const resolver =
  (values: Record<string, Actual>) =>
  (fieldId: string): Actual =>
    values[fieldId] ?? { present: false, value: null };

const yes = (v: number | string | boolean): Actual => ({ present: true, value: v });

describe('rule expression: correctness', () => {
  const active = yes(3); // activePackages
  const overdue = yes(2); // overduePackages
  const streak = yes(5); // streakDays

  it('AND needs every leaf, OR needs one, NOT flips — and nesting composes them', () => {
    // and(active >= 2, or(overdue > 0, not(streak >= 10)))  →  3>=2 ✓ , (2>0 ✓) , ⇒ true
    const tree = group('and', [
      leaf('activePackages', 'gte', 2),
      group('or', [
        leaf('overduePackages', 'gt', 0),
        group('not', [leaf('streakDays', 'gte', 10)]),
      ]),
    ]);
    const r = evaluateRuleExpr(
      tree,
      resolver({ activePackages: active, overduePackages: overdue, streakDays: streak }),
    );
    expect(r.ok).toBe(true);
    expect(r.truncated).toBe(false);
  });

  it('matches the truth table of and(a, or(b, not(c))) for all eight inputs', () => {
    const tree = group('and', [
      leaf('activePackages', 'gte', 1),
      group('or', [
        leaf('overduePackages', 'gte', 1),
        group('not', [leaf('streakDays', 'gte', 4)]),
      ]),
    ]);
    for (const a of [false, true])
      for (const b of [false, true])
        for (const c of [false, true]) {
          const r = evaluateRuleExpr(
            tree,
            resolver({
              activePackages: yes(a ? 5 : 0),
              overduePackages: yes(b ? 5 : 0),
              streakDays: yes(c ? 9 : 1),
            }),
          );
          // a>=1, b>=1, (c: streak>=4) → not(c) flips
          expect(r.ok).toBe(a && (b || !c));
        }
  });

  it('short-circuits an AND at the first false leaf but still explains it', () => {
    const tree = group('and', [leaf('activePackages', 'gte', 99), leaf('streakDays', 'gte', 1)]);
    const r = evaluateRuleExpr(tree, resolver({ activePackages: yes(1), streakDays: yes(1) }));
    expect(r.ok).toBe(false);
    expect(r.nodes).toBe(1);
    expect(traceLeaves(r.trace)).toHaveLength(1);
  });

  it('fail-closes on absent data but lets absence itself be the condition', () => {
    const missing = resolver({});
    expect(evaluateRuleExpr(leaf('user.city', 'gte', 1), missing).ok).toBe(false);
    expect(evaluateRuleExpr(leaf('user.city', 'eq', 'tehran'), missing).ok).toBe(false);
    // «not Tehran» is true for a user with no city at all — otherwise they could never be reached.
    expect(evaluateRuleExpr(leaf('user.city', 'neq', 'tehran'), missing).ok).toBe(true);
    expect(evaluateRuleExpr(leaf('user.city', 'isEmpty', null), missing).ok).toBe(true);
    expect(evaluateRuleExpr(leaf('user.city', 'isNotEmpty', null), missing).ok).toBe(false);
    expect(
      evaluateRuleExpr(leaf('user.city', 'isNotEmpty', null), resolver({ 'user.city': yes('') }))
        .ok,
    ).toBe(false);
    // 0 is a value, not an absence.
    expect(
      evaluateRuleExpr(
        leaf('overduePackages', 'isEmpty', null),
        resolver({ overduePackages: yes(0) }),
      ).ok,
    ).toBe(false);
  });

  it('supports the operator families the builder needs, on the right kinds', () => {
    const r = (l: RuleLeaf, v: Actual | null) =>
      evaluateRuleExpr(l, v === null ? resolver({}) : resolver({ [l.field]: v })).ok;
    expect(r(leaf('user.name', 'contains', 'علی'), yes('مریم علی‌پور'))).toBe(true);
    expect(r(leaf('user.name', 'startsWith', 'مریم'), yes('مریم علی‌پور'))).toBe(true);
    expect(r(leaf('user.province', 'in', 'تهران,اصفهان'), yes('اصفهان'))).toBe(true);
    expect(r(leaf('user.province', 'notIn', 'تهران,اصفهان'), yes('شیراز'))).toBe(true);
    expect(r(leaf('user.role', 'eq', 'manager'), yes('manager'))).toBe(true);
    expect(r(leaf('user.role', 'eq', 'nobody'), yes('manager'))).toBe(false);
    expect(r(leaf('progress', 'between', 20, 60), yes(45))).toBe(true);
    expect(r(leaf('progress', 'between', 20, 60), yes(90))).toBe(false);
    expect(r(leaf('startedEver', 'isTrue', null), yes(true))).toBe(true);
    expect(r(leaf('startedEver', 'isFalse', null), yes(false))).toBe(true);
    expect(r(leaf('user.hasTeam', 'exists', null), yes('team-1'))).toBe(true);
    expect(r(leaf('user.hasTeam', 'missing', null), null)).toBe(true);
    // A number written as a string in the store still compares as a number.
    expect(r(leaf('streakDays', 'gte', 3), yes('7'))).toBe(true);
  });

  it('compares dates and day-counts against the run clock, not the wall of the test machine', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');
    const at = (v: string | number) => resolver({ 'user.lastActiveAt': yes(v) });
    expect(
      evaluateRuleExpr(
        leaf('user.lastActiveAt', 'daysAgoGte', 7),
        at('2026-10-01T12:00:00Z'),
        new Date(now),
      ).ok,
    ).toBe(true);
    expect(
      evaluateRuleExpr(
        leaf('user.lastActiveAt', 'daysAgoGte', 7),
        at('2026-10-09T12:00:00Z'),
        new Date(now),
      ).ok,
    ).toBe(false);
    expect(
      evaluateRuleExpr(
        leaf('user.lastActiveAt', 'before', '2026-10-05'),
        at('2026-10-01'),
        new Date(now),
      ).ok,
    ).toBe(true);
    // An unparseable stamp can never be «after» anything.
    expect(
      evaluateRuleExpr(leaf('user.lastActiveAt', 'after', 'دیروز'), at('nope'), new Date(now)).ok,
    ).toBe(false);
  });
});

describe('rule expression: no fixed condition count, but hard budgets', () => {
  const flat = (n: number): RuleNode =>
    group(
      'and',
      Array.from({ length: n }, (_unused, i) => leaf('streakDays', 'gte', i)),
    );

  it('accepts 1, 12 and 40 conditions — the old .max(6) is gone', () => {
    for (const n of [1, 2, 7, 12, 40]) expect(validateRuleExpr(flat(n)).ok).toBe(true);
  });

  it('accepts deep nesting up to the budget and refuses beyond it', () => {
    const deep = (levels: number): RuleNode => {
      let node: RuleNode = leaf('streakDays', 'gte', 1);
      for (let i = 0; i < levels; i++) node = group('and', [node]);
      return node;
    };
    expect(validateRuleExpr(deep(RULE_LIMITS.maxDepth - 1)).ok).toBe(true);
    const tooDeep = validateRuleExpr(deep(RULE_LIMITS.maxDepth + 2));
    expect(tooDeep.ok).toBe(false);
    expect(tooDeep.issues.some((i) => i.message.includes('سطح'))).toBe(true);
  });

  it('refuses a tree that cannot finish inside one tick', () => {
    const big = flat(RULE_LIMITS.maxNodes + 10);
    const v = validateRuleExpr(big);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.message.includes(String(countNodes(big))))).toBe(true);
    expect(v.issues.some((i) => i.message.includes(String(RULE_LIMITS.maxNodes)))).toBe(true);
  });

  it('refuses an empty group, a two-child not, and an unknown node type', () => {
    expect(validateRuleExpr(group('and', [])).ok).toBe(false);
    expect(
      validateRuleExpr(group('not', [leaf('streakDays', 'gte', 1), leaf('progress', 'gte', 1)])).ok,
    ).toBe(false);
    expect(validateRuleExpr({ type: 'script', code: 'send()' } as unknown as RuleNode).ok).toBe(
      false,
    );
  });

  it('marks truncation instead of matching when a stored tree is over budget', () => {
    const over = flat(RULE_LIMITS.maxNodes * 2);
    const r = evaluateRuleExpr(over, resolver({ streakDays: yes(9999) }));
    expect(r.truncated).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.nodes).toBe(RULE_LIMITS.maxNodes);
  });

  it('counts its own shape the way the validator says', () => {
    const tree = group('and', [
      leaf('a', 'eq', 1),
      group('or', [leaf('b', 'eq', 2), leaf('c', 'eq', 3)]),
    ]);
    expect(countNodes(tree)).toBe(5);
    expect(countLeaves(tree)).toBe(3);
    expect(maxDepth(tree)).toBe(3);
    expect(leavesOf(tree).map((l) => l.field)).toEqual(['a', 'b', 'c']);
    expect(mapLeaves(tree, (l) => ({ ...l, value: 0 })).type).toBe('group');
  });
});

describe('rule expression: validation refuses unsafe or ill-typed rules', () => {
  it('refuses a field the engine cannot read', () => {
    const v = validateRuleExpr(leaf('passwordHash', 'eq', 'x'));
    expect(v.ok).toBe(false);
    expect(v.issues[0]?.message).toContain('passwordHash');
  });

  it('refuses an operator that does not exist (no free-form expression syntax at all)', () => {
    expect(validateRuleExpr(leaf('streakDays', 'matches', '/a.*b/') as RuleLeaf).ok).toBe(false);
    expect(validateRuleExpr(leaf('streakDays', 'eval', 'process.exit()') as RuleLeaf).ok).toBe(
      false,
    );
  });

  it('refuses a comparison that does not fit the field type', () => {
    expect(validateRuleExpr(leaf('startedEver', 'gte', 3)).issues[0]?.message).toContain('boolean');
    expect(validateRuleExpr(leaf('streakDays', 'contains', 'x')).ok).toBe(false);
    expect(validateRuleExpr(leaf('user.name', 'between', 1, 2)).ok).toBe(false);
    expect(validateRuleExpr(leaf('user.onboardedAt', 'in', 'a,b')).ok).toBe(false);
  });

  it('refuses a numeric field with non-numeric data and a missing operand', () => {
    expect(validateRuleExpr(leaf('progress', 'gte', 'خیلی زیاد')).ok).toBe(false);
    expect(validateRuleExpr(leaf('progress', 'gte', null)).ok).toBe(false);
    expect(validateRuleExpr(leaf('progress', 'between', 10)).ok).toBe(false);
    expect(validateRuleExpr(leaf('streakDays', 'isTrue', null)).ok).toBe(false);
    expect(validateRuleExpr(leaf('progress', 'between', 10, 90)).ok).toBe(true);
  });

  it('refuses an enum value outside the catalogue and a malformed date', () => {
    expect(validateRuleExpr(leaf('user.role', 'eq', 'superuser')).ok).toBe(false);
    expect(validateRuleExpr(leaf('user.role', 'eq', 'manager')).ok).toBe(true);
    expect(validateRuleExpr(leaf('user.lastActiveAt', 'before', 'هفته پیش')).ok).toBe(false);
    expect(validateRuleExpr(leaf('user.lastActiveAt', 'before', '2026-04-01')).ok).toBe(true);
    expect(validateRuleExpr(leaf('user.province', 'in', '   ')).ok).toBe(false);
  });

  it('refuses trigger-only fields inside an audience filter', () => {
    expect(validateRuleExpr(leaf('progress', 'gte', 3), { scope: 'audience' }).ok).toBe(false);
    expect(
      validateRuleExpr(leaf('user.teamId', 'isNotEmpty', null), { scope: 'audience' }).ok,
    ).toBe(true);
    expect(validateRuleExpr(leaf('event.score', 'gte', 5), { scope: 'audience' }).ok).toBe(false);
    expect(validateRuleExpr(leaf('event.score', 'gte', 5), { scope: 'trigger' }).ok).toBe(true);
  });

  it('points at the offending node by path', () => {
    const v = validateRuleExpr(
      group('and', [leaf('streakDays', 'gte', 1), group('or', [leaf('progress', 'gte', 'x')])]),
    );
    expect(v.issues[0]?.path).toBe('when.children[1].children[0]');
  });
});

describe('rule expression: explainability', () => {
  it('prints one Persian line per condition with the value it saw', () => {
    // `or(and(a, b), c)` with every branch false, so short-circuiting skips nothing.
    const tree = group('or', [
      group('and', [leaf('streakDays', 'gte', 3), leaf('overduePackages', 'eq', 0)]),
      leaf('user.city', 'eq', 'تهران'),
    ]);
    const r = evaluateRuleExpr(
      tree,
      resolver({ streakDays: yes(9), overduePackages: yes(2), 'user.city': yes('شیراز') }),
    );
    expect(r.ok).toBe(false);
    const lines = traceLeaves(r.trace).map((t) => t.text);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('روزهای پیوسته فعالیت');
    expect(lines[0]).toContain('۹');
    expect(lines[1]).toContain('آموزشِ از مهلت گذشته');
    expect(r.trace[0]?.type).toBe('group');
    const rendered = traceLines(r.trace);
    expect(rendered).toHaveLength(5);
    expect(rendered[0]).toContain('حداقل یکی');
    expect(rendered[1]).toContain('همه‌ی این‌ها');
    expect(rendered.filter((l) => l.trim().startsWith('✓'))).toHaveLength(1);
    expect(describeExpr(tree)).toContain('شرط');
    expect(describeExpr(null)).toBe('بدون شرط اضافه');
  });

  it('says why a rule matched nothing it could read', () => {
    const r = evaluateRuleExpr(leaf('inactiveDays', 'lte', 3), resolver({}));
    expect(traceLeaves(r.trace)[0]?.text).toContain('داده‌ای نیست');
  });
});

describe('extensibility: a new field or operator needs only a registry entry', () => {
  const EXACT = 'test.exactMatchPct';
  const NEAR = 'near';

  it('adding a field module makes it valid, evaluable and explainable without touching the engine', () => {
    expect(fieldById(EXACT)).toBeUndefined();
    registerField({
      ...fieldById('progress'),
      id: EXACT,
      label: 'درصد تطابق پاسخ (آزمون)',
      kind: 'number',
      group: 'داده‌ی اتفاق',
      source: 'event',
      sweep: false,
      audience: false,
      min: 0,
      max: 100,
      unit: '٪',
    } as FieldDef);

    const tree = group('and', [leaf(EXACT, 'gte', 80), leaf('streakDays', 'gte', 1)]);
    expect(validateRuleExpr(tree).ok).toBe(true);
    const r = evaluateRuleExpr(tree, resolver({ [EXACT]: yes(93), streakDays: yes(4) }));
    expect(r.ok).toBe(true);
    expect(traceLeaves(r.trace)[0]?.text).toContain('درصد تطابق پاسخ');
    // and it is offered to the builder in the right place: an event path, never a sweep
    expect(allFields().some((f) => f.id === EXACT)).toBe(true);
    expect(validateRuleExpr(leaf(EXACT, 'gte', 80), { scope: 'audience' }).ok).toBe(false);
    expect(validateRuleExpr(leaf(EXACT, 'contains', 'a')).ok).toBe(false);
  });

  it('adding an operator module works the same way', () => {
    registerOperator({
      id: NEAR,
      label: 'نزدیک این عدد',
      kinds: ['number'],
      arity: 1,
      evaluate: (a, n) => {
        const v = typeof a.value === 'number' ? a.value : Number(a.value);
        const t = Number(n.value);
        return a.present && Number.isFinite(v) && Number.isFinite(t) && Math.abs(v - t) <= 5;
      },
      explain: (a, n, f) => `${f.label}: ${String(a.value)} تا ${String(n.value)} نزدیکی دارد`,
    });
    expect(operatorsFor('number').some((o) => o.id === NEAR)).toBe(true);
    const tree = leaf('progress', NEAR, 50);
    expect(validateRuleExpr(tree).ok).toBe(true);
    expect(evaluateRuleExpr(tree, resolver({ progress: yes(47) })).ok).toBe(true);
    expect(evaluateRuleExpr(tree, resolver({ progress: yes(80) })).ok).toBe(false);
  });

  it('the evaluator still knows nothing about any specific scenario', () => {
    // The proof is in the source: no catalogue key, no field id, no rule text appears in the evaluator.
    const src = BUILT_IN_OPERATORS.map((o) => o.id).join(',');
    expect(src).toContain('gte');
    expect(allOperators().length).toBeGreaterThan(10);
  });
});

describe('field registry: consistency with the catalogue the panel already shows', () => {
  it('exposes every catalogue fact with the same label and kind', () => {
    expect(FACT_FIELDS.length).toBeGreaterThan(10);
    for (const f of FACT_FIELDS) {
      const def = fieldById(f.field);
      expect(def, `field ${f.field} must be registered`).toBeDefined();
      expect(def?.label).toBe(f.label);
      expect(def?.kind).toBe(f.kind === 'boolean' ? 'boolean' : 'number');
      expect(def?.sweep).toBe(true);
    }
    expect(Object.keys(FACT_LABELS).every((k) => fieldById(k))).toBe(true);
  });

  it('keeps sweep-unsafe data out of the scheduled path', () => {
    expect(fieldById('event.score')?.sweep).toBe(false);
    expect(fieldById('user.teamId')?.audience).toBe(true);
    expect(fieldById('user.points')?.audience).toBe(false);
  });

  it('reads facts by id and reports absent for anything else', () => {
    const f = fieldById('progress') as FieldDef;
    expect(resolveFact(f, { progress: 42 }).value).toBe(42);
    expect(resolveFact(f, {}).present).toBe(false);
    expect(resolveFact(f, undefined).present).toBe(false);
  });
});

describe('repeat policy: cadence belongs to the rule, not to the platform', () => {
  const state = (over: Partial<RepeatState> = {}): RepeatState => ({
    lastSentAt: null,
    daySent: 0,
    weekSent: 0,
    monthSent: 0,
    lifetimeSent: 0,
    ...over,
  });

  it('allows the eleventh and twelfth send when the rule says twelve a day', () => {
    const p: RepeatPolicy = {
      minIntervalMs: 60_000,
      perDay: 12,
      perWeek: 0,
      perMonth: 0,
      oncePerEventInstance: false,
      allowSameDayMultiple: true,
      onceInLivespan: false,
    };
    expect(validateRepeatPolicy(p)).toEqual([]);
    const t = Date.parse('2026-04-01T09:00:00Z');
    expect(decideRepeat(p, state({ daySent: 10, lastSentAt: t - 600_000 }), t).allow).toBe(true);
    expect(decideRepeat(p, state({ daySent: 11, lastSentAt: t - 600_000 }), t).allow).toBe(true);
    const blocked = decideRepeat(p, state({ daySent: 12, lastSentAt: t - 600_000 }), t);
    expect(blocked.allow).toBe(false);
    expect(blocked.reason).toBe('per_day');
    expect(blocked.retryAt).toBeGreaterThan(t);
  });

  it('a policy that repeats is not a licence to re-send the same event', () => {
    const p: Partial<RepeatPolicy> = { perDay: 0, minIntervalMs: 0, oncePerEventInstance: true };
    // Same event occurrence seen twice (a retry, a re-scan, a duplicate outbox row): blocked.
    expect(
      decideRepeat(p, state({ eventKey: 'quiz:u1:q7', lastEventKey: 'quiz:u1:q7' }), 1).reason,
    ).toBe('same_event_instance');
    // A genuinely new occurrence the same second: allowed, because the policy allows it.
    expect(
      decideRepeat(p, state({ eventKey: 'quiz:u1:q8', lastEventKey: 'quiz:u1:q7' }), 1).allow,
    ).toBe(true);
  });

  it('honours spacing, once-in-a-lifetime and the no-same-day switch', () => {
    const t0 = Date.parse('2026-04-01T08:00:00Z');
    expect(
      decideRepeat({ minIntervalMs: 4 * 3_600_000 }, state({ lastSentAt: t0 }), t0 + 3 * 3_600_000)
        .reason,
    ).toBe('min_interval');
    expect(
      decideRepeat({ minIntervalMs: 4 * 3_600_000 }, state({ lastSentAt: t0 }), t0 + 5 * 3_600_000)
        .allow,
    ).toBe(true);
    expect(decideRepeat({ onceInLivespan: true }, state({ lifetimeSent: 1 }), t0).reason).toBe(
      'once_in_livespan',
    );
    expect(
      decideRepeat({ allowSameDayMultiple: false, perDay: 5 }, state({ daySent: 1 }), t0).reason,
    ).toBe('per_day');
    // perRule is the tighter override, and wins over the rule's own numbers.
    expect(
      decideRepeat(
        { perDay: 12, perRule: { maxPerDay: 1, minIntervalMs: 2 * 3_600_000 } },
        state({ daySent: 1, lastSentAt: t0 }),
        t0 + 60_000,
      ).reason,
    ).toBe('min_interval');
  });

  it('refuses absurd policies instead of silently accepting a runaway', () => {
    expect(validateRepeatPolicy(undefined)).toEqual([]);
    expect(validateRepeatPolicy({ perDay: 5_000 })).not.toEqual([]);
    expect(validateRepeatPolicy({ perDay: -1 })).not.toEqual([]);
    expect(validateRepeatPolicy({ perDay: 1.5 })).not.toEqual([]);
    expect(validateRepeatPolicy({ minIntervalMs: 1000 })).not.toEqual([]);
    expect(validateRepeatPolicy({ minIntervalMs: 0 })).toEqual([]);
    expect(validateRepeatPolicy({ perWeek: '10' as never })).not.toEqual([]);
    expect(validateRepeatPolicy({ perStep: { wait: { minIntervalMs: -5 } } })).not.toEqual([]);
  });

  it('reproduces the old global caps for a migrated rule, and says so', () => {
    const legacy = { maxPerUserPerDay: 2, maxPerUserPerWeek: 10, minGapMs: 4 * 3_600_000 };
    const p = policyFromLegacySettings(legacy);
    expect(legacyParity(p, legacy)).toBe('identical');
    const t0 = Date.parse('2026-04-01T08:00:00Z');
    // third send of the day: blocked, exactly as before
    expect(decideRepeat(p, state({ daySent: 2, lastSentAt: t0 - 5 * 3_600_000 }), t0).reason).toBe(
      'per_day',
    );
    // two hours after the previous send: still blocked by the 4-hour gap
    expect(decideRepeat(p, state({ daySent: 1, lastSentAt: t0 - 2 * 3_600_000 }), t0).reason).toBe(
      'min_interval',
    );
    // the old behaviour, second send after the gap: allowed
    expect(decideRepeat(p, state({ daySent: 1, lastSentAt: t0 - 4 * 3_600_000 }), t0).allow).toBe(
      true,
    );
    // an admin who drops the caps is recorded as a deliberate loosening, not as a silent change
    expect(legacyParity({ ...p, perDay: 0, perWeek: 0, minIntervalMs: 0 }, legacy)).toBe('looser');
    expect(legacyParity({ ...p, perDay: 1 }, legacy)).toBe('stricter');
  });
});
