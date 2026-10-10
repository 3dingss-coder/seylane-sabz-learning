import { describe, expect, it } from 'vitest';
import {
  CATEGORY_ORDER,
  PRIORITY_META,
  capsSummary,
  draftFromSettings,
  estimateChip,
  estimateSentence,
  faNum,
  faPct,
  gapLabel,
  groupRows,
  healthItems,
  isDeadlineCategory,
  needsCriticalConfirm,
  settingsFromDraft,
  shortPath,
  stateOf,
  validateCaps,
  type AutomationList,
  type AutomationRow,
  type AutomationSettings,
  type DryRunResult,
  type SystemHealth,
} from './pushAutomationModel';

const row = (over: Partial<AutomationRow> = {}): AutomationRow => ({
  key: 'inactive_1d',
  name: 'یک روز بی‌فعالیتی',
  description: 'یادآوری ادامه دادن',
  category: 'deadlines',
  categoryLabel: 'مهلت و تکلیف',
  triggerKind: 'inactivity',
  triggerLabel: 'بی‌فعالیتی کاربر',
  enabled: false,
  isSystem: true,
  isGate: false,
  templateKey: null,
  requiresFeature: null,
  optInOnly: false,
  push: true,
  priority: 'normal',
  audienceLabel: 'بازاریاب‌ها',
  timeLabel: '10:00',
  dueNow: false,
  lastRunAt: null,
  sent7d: 0,
  skipped7d: 0,
  version: 1,
  ...over,
});

const settings = (over: Partial<AutomationSettings> = {}): AutomationSettings => ({
  paused: false,
  maxPerUserPerDay: 2,
  maxPerUserPerWeek: 10,
  minGapMs: 4 * 3600_000,
  defaultHourTehran: 10,
  decisionTtlDays: 30,
  failureAlertPct: 20,
  updatedAt: '',
  updatedBy: null,
  ...over,
});

const dry = (over: Partial<DryRunResult> = {}): DryRunResult => ({
  key: 'inactive_1d',
  windowKey: '2026-10-03',
  evaluated: 12,
  wouldSend: 7,
  skipped: { capDay: 3, noDevice: 2 },
  skippedLabels: [
    { reason: 'capDay', count: 3, label: 'سقف روزانه پوش کاربر پر شده است' },
    { reason: 'noDevice', count: 2, label: 'هیچ دستگاه معتبری برای این کاربر ثبت نشده است' },
  ],
  sample: [],
  note: null,
  ...over,
});

const health = (over: Partial<SystemHealth> = {}): SystemHealth => ({
  cron: {
    lastRunAt: '2026-10-03T06:30:00.000Z',
    expression: '*/15 * * * *',
    ok: true,
    error: null,
    jobs: [],
    minutesSinceLastRun: 4,
    stalled: false,
    neverReported: false,
  },
  push: {
    provider: 'fcm-http',
    configured: true,
    lastAttemptAt: '2026-10-03T06:31:00.000Z',
    lastError: null,
    today: { sent: 30, failed: 1, invalid: 0 },
    failureRate: 0.03,
  },
  ...over,
});

