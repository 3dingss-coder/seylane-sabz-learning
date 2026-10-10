import type { AutomationPriority, AutomationRow } from './pushAutomationModel';

/**
 * Pure model behind the automation wizard (no React, no fetch) — the same split
 * `pushCampaignModel.ts` uses so every rule is unit-testable without a DOM.
 *
 * The wizard is a *writer* for `PATCH /admin/push-automations/:key`, so its validation mirrors
 * `automationSchema` + `validateSemantics` (`functions/src/services/push-automation-admin.ts`)
 * with the same Persian wording: an admin should see the error while typing, and the server still
 * has the last word. `trigger`, `audience`, `message` and `delivery` are replaced wholesale by the
 * server, so `patchFromDraft` always sends all of them — never a partial object.
 */

export type TriggerKind =
  'event' | 'event_delay' | 'inactivity' | 'schedule_daily' | 'schedule_weekly' | 'condition';

export type AudienceType = 'all' | 'team' | 'role' | 'user';
export type AudienceRole = 'marketer' | 'manager' | 'admin' | 'all';
export type ConditionOp = 'gte' | 'lte' | 'eq' | 'neq';

export interface TriggerValue {
  kind: TriggerKind;
  event?: string | null;
  delayMinutes?: number | null;
  inactivityDays?: number | null;
  ladderGroup?: string | null;
  time?: string | null;
  weekday?: number | null;
  conditions?: AutomationConditionValue[] | null;
}

export interface AutomationConditionValue {
  field: string;
  op: ConditionOp;
  value: number | string | boolean;
}

export interface DetailMeta extends AutomationRow {
  trigger: TriggerValue;
  audience: { type: AudienceType; targetId: string | null; channel: 'any' | 'web' | 'android' };
  message: { title: string; body: string; actionRef: string; imageUrl: string | null };
  delivery: {
    priority: AutomationPriority;
    push: boolean;
    inApp: boolean;
    respectQuietHours: boolean;
    cooldownMs: number;
    maxPerUserPerDay: number | null;
    sendOnce: boolean | null;
    aggregateForManager: boolean | null;
  };
  supersedes: string[];
  effectiveMessage: { title: string; body: string; source: 'template' | 'automation' } | null;
  variables: Array<{ token: string; label: string }>;
  destinations: Array<{ value: string; label: string }>;
  updatedAt: string;
  updatedBy: string | null;
  createdBy: string;
  canDelete: boolean;
  needsCriticalConfirm: boolean;
  audienceRole: AudienceRole;
}

export interface CatalogMeta {
  entries: Array<{
    key: string;
    name: string;
    category: string;
    description: string;
    trigger: TriggerValue;
    isGate: boolean;
    requiresFeature: string | null;
  }>;
  variables: Array<{ token: string; label: string }>;
  destinations: Array<{ value: string; label: string }>;
  categories: Array<{ id: string; label: string; hint: string; protected: boolean }>;
  triggerKinds: Record<string, string>;
  facts: Array<{ field: string; label: string; kind: 'number' | 'boolean' }>;
  events: Record<string, string>;
  weekdays: string[];
  limits: { titleMax: number; bodyMax: number };
}

export interface RunRow {
  id: string;
  key: string;
  label: string;
  kind: 'sweep' | 'event' | 'queue' | 'manual';
  windowKey: string;
  startedAt: string;
  finishedAt: string | null;
  evaluated: number;
  matched: number;
  sent: number;
  skipped: Record<string, number>;
  /**
   * Persian wording of each reason, from the engine's own `skipLabel()`
   * (`functions/src/services/push-automation-governor.ts`). Optional because run rows written before
   * this field existed simply do not have it — the panel then shows the counts without labels.
   */
  skippedLabels?: Array<{ reason: string; count: number; label: string }>;
  failed: number;
  error: string | null;
}

export interface TextRevision {
  version: number;
  at: string;
  by: string | null;
  note: string;
  message: { title: string; body: string; actionRef: string; imageUrl: string | null };
  delivery: { priority: AutomationPriority; push: boolean; cooldownMs: number };
}

export interface TestSendResult {
  sent: boolean;
  reason?: string;
  label?: string;
  preview: { title: string; body: string };
}

// ─── Draft ───────────────────────────────────────────────────────────────────

