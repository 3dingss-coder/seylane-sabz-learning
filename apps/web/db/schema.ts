import { index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Document table backing the API's DocStore port (functions/src/store/types.ts) on Netlify.
 * One row per document: `col` is the collection path ("users", "packages/p1/sections"),
 * `grp` its last segment (collection-group queries) and `data` the document body.
 */
export const docs = pgTable(
  'docs',
  {
    col: text('col').notNull(),
    id: text('id').notNull(),
    grp: text('grp').notNull(),
    data: jsonb('data').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.col, t.id] }), index('docs_grp_idx').on(t.grp)],
);
