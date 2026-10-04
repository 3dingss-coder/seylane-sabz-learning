/**
 * Loads the product knowledge files in `mentor-behavior/` (the «فایل رفتار منتور» zip
 * the client supplied) into mentor_guides, one per brand/product. Idempotent: existing
 * admin-authored guides win (we never overwrite admin edits), and content merges for the
 * global guide are deduplicated by content hash so re-running seed never duplicates text.
 *
 * Known catalog IDs are declared per file, while D1's additive import remaps IDs to an exact
 * Persian/Latin brand-name match when the live catalog uses different IDs. Dart targets the
 * existing live brand ID `brand-b9jgxnnlhx`; it is never folded into the global guide.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Deps } from '../services/context';
import * as guides from '../services/mentor-guides';
import { markKnowledgeDirty } from '../services/knowledge';
import { normalizeFa } from '../services/mentor';
import type { Brand, MentorGuide } from '../domain/types';
import type { Doc } from '../store/types';

export interface BehaviorFileMapping {
  file: string;
  /** Stable catalog ID when this brand is included in the repository seed. */
  brandId?: string;
  /** Exact Persian/Latin name aliases used when a live catalog has a different ID. */
  brandNames: string[];
}

/**
 * Product knowledge is stored as a brand guide, since every file is primarily about one
 * brand's sales behavior. Stable IDs are used when known; the D1 incremental import maps
 * those IDs to the live catalog by exact Persian/Latin brand names if IDs differ.
 */
export const BEHAVIOR_FILES: BehaviorFileMapping[] = [
  { file: '01_Formi.md', brandId: 'brand-sb-formi', brandNames: ['فورمی', 'Formi', '4ME'] },
  { file: '02_Zen.md', brandId: 'brand-sb-zen', brandNames: ['زِن', 'زن', 'Zen'] },
  {
    file: '03_As.md',
    brandId: 'brand-sb-vitas',
    brandNames: ['ویت آس', 'WITH US', 'With Us', 'Vitas'],
  },
  { file: '04_Atel.md', brandId: 'brand-sb-atl', brandNames: ['آتل', 'ATL'] },
  { file: '05_Collamin.md', brandId: 'brand-sb-11', brandNames: ['کلامین', 'کالمین', 'Collamin'] },
  { file: '06_IceBall.md', brandId: 'brand-sb-10', brandNames: ['آیس بال', 'Ice Ball', 'Iceball'] },
  {
    file: '07_Bubble.md',
    brandId: 'brand-sb-icebubble',
    brandNames: ['آیس بابل', 'بابل', 'Bubble', 'ICE BUBBLE'],
  },
  { file: '08_Dart.md', brandId: 'brand-b9jgxnnlhx', brandNames: ['دارت', 'Dart'] },
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
  const lines = raw.split(/\r?\n/);
  const titleLine = lines.find((line) => line.startsWith('# '));
  const title = titleLine?.replace(/^#\s+/, '').trim() ?? '';
  const bodyLines = lines.slice(Math.max(0, lines.findIndex((line) => line.startsWith('# ')) + 1));
  const sections: Array<{ heading: string; content: string }> = [];
  let current: { heading: string; lines: string[] } | null = null;
  for (const line of bodyLines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading?.[1]) {
      if (current)
        sections.push({ heading: current.heading, content: current.lines.join('\n').trim() });
      current = { heading: heading[1].trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current)
    sections.push({ heading: current.heading, content: current.lines.join('\n').trim() });

  const headingText = (section: { heading: string }) => normalizeFa(section.heading).toLowerCase();
  const core = sections.filter((section) =>
    /مسئله|مشکل|نیاز|ویژگی|ترکیب|کارکرد|مخاطب|مصرف|انتظار|ارزش|داستان|جایگاه|نتیجه/.test(
      headingText(section),
    ),
  );
  const sales = sections.filter((section) => /پرزنت|فروش|کشف نیاز/.test(headingText(section)));
  const qaSections = sections.filter((section) =>
    /اعتراض|سؤال|سوال|پرسش|پاسخ|رایج|محتمل/.test(headingText(section)),
  );
  const safety = sections.filter((section) =>
    /ایمنی|هشدار|مرزبندی|خط قرمز|کمبود اطلاعات|نامعلوم|تمایز/.test(headingText(section)),
  );
  const summarySections = [...core, ...safety];
  const summarySource = summarySections
    .map((section) => `## ${section.heading}\n${section.content}`)
    .join('\n\n');
  const summary = clipText(summarySource || bodyLines.join('\n').trim(), 3800);

  const keyPoints = core
    .map((section) => summarize(`${section.heading}: ${section.content}`, 380))
    .filter(Boolean)
    .slice(0, 10);
  const sellingPoints = sales.flatMap((section) => {
    const bullets = section.content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^[-*]\s+/.test(line))
      .map(cleanBullet);
    return bullets.length ? bullets.slice(0, 8) : [summarize(section.content, 360)];
  });

  const objections: Array<{ objection: string; answer: string }> = [];
  const faq: Array<{ question: string; answer: string }> = [];
  for (const section of qaSections) {
    const entries = parseQuestionAnswers(section.content);
    if (/اعتراض/.test(headingText(section))) objections.push(...entries);
    else faq.push(...entries.map((entry) => ({ question: entry.objection, answer: entry.answer })));
  }

  const safetyLines = safety.flatMap((section) =>
    section.content
      .split(/\r?\n|(?<=[؛.!؟])\s+/)
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean),
  );
  const prohibition = /نکن|ممنوع|نساز|خودداری|پرهیز|نگو|نباید|توصیه نمی|استفاده نشود/;
  const donts = safetyLines.filter((line) => prohibition.test(line)).slice(0, 8);
  const dos = safetyLines
    .filter((line) => !prohibition.test(line) && /بگو|پیشنهاد|تأکید|معرفی|استفاده/.test(line))
    .slice(0, 8);

  return {
    title: title || 'راهنمای محصول',
    summary,
    keyPoints,
    sellingPoints: [...new Set(sellingPoints.filter(Boolean))].slice(0, 10),
    objections: uniqueQa(objections).slice(0, 10),
    faq: uniqueQa(faq).slice(0, 10),
    dos,
    donts,
  };
}