/** Every editable number is a string here: an emptied input must not silently become 0. */
export interface WizardDraft {
  key: string;
  name: string;
  description: string;
  category: string;
  audienceRole: AudienceRole;
  triggerKind: TriggerKind;
  event: string;
  delayMinutes: string;
  inactivityDays: string;
  ladderGroup: string;
  time: string;
  weekday: string;
  conditions: Array<{ field: string; op: ConditionOp; value: string }>;
  audienceType: AudienceType;
  audienceTargetId: string;
  /** Used when `audienceType === 'role'`: which role, as the audience target. */
  roleTarget: 'marketer' | 'manager' | 'admin';
  channel: 'any' | 'web' | 'android';
  title: string;
  body: string;
  imageUrl: string;
  actionRef: string;
  priority: AutomationPriority;
  push: boolean;
  inApp: boolean;
  respectQuietHours: boolean;
  cooldownHours: string;
  maxPerUserPerDay: string;
  sendOnce: boolean;
  aggregateForManager: boolean;
  optInOnly: boolean;
  supersedes: string;
}

export const WIZARD_STEPS = [
  { id: 'what', label: 'چیست', hint: 'نام، توضیح و دسته' },
  { id: 'when', label: 'چه‌زمانی', hint: 'تریگر و شرط‌ها' },
  { id: 'who', label: 'برای چه‌کسی', hint: 'جمعیت و کانال' },
  { id: 'wording', label: 'متن و ارسال', hint: 'عنوان، مقصد، سقف‌ها' },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]['id'];

/** Which trigger fields the wizard shows — a `condition` rule never asks for a weekday. */
export const TRIGGER_FIELDS: Record<TriggerKind, string[]> = {
  event: ['event'],
  event_delay: ['event', 'delayMinutes', 'time'],
  inactivity: ['inactivityDays', 'time'],
  schedule_daily: ['time'],
  schedule_weekly: ['weekday', 'time'],
  condition: ['conditions', 'time'],
};

export const CONDITION_OPS: Array<{ op: ConditionOp; label: string }> = [
  { op: 'gte', label: 'بیشتر یا مساوی' },
  { op: 'lte', label: 'کمتر یا مساوی' },
  { op: 'eq', label: 'مساوی' },
  { op: 'neq', label: 'نابرابر' },
];

export const AUDIENCE_TYPE_LABELS: Record<AudienceType, string> = {
  all: 'همه',
  team: 'یک تیم',
  role: 'یک نقش',
  user: 'فقط یک کاربر',
};

const num = (v: number | null | undefined): string =>
  v === null || v === undefined ? '' : String(v);

export function emptyDraft(
  meta: CatalogMeta | null,
  audienceRole: AudienceRole = 'all',
): WizardDraft {
  return {
    key: '',
    name: '',
    description: '',
    category: 'general',
    audienceRole,
    triggerKind: 'condition',
    event: '',
    delayMinutes: '',
    inactivityDays: '1',
    ladderGroup: '',
    time: '',
    weekday: '',
    conditions: [{ field: 'progress', op: 'lte', value: '80' }],
    audienceType: 'all',
    audienceTargetId: '',
    roleTarget: 'marketer',
    channel: 'any',
    title: '',
    body: '',
    imageUrl: '',
    actionRef: meta?.destinations[1]?.value ?? '/learn',
    priority: 'normal',
    push: true,
    inApp: true,
    respectQuietHours: true,
    cooldownHours: '',
    maxPerUserPerDay: '',
    sendOnce: false,
    aggregateForManager: false,
    optInOnly: false,
    supersedes: '',
  };
}

const hoursOf = (ms: number | null | undefined): string =>
  ms ? String(Math.round(ms / 3_600_000)) : '';

