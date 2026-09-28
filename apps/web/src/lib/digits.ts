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