describe('automation model: grouping and status chips', () => {
  it('groups by category in a fixed, meaningful order and counts what is on', () => {
    const groups = groupRows([
      row({ key: 'badge', category: 'progress', categoryLabel: 'پیشرفت', enabled: true }),
      row({ key: 'quiz', category: 'quizzes', categoryLabel: 'آزمون' }),
      row({ key: 'health', category: 'health', categoryLabel: 'سلامت سامانه' }),
      row({ key: 'dead', category: 'deadlines', categoryLabel: 'مهلت و تکلیف', enabled: true }),
      row({ key: 'dead2', category: 'deadlines', categoryLabel: 'مهلت و تکلیف' }),
    ]);
    expect(groups.map((g) => g.category)).toEqual(['deadlines', 'quizzes', 'progress', 'health']);
    expect(CATEGORY_ORDER[0]).toBe('deadlines');
    const [deadlines] = groups;
    expect(deadlines?.label).toBe('مهلت و تکلیف');
    expect(deadlines?.enabledCount).toBe(1);
    expect(deadlines?.rows).toHaveLength(2);
  });

  it('an unknown category never disappears: it lands last, labelled as it came', () => {
    const groups = groupRows([row({ category: 'weird', categoryLabel: '' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('weird');
  });

  it('a system gate is explained as a gate, not as a duplicate scenario', () => {
    expect(stateOf(row({ isGate: true, templateKey: 'reminder', enabled: true })).label).toBe(
      'سیستمی — روشن',
    );
    // A system gate that is switched off is the one state that silently deletes an existing card.
    expect(stateOf(row({ isGate: true, enabled: false })).tone).toBe('warning');
    expect(stateOf(row({ enabled: true, push: false })).label).toBe('فقط داخل اپ');
    expect(stateOf(row({ enabled: true })).label).toBe('روشن');
    expect(stateOf(row({ requiresFeature: 'team_rank' })).label).toBe('نسخه ۲');
    expect(stateOf(row({ requiresFeature: 'x' })).tone).toBe('neutral');
  });

  it('the three deadline keys need a confirmation, nothing else does', () => {
    for (const key of ['reminder', 'deadline_warning', 'deadline_passed'])
      expect(needsCriticalConfirm({ key })).toBe(true);
    expect(needsCriticalConfirm({ key: 'inactive_1d' })).toBe(false);
    expect(isDeadlineCategory(row({ category: 'deadlines' }))).toBe(true);
    expect(isDeadlineCategory(row({ category: 'quizzes' }))).toBe(false);
  });
});

describe('automation model: numbers and sentences', () => {
  it('renders Persian digits everywhere a person reads a number', () => {
    expect(faNum(1234)).toBe('۱٬۲۳۴');
    expect(faNum(null)).toBe('۰');
    expect(faPct(0.031)).toBe('۳٪');
    expect(faPct(null)).toBe('—');
    expect(PRIORITY_META.urgent.label).toBe('فوری');
  });

  it('formats the gap cap the way an admin thinks about it', () => {
    expect(gapLabel(0)).toBe('بدون فاصله');
    expect(gapLabel(4 * 3600_000)).toBe('۴ ساعت');
    expect(gapLabel(90 * 60_000)).toBe('۱ ساعت و ۳۰ دقیقه');
    expect(gapLabel(45_000)).toBe('۱ دقیقه');
    expect(gapLabel(20_000)).toBe('۲۰ ثانیه');
  });

  it('summarises the global caps in one line', () => {
    expect(capsSummary(settings())).toBe(
      'حداکثر ۲ پوش در روز برای هر نفر · ۱۰ پوش در هفته · حداقل فاصله ۴ ساعت',
    );
  });

  it('says what a dry-run means, including why people were skipped', () => {
    expect(estimateSentence(dry({ skipped: {}, skippedLabels: [] }))).toBe(
      '۱۲ نفر در جمعیت بررسی‌شده مشمول این قانون بودند — ۷ نفر همین حالا پوش می‌گرفتند.',
    );
    const text = estimateSentence(dry());
    expect(text).toContain('ردشدن‌ها: سقف روزانه پوش کاربر پر شده است (۳)');
    expect(estimateChip(dry())).toBe('۷ نفر مشمول ارسال');
  });
});

describe('automation model: caps form', () => {
  it('mirrors the server limits with Persian errors instead of a 400', () => {
    const draft = draftFromSettings(settings());
    expect(draft).toMatchObject({
      maxPerUserPerDay: '2',
      maxPerUserPerWeek: '10',
      gapMinutes: '240',
      defaultHourTehran: '10',
      decisionTtlDays: '30',
      failureAlertPct: '20',
    });
    expect(validateCaps(draft)).toEqual({});
    expect(Object.keys(validateCaps({ ...draft, maxPerUserPerDay: '21' }))).toEqual([
      'maxPerUserPerDay',
    ]);
    expect(validateCaps({ ...draft, maxPerUserPerDay: '' }).maxPerUserPerDay).toContain('۰ تا ۲۰');
    expect(validateCaps({ ...draft, gapMinutes: '-1' }).gapMinutes).toBeTruthy();
    expect(validateCaps({ ...draft, decisionTtlDays: '0' }).decisionTtlDays).toBeTruthy();
    expect(validateCaps({ ...draft, failureAlertPct: '101' }).failureAlertPct).toBeTruthy();
  });

  it('converts minutes back to milliseconds and keeps the rest of the document', () => {
    const next = settingsFromDraft(
      { ...draftFromSettings(settings()), gapMinutes: '90' },
      settings(),
    );
    expect(next.minGapMs).toBe(90 * 60_000);
    expect(next.paused).toBe(false);
    expect(next.decisionTtlDays).toBe(30);
    // An unparsable field falls back to what is stored, never to 0.
    expect(
      settingsFromDraft({ ...draftFromSettings(settings()), gapMinutes: 'abc' }, settings())
        .minGapMs,
    ).toBe(4 * 3600_000);
  });
});

describe('automation model: health card', () => {
  it('names the three things an admin must not guess', () => {
    const items = healthItems(health(), settings());
    expect(items.map((i) => i.id)).toEqual(['scheduler', 'provider', 'volume', 'failures']);
    const [scheduler, provider, volume, failures] = items;
    expect(scheduler?.tone).toBe('success');
    expect(provider?.value).toBe('fcm-http');
    expect(volume?.detail).toContain('حداکثر ۲ پوش در روز');
    expect(failures?.value).toBe('۳٪');
  });

  it('a scheduler that never reported is the loudest signal, and stale is a warning', () => {
    const never = healthItems(
      health({
        cron: {
          ...health().cron,
          lastRunAt: null,
          minutesSinceLastRun: null,
          stalled: true,
          neverReported: true,
        },
      }),
      settings(),
    );
    expect(never[0]?.tone).toBe('danger');
    expect(never[0]?.value).toBe('گزارشی نرسانده است');
    const stale = healthItems(
      health({ cron: { ...health().cron, minutesSinceLastRun: 95, stalled: true } }),
      settings(),
    );
    expect(stale[0]?.tone).toBe('warning');
    expect(stale[0]?.value).toContain('۹۵ دقیقه');
  });

  it('an unconfigured provider and a failure rate above the alert threshold both shout', () => {
    const items = healthItems(
      health({
        push: { ...health().push, configured: false, provider: 'unconfigured', failureRate: 0.4 },
      }),
      settings({ failureAlertPct: 20 }),
    );
    expect(items[1]?.tone).toBe('danger');
    expect(items[3]?.tone).toBe('danger');
    expect(healthItems(health(), settings({ paused: true }))[2]?.tone).toBe('warning');
    expect(
      healthItems(health({ push: { ...health().push, failureRate: null } }), settings())[3]?.value,
    ).toBe('داده‌ای نیست');
  });
});

describe('automation model: the panel is a view, not a decision maker', () => {
  it('shows the destination as a plain internal path and never as a link the table can invent', () => {
    expect(shortPath('/packages/p1')).toBe('packages/p1');
    expect(shortPath('/')).toBe('خانه');
  });

  it('passes the server counts through untouched for the header strip', () => {
    const list: AutomationList = {
      rows: [row({ enabled: true }), row({ key: 'x', enabled: false })],
      paused: false,
      settings: settings(),
      counts: { total: 38, enabled: 1, gates: 13, v2: 3 },
      today: { sent: 12, skipped: { capDay: 4 } },
    };
    expect(list.counts.enabled).toBe(1);
    expect(list.rows.filter((r) => r.dueNow)).toHaveLength(0);
    expect(Object.values(list.today.skipped).reduce((a, b) => a + b, 0)).toBe(4);
  });
});
