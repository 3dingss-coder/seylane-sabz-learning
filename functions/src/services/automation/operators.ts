/**
 * The operator registry: the only comparison vocabulary a rule may use.
 *
 * Adding a comparison (say a `stddevAbove` for some future field kind) means one entry here with a
 * pure `evaluate`. The evaluator in `expr.ts` never switches on an operator id, and neither does the
 * panel — both ask this registry. Stored values are *data*: nothing here can execute anything the
 * rule asked for, which is what makes it safe to let an admin save a condition at all (no `eval`,
 * no `Function`, no template compiled from the database).
 */

import type { Actual, FieldDef } from './fields';
import type { RuleLeaf } from './expr';

const faNum = (n: number): string => new Intl.NumberFormat('fa-IR').format(n);

const asNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const asText = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';

/** A `date` value the admin typed: `YYYY-MM-DD`, `YYYY-MM-DDTHH:mm`, or a bare clock time. */
const DATE_RE = /^(\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?|\d{2}:\d{2})$/;

/** Equality that survives the store: a JSON doc may hold `"3"` where the rule says `3`. */
function looseEq(actual: unknown, wanted: unknown): boolean {
  if (typeof actual === 'boolean' || typeof wanted === 'boolean')
    return (actual === true || actual === 'true') === (wanted === true || wanted === 'true');
  const a = asNumber(actual);
  const b = asNumber(wanted);
  if (a !== null && b !== null) return a === b;
  return asText(actual).trim().toLowerCase() === asText(wanted).trim().toLowerCase();
}

/** `HH:mm` alone means "that clock time today" — the unit the deadline windows speak in. */
function normDate(v: string): string {
  const t = v.trim();
  if (/^\d{2}:\d{2}$/.test(t)) return `${new Date().toISOString().slice(0, 10)}T${t}:00`;
  return t.replace(' ', 'T');
}

const parseDate = (v: unknown): number | null => {
  const raw = typeof v === 'number' ? v : Date.parse(normDate(asText(v)));
  return Number.isFinite(raw) ? raw : null;
};

/** The value a leaf actually holds, as the trace line should read it. */
export const showValue = (field: FieldDef, v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (field.kind === 'boolean') return v === true || v === 'true' ? 'بله' : 'خیر';
  const n = asNumber(v);
  if (n !== null && (field.kind === 'number' || field.kind === 'presence'))
    return faNum(n) + (field.unit ? ` ${field.unit}` : '');
  if (field.kind === 'enum') {
    const hit = (field.options ?? []).find((o) => o.value === String(v));
    return hit ? hit.label : String(v);
  }
  return String(v).slice(0, 40);
};

const actualOf = (field: FieldDef, a: Actual): string =>
  a.present ? showValue(field, a.value) : 'داده‌ای نیست';

const numberList = (v: unknown): string[] =>
  asText(v)
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x !== '');

export interface OperatorDef {
  id: string;
  label: string;
  /** Which field kinds this may be applied to — the type check `validateRuleExpr` enforces. */
  kinds: FieldDef['kind'][];
  /** How many values the leaf must carry (0 for `isTrue`, 2 for `between`). */
  arity: 0 | 1 | 2;
  /** The "does the data exist" family: legal even when the field has no value at all. */
  presenceOnly?: boolean;
  evaluate(actual: Actual, node: RuleLeaf, field: FieldDef, now: Date): boolean;
  explain(actual: Actual, node: RuleLeaf, field: FieldDef, now: Date): string;
  /** Extra shape rules beyond "kind matches" (numeric range, enum membership, date format). */
  validate?(node: RuleLeaf, field: FieldDef): string | null;
}

const cmp = (n: RuleLeaf): number | null => asNumber(n.value);

const sentence =
  (verb: (n: RuleLeaf, field: FieldDef) => string) =>
  (a: Actual, n: RuleLeaf, f: FieldDef): string =>
    `${f.label}: ${actualOf(f, a)} ${verb(n, f)}`;

const withValue =
  (symbol: string) =>
  (n: RuleLeaf, f: FieldDef): string =>
    `${symbol} ${showValue(f, n.value)}`;

const DAYS = 86_400_000;