export function draftFromDetail(d: DetailMeta): WizardDraft {
  const base = emptyDraft(null);
  const t = d.trigger ?? ({} as TriggerValue);
  return {
    ...base,
    key: d.key,
    name: d.name ?? '',
    description: d.description ?? '',
    category: d.category ?? 'general',
    audienceRole: (d.audienceRole ?? 'all') as AudienceRole,
    triggerKind: (t.kind ?? 'condition') as TriggerKind,
    event: t.event ?? '',
    delayMinutes: num(t.delayMinutes),
    inactivityDays: num(t.inactivityDays),
    ladderGroup: t.ladderGroup ?? '',
    time: t.time ?? '',
    weekday: t.weekday === null || t.weekday === undefined ? '' : String(t.weekday),
    conditions: (t.conditions ?? []).map((c) => ({
      field: c.field,
      op: c.op,
      value: typeof c.value === 'boolean' ? (c.value ? 'true' : 'false') : String(c.value),
    })),
    audienceType: d.audience?.type ?? 'all',
    audienceTargetId: d.audience?.type === 'role' ? '' : (d.audience?.targetId ?? ''),
    roleTarget:
      d.audience?.type === 'role' &&
      (d.audience?.targetId === 'manager' || d.audience?.targetId === 'admin')
        ? d.audience.targetId
        : 'marketer',
    channel: d.audience?.channel ?? 'any',
    title: d.message?.title ?? '',
    body: d.message?.body ?? '',
    imageUrl: d.message?.imageUrl ?? '',
    actionRef: d.message?.actionRef ?? '/learn',
    priority: d.delivery?.priority ?? 'normal',
    push: d.delivery?.push ?? true,
    inApp: d.delivery?.inApp ?? true,
    respectQuietHours: d.delivery?.respectQuietHours ?? true,
    cooldownHours: hoursOf(d.delivery?.cooldownMs),
    maxPerUserPerDay: num(d.delivery?.maxPerUserPerDay),
    sendOnce: !!d.delivery?.sendOnce,
    aggregateForManager: !!d.delivery?.aggregateForManager,
    optInOnly: !!d.optInOnly,
    supersedes: (d.supersedes ?? []).join(','),
  };
}

