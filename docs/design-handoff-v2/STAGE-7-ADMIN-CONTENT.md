# Stage 7 — Admin Content Workflows (Report)

> **Status:** Implemented and gated. The content workflows (content tabs,
> brand detail, package editor, quiz builder, media library, mentor guides,
> assignments) were audited against the handoff admin spec; the spec's content
> rules are preservation rules ("do not invent generic LMS modules"), and the
> Stage 1 token migration already carries the formal console look. This stage
> fixes the audited touch-target gap and **pins the must-preserve content
> contracts** with tests.

## Handoff rules applied (`04-page-specs/admin.md` content sections)

- ContentPage keeps the real tabs **brands / unassigned / archive** with real
  actions — pinned (incl. the `?tab=` deep-link contract used by dashboard
  cards and brand cards into brand detail with real counts + temporary-logo
  warning).
- Package editor keeps the real preparation sequence
  **Product → Sections → Quizzes → Publish → Audience** (labels: محصول /
  قسمت‌ها / آزمون‌ها / انتشار / مخاطبان) — the **order itself is pinned**,
  on top of the existing tests for next-step naming, quiz deep-links and
  audience visibility.
- Quiz builder keeps the four-option MCQ contract: four options, correct-answer
  marker (icon+label, not color-only), explanation, reorder up/down, edit/
  delete, the minimum-3-questions requirement, and pass-score / max-attempt
  settings (with policy defaults shown as hints) — pinned; the new-question
  dialog keeps stem + 4 option fields + correct-answer radios + explanation.
- Media library: no change; its upload/queue/add-to-package flows stay pinned
  by the existing `admin.test.tsx` library tests (3 tests) and
  `lib/mediaLibrary/eta.test.ts`.
- Mentor guides / assignments: no change; mentor guides stay pinned by
  `mentorGuides.test.tsx`; assignments entry points («مسیر یادگیری
  (پیشنهادی)» / «انتساب مستقیم» + two tabs) pinned here.

## Changes (presentation only)

- `pages/admin/QuizBuilderPage.tsx`: option-text inputs `min-h-11` (44px) →
  `min-h-12` (48px) — the Stage-6 pending checklist item for this stage.
- No other product-code change (audited: no mascot usage, no white-on-amber,
  no color-only statuses, no removed actions across the ~4,500 lines of the
  content surface).

## Regression pinning (new tests)

`pages/admin/adminContent.test.tsx` (6 tests, `renderApp` harness):

1. content tabs + brand card (counts, fallback-logo warning);
2. `?tab=unassigned` URL sync;
3. package steps sequence order (5 labels in order) + next-step hint;
4. quiz: 4 options with correct marker + explanation + reorder/edit/delete +
   pass-score/max-attempt settings + min-question requirement;
5. new-question dialog: stem + 4 option fields + correct radios + explanation;
6. assignments: both guidance cards + both real tabs.

## Gates (on the final code)

| Check | Result |
| --- | --- |
| `npm run typecheck -w apps/web` | ✅ pass |
| `npm run lint -w apps/web` | ✅ pass |
| prettier (changed files) | ✅ pass |
| `npm run test -w apps/web` | ✅ 47 files, 363 tests (357 baseline + 6 new) |
| `npm run build -w apps/web` | ✅ pass |

## Explicitly unchanged

All content APIs (`/admin/content/tree`, `/admin/packages*`,
`/admin/quizzes/*` incl. reorder/patch/delete question, `/admin/media/library`,
`/admin/mentor/guides*`, `/admin/paths`, `/admin/assignments*`), the
publish-issue model, audience assignment semantics, media upload pipeline
(`lib/mediaLibrary/*`), quiz versioning/review (`needsReview`), archivedCount
handling, dark mode, reduced motion. No Cloudflare/production verification is
claimed.

## Pending 48px targets (from Stage-6 checklist)

Done here: `QuizBuilderPage:347`. Remaining for Stage 8/9:
`PushAutomationDetailPage.tsx:1261`, `PushTemplatesTab.tsx:85` (Stage 8),
`ArchivePage.tsx:204` (Stage 9).

## Next

Stage 8 — Notifications + Push + Automations (operations console legibility;
dry-run/test-send/run-history/trace/skip-reasons never hidden behind
decorative UI).