export const BUILT_IN_OPERATORS: OperatorDef[] = [
  {
    id: 'gte',
    label: 'بزرگ‌تر یا برابر',
    kinds: ['number'],
    arity: 1,
    evaluate: (a, n) => a.present && (asNumber(a.value) ?? -Infinity) >= (cmp(n) ?? Infinity),
    explain: sentence(withValue('≥')),
  },
  {
    id: 'gt',
    label: 'بزرگ‌تر',
    kinds: ['number'],
    arity: 1,
    evaluate: (a, n) => a.present && (asNumber(a.value) ?? -Infinity) > (cmp(n) ?? Infinity),
    explain: sentence(withValue('>')),
  },
  {
    id: 'lte',
    label: 'کوچک‌تر یا برابر',
    kinds: ['number'],
    arity: 1,
    evaluate: (a, n) => a.present && (asNumber(a.value) ?? Infinity) <= (cmp(n) ?? -Infinity),
    explain: sentence(withValue('≤')),
  },
  {
    id: 'lt',
    label: 'کوچک‌تر',
    kinds: ['number'],
    arity: 1,
    evaluate: (a, n) => a.present && (asNumber(a.value) ?? Infinity) < (cmp(n) ?? -Infinity),
    explain: sentence(withValue('<')),
  },
  {
    id: 'between',
    label: 'بین دو عدد',
    kinds: ['number'],
    arity: 2,
    evaluate: (a, n) => {
      const v = a.present ? asNumber(a.value) : null;
      const lo = asNumber(n.value);
      const hi = asNumber(n.value2 ?? null);
      return (
        v !== null && lo !== null && hi !== null && v >= Math.min(lo, hi) && v <= Math.max(lo, hi)
      );
    },
    explain: (a, n, f) =>
      `${f.label}: ${actualOf(f, a)} بین ${showValue(f, n.value)} و ${showValue(f, n.value2)}`,
  },
  {
    id: 'eq',
    label: 'مساوی',
    kinds: ['number', 'text', 'boolean', 'enum', 'date'],
    arity: 1,
    evaluate: (a, n) => a.present && looseEq(a.value, n.value),
    explain: sentence(withValue('=')),
  },
  {
    id: 'neq',
    label: 'غیرمساوی',
    kinds: ['number', 'text', 'boolean', 'enum', 'date'],
    arity: 1,
    // Absent data is equal to nothing, so «not equal» is *true* for it: a rule asking for
    // "city is not Tehran" must not silently skip everyone whose city was never filled in.
    evaluate: (a, n) => !a.present || !looseEq(a.value, n.value),
    explain: sentence(withValue('≠')),
  },
  {
    id: 'contains',
    label: 'شامل این رشته',
    kinds: ['text'],
    arity: 1,
    evaluate: (a, n) => a.present && asText(a.value).includes(asText(n.value)),
    explain: sentence((n) => `شامل «${asText(n.value)}» است`),
  },
  {
    id: 'startsWith',
    label: 'با این شروع شود',
    kinds: ['text'],
    arity: 1,
    evaluate: (a, n) => a.present && asText(a.value).startsWith(asText(n.value)),
    explain: sentence((n) => `با «${asText(n.value)}» شروع می‌شود`),
  },
  {
    id: 'in',
    label: 'یکی از این‌ها',
    kinds: ['text', 'enum', 'number'],
    arity: 1,
    // `value` is a comma-separated list: the stored rule stays tiny and the panel can render chips.
    validate: (n) =>
      numberList(n.value).length > 0
        ? null
        : 'فهرست مقدار خالی است؛ گزینه‌ها را با ویرگول جدا کنید.',
    evaluate: (a, n) => {
      if (!a.present) return false;
      return numberList(n.value).some((x) => looseEq(a.value, x));
    },
    explain: sentence((n) => `یکی از «${asText(n.value)}» است`),
  },
  {
    id: 'notIn',
    label: 'هیچ‌کدام از این‌ها',
    kinds: ['text', 'enum', 'number'],
    arity: 1,
    validate: (n) =>
      numberList(n.value).length > 0
        ? null
        : 'فهرست مقدار خالی است؛ گزینه‌ها را با ویرگول جدا کنید.',
    evaluate: (a, n) => !a.present || !numberList(n.value).some((x) => looseEq(a.value, x)),
    explain: sentence((n) => `هیچ‌کدام از «${asText(n.value)}» نیست`),
  },
  {
    id: 'isTrue',
    label: 'روشن است',
    kinds: ['boolean'],
    arity: 0,
    evaluate: (a) => a.value === true || a.value === 'true',
    explain: sentence(() => 'روشن است'),
  },
  {
    id: 'isFalse',
    label: 'خاموش است',
    kinds: ['boolean'],
    arity: 0,
    evaluate: (a) => a.present && (a.value === false || a.value === 'false'),
    explain: sentence(() => 'خاموش است'),
  },
  {
    id: 'isEmpty',
    label: 'مقداری ندارد',
    kinds: ['number', 'text', 'boolean', 'enum', 'date', 'presence'],
    arity: 0,
    presenceOnly: true,
    evaluate: (a) => !a.present || a.value === null || a.value === '',
    explain: (a, _n, f) =>
      `${f.label}: ${a.present ? `مقدارش «${showValue(f, a.value)}» است` : 'مقداری ندارد'}`,
  },
  {
    id: 'isNotEmpty',
    label: 'مقداری دارد',
    kinds: ['number', 'text', 'boolean', 'enum', 'date', 'presence'],
    arity: 0,
    presenceOnly: true,
    evaluate: (a) => a.present && a.value !== null && a.value !== '',
    explain: (a, _n, f) =>
      `${f.label}: ${a.present ? `مقدارش «${showValue(f, a.value)}» است` : 'مقداری ندارد'}`,
  },
  {
    id: 'before',
    label: 'قبل از این زمان/تاریخ',
    kinds: ['date'],
    arity: 1,
    validate: (n) =>
      DATE_RE.test(asText(n.value))
        ? null
        : 'تاریخ را مثل ۲۰۲۶-۰۴-۰۱ یا ساعت را مثل ۱۸:۳۰ بنویسید.',
    evaluate: (a, n) => {
      const t = a.present ? parseDate(a.value) : null;
      const w = parseDate(n.value);
      return t !== null && w !== null && t <= w;
    },
    explain: sentence((n) => `پیش از «${asText(n.value)}» است`),
  },
  {
    id: 'after',
    label: 'بعد از این زمان/تاریخ',
    kinds: ['date'],
    arity: 1,
    validate: (n) =>
      DATE_RE.test(asText(n.value))
        ? null
        : 'تاریخ را مثل ۲۰۲۶-۰۴-۰۱ یا ساعت را مثل ۱۸:۳۰ بنویسید.',
    evaluate: (a, n) => {
      const t = a.present ? parseDate(a.value) : null;
      const w = parseDate(n.value);
      return t !== null && w !== null && t > w;
    },
    explain: sentence((n) => `پس از «${asText(n.value)}» است`),
  },
  {
    id: 'daysAgoGte',
    label: 'حداقل این روزها گذشته',
    kinds: ['date'],
    arity: 1,
    evaluate: (a, n, _f, now) => {
      const t = a.present ? parseDate(a.value) : null;
      const days = cmp(n);
      return t !== null && days !== null && (now.getTime() - t) / DAYS >= days;
    },
    explain: (a, n, f) =>
      `${f.label}: ${actualOf(f, a)} — ${faNum(cmp(n) ?? 0)} روز یا بیشتر گذشته`,
  },
  {
    id: 'daysAgoLte',
    label: 'بیشتر این روزها نگذشته',
    kinds: ['date'],
    arity: 1,
    evaluate: (a, n, _f, now) => {
      const t = a.present ? parseDate(a.value) : null;
      const days = cmp(n);
      return t !== null && days !== null && (now.getTime() - t) / DAYS <= days;
    },
    explain: (a, n, f) => `${f.label}: ${actualOf(f, a)} — کمتر از ${faNum(cmp(n) ?? 0)} روز گذشته`,
  },
  {
    id: 'exists',
    label: 'این داده را دارد',
    kinds: ['presence'],
    arity: 0,
    presenceOnly: true,
    evaluate: (a) => a.present && a.value !== false && a.value !== null && a.value !== '',
    explain: (a, _n, f) => `${f.label}: ${a.present ? 'پیدا شد' : 'پیدا نشد'}`,
  },
  {
    id: 'missing',
    label: 'این داده را ندارد',
    kinds: ['presence'],
    arity: 0,
    presenceOnly: true,
    evaluate: (a) => !(a.present && a.value !== false && a.value !== null && a.value !== ''),
    explain: (a, _n, f) => `${f.label}: ${a.present ? 'پیدا شد' : 'پیدا نشد'}`,
  },
];

const REGISTRY = new Map<string, OperatorDef>();
for (const op of BUILT_IN_OPERATORS) REGISTRY.set(op.id, op);

/** The only supported way to teach the engine a new comparison. */
export function registerOperator(def: OperatorDef): void {
  REGISTRY.set(def.id, def);
}

export function operatorById(id: string): OperatorDef | undefined {
  return REGISTRY.get(id);
}

export function allOperators(): OperatorDef[] {
  return [...REGISTRY.values()];
}

/** The comparisons a builder may offer for one field kind — and the only ones the validator accepts. */
export function operatorsFor(kind: FieldDef['kind']): OperatorDef[] {
  return allOperators().filter((o) => o.kinds.includes(kind));
}

/** `value`/`value2` as the panel needs them described, from the operator's own contract. */
export function operatorNeeds(
  kind: FieldDef['kind'],
  id: string,
): { value: boolean; value2: boolean } {
  const op = operatorById(id);
  return { value: (op?.arity ?? 1) >= 1, value2: (op?.arity ?? 1) >= 2 };
}