const intOf = (v: string): number | null => {
  const t = v.trim().replace(/[^\d-]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : null;
};

export type WizardErrors = Record<string, string>;

/** Client-side mirror of the server rules, keyed by field, all in Persian. */
export function validateStep(
  step: WizardStepId,
  d: WizardDraft,
  meta: CatalogMeta | null,
): WizardErrors {
  const e: WizardErrors = {};
  const titleMax = meta?.limits.titleMax ?? 80;
  const bodyMax = meta?.limits.bodyMax ?? 300;
  const len = (v: string) => v.trim().length;

  if (step === 'what') {
    if (len(d.name) < 2 || len(d.name) > 60) e.name = 'نام باید بین ۲ تا ۶۰ نویسه باشد.';
    if (len(d.description) < 2 || len(d.description) > 300)
      e.description = 'توضیح باید بین ۲ تا ۳۰۰ نویسه باشد.';
    if (meta && !meta.categories.some((c) => c.id === d.category))
      e.category = 'این دسته در فهرست مجاز نیست.';
    if (!d.key.trim()) e.key = 'کلید لازم است.';
    else if (!/^[a-z0-9][a-z0-9_]{2,39}$/.test(d.key.trim()))
      e.key = 'کلید باید کوچک، لاتین و یکتا باشد؛ مثل inactive_1d.';
  }

  if (step === 'when') {
    const needsEvent = d.triggerKind === 'event' || d.triggerKind === 'event_delay';
    if (needsEvent) {
      if (!d.event.trim()) e.event = 'برای تریگر از نوع اتفاق، نام اتفاق لازم است.';
      else if (meta && !(d.event.trim() in meta.events))
        e.event = 'این اتفاق هنوز توسط سامانه منتشر نمی‌شود؛ از فهرست انتخابش کنید.';
    }
    if (d.triggerKind === 'event_delay') {
      const m = intOf(d.delayMinutes);
      if (m === null || m < 1 || m > 7 * 24 * 60)
        e.delayMinutes = 'برای اتفاق با تأخیر، دقیقه‌ای بین ۱ تا ۱۰۰۸۰ لازم است.';
    }
    if (d.triggerKind === 'inactivity') {
      const days = intOf(d.inactivityDays);
      if (days === null || days < 1 || days > 60)
        e.inactivityDays = 'برای بی‌فعالیتی، تعداد روز بین ۱ تا ۶۰ لازم است.';
    }
    if (d.triggerKind === 'schedule_weekly' && intOf(d.weekday) === null)
      e.weekday = 'برای برنامه هفتگی، روز هفته لازم است.';
    if (d.triggerKind === 'condition') {
      if (!d.conditions.length) e.conditions = 'حداقل یک شرط لازم است؛ مثلاً پیشرفت کمتر از ۸۰.';
      const known = new Map((meta?.facts ?? []).map((f) => [f.field, f.kind]));
      for (const [i, c] of d.conditions.entries()) {
        if (meta && known.size && !known.has(c.field))
          e[`conditions.${i}.field`] = `شرط «${c.field}» در فهرست داده‌های قابل محاسبه نیست.`;
        const kind = known.get(c.field);
        if (kind === 'boolean') {
          if (c.value !== 'true' && c.value !== 'false')
            e[`conditions.${i}.value`] = 'این داده بله/خیر است.';
        } else if (kind === 'number' && intOf(c.value) === null) {
          e[`conditions.${i}.value`] = 'مقدار این شرط باید عدد باشد.';
        } else if (!c.value.trim()) {
          e[`conditions.${i}.value`] = 'مقدار شرط لازم است.';
        }
      }
    }
    if (d.time.trim() && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(d.time.trim()))
      e.time = 'ساعت را به قالب HH:mm بنویسید.';
  }

  if (step === 'who') {
    // A role target is a pick list (the same four values the sweep understands), so it cannot be
    // mistyped; team/user need an id, exactly like `validateSemantics` on the server.
    if ((d.audienceType === 'team' || d.audienceType === 'user') && !d.audienceTargetId.trim())
      e.audienceTargetId = 'برای مخاطب تیمی/فردی، شناسه هدف لازم است.';
  }

  if (step === 'wording') {
    if (len(d.title) < 2 || len(d.title) > titleMax)
      e.title = `عنوان باید بین ۲ تا ${toFa(titleMax)} نویسه باشد.`;
    if (len(d.body) < 2 || len(d.body) > bodyMax)
      e.body = `متن باید بین ۲ تا ${toFa(bodyMax)} نویسه باشد.`;
    const allowed = new Set((meta?.variables ?? []).map((v) => v.token));
    for (const v of usedVars(`${d.title} ${d.body}`))
      if (allowed.size && !allowed.has(`{${v}}`)) e.variables = `متغیر «{${v}}» شناخته‌شده نیست.`;
    // The destination is picked from the allowlist the server publishes — a free-text path here would
    // only ever be refused by `isSafePathTemplate`, so the UI never offers one.
    if (meta && !meta.destinations.some((x) => x.value === d.actionRef))
      e.actionRef = 'مقصد باید یکی از مسیرهای داخلی مجاز باشد.';
    if (d.imageUrl.trim() && !/^https:\/\/[^/@\s]+\/[^@]*$/.test(d.imageUrl.trim()))
      e.imageUrl = 'آدرس تصویر باید یک لینک عمومی و معتبر با HTTPS باشد.';
    const cd = intOf(d.cooldownHours);
    if (cd !== null && (cd < 0 || cd > 180 * 24))
      e.cooldownHours = 'سردکردن هر کاربر بین ۰ تا ۴۳۲۰ ساعت است.';
    const cap = intOf(d.maxPerUserPerDay);
    if (cap !== null && (cap < 0 || cap > 20))
      e.maxPerUserPerDay = 'سقف روزانه این اتوماسیون بین ۰ تا ۲۰ است (خالی یعنی سقف سراسری).';
  }
  return e;
}

/** Distinct, in order of first use — the message editor shows each problem once. */
export const usedVars = (text: string): string[] => [
  ...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string)),
];

export function allErrors(d: WizardDraft, meta: CatalogMeta | null): WizardErrors {
  return WIZARD_STEPS.reduce<WizardErrors>(
    (acc, s) => Object.assign(acc, validateStep(s.id, d, meta)),
    {},
  );
}

/** The number of steps that still have a problem — the wizard shows it before the admin clicks save. */
export function incompleteSteps(d: WizardDraft, meta: CatalogMeta | null): WizardStepId[] {
  return WIZARD_STEPS.filter((s) => Object.keys(validateStep(s.id, d, meta)).length > 0).map(
    (s) => s.id,
  );
}

