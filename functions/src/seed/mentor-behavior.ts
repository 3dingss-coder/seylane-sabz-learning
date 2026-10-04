/**
 * Loads the product knowledge files in `mentor-behavior/` (the «فایل رفتار منتور» zip
 * the client supplied) into mentor_guides, one per brand/product. Idempotent: existing
 * admin-authored guides win (we never overwrite admin edits).
 *
 * Each .md file has a Persian header like `# فورمی | ست آبرسان ۴ME` followed by the
 * knowledge structure defined in 00_README.md. We store the body verbatim as the
 * guide's `summary` and `keyPoints`/etc. fields so the mentor can answer product
 * questions grounded in these files.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Deps } from '../services/context';
import * as guides from '../services/mentor-guides';
import { normalizeFa } from '../services/mentor';

export interface BehaviorFileMapping {
  file: string;
  /** 'brand' or 'product' */
  kind: 'brand' | 'product';
  /** Brand id (for kind='product' this is the brand the product belongs to). */
  brandId?: string | null;
  /** Product id (for kind='product'). */
  productId?: string | null;
  /** Override guide title (otherwise derived from the markdown H1). */
  title?: string;
}

/**
 * Mapping from mentor-behavior/*.md files to their brand/product targets.
 * File names (01_Formi, ...) correspond to the SKU order in 00_README.md.
 * Product IDs are taken from catalog-supplement.json and brands.csv.
 */
export const BEHAVIOR_FILES: BehaviorFileMapping[] = [
  // 01 Formi — 4ME hydration set → brand-sb-formi / sb-310350101
  { file: '01_Formi.md', kind: 'brand', brandId: 'brand-sb-formi' },
  // 02 Zen — Zen Body Oil → brand-sb-zen / sb-290252101
  { file: '02_Zen.md', kind: 'brand', brandId: 'brand-sb-zen' },
  // 03 As — With Us heel cream → brand-sb-vitas / sb-340122101
  { file: '03_As.md', kind: 'brand', brandId: 'brand-sb-vitas' },
  // 04 Atel — ATL quick fix → brand-sb-atl / sb-220306101
  { file: '04_Atel.md', kind: 'brand', brandId: 'brand-sb-atl' },
  // 05 Collamin — Collagen bank → brand-sb-11 (کالمین)
  { file: '05_Collamin.md', kind: 'brand', brandId: 'brand-sb-11' },
  // 06 IceBall — Ice Ball brand → brand-sb-10 (آیس بال)
  { file: '06_IceBall.md', kind: 'brand', brandId: 'brand-sb-10' },
  // 07 Bubble — ICE BUBBLE foam cleanser → brand-sb-icebubble / sb-370276101
  { file: '07_Bubble.md', kind: 'brand', brandId: 'brand-sb-icebubble' },
  // 08 Dart — Filler Shot (no brand yet); merged into the global mentor guide.
  { file: '08_Dart.md', kind: 'brand', brandId: null },
];

/** Parsed content of one mentor-behavior markdown file. */
interface ParsedBehavior {
  title: string;
  summary: string;
  keyPoints: string[];
  sellingPoints: string[];
  objections: Array<{ objection: string; answer: string }>;
  faq: Array<{ question: string; answer: string }>;
  dos: string[];
  donts: string[];
}

