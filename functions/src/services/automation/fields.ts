/**
 * Field kinds and the registry every rule field has to be declared in.
 *
 * This is the extension point the panel reads and the evaluator trusts: a new piece of data becomes
 * usable in a rule by adding one `FieldDef` here (plus whatever computes it) — never by touching the
 * evaluator, the validator, or the React page. `OPERATORS` is the same idea for comparisons.
 *
 * Two flags are load-bearing for cost, not cosmetics:
 *  • `sweep`   — can this value be produced for *every* user inside one scheduled run, from the data
 *                `buildSweepContext` already holds? If not, a rule may only read it on an event/trace
 *                path (one user), or a 141-user sweep would pay one query per user per condition.
 *  • `audience`— is this field part of the user record itself (so it can filter an audience)?
 */

import type { Facts } from '../push-automation-engine';

export type FieldKind = 'number' | 'text' | 'boolean' | 'date' | 'enum' | 'presence';

export type FieldSource = 'facts' | 'user' | 'learning' | 'health' | 'prefs' | 'device' | 'event';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  /** Stable id, stored inside every rule document. Changing it breaks saved rules — add a new field. */
  id: string;
  /** What the panel shows. Persian, because the panel is Persian. */
  label: string;
  /** Short helper line under the select (unit, source, gotcha). */
  hint?: string;
  kind: FieldKind;
  /** Groups the builder renders sections by. */
  group: string;
  source: FieldSource;
  /** Usable inside a scheduled sweep (see the file header). */
  sweep: boolean;
  /** Usable in an audience filter. */
  audience: boolean;
  /** For `number`: bounds the *typed* value must sit inside. */
  min?: number;
  max?: number;
  /** For `enum`: the only accepted values. */
  options?: FieldOption[];
  /** Number formatting hint for the trace sentence. */
  unit?: string;
}

/** Everything the value of one leaf can be, as the evaluator sees it. */
export interface Actual {
  /** False when the data source has nothing for this user (never treated as 0 — that is the whole
   *  difference between «is empty» and «equals zero»). */
  present: boolean;
  value: number | string | boolean | null;
}

export const absent: Actual = { present: false, value: null };

export const known = (value: number | string | boolean): Actual => ({ present: true, value });

const F = (id: string, label: string, kind: FieldKind, over: Partial<FieldDef> = {}): FieldDef => ({
  id,
  label,
  kind,
  group: over.group ?? 'آموزش',
  source: over.source ?? 'facts',
  sweep: over.sweep ?? true,
  audience: over.audience ?? false,
  ...over,
});

/**
 * The learning/behaviour values `factsFor()` already computes for a user. Kept in step with
 * `FACT_FIELDS` in the catalogue: the panel used to offer exactly those 13; each entry now also says
 * what it *is*, so operators get numbers for numbers and yes/no for yes/no.
 */
const FACT_FIELDS: FieldDef[] = [
  F('progress', 'پیشرفت بیشترین آموزش فعال (٪)', 'number', {
    min: 0,
    max: 100,
    unit: '٪',
    hint: 'بالاترین درصد بین آموزش‌های فعال؛ ۱۰۰ یعنی چیزی باز ندارد',
  }),
  F('activePackages', 'تعداد آموزش فعال', 'number', { min: 0, max: 999 }),
  F('overduePackages', 'آموزشِ از مهلت گذشته', 'number', { min: 0, max: 999 }),
  F('stalledSections', 'قسمت نیمه‌کاره (زیر ۲۵٪)', 'number', { min: 0, max: 999 }),
  F('streakDays', 'روزهای پیوسته فعالیت', 'number', { min: 0, max: 3650 }),
  F('inactiveDays', 'روز بی‌فعالیتی', 'number', {
    min: 0,
    max: 9999,
    hint: '۹۹۹۹ یعنی هرگز وارد نشده است',
  }),
  F('completedLast7d', 'آموزش کامل‌شده در ۷ روز اخیر', 'number', { min: 0, max: 999 }),
  F('startedEver', 'حتی یک قسمت را باز کرده است', 'boolean'),
  F('accountAgeDays', 'سن حساب (روز)', 'number', { min: 0, max: 3650, group: 'حساب کاربر' }),
  F('todayActive', 'امروز فعال بوده است', 'boolean'),
  F('hasDeadlineSoon', 'مهلت نزدیک (۷۲ ساعت)', 'boolean'),
  F('failureRatePct', 'نرخ شکست پوش (٪)', 'number', {
    min: 0,
    max: 100,
    unit: '٪',
    group: 'سلامت سامانه',
    source: 'health',
  }),
  F('cronStalenessMin', 'دقیقه از آخرین اجرای زمان‌بندی', 'number', {
    min: 0,
    max: 10080,
    group: 'سلامت سامانه',
    source: 'health',
  }),
];