export interface PatchBody {
  name: string;
  description: string;
  category: string;
  audienceRole: AudienceRole;
  trigger: TriggerValue;
  audience: { type: AudienceType; targetId: string | null; channel: 'any' | 'web' | 'android' };
  message: { title: string; body: string; actionRef: string; imageUrl: string | null };
  delivery: {
    priority: AutomationPriority;
    push: boolean;
    inApp: boolean;
    respectQuietHours: boolean;
    cooldownMs: number;
    maxPerUserPerDay: number | null;
    sendOnce: boolean;
    aggregateForManager: boolean;
  };
  supersedes: string[];
  optInOnly: boolean;
}

/** Full sub-objects, always: the server replaces them, it does not merge them. */
export function patchFromDraft(d: WizardDraft): PatchBody & { expectedVersion?: number } {
  const conditions = d.conditions
    .filter((c) => c.field.trim())
    .map((c) => {
      const raw = intOf(c.value);
      const isBool = c.value === 'true' || c.value === 'false';
      return {
        field: c.field.trim(),
        op: c.op,
        value: isBool ? c.value === 'true' : raw === null ? c.value.trim().slice(0, 40) : raw,
      };
    });
  const weekday = intOf(d.weekday);
  const delay = intOf(d.delayMinutes);
  const inactive = intOf(d.inactivityDays);
  const trigger: TriggerValue = {
    kind: d.triggerKind,
    event: d.event.trim() || null,
    delayMinutes: d.triggerKind === 'event_delay' ? delay : null,
    inactivityDays: d.triggerKind === 'inactivity' ? inactive : null,
    ladderGroup: d.ladderGroup.trim() || null,
    time: d.time.trim() || null,
    weekday: d.triggerKind === 'schedule_weekly' && weekday !== null ? weekday : null,
    conditions: d.triggerKind === 'condition' ? conditions : null,
  };
  return {
    name: d.name.trim(),
    description: d.description.trim(),
    category: d.category,
    audienceRole: d.audienceRole,
    trigger,
    audience: {
      type: d.audienceType,
      targetId:
        d.audienceType === 'all'
          ? null
          : d.audienceType === 'role'
            ? d.roleTarget
            : d.audienceTargetId.trim() || null,
      channel: d.channel,
    },
    message: {
      title: d.title.trim(),
      body: d.body.trim(),
      actionRef: d.actionRef.trim(),
      imageUrl: d.imageUrl.trim() ? d.imageUrl.trim() : null,
    },
    delivery: {
      priority: d.priority,
      push: d.push,
      inApp: d.inApp,
      respectQuietHours: d.respectQuietHours,
      cooldownMs: Math.max(0, intOf(d.cooldownHours) ?? 0) * 3_600_000,
      maxPerUserPerDay: intOf(d.maxPerUserPerDay),
      sendOnce: d.sendOnce,
      aggregateForManager: d.aggregateForManager,
    },
    supersedes: d.supersedes
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 8),
    optInOnly: d.optInOnly,
  };
}

/** Body for `POST /admin/push-automations` — the same object plus the key, never `enabled`. */
export function createBody(d: WizardDraft): PatchBody & { key: string; enabled: false } {
  return { ...patchFromDraft(d), key: d.key.trim(), enabled: false };
}

// ─── Preview ─────────────────────────────────────────────────────────────────

export interface Preview {
  title: string;
  body: string;
  /** Tokens the engine could not fill from the sample data — shown, never sent silently. */
  missing: string[];
}

/**
 * Renders the wording with the sample values from a dry-run. A variable that cannot be filled stays
 * visible as `⟨name⟩`: the engine refuses to send such a message, and the preview must not hide that.
 */
export function previewOf(d: WizardDraft, vars: Record<string, string | number> | null): Preview {
  const missing = new Set<string>();
  const fill = (text: string) =>
    text.replace(/\{(\w+)\}/g, (_all, name: string) => {
      const v = vars?.[name];
      if (v === undefined || v === null || v === '') {
        missing.add(name);
        return `⟨${name}⟩`;
      }
      return String(v);
    });
  return { title: fill(d.title), body: fill(d.body), missing: [...missing] };
}

/** The chips under the message editor: what `{n}` means, and which are missing in this sample. */
export const varLabel = (meta: CatalogMeta | null, name: string): string =>
  meta?.variables.find((v) => v.token === `{${name}}`)?.label ?? name;

