import { describe, expect, it } from 'vitest';
import { detectSmallTalk } from '../src/services/mentor-converse';
describe('detectSmallTalk', () => {
  const cases: Array<[string, string | null]> = [
    ['سلام', 'greeting'],
    ['سلام، چطوری؟', 'wellbeing'],
    ['درود بر شما', 'greeting'],
    ['hi', 'greeting'],
    ['چطوری؟', 'wellbeing'],
    ['خوبی؟', 'wellbeing'],
    ['مرسی', 'thanks'],
    ['ممنون از کمکت', 'thanks'],
    ['خداحافظ', 'farewell'],
    ['باشه', 'ack'],
    ['خسته شدم امروز', 'feeling'],
    ['اسمت چیه؟', 'chat'],
    ['مزیت اصلی کرم آیس بال چیست؟', null],
    ['قیمت عمده محصول دارت چقدره', null],
    ['سلام، مزیت محصول آیس بال چیه؟', null],
    ['به مشتری مردد چه بگویم؟', null],
    ['قیمت دلار فردا چقدر می‌شود؟', null],
  ];
  for (const [t, k] of cases) it(`${t} -> ${k}`, () => expect(detectSmallTalk(t)).toBe(k));
});
