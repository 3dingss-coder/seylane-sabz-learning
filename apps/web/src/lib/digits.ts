const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

/** Persian digits for body text (§16.3). */
export function toPersianDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => FA[Number(d)] ?? d);
}

/** Normalize Persian/Arabic digits to Latin (inputs: phone, numbers — §24 normalization). */
export function toLatinDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (d) => {
    const fa = FA.indexOf(d);
    return String(fa >= 0 ? fa : AR.indexOf(d));
  });
}

/** «علی عدلی — ۰۹۱۲…» : the phone/email tells apart users who share the same name. */
export function userOptionLabel(u: {
  name: string;
  phone: string | null;
  email: string | null;
}): string {
  const id = u.phone ?? u.email;
  return id ? `${u.name} — ${toPersianDigits(id)}` : u.name;
}
