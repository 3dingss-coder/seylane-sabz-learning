# Stage 6 — Admin Shell + Core (Report)

> **Status:** Implemented and gated. The admin chrome (PanelLayout/Sidebar,
> 14-item nav) and core operational screens (dashboard, users, teams, reports)
> were already structurally aligned with the handoff admin spec ("formal,
> serious, high-confidence enterprise operations console"); this stage applies
> the tone/a11y rules and **locks the shell contracts with tests** so Stages 7–9
> cannot drift them.

## Handoff rules applied (`04-page-specs/admin.md`)

- Role boundary: Admin stays separate from Manager permissions and navigation —
  now **pinned**: the 14-item admin nav renders at `/admin`, and the manager
  console shows none of the admin-only areas (سیاست‌ها / کمپین‌های Push /
  لاگ تغییرات / محتوای آموزشی) while keeping its own items (گزارش تکمیل /
  آزمون مجدد).
- «Mascot should not be a recurring decorative element» — no mascot exists in
  the admin console; the formal tone is now **pinned by a test** (the loading
  spinner mascot is transient and excluded by waiting for dashboard content).
- Content status on the dashboard keeps deep links into the real content tabs
  (`/admin/content`, `/admin/content?tab=unassigned`) — pinned.
- Dense console tone: KPI grid, PublishGuide, filter bars, DataTable usage and
  StatusBadge icon+text labels were audited and kept (semantic tones already
  AA: `warning-fg`/`danger` on their surfaces ≥ 4.6:1).

## Changes (presentation only)

- `pages/admin/UsersPage.tsx`: archive-group checkbox rows `min-h-11` (44px) →
  `min-h-12` (48px touch-target rule).
- No other product-code change: the Stage 1 token migration already carries
  the emerald formal look through the shell and core screens; Sidebar
  (gliding 48px active pill), PanelLayout (48px mobile nav from Stage 5),
  AdminDashboard KPIs/PublishGuide/content stats, UsersPage filters+tables,
  TeamsPage, ReportsPage tabs (تکمیل / نتایج آزمون / آزمون مجدد / کیفیت
  منتور) remain behaviour-identical.

## Regression pinning (new tests)

`pages/admin/adminCore.test.tsx` (4 tests, real app harness `renderApp` +
mocked API, signed-in as admin/manager):

1. full 14-item admin navigation labels render;
2. manager navigation is separate (no merged admin menus);
3. admin core renders with **no decorative mascot**;
4. content status cards deep-link to the real content tabs.

Existing `admin.test.tsx` (13 tests: publish guide, package editor steps,
media-library flows, audience visibility, users residence, paths) untouched
and green.

## Gates (on the final code)

| Check | Result |
| --- | --- |
| `npm run typecheck -w apps/web` | ✅ pass |
| `npm run lint -w apps/web` | ✅ pass |
| prettier (changed files) | ✅ pass |
| `npm run test -w apps/web` | ✅ 46 files, 357 tests (353 baseline + 4 new) |
| `npm run build -w apps/web` | ✅ pass |

## Explicitly unchanged

All 14 admin routes and every sub-route (packages/quizzes/push-automations
namespaces), role guards and manager↔admin permission split, AdminDashboard
API (`/admin/dashboard`), users/teams/reports APIs incl. admin retake review
(`RetakeList base="/admin"` in ReportsPage), PublishGuide steps, PackageForm
dialog, dark mode, reduced motion. No Cloudflare/production verification is
claimed.

## Pending 48px targets for later stages (audited, deliberately staged)

`ArchivePage.tsx:204` and `PushAutomationDetailPage.tsx:1261` (labels),
`PushTemplatesTab.tsx:85` (tab pills), `QuizBuilderPage.tsx:347` (input) —
each will be fixed in its owning stage (7/8/9) and listed in that stage's
report.

## Next

Stage 7 — Admin content workflows (content tabs, brand detail, package
editor, quiz builder, media library, mentor guides, assignments).
