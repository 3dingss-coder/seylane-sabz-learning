import { z, type ZodTypeAny } from 'zod';
import { ApiError } from './errors';

/** Parse + whitelist (Zod strips unknown keys → no mass assignment). */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) {
    const details = r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    const first = details[0];
    throw new ApiError(
      'VALIDATION',
      first?.message && /[\u0600-\u06FF]/.test(first.message) ? first.message : undefined,
      details,
    );
  }
  return r.data as z.infer<S>;
}

/** Persian/Arabic digit + character normalisation for free text. */
export function normalizeText(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Keeps Persian digits in display text but unifies Arabic letters and whitespace. */
export const text = (min: number, max: number, label: string) =>
  z
    .string({
      required_error: `${label} را وارد کنید.`,
      invalid_type_error: `${label} معتبر نیست.`,
    })
    .transform((s) =>
      s
        .replace(/ي/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/[ \t]+/g, ' ')
        .trim(),
    )
    .refine((s) => s.length >= min, `${label} باید حداقل ${min} نویسه باشد.`)
    .refine((s) => s.length <= max, `${label} حداکثر ${max} نویسه است.`);

export const isoDate = (label: string) =>
  z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), `${label} معتبر نیست.`)
    .transform((s) => new Date(s).toISOString());

export const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
});

/** Simple cursor pagination over an already-sorted array (datasets are small in MVP). */
export function paginate<T extends { id: string }>(items: T[], limit: number, cursor?: string) {
  let start = 0;
  if (cursor) {
    const idx = items.findIndex((x) => x.id === cursor);
    start = idx >= 0 ? idx + 1 : 0;
  }
  const page = items.slice(start, start + limit);
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor: start + limit < items.length && last ? last.id : null,
    total: items.length,
  };
}