function parseBehaviorMarkdown(raw: string): ParsedBehavior {
  // Title from first H1 line
  const lines = raw.split(/\r?\n/);
  let title = '';
  const bodyLines: string[] = [];
  let inBody = false;
  for (const line of lines) {
    if (!title && line.startsWith('# ')) {
      title = line.replace(/^#\s+/, '').trim();
      inBody = true;
      continue;
    }
    if (inBody) bodyLines.push(line);
  }
  const body = bodyLines.join('\n');

  // Extract key sections by ## headers
  const section = (heading: string): string => {
    const re = new RegExp(`##\\s+${escapeReg(heading)}[\\s\\S]*?(?=\\n##\\s|$)`, 'm');
    const m = body.match(re);
    return m ? m[0].replace(new RegExp(`##\\s+${escapeReg(heading)}\\s*\\n?`), '').trim() : '';
  };

  const problem = section('مسئله و (?:ارزش پیشنهادی|داستان محصول) \\[مستند\\]') || section('مسئله و ارزش پیشنهادی');
  const features = section('ترکیب، کارکرد و مخاطب \\[مستند\\]') || section('ویژگی و مخاطب \\[مستند\\]');
  const usage = section('شیوهٔ مصرف بر اساس هدف \\[مستند\\]') || section('مصرف و انتخاب \\[مستند\\]');
  const sales = section('کشف نیاز و پرزنت \\[پیشنهاد فروش\\]') || section('گفت‌وگوی فروش \\[پیشنهاد فروش\\]');
  const qa = section('سؤال‌ها و اعتراض‌های مححتمل') || section('پاسخ‌های کاربردی');
  const safety = section('ایمنی، تمایز و پیشنهاد همراه') || section('خط قرمز و تمایز');

  const keyPoints: string[] = [];
  if (problem) keyPoints.push(summarize(problem, 280));
  if (features) keyPoints.push(summarize(features, 320));
  if (usage) keyPoints.push(summarize(usage, 280));

  const sellingPoints: string[] = [];
  if (sales) {
    // Extract bullet lines
    const bullets = sales.split(/\n/).map((l) => l.trim()).filter((l) => l.startsWith('-'));
    if (bullets.length) sellingPoints.push(...bullets.map(cleanBullet).slice(0, 6));
    else sellingPoints.push(summarize(sales, 280));
  }

  // Parse objections from Q&A
  const objections: Array<{ objection: string; answer: string }> = [];
  if (qa) {
    const lines = qa.split(/\n/);
    let currentQ = '';
    let currentA = '';
    for (const line of lines) {
      const m = line.match(/^[-*]\s*[«"]?([^«»":؟?]+)[»"]?\s*(?:پاسخ:|:)\s*(.+)$/);
      if (m && m[1] && m[2]) {
        if (currentQ) objections.push({ objection: currentQ.trim(), answer: currentA.trim() });
        currentQ = m[1].replace(/^«|»$/g, '').trim();
        currentA = m[2].trim();
      } else {
        const mm = line.match(/^[-*]\s*«([^»]+)»\s*:?\s*(.*)$/);
        if (mm && mm[1]) {
          if (currentQ) objections.push({ objection: currentQ.trim(), answer: currentA.trim() });
          currentQ = mm[1].trim();
          currentA = (mm[2] ?? '').trim();
        } else if (currentQ && line.trim() && !line.startsWith('#')) {
          currentA += ' ' + line.trim();
        }
      }
    }
    if (currentQ) objections.push({ objection: currentQ.trim(), answer: currentA.trim() });
  }

  const dos: string[] = [];
  const donts: string[] = [];
  if (safety) {
    // Pull out negative imperatives as donts
    const negMatches = safety.match(/(?:استفاده نشود|نکنید?|نگو|ممنوع|نباشد|پرهیز)[^.؟!]*/g);
    if (negMatches) donts.push(...negMatches.slice(0, 6).map((s) => s.trim()));
    const posMatches = safety.match(/(?:پیشنهاد|معرفی کن|بگو|استفاده شود|تأکید)[^.؟!]*/g);
    if (posMatches) dos.push(...posMatches.slice(0, 6).map((s) => s.trim()));
  }

  return {
    title: title || 'راهنمای محصول',
    summary: [problem, features].filter(Boolean).join('\n\n').slice(0, 3000),
    keyPoints: keyPoints.filter(Boolean).slice(0, 10),
    sellingPoints: sellingPoints.filter(Boolean).slice(0, 10),
    objections: objections.filter((o) => o.objection).slice(0, 10),
    faq: [],
    dos: dos.filter(Boolean).slice(0, 8),
    donts: donts.filter(Boolean).slice(0, 8),
  };
}

function cleanBullet(s: string): string {
  return s.replace(/^[-*]\s*/, '').trim();
}
function summarize(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + '…' : t;
}
function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Seeds every mentor-behavior/*.md file into mentor_guides. Idempotent: if a guide already
 * exists (e.g. the admin edited it), we leave it alone.
 */
export async function seedMentorBehavior(d: Deps, repoRoot: string, log?: (m: string) => void): Promise<number> {
  const dir = path.join(repoRoot, 'mentor-behavior');
  if (!fs.existsSync(dir)) {
    log?.('mentor-behavior: directory not found, skipping');
    return 0;
  }
  const actor = { id: 'seed-mentor-behavior', role: 'system' as const };
  let count = 0;
  for (const mapping of BEHAVIOR_FILES) {
    const filePath = path.join(dir, mapping.file);
    if (!fs.existsSync(filePath)) {
      log?.(`mentor-behavior: missing ${mapping.file}, skipping`);
      continue;
    }
    // Decide doc id — brand-level or product-level. Dart (brandId null) → global.
    const kind = mapping.kind;
    const targetId = mapping.productId ?? mapping.brandId ?? null;
    if (kind === 'brand' && !mapping.brandId) {
      // Global guide merge — append to existing global rather than replacing.
      await mergeGlobal(d, actor, filePath, log);
      count++;
      continue;
    }
    const docId = guides.guideDocId(kind, targetId);
    const existing = await d.store.get(`mentor_guides/${docId}`);
    if (existing) {
      log?.(`mentor-behavior: ${docId} already exists (admin-authored), skipping`);
      continue;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = parseBehaviorMarkdown(raw);
    await guides.upsertGuide(
      d,
      actor,
      kind,
      targetId,
      {
        title: parsed.title,
        enabled: true,
        tone: 'coach',
        personaNote: 'همکار و مربی فروش باتجربه؛ پاسخ مستقیم، یک دلیل از سند، یک نکته مصرف، یک سؤال کوتاه.',
        summary: parsed.summary,
        keyPoints: parsed.keyPoints,
        sellingPoints: parsed.sellingPoints,
        objections: parsed.objections,
        faq: parsed.faq,
        dos: parsed.dos,
        donts: parsed.donts,
        keywords: extractKeywords(parsed.title),
        priority: 2,
        quizAnswers: 'hide',
      },
    );
    log?.(`mentor-behavior: seeded ${docId} (${parsed.title})`);
    count++;
  }
  return count;
}

async function mergeGlobal(
  d: Deps,
  actor: { id: string; role: 'system' },
  filePath: string,
  log?: (m: string) => void,
) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = parseBehaviorMarkdown(raw);
  // Fetch existing global (or empty).
  const existing = await d.store.get(`mentor_guides/${guides.GLOBAL_GUIDE_ID}`);
  const base = existing
    ? {
        title: (existing as { title?: string }).title ?? 'رفتار پیش‌فرض منتور',
        enabled: (existing as { enabled?: boolean }).enabled ?? true,
        tone: ((existing as { tone?: 'friendly' | 'professional' | 'coach' | 'brief' }).tone ?? 'friendly'),
        personaNote: (existing as { personaNote?: string }).personaNote ?? '',
        summary: (existing as { summary?: string }).summary ?? '',
        keyPoints: (existing as { keyPoints?: string[] }).keyPoints ?? [],
        sellingPoints: (existing as { sellingPoints?: string[] }).sellingPoints ?? [],
        objections: (existing as { objections?: Array<{ objection: string; answer: string }> }).objections ?? [],
        faq: (existing as { faq?: Array<{ question: string; answer: string }> }).faq ?? [],
        dos: (existing as { dos?: string[] }).dos ?? [],
        donts: (existing as { donts?: string[] }).donts ?? [],
        keywords: (existing as { keywords?: string[] }).keywords ?? [],
        priority: (existing as { priority?: number }).priority ?? 1,
        quizAnswers: ((existing as { quizAnswers?: 'inherit' | 'allow' | 'hide' }).quizAnswers ?? 'inherit') as 'inherit' | 'allow' | 'hide',
      }
    : {
        title: 'رفتار پیش‌فرض منتور',
        enabled: true,
        tone: 'coach' as const,
        personaNote: 'همکار باتجربه و مربی فروش.',
        summary: '',
        keyPoints: [] as string[],
        sellingPoints: [] as string[],
        objections: [] as Array<{ objection: string; answer: string }>,
        faq: [] as Array<{ question: string; answer: string }>,
        dos: [] as string[],
        donts: [] as string[],
        keywords: [] as string[],
        priority: 1,
        quizAnswers: 'inherit' as const,
      };
  // Append Dart content, deduplicating.
  const mergedSummary = [base.summary, parsed.summary].filter(Boolean).join('\n\n').slice(0, 4000);
  const appendUnique = <T>(a: T[], b: T[], key: (x: T) => string) => {
    const seen = new Set(a.map(key));
    for (const item of b) if (!seen.has(key(item))) a.push(item);
    return a;
  };
  await guides.upsertGuide(d, actor, 'global', null, {
    ...base,
    title: base.title || parsed.title,
    summary: mergedSummary,
    keyPoints: appendUnique([...base.keyPoints], parsed.keyPoints, (x) => normalizeFa(x).slice(0, 40)),
    sellingPoints: appendUnique([...base.sellingPoints], parsed.sellingPoints, (x) => normalizeFa(x).slice(0, 40)),
    objections: appendUnique([...base.objections], parsed.objections, (x) => normalizeFa(x.objection).slice(0, 40)),
    dos: appendUnique([...base.dos], parsed.dos, (x) => normalizeFa(x).slice(0, 40)),
    donts: appendUnique([...base.donts], parsed.donts, (x) => normalizeFa(x).slice(0, 40)),
    keywords: appendUnique([...base.keywords], extractKeywords(parsed.title), (x) => normalizeFa(x)),
  });
  log?.(`mentor-behavior: merged global guide with ${parsed.title}`);
}

function extractKeywords(title: string): string[] {
  // Pull the Latin/Persian product name from the H1 — e.g. «فورمی | ست آبرسان ۴ME» → [فورمی, 4ME]
  const parts = title.split('|').map((s) => s.trim()).filter(Boolean);
  const kws: string[] = [];
  for (const p of parts) {
    const tokens = p.split(/[\s\-–—()]+/).filter((t) => t.length >= 2);
    kws.push(...tokens);
  }
  return [...new Set(kws)].slice(0, 15);
}
