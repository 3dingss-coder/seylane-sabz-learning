import { describe, expect, it } from 'vitest';
import { fuzzyExpand, withinOneEdit } from '../src/services/retrieval';
import { CRON_JOBS } from '../src/services/cron';

describe('mentor: spelling tolerance and freshness', () => {
  it('«کلامین» is one edit from «کالمین»; unrelated words are not', () => {
    expect(withinOneEdit('کلامین', 'کالمین')).toBe(true);
    expect(withinOneEdit('کامان', 'کومان')).toBe(true);
    expect(withinOneEdit('دارت', 'کالمین')).toBe(false);
  });

  it('fuzzyExpand adds the known brand word for a misspelt query token', () => {
    const out = fuzzyExpand(['کلامین'], new Set(['کالمین', 'دارت']));
    expect(out).toContain('کالمین');
    expect(out).not.toContain('دارت');
  });

  it('the knowledge-reindex job (media reading + incremental index) is actually scheduled', () => {
    expect(Object.values(CRON_JOBS).flat()).toContain('knowledge-reindex');
  });
});
