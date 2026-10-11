/**
 * The rule expression: a small, closed tree of AND / OR / NOT groups over typed leaves.
 *
 * Three things matter to the whole system:
 *
 *  1. **No fixed condition count.** A rule may carry one leaf or forty, nested six deep — the shape
 *     comes from the builder, not from a scenario.
 *  2. **It is data, never code.** Validation walks the tree against the field and operator registries
 *     and rejects anything unknown or ill-typed, so an admin cannot store a condition the engine
 *     would have to interpret in some ad-hoc way. There is no `eval`, no function body, no template
 *     executed from the database anywhere in this file or its callers.
 *  3. **Every rule is bounded.** A Worker tick is finite, so the tree carries hard budgets
 *     (`RULE_LIMITS`). Exceeding them at eval time means the rule does not match and the run is marked
 *     truncated — a truncation can never cause a send, only skip one.
 *
 * Evaluation is fail-closed on missing data (a leaf whose field has no value is false, except the
 * presence operators and `neq`/`notIn`, which are about absence). The consequence matters: a rule with
 * a typo'd field simply never sends instead of sending to everyone.
 */

import type { RuleExpr, RuleGroup, RuleLeaf, RuleNode } from '../../domain/types';
import { fieldById, type Actual } from './fields';
import { operatorById } from './operators';

// The persisted shape lives in the data model; this module owns everything that *means* something.
export type { RuleExpr, RuleGroup, RuleLeaf, RuleNode };

/** Where a tree is used: audiences filter on per-user fields only, never on trigger metadata. */
export type RuleScope = 'trigger' | 'audience';

export const RULE_LIMITS = {
  maxNodes: 64,
  maxDepth: 6,
  maxLeaves: 48,
  /** A flat group may hold at most this many children — the same ceiling as `maxLeaves`, so the two
   *  budgets can never contradict each other (`not` holds exactly one). */
  maxChildren: 48,
  /** How many steps a workflow may chain. Owned by the step queue (`steps.ts`, stage D4). */
  maxSteps: 8,
} as const;