// ─── Reading the rest of the detail page ─────────────────────────────────────

export const toFa = (n: number | null | undefined): string => (n ?? 0).toLocaleString('fa-IR');

export const opLabel = (op: ConditionOp): string =>
  CONDITION_OPS.find((o) => o.op === op)?.label ?? op;

export const conditionLabel = (meta: CatalogMeta | null, field: string): string =>
  meta?.facts.find((f) => f.field === field)?.label ?? field;

export const eventLabel = (meta: CatalogMeta | null, event: string): string =>
  meta?.events[event] ?? event;

export const triggerSentence = (d: WizardDraft, meta: CatalogMeta | null): string => {
  const kind = meta?.triggerKinds[d.triggerKind] ?? d.triggerKind;
  const at = d.time.trim() ? `، ساعت ${d.time.trim()}` : '، در پنجره پیش‌فرض';
  switch (d.triggerKind) {
    case 'event':
      return `${kind}: ${eventLabel(meta, d.event)}`;
    case 'event_delay': {
      const m = intOf(d.delayMinutes) ?? 0;
      return `${kind}: ${eventLabel(meta, d.event)}، ${faDuration(m)} بعد`;
    }
    case 'inactivity':
      return `${kind}: ${toFa(intOf(d.inactivityDays))} روز بدون فعالیت${at}`;
    case 'schedule_weekly': {
      const w = intOf(d.weekday);
      const day = w !== null ? (meta?.weekdays[w] ?? String(w)) : 'بدون روز هفته';
      return `${kind}: ${day}${at}`;
    }
    case 'condition':
      return `${kind}: ${d.conditions
        .map((c) => {
          const n = intOf(c.value);
          return `${conditionLabel(meta, c.field)} ${opLabel(c.op)} ${n === null ? c.value : toFa(n)}`;
        })
        .join(' و ')}${at}`;
    default:
      return `${kind}${at}`;
  }
};

function faDuration(minutes: number): string {
  if (minutes >= 24 * 60) {
    const d = Math.round(minutes / (24 * 60));
    return `${toFa(d)} روز`;
  }
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${toFa(h)} ساعت و ${toFa(m)} دقیقه` : `${toFa(h)} ساعت`;
  }
  return `${toFa(minutes)} دقیقه`;
}

export interface SummaryItem {
  label: string;
  value: string;
  hint?: string;
}

/** What the read-only half of the page shows — all derived, nothing invented. */
export function deliverySummary(d: WizardDraft, meta: CatalogMeta | null): SummaryItem[] {
  const cap = intOf(d.maxPerUserPerDay);
  const cool = intOf(d.cooldownHours);
  return [
    { label: 'اولویت', value: d.priority, hint: 'فقط «فوری» از ساعت سکوت رد می‌شود' },
    {
      label: 'پوش',
      value: d.push ? 'بله' : 'نه، فقط کارت داخل اپ',
    },
    { label: 'کارت داخل اپ', value: d.inApp ? 'همیشه' : 'خاموش' },
    {
      label: 'ساعت سکوت',
      value: d.respectQuietHours ? 'رعایت می‌شود' : 'رد می‌شود (فوری)',
    },
    {
      label: 'سردکردن هر کاربر',
      value: cool ? `${toFa(cool)} ساعت` : 'پیش‌فرض',
      hint: 'بین دو ارسالِ همین قانون',
    },
    {
      label: 'سقف روزانه این قانون',
      value: cap === null ? 'سقف سراسری' : `${toFa(cap)} پوش`,
    },
    { label: 'یک‌بار در هر بازه', value: d.sendOnce ? 'بله' : 'نه' },
    {
      label: 'گزارش به مدیر',
      value: d.aggregateForManager ? 'جمع‌بندی برای مدیر' : 'نه',
      hint: 'پیام کاربر و یک کارت برای مدیر، نه دو پیام برای کاربر',
    },
    {
      label: 'مقصد',
      value: meta?.destinations.find((x) => x.value === d.actionRef)?.label ?? d.actionRef,
    },
    { label: 'تصویر', value: d.imageUrl.trim() ? d.imageUrl.trim() : 'بدون تصویر' },
  ];
}
