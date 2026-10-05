import { describe, expect, it } from 'vitest';
import { createCtx } from './support/ctx';
import {
  compressOlderChats,
  renderMemoryBlock,
  syncMentorMemory,
  windowUserTexts,
} from '../src/services/mentor-memory';

describe('mentor memory', () => {
  it('keeps 50 user messages and compresses the rest', () => {
    const texts = Array.from({ length: 60 }, (_, i) => `سؤال شماره ${i} درباره محصول`);
    const { kept, overflow } = windowUserTexts(texts);
    expect(kept).toHaveLength(50);
    expect(overflow).toHaveLength(10);
    expect(kept[0]).toContain('10');
    const summary = compressOlderChats('', overflow);
    expect(summary).toContain('سؤالات قبلی');
    expect(summary).toContain('سؤال شماره 0');
    const again = compressOlderChats(summary, ['سؤال تازه‌تر']);
    expect(again).toContain('سؤال تازه‌تر');
    expect(renderMemoryBlock({ summary, userTexts: kept })).toContain('پیام‌های قبلی خود کاربر');
  });

  it('does not append the same older questions to the summary on the next question', async () => {
    const ctx = await createCtx();
    const userId = 'user-memory';
    const texts = Array.from({ length: 40 }, (_, i) => `سؤال شماره ${i} درباره محصول `.repeat(40));
    for (let i = 0; i < texts.length; i++) {
      await ctx.deps.store.set(`chat_messages/m${i}`, {
        userId,
        role: 'user',
        text: texts[i],
        createdAt: `2026-10-01T00:${String(i).padStart(2, '0')}:00.000Z`,
      });
    }
    const first = await syncMentorMemory(ctx.deps, userId);
    const second = await syncMentorMemory(ctx.deps, userId);
    expect(first.summary.length).toBeGreaterThan(0);
    expect(second.summary).toBe(first.summary);
    expect(second.userTexts).toEqual(first.userTexts);
    expect(second.userTexts.length).toBeLessThan(40);
  });
});
