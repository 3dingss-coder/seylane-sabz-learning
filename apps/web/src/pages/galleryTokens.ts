/**
 * PHASE-1 §1.8 DoD — the data behind the gallery's «بنیادهای توکن» section.
 *
 * These are labels *about* the design system (token names, radii, lip sizes), not product copy,
 * so they live here rather than in `lib/copy/fa.ts`.
 *
 * Deliberately no hex values and no px values: the rendered swatch / box / glyph *is* the token,
 * so it cannot drift out of sync with the `@theme` block in `styles/index.css`. A second copy of
 * the number would be a lie waiting to happen — and `scripts/check-no-hex.mjs` enforces that.
 */

/** role colour → the utility class that paints it. */
export const TOKEN_SWATCHES: [label: string, cls: string][] = [
  ['سبز اصلی — اقدام', 'bg-primary'],
  ['سبز موفقیت', 'bg-success'],
  ['خطر', 'bg-danger'],
  ['هشدار', 'bg-warning'],
  ['اطلاع', 'bg-info'],
  ['بوم (canvas)', 'bg-background'],
  ['سطح', 'bg-surface'],
  ['برگ (لایهٔ پویا)', 'bg-leaf'],
  ['نعناعی (پس‌زمینهٔ نرم)', 'bg-mint'],
  ['بنفش — فقط مسکات', 'bg-mascot'],
];

/** Tailwind text size → what that step is used for. */
export const TYPE_SCALE: [cls: string, label: string][] = [
  ['text-4xl', 'نمایشی — عدد بزرگ'],
  ['text-3xl', 'عنوان صفحه'],
  ['text-2xl', 'عنوان بخش'],
  ['text-xl', 'زیرعنوان'],
  ['text-base', 'متن بدنه — ۱۶px برای خوانایی در RTL'],
  ['text-sm', 'متن کمکی'],
  ['text-xs', 'برچسب'],
];

/** radius utility → which surface it belongs to. */
export const RADII: [cls: string, label: string][] = [
  ['rounded-input', 'ورودی'],
  ['rounded-btn', 'دکمه'],
  ['rounded-card', 'کارت'],
  ['rounded-station', 'ایستگاه'],
  ['rounded-hero', 'قهرمان'],
  ['rounded-pill', 'قرص'],
];

/** lip token → what it reads as. The shadow is read from the token, never written here. */
export const LIPS: [shadow: string, label: string][] = [
  ['var(--lip-sm)', 'کوچک'],
  ['var(--lip-md)', 'متوسط'],
  ['var(--lip-lg)', 'بزرگ'],
  ['var(--lip-danger)', 'خطر'],
];

/** Headings and the one explanatory note for that section — metadata about the tokens. */
export const TOKEN_SECTION = {
  title: 'بنیادهای توکن (فاز ۱)',
  colours: 'رنگ‌های نقش‌دار',
  type: 'مقیاس تایپ — Vazirmatn RD',
  radii: 'شعاع‌ها',
  lips: 'لیپ (سایهٔ سه‌بعدی دکمه)',
  lipNote:
    'لیپ با transform جمع می‌شود، نه با سایهٔ نرم — همان چیزی که دکمه را «قابل فشار دادن» نشان می‌دهد (A-01).',
} as const;
