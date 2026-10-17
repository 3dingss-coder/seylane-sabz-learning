# Stage 5 — Manager (Report)

> **Status:** Implemented and gated. The Manager surface is deliberately a
> small, surgical stage: the handoff manager spec says Manager is serious /
> professional / operational and that the repository's real Manager model must
> be preserved — the dashboard, reports, member detail, retake requests and
> message/note dialog were already structurally aligned with the spec, so this
> stage applies the tone rules and pins the behaviour rather than reworking
> layouts.

## Handoff rules applied (`04-page-specs/manager.md`)

- Role boundary respected: Manager is team management, not a trimmed Admin —
  no admin concepts were merged in; NAV/routes untouched.
- «People needing attention must be actionable, not just KPI numbers» — this
  contract already exists (laggard rows navigate to member detail, quick
  «پیام» per row, pending-retake banner links to the review queue) and is now
  **pinned by tests** so redesign work can never regress it.
- «Team health first» — dashboard order (KPIs → retake banner → laggards)
  kept as-is.
- «Mascot only for rare empty/help states» — exactly one mascot site in the
  whole Manager surface: the no-team help state («هنوز تیمی به شما سپرده
  نشده» → guide). The all-good laggards state keeps its icon treatment and
  has **no** mascot (pinned by test).
- Semantic status language kept (icons + text, never color-only); the
  `text-danger`/`text-success`-style semantic tones used in manager/report
  tables were contrast-checked against their surfaces (danger on white
  4.83:1, success-fg 5.02:1, warning-fg 5.02:1 — all AA) and left unchanged.

## Changes (presentation only)

- `pages/manager/ManagerDashboard.tsx`: rare help state gets the decorative
  mascot (`guide`) via the Stage-4 `EmptyState.illustration` slot.
- `layouts/PanelLayout.tsx`: mobile panel nav targets `min-h-11` (44px) →
  `min-h-12` (48px touch-target rule). This shell is shared with Admin — the
  change is the global a11y rule, not an admin surface redesign (Stage 6
  covers the admin shell proper).
- Nothing else: ManagerDashboard KPIs/table, ManagerReports tabs+filters,
  ManagerMember timeline, SendMessageDialog (message vs package note,
  templates, validations), RetakeList (pending/approved/rejected tabs,
  approve/reject + note + escalation language) are untouched.

## Regression pinning (new tests)

`pages/manager/manager.test.tsx` (5 tests):

1. team KPIs + pending-retake banner **link** to `/manager/retakes`;
2. laggard row is actionable: quick «پیام» opens the SendMessageDialog and
   row click navigates to `/manager/members/:id`;
3. no-team help state carries the decorative mascot (`alt=""`);
4. all-good state has no mascot and keeps its status copy;
5. RetakeList approve flow: member link + scores, confirm dialog with note,
   `POST /manager/retake-requests/:id/approve` with `{ note }`, success toast.

Existing `CompletionReport.test.tsx` / `QuizResultsReport.test.tsx` remain
green unchanged (report internals untouched).

## Gates (on the final code)

| Check | Result |
| --- | --- |
| `npm run typecheck -w apps/web` | ✅ pass |
| `npm run lint -w apps/web` | ✅ pass |
| prettier (changed files) | ✅ pass |
| `npm run test -w apps/web` | ✅ 45 files, 353 tests (348 baseline + 5 new) |
| `npm run build -w apps/web` | ✅ pass |

## Explicitly unchanged

All Manager routes and NAV, `/manager/dashboard`, `/manager/reports/*`,
`/manager/users/:id/progress`, `/manager/retake-requests*`,
`/manager/users/:id/{messages,notes}` API contracts, quiz-retake approval
semantics (incl. escalation blocking for non-admin), report filters incl.
inverted-range guard, Excel exports, ProfilePage (shared with marketer),
manager↔admin permission split, dark mode, reduced motion. No
Cloudflare/production verification is claimed.

## Next

Stage 6 — Admin shell + core (sidebar/14-nav, dashboard & top-level admin
screens). Not started.
