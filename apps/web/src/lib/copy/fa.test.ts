import { describe, expect, it } from 'vitest';
import {
  allCopyStrings,
  allFormatSamples,
  BANNED_PHRASES,
  COPY,
  copyViolations,
  MAX_EMOJI_PER_BUBBLE,
  MAX_SENTENCES,
  LINES,
} from './fa';

/**
 * PHASE-6 §6.4 — the copy quality gate, as an executable rule rather than a review checklist.
 */
describe('PHASE-6 — copy quality (§6.4)', () => {
  it('no string in the module breaks the voice rules', () => {
    const violations = copyViolations(allCopyStrings());
    expect(violations).toEqual([]);
  });

  it('the numbered lines are gated too — not just the static ones', () => {
    expect(copyViolations(allFormatSamples())).toEqual([]);
  });

  it('every numbered line is actually covered by the samples', () => {
    const samples = allFormatSamples();
    expect(samples.length).toBe(Object.keys(LINES).length);
    for (const [, text] of samples) expect(text).toMatch(/[\u0600-\u06FF]/);
  });

  it('the gate actually catches each rule (otherwise it is decoration)', () => {
    const bad: Array<[string, string]> = [
      ['a', 'متأسفانه مردود شدی.'],
      ['b', 'خطا: ۵۰۳ رخ داد.'],
      ['c', '🎉🎉🎉 آفرین!'],
      ['d', 'جملهٔ اول. جملهٔ دوم. جملهٔ سوم.'],
      ['e', 'من ناراحت می‌شم اگه نیای.'],
      ['f', 'داده‌ای یافت نشد.'],
    ];
    const rules = copyViolations(bad).map((v) => v.rule);
    expect(rules).toContain('banned:مردود');
    expect(rules).toContain('error-code');
    expect(rules).toContain('too-many-emoji');
    expect(rules).toContain('too-long');
    expect(rules).toContain('banned:ناراحت');
    expect(rules).toContain('banned:داده‌ای یافت نشد');
  });

  it('one emoji is allowed, two are not (§6.4 rule 4)', () => {
    expect(MAX_EMOJI_PER_BUBBLE).toBe(1);
    expect(copyViolations([['x', 'آفرین 🦜']])).toEqual([]);
    expect(copyViolations([['x', 'آفرین 🦜🎉']])[0]?.rule).toBe('too-many-emoji');
  });

  it('two sentences are allowed, three are not (§6.0)', () => {
    expect(MAX_SENTENCES).toBe(2);
    expect(copyViolations([['x', 'سلام. حالت چطوره؟']])).toEqual([]);
    expect(copyViolations([['x', 'یک. دو. سه.']])[0]?.rule).toBe('too-long');
  });
});

describe('PHASE-6 §6.2 — the reference matrix is complete', () => {
  it('every state in the matrix has a non-empty string', () => {
    const required = [
      COPY.empty.home,
      COPY.empty.completed,
      COPY.empty.cards,
      COPY.empty.messages,
      COPY.loading.mentorThinking,
      COPY.error.network,
      COPY.error.video,
      COPY.error.offlineSaved,
      COPY.error.mentorUnavailable,
      COPY.success.duelPassedCustomer,
      COPY.success.packageCompleted,
      COPY.success.mastery,
      COPY.success.reviewOnTime,
      COPY.streak.dailyReminder,
      COPY.streak.shieldUsed,
      COPY.streak.milestone30,
      COPY.deadline.tomorrow,
    ];
    for (const s of required) expect(s.length).toBeGreaterThan(5);
  });

  it('the banned list is the one from §6.4', () => {
    expect(BANNED_PHRASES).toContain('مردود');
    expect(BANNED_PHRASES).toContain('خطا:');
    expect(BANNED_PHRASES).toContain('ناراحت');
  });

  it('§6.1 — a deadline is information, never a countdown threat', () => {
    expect(COPY.deadline.tomorrow).toContain('پنج دقیقه');
    expect(COPY.deadline.tomorrow).not.toMatch(/فقط \d+ ساعت/);
  });
});