export interface ValidationIssue {
  /** Dot-indexed path into the tree, e.g. `when.children[1].children[0]`. */
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface TraceLeaf {
  type: 'leaf';
  ok: boolean;
  text: string;
}

export interface TraceGroup {
  type: 'group';
  op: RuleGroup['op'];
  ok: boolean;
  children: TraceNode[];
}

export type TraceNode = TraceLeaf | TraceGroup;

export interface EvalResult {
  ok: boolean;
  /** Nodes actually looked at — the cost of this run. */
  nodes: number;
  /** A budget was hit, so this is *not* a real "no". */
  truncated: boolean;
  /** Per-condition human explanation, so the panel can say WHY a rule fired or stayed quiet. */
  trace: TraceNode[];
}

/** How a rule reads its data: the engine supplies this, the evaluator supplies the semantics. */
export type ResolveActual = (fieldId: string) => Actual;

// ─── shape helpers ───────────────────────────────────────────────────────────

export function isRuleGroup(node: RuleNode | undefined | null): node is RuleGroup {
  return !!node && node.type === 'group';
}

export function countNodes(root: RuleNode): number {
  if (!isRuleGroup(root)) return 1;
  return 1 + (root.children ?? []).reduce((s, c) => s + countNodes(c), 0);
}

export function countLeaves(root: RuleNode): number {
  if (!isRuleGroup(root)) return 1;
  return (root.children ?? []).reduce((s, c) => s + countLeaves(c), 0);
}

export function maxDepth(root: RuleNode, depth = 1): number {
  if (!isRuleGroup(root)) return depth;
  const kids = root.children ?? [];
  return kids.length === 0 ? depth : Math.max(...kids.map((c) => maxDepth(c, depth + 1)));
}

export function leavesOf(root: RuleNode): RuleLeaf[] {
  if (!isRuleGroup(root)) return [root];
  return (root.children ?? []).flatMap(leavesOf);
}

/** Rewrite every leaf (used by the v1→v2 migration and by dry-run's threshold override). */
export function mapLeaves(root: RuleNode, fn: (leaf: RuleLeaf) => RuleLeaf): RuleNode {
  if (!isRuleGroup(root)) return fn(root);
  return { ...root, children: (root.children ?? []).map((c) => mapLeaves(c, fn)) };
}

// ─── validation ─────────────────────────────────────────────────────────────

const missing = (v: unknown): boolean => v === null || v === undefined || v === '';

function validateLeaf(node: RuleLeaf, scope: RuleScope): string[] {
  const field = fieldById(node.field);
  if (!field) return [`فیلد «${node.field}» در رجستری فیلدها نیست.`];
  if (scope === 'audience' && !field.audience)
    return [`«${field.label}» برای فیلتر مخاطب قابل استفاده نیست؛ فقط شرط رویداد است.`];
  const op = operatorById(node.operator);
  if (!op) return [`عملگر «${node.operator}» شناخته‌شده نیست.`];
  const bad: string[] = [];
  if (!op.kinds.includes(field.kind))
    bad.push(`عملگر «${op.label}» با نوع «${field.kind}» فیلد «${field.label}» جور نیست.`);
  if (op.arity >= 1 && missing(node.value)) bad.push(`«${op.label}» به یک مقدار نیاز دارد.`);
  if (op.arity === 0 && !missing(node.value)) bad.push(`«${op.label}» مقدار نمی‌گیرد.`);
  if (op.arity >= 2 && missing(node.value2 ?? null))
    bad.push(`«${op.label}» به دو مقدار نیاز دارد.`);
  if (
    (field.kind === 'number' || field.kind === 'presence') &&
    op.arity >= 1 &&
    !missing(node.value)
  ) {
    if (!Number.isFinite(Number(node.value))) bad.push(`مقدار «${field.label}» باید عدد باشد.`);
  }
  if (
    field.kind === 'enum' &&
    (op.id === 'eq' || op.id === 'neq') &&
    typeof node.value === 'string'
  ) {
    const allowed = (field.options ?? []).map((o) => o.value);
    if (!allowed.includes(node.value))
      bad.push(`«${node.value}» یکی از مقادیر مجاز «${field.label}» نیست.`);
  }
  const extra = op.validate?.(node, field);
  if (extra) bad.push(extra);
  return bad;
}

function validateNode(
  node: RuleNode,
  path: string,
  scope: RuleScope,
  acc: ValidationIssue[],
): void {
  if (!node || (node.type !== 'leaf' && node.type !== 'group')) {
    acc.push({ path, message: 'هر گره باید leaf یا group باشد.' });
    return;
  }
  if (node.type === 'leaf') {
    for (const message of validateLeaf(node, scope)) acc.push({ path, message });
    return;
  }
  if (node.op !== 'and' && node.op !== 'or' && node.op !== 'not') {
    acc.push({ path, message: 'گروه فقط می‌تواند and / or / not باشد.' });
    return;
  }
  const kids = node.children ?? [];
  if (node.op === 'not' && kids.length !== 1)
    acc.push({ path, message: 'گروه not دقیقاً یک فرزند می‌گیرد.' });
  if (node.op !== 'not' && kids.length === 0)
    acc.push({ path, message: 'گروه خالی همیشه برقرار است؛ یک شرط اضافه کنید.' });
  if (kids.length > RULE_LIMITS.maxChildren)
    acc.push({ path, message: `یک گروه حداکثر ${RULE_LIMITS.maxChildren} فرزند می‌گیرد.` });
  kids.forEach((c, i) => validateNode(c, `${path}.children[${i}]`, scope, acc));
}

/**
 * Validate a whole tree. `undefined` / `null` means "no condition", which is legal (a rule may fire on
 * its trigger alone) and returns `ok: true` with no issues.
 */
export function validateRuleExpr(
  root: RuleNode | null | undefined,
  opts: { scope?: RuleScope; path?: string } = {},
): ValidationResult {
  const scope: RuleScope = opts.scope ?? 'trigger';
  const path = opts.path ?? 'when';
  if (!root) return { ok: true, issues: [] };
  const issues: ValidationIssue[] = [];
  validateNode(root, path, scope, issues);
  const nodes = countNodes(root);
  if (nodes > RULE_LIMITS.maxNodes)
    issues.push({
      path,
      message: `این درخت ${nodes} گره دارد؛ سقف ${RULE_LIMITS.maxNodes} است تا ارزیابی داخل یک تیک Worker تمام شود.`,
    });
  const depth = maxDepth(root);
  if (depth > RULE_LIMITS.maxDepth)
    issues.push({
      path,
      message: `تودرتو بودن بیش از ${RULE_LIMITS.maxDepth} سطح مجاز نیست (الان ${depth} سطح).`,
    });
  const leaves = countLeaves(root);
  if (leaves > RULE_LIMITS.maxLeaves)
    issues.push({ path, message: `تعداد شرط ${leaves} است؛ سقف ${RULE_LIMITS.maxLeaves}.` });
  return { ok: issues.length === 0, issues };
}

// ─── evaluation ─────────────────────────────────────────────────────────────

interface Walk {
  resolve: ResolveActual;
  now: Date;
  nodes: number;
  truncated: boolean;
}

function evalNode(node: RuleNode, w: Walk): { ok: boolean; trace: TraceNode } {
  if (w.nodes >= RULE_LIMITS.maxNodes) {
    w.truncated = true;
    return {
      ok: false,
      trace: { type: 'leaf', ok: false, text: 'سقف تعداد گره رسید؛ ارزیابی متوقف شد.' },
    };
  }
  if (!isRuleGroup(node)) {
    w.nodes += 1;
    const field = fieldById(node.field);
    const op = operatorById(node.operator);
    if (!field || !op) {
      // Should not happen for a validated rule; fail closed rather than guess.
      return {
        ok: false,
        trace: {
          type: 'leaf',
          ok: false,
          text: `«${node.field} ${node.operator}» قابل ارزیابی نیست.`,
        },
      };
    }
    const actual = w.resolve(node.field);
    const ok = op.evaluate(actual, node, field, w.now);
    return { ok, trace: { type: 'leaf', ok, text: op.explain(actual, node, field, w.now) } };
  }
  const kids = node.children ?? [];
  if (node.op === 'not') {
    const one = kids[0];
    if (!one) return { ok: false, trace: { type: 'group', op: 'not', ok: false, children: [] } };
    const r = evalNode(one, w);
    return { ok: !r.ok, trace: { type: 'group', op: 'not', ok: !r.ok, children: [r.trace] } };
  }
  const traces: TraceNode[] = [];
  let ok = node.op === 'and';
  for (const kid of kids) {
    const r = evalNode(kid, w);
    traces.push(r.trace);
    ok = node.op === 'and' ? ok && r.ok : ok || r.ok;
    // Short-circuit the *result* only: AND stops at the first false, OR at the first true.
    if (node.op === 'and' ? !ok : ok) break;
  }
  return { ok, trace: { type: 'group', op: node.op, ok, children: traces } };
}

/** Evaluate a rule tree against resolved data. Pure — the same tree and the same fields give the same answer. */
export function evaluateRuleExpr(
  root: RuleNode | null | undefined,
  resolve: ResolveActual,
  now: Date = new Date(),
): EvalResult {
  if (!root) return { ok: true, nodes: 0, truncated: false, trace: [] };
  const w: Walk = { resolve, now, nodes: 0, truncated: false };
  const r = evalNode(root, w);
  return { ok: r.ok, nodes: w.nodes, truncated: w.truncated, trace: [r.trace] };
}

/** Flatten a trace into the short Persian lines the panel shows, one per condition. */
export function traceLines(trace: TraceNode[], depth = 0): string[] {
  return trace.flatMap((node) => traceLine(node, depth));
}

function traceLine(node: TraceNode, depth: number): string[] {
  const pad = '  '.repeat(depth);
  if (node.type === 'leaf') return [`${pad}${node.ok ? '✓' : '✗'} ${node.text}`];
  const head =
    `${pad}${node.ok ? '✓' : '✗'} ` +
    (node.op === 'and'
      ? 'همه‌ی این‌ها باید برقرار باشد'
      : node.op === 'or'
        ? 'حداقل یکی باید برقرار باشد'
        : 'این شرط نباید برقرار باشد');
  return [head, ...traceLines(node.children, depth + 1)];
}

/** The per-leaf verdicts as a flat list — what the dry-run panel prints. */
export function traceLeaves(trace: TraceNode[]): { ok: boolean; text: string }[] {
  return trace.flatMap((t) =>
    t.type === 'leaf' ? [{ ok: t.ok, text: t.text }] : traceLeaves(t.children),
  );
}

/** A one-line Persian summary for a list row («۳ شرط • همه باید برقرار باشند»). */
export function describeExpr(root: RuleNode | null | undefined): string {
  if (!root) return 'بدون شرط اضافه';
  const fa = new Intl.NumberFormat('fa-IR').format(countLeaves(root));
  if (!isRuleGroup(root)) return `${fa} شرط`;
  if (root.op === 'not') return `نه — ${fa} شرط`;
  return `${root.op === 'and' ? 'همه‌ی' : 'حداقل یکی از'} ${fa} شرط`;
}