/** The user row itself — the only fields an audience filter may use (no per-user queries needed). */
const USER_FIELDS: FieldDef[] = [
  F('user.role', 'نقش کاربر', 'enum', {
    group: 'حساب کاربر',
    source: 'user',
    audience: true,
    options: [
      { value: 'marketer', label: 'بازاریاب' },
      { value: 'manager', label: 'مدیر' },
      { value: 'admin', label: 'ادمین' },
      { value: 'superadmin', label: 'سوپرادمین' },
    ],
  }),
  F('user.status', 'وضعیت حساب', 'enum', {
    group: 'حساب کاربر',
    source: 'user',
    audience: true,
    // Exactly `UserStatus`: a rule must not be able to ask for a state the store cannot hold.
    options: [
      { value: 'active', label: 'فعال' },
      { value: 'inactive', label: 'غیرفعال' },
    ],
  }),
  F('user.name', 'نام کاربر', 'text', { group: 'حساب کاربر', source: 'user', audience: true }),
  F('user.province', 'استان', 'text', { group: 'حساب کاربر', source: 'user', audience: true }),
  F('user.city', 'شهر', 'text', { group: 'حساب کاربر', source: 'user', audience: true }),
  F('user.teamId', 'تیم', 'text', {
    group: 'حساب کاربر',
    source: 'user',
    audience: true,
    hint: 'شناسه‌ی تیم، همان چیزی که در فهرست کاربران می‌بینید',
  }),
  F('user.hasTeam', 'تیم دارد', 'presence', {
    group: 'حساب کاربر',
    source: 'user',
    audience: true,
  }),
  F('user.onboardedAt', 'تاریخ ثبت‌نام', 'date', { group: 'حساب کاربر', source: 'user' }),
  F('user.lastActiveAt', 'آخرین فعالیت', 'date', { group: 'حساب کاربر', source: 'user' }),
  F('user.pointsBalance', 'موجودی امتیاز کاربر', 'number', {
    min: 0,
    max: 1_000_000_000,
    group: 'حساب کاربر',
    source: 'user',
    audience: true,
  }),
  F('user.brandIds', 'برند دارد', 'presence', {
    group: 'حساب کاربر',
    source: 'user',
    audience: true,
    hint: 'آرایه‌ی برند‌های کاربر خالی نیست',
  }),
];

/** Values only an event/trace path can reach — selectable there, refused in a scheduled sweep. */
const EVENT_FIELDS: FieldDef[] = [
  F('event.score', 'نمره‌ی همین آزمون', 'number', {
    min: 0,
    max: 100,
    group: 'داده‌ی اتفاق',
    source: 'event',
    sweep: false,
    hint: 'فقط وقتی قانون از یک اتفاق روشن می‌شود مقدار دارد',
  }),
  F('event.passed', 'آزمون را پاس کرد', 'boolean', {
    group: 'داده‌ی اتفاق',
    source: 'event',
    sweep: false,
  }),
  F('event.sectionId', 'قسمتِ همین اتفاق', 'text', {
    group: 'داده‌ی اتفاق',
    source: 'event',
    sweep: false,
  }),
];

const REGISTRY = new Map<string, FieldDef>();

for (const f of [...FACT_FIELDS, ...USER_FIELDS, ...EVENT_FIELDS]) REGISTRY.set(f.id, f);

/**
 * Adds (or replaces, by id) a field. This is the only supported way for another module to teach the
 * engine about data it owns — `push-automation-catalog` uses it for nothing today, and a test uses it
 * to prove the evaluator never needs editing.
 */
export function registerField(def: FieldDef): void {
  REGISTRY.set(def.id, def);
}

export function fieldById(id: string): FieldDef | undefined {
  return REGISTRY.get(id);
}

export function allFields(): FieldDef[] {
  return [...REGISTRY.values()];
}

/** Which fields the builder offers: `rule` = anything computable in a sweep, `audience` = the user row. */
export function fieldsFor(scope: 'rule' | 'audience'): FieldDef[] {
  return scope === 'audience'
    ? allFields().filter((f) => f.audience)
    : allFields().filter((f) => f.sweep);
}

/**
 * Reads one field out of the flat fact record a sweep built. Unknown fields come back `absent`
 * (never 0): a rule asking for data the engine does not have must fail as «no value», not as «zero».
 */
export function resolveFact(field: FieldDef, facts: Facts | undefined): Actual {
  const raw = facts ? facts[field.id] : undefined;
  if (raw === undefined) return absent;
  return known(raw);
}
