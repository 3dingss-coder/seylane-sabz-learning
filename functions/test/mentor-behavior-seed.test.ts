import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BEHAVIOR_FILES, seedMentorBehavior } from '../src/seed/mentor-behavior';
import { createCtx } from './support/ctx';

const repoRoot = path.resolve(__dirname, '../..');

describe('mentor behavior knowledge seed', () => {
  it('creates populated guides on the mapped brand IDs and is safe to re-run', async () => {
    const ctx = await createCtx({ llm: null });
    for (const mapping of BEHAVIOR_FILES) {
      if (!mapping.brandId || mapping.brandId === 'brand-b9jgxnnlhx') continue;
      await ctx.deps.store.set(`brands/${mapping.brandId}`, {
        name: mapping.brandNames[0] ?? 'برند آزمون',
        nameLatin: mapping.brandNames[1] ?? null,
      });
    }

    expect(await seedMentorBehavior(ctx.deps, repoRoot)).toBe(BEHAVIOR_FILES.length);
    const docs = await ctx.deps.store.query({ collection: 'mentor_guides' });
    expect(docs).toHaveLength(8);
    for (const mapping of BEHAVIOR_FILES) {
      const guide = await ctx.deps.store.get<{
        kind: string;
        targetId: string;
        title: string;
        summary: string;
        keyPoints: string[];
        sellingPoints: string[];
        objections: Array<{ objection: string; answer: string }>;
        faq: Array<{ question: string; answer: string }>;
      }>(`mentor_guides/brand:${mapping.brandId}`);
      expect(guide?.kind).toBe('brand');
      expect(guide?.targetId).toBe(mapping.brandId);
      expect(guide?.summary.length).toBeGreaterThan(500);
      expect(guide?.keyPoints.length).toBeGreaterThan(0);
      expect(guide?.sellingPoints.length).toBeGreaterThan(0);
      expect((guide?.objections.length ?? 0) + (guide?.faq.length ?? 0)).toBeGreaterThan(0);
    }
    expect(await seedMentorBehavior(ctx.deps, repoRoot)).toBe(0);
    expect(await ctx.deps.store.get('mentor_guides/global')).toBeNull();
  });

  it('merges an unmapped file into the global guide once, without repeating the text', async () => {
    const ctx = await createCtx({ llm: null });
    const originalMappings = [...BEHAVIOR_FILES];
    const dart = BEHAVIOR_FILES.find((mapping) => mapping.file === '08_Dart.md');
    if (!dart) throw new Error('Dart behavior mapping not found');
    BEHAVIOR_FILES.splice(0, BEHAVIOR_FILES.length, { ...dart, brandId: undefined });

    try {
      await seedMentorBehavior(ctx.deps, repoRoot);
      const first = await ctx.deps.store.get<{ summary: string }>('mentor_guides/global');
      await seedMentorBehavior(ctx.deps, repoRoot);
      const second = await ctx.deps.store.get<{ summary: string }>('mentor_guides/global');
      expect(first?.summary).toBeTruthy();
      expect(second?.summary).toBe(first?.summary);
      expect((second?.summary.match(/seeded-mentor-behavior:08_Dart\.md:/g) ?? []).length).toBe(1);
    } finally {
      BEHAVIOR_FILES.splice(0, BEHAVIOR_FILES.length, ...originalMappings);
    }
  });
});