function parseQuestionAnswers(content: string): Array<{ objection: string; answer: string }> {
  const out: Array<{ objection: string; answer: string }> = [];
  let active: { objection: string; answer: string } | null = null;
  const save = () => {
    if (active?.objection) out.push({ objection: active.objection, answer: active.answer.trim() });
  };
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    const question = line.match(/^[-*]\s*[«“"](.+?)[»”"]\s*(.*)$/);
    if (question?.[1]) {
      save();
      active = {
        objection: question[1].trim(),
        answer: (question[2] ?? '').replace(/^[؟?:：–—-]\s*/, '').trim(),
      };
    } else if (active && line && !line.startsWith('#')) {
      active.answer = `${active.answer} ${line}`.trim();
    }
  }
  save();
  return out;
}

function uniqueQa<T extends { objection?: string; question?: string; answer: string }>(
  rows: T[],
): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = normalizeFa(row.objection ?? row.question ?? '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clipText(value: string, max: number): string {
  const text = value
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.replace(/\s+\S*$/, '').trim()}…`;
}

function cleanBullet(s: string): string {
  return s.replace(/^[-*]\s*/, '').trim();
}
function summarize(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + '…' : t;
}

/** Normalise a name for fuzzy matching (lowercase, unify Arabic/Persian letters, collapse spaces). */
function norm(s: string | null | undefined): string {
  if (!s) return '';
  return normalizeFa(String(s).toLowerCase())
    .replace(/[\u200c\-_\s]+/g, ' ')
    .trim();
}

/**
 * Content hash used for idempotent global-guide merges: two runs of seed with the same
 * parsed Dart content will produce the same hash, so we skip appending duplicates.
 */
function contentHash(s: string): string {
  return createHash('sha1').update(s).digest('hex').slice(0, 12);
}

const SEED_BEHAVIOR_MARKER = 'seeded-mentor-behavior';

/**
 * Seeds every mentor-behavior/*.md file into mentor_guides. Idempotent: if a guide already
 * exists (e.g. the admin edited it), we leave it alone. Global guide merges are tagged
 * with per-block content hashes so re-running seed never duplicates content.
 */
export async function seedMentorBehavior(
  d: Deps,
  repoRoot: string,
  log?: (m: string) => void,
): Promise<number> {
  const dir = path.join(repoRoot, 'mentor-behavior');
  if (!fs.existsSync(dir)) {
    log?.('mentor-behavior: directory not found, skipping');
    return 0;
  }
  const actor = { id: 'seed-mentor-behavior', role: 'system' as const };

  const allBrands = await d.store.query<Brand>({ collection: 'brands' });

  let count = 0;
  for (const mapping of BEHAVIOR_FILES) {
    const filePath = path.join(dir, mapping.file);
    if (!fs.existsSync(filePath)) {
      log?.(`mentor-behavior: missing ${mapping.file}, skipping`);
      continue;
    }
    const parsed = parseBehaviorMarkdown(fs.readFileSync(filePath, 'utf8'));
    const brandMatch =
      allBrands.find((brand) => brand.id === mapping.brandId) ??
      allBrands.find((brand) =>
        mapping.brandNames.some((name) => {
          const needle = norm(name);
          return needle && (norm(brand.name) === needle || norm(brand.nameLatin) === needle);
        }),
      );
    const targetId = brandMatch?.id ?? mapping.brandId;

    if (targetId) {
      const docId = guides.guideDocId('brand', targetId);
      if (await d.store.get(`mentor_guides/${docId}`)) {
        log?.(`mentor-behavior: ${docId} already exists, skipping`);
        continue;
      }
      const input = {
        title: parsed.title,
        enabled: true,
        tone: 'coach' as const,
        personaNote:
          'همکار و مربی فروش باتجربه؛ پاسخ مستقیم، یک دلیل از سند، یک نکته مصرف، یک سؤال کوتاه.',
        summary: parsed.summary,
        keyPoints: parsed.keyPoints,
        sellingPoints: parsed.sellingPoints,
        objections: parsed.objections,
        faq: parsed.faq,
        dos: parsed.dos,
        donts: parsed.donts,
        keywords: extractKeywords(parsed.title),
        priority: 2,
        quizAnswers: 'hide' as const,
      };
      if (brandMatch) {
        await guides.upsertGuide(d, actor, 'brand', targetId, input);
      } else {
        // A live-only ID (currently Dart) is retained in the snapshot. D1 import later
        // verifies that target exists in the live catalog before installing the guide.
        const now = d.clock().toISOString();
        const guide: MentorGuide = {
          ...guides.emptyGuide('brand', targetId),
          ...input,
          kind: 'brand',
          targetId,
          createdAt: now,
          updatedAt: now,
          updatedBy: actor.id,
        };
        await d.store.set(`mentor_guides/${docId}`, guide as unknown as Record<string, unknown>);
        await markKnowledgeDirty(d);
      }
      log?.(
        `mentor-behavior: seeded ${docId} (${parsed.title})${brandMatch ? ` → ${brandMatch.name}` : ' (live catalog ID)'}`,
      );
      count++;
      continue;
    }

    // Unmapped future files fall back to a hash-tagged global block; repeated seed runs
    // replace that block rather than appending a duplicate.
    await mergeGlobalIdempotent(d, actor, parsed, mapping.file, log);
    count++;
  }
  return count;
}

/**
 * Idempotent global-guide merge: each parsed file contributes one content block whose
 * summary is tagged with a content hash. If the block is already present (same hash),
 * we skip it — re-running seed never duplicates Dart content.
 */
async function mergeGlobalIdempotent(
  d: Deps,
  actor: { id: string; role: 'system' },
  parsed: ParsedBehavior,
  sourceFile: string,
  log?: (m: string) => void,
) {
  const GLOBAL_ID = 'global';
  const existing = await d.store.get(`mentor_guides/${GLOBAL_ID}`);
  const existingTyped = existing as Doc<{
    title?: string;
    enabled?: boolean;
    tone?: 'friendly' | 'professional' | 'coach' | 'brief';
    personaNote?: string;
    summary?: string;
    keyPoints?: string[];
    sellingPoints?: string[];
    objections?: Array<{ objection: string; answer: string }>;
    faq?: Array<{ question: string; answer: string }>;
    dos?: string[];
    donts?: string[];
    keywords?: string[];
    priority?: number;
    quizAnswers?: 'inherit' | 'allow' | 'hide';
  }> | null;

  const blockTag = `<!-- ${SEED_BEHAVIOR_MARKER}:${sourceFile}:${contentHash(parsed.summary)} -->`;
  // If the block is already present in the existing summary, do nothing.
  if (existingTyped?.summary && existingTyped.summary.includes(blockTag)) {
    log?.(`mentor-behavior: global already has ${parsed.title} (same hash), skipping`);
    return;
  }

  // Remove any older block for the same source file (different hash = content was updated).
  const stripOldBlocks = (s: string) =>
    s
      .replace(
        new RegExp(
          `\\n?<!-- ${SEED_BEHAVIOR_MARKER}:${escapeReg(sourceFile)}:[a-f0-9]+ -->[\\s\\S]*?(?=<!-- ${SEED_BEHAVIOR_MARKER}:|$)`,
          'g',
        ),
        '',
      )
      .trim();

  const base = existingTyped
    ? {
        title: existingTyped.title ?? 'رفتار پیش‌فرض منتور',
        enabled: existingTyped.enabled ?? true,
        tone: (existingTyped.tone ?? 'coach') as 'friendly' | 'professional' | 'coach' | 'brief',
        personaNote: existingTyped.personaNote ?? 'همکار باتجربه و مربی فروش.',
        summary: stripOldBlocks(existingTyped.summary ?? ''),
        keyPoints: [...(existingTyped.keyPoints ?? [])],
        sellingPoints: [...(existingTyped.sellingPoints ?? [])],
        objections: [...(existingTyped.objections ?? [])],
        faq: [...(existingTyped.faq ?? [])],
        dos: [...(existingTyped.dos ?? [])],
        donts: [...(existingTyped.donts ?? [])],
        keywords: [...(existingTyped.keywords ?? [])],
        priority: existingTyped.priority ?? 1,
        quizAnswers: (existingTyped.quizAnswers ?? 'inherit') as 'inherit' | 'allow' | 'hide',
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

  // Append the new block with its hash tag at the end of the summary.
  const appendUnique = <T>(a: T[], b: T[], key: (x: T) => string): T[] => {
    const seen = new Set(a.map(key));
    for (const item of b) {
      const itemKey = key(item);
      if (!seen.has(itemKey)) {
        a.push(item);
        seen.add(itemKey);
      }
    }
    return a;
  };

  const newSummarySection = `${blockTag}\n# ${parsed.title}\n${parsed.summary}`;
  const mergedSummary = [base.summary, newSummarySection]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 5500);

  await guides.upsertGuide(d, actor, 'global', null, {
    ...base,
    title: base.title || parsed.title,
    summary: mergedSummary,
    keyPoints: appendUnique(base.keyPoints, parsed.keyPoints, (x) => norm(x).slice(0, 40)),
    sellingPoints: appendUnique(base.sellingPoints, parsed.sellingPoints, (x) =>
      norm(x).slice(0, 40),
    ),
    objections: appendUnique(base.objections, parsed.objections, (x) =>
      norm(x.objection).slice(0, 40),
    ),
    dos: appendUnique(base.dos, parsed.dos, (x) => norm(x).slice(0, 40)),
    donts: appendUnique(base.donts, parsed.donts, (x) => norm(x).slice(0, 40)),
    keywords: appendUnique(base.keywords, extractKeywords(parsed.title), (x) => norm(x)),
  });
  log?.(`mentor-behavior: merged ${parsed.title} into global guide (idempotent)`);
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractKeywords(title: string): string[] {
  const parts = title
    .split(/[|\-–—()]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const kws: string[] = [];
  for (const p of parts) {
    const tokens = p.split(/[\s]+/).filter((t) => t.length >= 2);
    kws.push(...tokens);
  }
  return [...new Set(kws)].slice(0, 15);
}
