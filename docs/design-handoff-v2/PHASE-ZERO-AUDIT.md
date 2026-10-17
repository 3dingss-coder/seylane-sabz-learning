# Phase Zero Audit Report — Seylaneh Design Handoff v2

> **Status:** Audit only. No product code, API, database, Worker, deployment, or
> Cloudflare configuration was changed by this report.
>
> **Purpose:** Prove, before the redesign starts, which existing behaviour is
> authoritative and must survive every later stage.

## 1. Repository identity and commit check

| Item | Finding |
| --- | --- |
| Repository | `3dingss-coder/seylane-sabz-learning` |
| Working branch | `arena/9e53c41a-seylane-sabz-learning` |
| Current `HEAD` / `main` commit observed | `81d7393210176cb4e1f66b2765acec418abcc292` |
| Commit subject | `Merge pull request #107 from 3dingss-coder/arena/0a7125d8-seylane-sabz-learning` |
| Handoff-audited commit | `81d7393210176cb4e1f66b2765acec418abcc292` |
| Material drift from handoff baseline | **None at audit time.** Working tree was clean before this report. |

Because the current commit exactly matches the handoff audit baseline, there is
no code-vs-handoff commit conflict to resolve before Stage 1. If `main` moves
before a later stage starts, that stage must re-check this section first.

## 2. Handoff material read

Read in the mandated order (Drive folder `seylaneh-design-handoff-v2`):

1. `00-README.md`
2. `01-foundations/design-tokens.md`
3. `02-mascot/mascot-guide.md`
4. `03-responsive-motion/responsive-motion.md`
5. `04-page-specs/auth-onboarding.md`
6. `04-page-specs/marketer.md`
7. `04-page-specs/manager.md`
8. `04-page-specs/admin.md`
9. `05-reference-images/REFERENCE-MANIFEST.md`
10. `07-cloudflare-live-context.md` (read-only infrastructure snapshot)
11. `06-arena/implementation-checklist.md`
12. `06-arena/AUDIT-REPORT.md`
13. `06-arena/arena-master-prompt.md` / `ARENA-MASTER-PROMPT.md` (identical)
14. `06-arena/arena-agent-prompt.md`

Repository material inspected for reconciliation:

- `apps/web/src/styles/index.css` (568 lines)
- `apps/web/src/components/ui/*`
- `apps/web/src/components/layout/*`, `apps/web/src/components/common/*`
- `apps/web/src/layouts/*` (`MarketerLayout`, `PanelLayout`, `RequireAuth`)
- `apps/web/src/App.tsx` and all route tables
- All Marketer, Manager, Admin, Auth and Push/Automation pages
- `apps/web/e2e/*`, unit/integration tests under `apps/web/src/**`
- `wrangler.toml`
- `.github/workflows/deploy.yml` (plus presence of `ci.yml`, `android.yml`,
  `backup-and-preview.yml`, `cloudflare-report.yml`)
- Existing refresh documentation: `docs/DESIGN-REFRESH.md`,
  `docs/IMPLEMENTATION-STATUS.md`

### Reference-image handling

`REFERENCE-MANIFEST.md` is the authority for which images are approved.
Approved direction only: `manager-direction.png`,
`admin-content-brands.png`, `mascot-core-states.png`,
`mascot-full-state-system.png`, `responsive-motion-reference.png`, and the
canonical `mascot-original.png`. Sample copy, sample data, fake logos, and
accidental controls inside generated boards are **not** product requirements.
Detailed per-image visual QA must be repeated immediately before the stage
that uses each board (Stages 3–5); no page may be built from a screenshot
alone.

## 3. Current architecture (as-is)

```text
apps/web (React 19 + Vite + Tailwind CSS v4, Vazirmatn, RTL)
  src/App.tsx                 route table + auth/role guards + lazy panels
  src/layouts/
    MarketerLayout.tsx        marketer shell (header, desktop nav, BottomNav)
    PanelLayout.tsx           shared Manager/Admin shell (Sidebar + mobile tab row)
    RequireAuth.tsx           role guard, staff-login handoff, onboarding gate
  src/pages/
    auth/                     AuthPage, StaffLoginPage, OnboardingPage
    m/                        marketer pages
    manager/                  manager pages (own route table)
    admin/                    admin pages (own route table)
  src/components/ui/          shared primitives (see §6)
  src/components/{admin,brand,common,layout,learning,reports}/
  src/lib/                    api, auth, roles, queries, motion, media library…
functions/                    Worker/API code — OUT OF SCOPE for redesign
wrangler.toml                 Worker/D1/R2/cron config — DO NOT TOUCH
.github/workflows/deploy.yml  deploy pipeline — DO NOT TOUCH
```

Key architectural facts that constrain the redesign:

- **Code-splitting is a feature:** Marketer sub-pages and the Manager/Admin
  panels are `lazy()`-loaded in `App.tsx` so mobile marketers never download
  admin code. The redesign must not collapse these bundles.
- **Panels share one shell, not one permission model:** Manager and Admin both
  render through `PanelLayout`, but they have separate route tables
  (`ManagerRoutes.tsx`, `AdminRoutes.tsx`), separate `RequireAuth` role lists,
  and separate nav item sets. Sharing the shell component is safe; merging
  nav/permissions is forbidden.
- **Role routing is enforced twice:** `RequireAuth` (UI mirror) plus server
  RBAC. UI work must never weaken or “simplify” the UI mirror.
- **Existing design-refresh groundwork exists:** `index.css` already carries a
  brand scale derived from `#177a50`, dark-mode token remapping
  (`prefers-color-scheme`), motion tokens, `prefers-reduced-motion` collapse,
  cold-load motion gating (`html:not([data-motion])`), and performance
  safeguards (no mobile `backdrop-filter`, transform/opacity-only motion).
  The handoff palette must be layered onto this system, not replace it.

## 4. Role boundaries (must stay separate)

| Role(s) | Entry | Guard in `App.tsx` | Home behaviour |
| --- | --- | --- | --- |
| `marketer` | `/login`, `/register` | `RequireAuth roles={['marketer']}` | `/` (MarketerLayout), onboarding gate if `!user.onboardedAt` |
| `manager` | `/manager/*` (staff login at same URL) | `RequireAuth roles={['manager']}` | `/manager` |
| `admin`, `superadmin` | `/admin/*` (staff login at same URL) | `RequireAuth roles={['admin','superadmin']}` | `/admin` |

Boundary rules confirmed in code (`lib/roles.ts`, `RequireAuth.tsx`):

- `panelOf()` maps `/admin/*` → admin, `/manager/*` → manager, everything else
  (except public auth routes) → marketer.
- Wrong-role access to a panel shows `WrongAccount` (switch-account screen),
  it does **not** silently merge or redirect into the other panel.
- `/admin` and `/manager` anonymous visits render `StaffLoginPage` in place.
- Marketer without `onboardedAt` is forced to `/onboarding` from any route.

**Redesign constraint:** Manager nav ≠ Admin nav; no Admin action (content,
users, teams, policies, audit, push automations…) may appear in Manager UI,
and no Manager-only team scope may be widened.

## 5. Exact existing features that must be preserved

### 5.1 Public / Auth / Onboarding

Routes: `/login`, `/register`, `/forgot-password` (currently a redirect to
`/login` — preserve, do not invent a reset flow), `/gallery`, `/onboarding`.

`AuthPage.tsx` real behaviour (authoritative over any mockup):

- Marketer sign-in identifier is **phone (11-digit) or national code
  (10-digit)**, auto-detected by shape; there is **no password and no OTP
  step** for marketers. Do not add one.
- Login with an unknown identifier converts in place to registration, keeping
  the typed identifier.
- Registration fields, in order: full name → residence
  (**province → city**, `ResidencePicker`) → final identity field whose kind
  is decided by `provinceUsesNationalCode(province)` (**national code or
  mobile**, per-province logic in `lib/nationalCode.ts`).
- Changing province after typing an identifier clears a now-incompatible
  identifier and explains why (existing inline notice). Validations:
  name ≥ 2 chars, province/city required, national-code checksum / mobile
  format. Changing mode tracks `signup_started`.
- `StaffLoginPage` serves Admin/Manager username+password sign-in at the
  panel URL itself.
- `OnboardingPage`: exactly **3 slides** with next / skip («رد شدن») / start
  («شروع») behaviour; completing or skipping marks onboarding done.
  Keep all three real slides and their copy source in code.

### 5.2 Marketer (mobile-first) — routes under `MarketerLayout`

| Route | Page | Must preserve |
| --- | --- | --- |
| `/` | `HomePage` | next-task card with start/continue/quiz CTA states, mentor nudge, overall progress, new/in-progress/completed metrics, points, overdue warning, “my learning” list, empty state |
| `/learn` | `LearnPage` | learning catalogue / package list states |
| `/packages/:id` | `PackagePage` | section list, sequential lock («ابتدا قسمت قبل را کامل کنید»), empty-package state |
| `/sections/:id` | `SectionPage` | media playback (video/audio), progress/heartbeat tracking, offline queue sync |
| `/quiz/:sectionId` | `QuizPage` | start, questions, review, submit confirm, pass/fail, retake-pending («در انتظار تأیید مدیر»), attempts-exhausted states |
| `/messages` | `MessagesPage` | notifications + manager messages, unread states, empty states |
| `/cards` | `CardsPage` | points & badges («امتیاز و نشان‌ها»), locked/earned states |
| `/mentor` | `MentorPage` + `MentorChat`/`VoiceCallSheet` | text chat, microphone, **voice call**, image, text-file, link/reference input, answer sources, feedback (up/down) controls |
| `/profile` | `ProfilePage` | profile data, notification preferences (`NotificationPrefsCard`), push opt-in |

Shell behaviours to preserve: header logo/bell/profile, unread badge =
notifications + unread messages, desktop top nav (≥lg) vs mobile `BottomNav`
(4 tabs: خانه، آموزش‌ها، پیام‌ها، کارت‌ها) with active-tab marker, offline
banner + offline beat flushing on reconnect, route prefetching.

### 5.3 Manager — routes under `/manager/*` (`ManagerRoutes.tsx`)

Nav (4 items only): داشبورد، گزارش تکمیل، آزمون مجدد، پروفایل.

| Route | Must preserve |
| --- | --- |
| `/manager` | `ManagerDashboard`: team health, completion rate, on-time rate, overdue members, retake requests, “no team assigned” state |
| `/manager/reports` | `ManagerReports` + shared `CompletionReport` / `QuizResultsReport` (incl. export behaviour in those components) |
| `/manager/members/:id` | `ManagerMember` member detail + timeline |
| `/manager/retakes` | `RetakeList` with `isAdmin={false}`, member links, approve/reject flow |
| (dialog) | `SendMessageDialog`: send message / training note to member |
| `/manager/profile` | shared marketer `ProfilePage` |

Manager scope is **team-scoped only**. No users/teams admin, no content, no
policies, no push tooling may be added here.

### 5.4 Admin — routes under `/admin/*` (`AdminRoutes.tsx`)

Nav (14 items): داشبورد، محتوای آموزشی، کتابخانه رسانه، رفتار منتور،
مسیرها و مخاطبان، کاربران، تیم‌ها، گزارش‌ها، آرشیو، اعلان‌ها،
کمپین‌های Push، سیاست‌ها، لاگ تغییرات، پروفایل.

| Route | Page | Must preserve |
| --- | --- | --- |
| `/admin` | `AdminDashboard` | KPIs: marketers, activation, WAU/MAU, on-time completion, first-attempt pass, avg. delay |
| `/admin/content` | `ContentPage` | real tabs **brands / unassigned / archive**, brand CRUD entry points |
| `/admin/content/brands/:id` | `BrandDetailPage` | logo/edit/archive, mentor behaviour, brand learning path, brand training, products, per-product packages |
| `/admin/packages/:id` | `PackageEditorPage` | real sequence **Product → Sections → Quizzes → Publish → Audience**; section ordering, media-library insertion, quiz links, publish issues, audience assignment |
| `/admin/quizzes/:id` | `QuizBuilderPage` | 4-option MCQ, correct answer, explanation, reorder, edit/delete, minimum-question rule, review state, pass-score & max-attempts |
| `/admin/media` | `MediaLibraryPage` | video/audio only; drag/drop, brand/product assignment, upload queue + progress + ETA + retry/cancel, filters, preview modal, add-to-package |
| `/admin/mentor` | `MentorGuidesPage` + `MentorGuideDialog` | behaviour-guide (“جعبه رفتار”) CRUD |
| `/admin/assignments` | `AssignmentsPage` | learning paths (پیشنهادی), direct assignment, audiences, cancel/delete confirms |
| `/admin/users`, `/admin/users/:id` | `UsersPage`, `AdminUserDetail` | role/team/status editing, password reset confirm, blacklist states |
| `/admin/teams` | `TeamsPage` | team CRUD and membership |
| `/admin/reports` | `ReportsPage` | completion/quiz reports, mentor-quality metrics (positive/negative feedback, “نمی‌دانم” rate, latency, voice minutes) |
| `/admin/archive` | `ArchivePage` | archived reports & blacklist; restore vs **permanent deletion must stay visually unmistakable** |
| `/admin/notifications` | `NotificationsPage` | inbox, templates/manual send, send confirm |
| `/admin/push-campaigns` | `PushCampaignsPage` | campaign list by status (draft/scheduled/sent…) |
| `/admin/push-campaigns/new`, `/:id` | `PushCampaignEditorPage` | editor, phone preview, template picker, audience estimate, schedule/cancel-schedule, archive, immediate-send confirm |
| `/admin/push-campaigns/automations` | `PushAutomationsPage`/`Panel` | automation list + global automation settings |
| `.../automations/new`, `.../:key` | `PushAutomationDetailPage` | rule editor, dry-run estimate, test send, delete confirm |
| `.../automations/runs` | `PushAutomationRunsPage` | run history |
| `.../automations/trace` | `PushAutomationTracePage` | per-user push trace incl. skip reasons |
| `/admin/policies` | `PoliciesPage` | grouped settings: quiz/completion, points, reminders/notifications, mentor chat, mentor voice |
| `/admin/audit` | `AuditPage` | **read-only** append-only log with before/after detail |
| `/admin/profile` | `ProfilePage` | shared profile page |

Admin tone rule: formal operations console, mascot essentially absent,
destructive actions keep explicit confirmations (`ConfirmDialog`).

### 5.5 Cross-cutting behaviour (all roles)

- Loading / empty / error states on every data page (`QueryState`,
  `EmptyState`, `ErrorState`, skeletons) — restyle, never remove.
- Toast system (success/error/warning/info, action button, auto-dismiss).
- Push opt-in banner + notification preferences; web-push resume on login.
- Offline queue for learning progress; “connection lost” banner.
- Dark mode via `prefers-color-scheme` token remap; `prefers-reduced-motion`
  collapse; cold-load motion gating. All three must survive token migration.
- Accessibility already in code: 48px targets (`--spacing-touch`), 2px focus
  outline, icon+text status badges (not colour-only), RTL logical properties,
  Persian digit formatting.

## 6. Shared components & tokens that can be migrated safely

Existing primitives in `apps/web/src/components/ui/` (extend, do not replace):

`Button` (primary/secondary/ghost/danger/light, md/lg, loading, block) ·
`Card` (default/brand/hero, interactive) · `Input` (label/error/hint/icon/LTR) ·
`Modal` (focus trap, stack-aware Escape, mobile sheet) · `StatusBadge` ·
`EmptyState` · `ErrorState` · `ErrorBoundary` · `Skeleton` (+ table/package
presets, `LoadingRegion`) · `Toast`/`ToastProvider` · `KpiCard` ·
`ProgressRing`/`ProgressBar` · `CountUp` · `CountBadge` · `CountdownChip` ·
`Spinner` · `Confetti` · illustrations.

Supporting shared pieces: `components/common/{Field, PageHeader, QueryState,
JalaliDateField, ResidencePicker, NotificationPrefsCard, PushOptIn*,
ProductImage}`, `components/admin/{DataTable, ConfirmDialog, MediaPicker,
Uploader, PublishGuide, PushNotificationPreview}`,
`components/layout/{BottomNav, Sidebar, Breadcrumb, PageTransition}`.

**Gaps vs. Stage-2 list in the handoff:** there is no standalone shared
`Select`, `Textarea`, `Tabs`, or generic `Table` primitive. Equivalent
patterns currently live inside `Field.tsx`, page-level markup,
`PushSectionTabs`, and `components/admin/DataTable.tsx`. Stage 2 must first
map these existing patterns; creating new primitives is allowed only where it
wraps current behaviour without changing it.

Token migration map (Stage 1, `index.css` `@theme`):

| Handoff token | Value | Current code | Safe migration |
| --- | --- | --- | --- |
| `brand-deep` | `#064E3B` | `--color-primary-900/800` (`#0e4630`/`#115638`) used by `.bg-hero` | Add semantic alias; re-point hero surface only after contrast check |
| `brand-primary` | `#059669` | `--color-primary: #177a50` (deliberately darkened, decision D40, for WCAG AA white text) | **Conflict — see §8.1.** Keep `#177a50`-family as the text-safe action colour; use `#059669` only as identity/accent, never with white normal text |
| `interactive-primary` | `#047857` | `--color-primary-hover: #146c45` | Adopt `#047857` (or keep darker `#146c45`) as solid CTA fill with white text |
| `brand-energy` | `#58CC02` | — (closest: `--color-success`) | New accent for marketer progress/rewards; dark text/icons only |
| `accent-amber` | `#F59E0B` | `--color-accent: #f59e0b`, `--color-warning: #d97706` | Already aligned; keep rewards (accent) vs warning semantics separate |
| semantic info/success/danger | accessible set | `--color-info/success/warning/danger` + `*-fg` text tones | Keep; never recolour status semantics to brand green |

Typography/spacing/radius already match the handoff scale
(12/14/16/18/20/24/30/36px, radius 8/12/16/20, 4–48 spacing rhythm,
`--spacing-touch: 48px`). Stage 1 is therefore an **aliasing and
harmonisation** task, not a rewrite.

## 7. Risky areas / regression hotspots

1. **Push automations (highest risk):** `PushAutomationDetailPage.tsx`
   (~2000 lines), `AutomationRuleLogic.tsx`, `PushAutomationsPanel.tsx` and
   their model/test files. Dense operational logic (dry run, test send, run
   history, per-user trace, skip reasons). Restyle only via shared primitives;
   never restructure the rule editor in the same commit as visual changes.
2. **Package editor & media library:** multi-step publish sequence, upload
   queue with progress/ETA/retry/cancel, resumable uploads
   (`lib/mediaLibrary/*` has its own tests). Visual changes must not touch
   queue state handling.
3. **Quiz flows (both sides):** builder (versioning, min-questions) and
   marketer attempt (attempt limits, retake approval, sequential lock).
4. **Auth identity logic:** province-dependent national-code vs mobile field
   (`lib/nationalCode.ts`, `iranLocations.ts`) — a “simpler” generic form
   would break real registrations.
5. **Mentor:** text/mic/voice-call/image/file/link inputs, sources and
   feedback are real API capabilities, not chat decoration.
6. **Token recolouring:** `--color-primary` is referenced across ~every page;
   changing its value changes contrast everywhere at once. Must be done as
   Stage 1 alone, with the a11y suite run immediately after.
7. **Performance safeguards:** mobile `backdrop-filter` removal, cold-load
   motion gate, transform/opacity-only rule. A “richer” visual pass can
   silently regress Lighthouse (documented in `docs/DESIGN-REFRESH.md` §6).
8. **Dark mode:** every new token needs a dark remap with checked contrast;
   product images rely on the always-white tile in `ProductImage`.
9. **Test sensitivity:** several tests assert class names / Persian labels
   (e.g. `refresh.test.tsx` expects `text-primary` on nav). Primitive changes
   must keep test-visible semantics or update tests only where the redesign
   intentionally changes presentation, with justification.
10. **No local toolchain in the audit sandbox:** `node_modules` is absent, so
    `typecheck` currently fails with `tsc: not found` before any change.
    Stage 1 must start from `npm ci` and a green baseline run; a stage may
    not be declared passing on a machine where the baseline itself was red.

## 8. Mismatches and conflicts found

### 8.1 ⚠️ STOP-AND-REPORT: primary green value

- Handoff `design-tokens.md`: `brand-primary #059669` is the identity green,
  `interactive-primary #047857` is the white-text CTA fill; white normal text
  on `#059669` is explicitly forbidden.
- Repository (decision **D40**, `index.css`): `--color-primary` was
  deliberately darkened `#1B8A5A → #177a50` so white-on-primary meets WCAG AA
  (5.34:1), and components use `text-on-primary` on `bg-primary` everywhere.

**Resolution proposed (no code changed yet):** keep a `#177a50`-class value
as the operational `primary` token (it satisfies the handoff’s contrast rule
for CTA fills, in the same role as `interactive-primary #047857`), and adopt
`#059669` only where the handoff permits it — identity/accent surfaces
without white normal-size text. This satisfies both sources; the alternative
(re-valuing `primary` to `#059669`) would break WCAG AA across the app and
contradicts the handoff itself. **Stage 1 must not proceed on any other
interpretation without explicit user approval.**

### 8.2 Mascot asset identity

- Handoff: canonical file `02-mascot/mascot-original.png`, SHA-256
  `1bf42cc8…b49562` (per `06-arena/AUDIT-REPORT.md`).
- Repository: the app actually ships a derived `apps/web/public/brand/
  mascot.webp` (45 KB, preloaded in `index.html`, used in `RequireAuth`
  loading state); the repo also contains an unrelated root-level
  `مسکات.png` (1.2 MB, not referenced by the web app).
- Visual inspection of the shipped `mascot.webp` confirms the locked traits:
  purple feathered body, tall red comb, bright green eyes, cream/orange beak,
  red wattle, beige suspenders, orange legs/feet. No hoodie/hat/glasses.

**Rule for later stages:** use the shipped asset (and approved state boards)
as-is; do not regenerate, re-anatomise, or swap in the root `مسکات.png`.
Byte-identity with the Drive PNG cannot be claimed for the WebP derivative.

### 8.3 Smaller reconciliations (code wins)

- `/forgot-password` exists only as a redirect to `/login`; the handoff does
  not require a reset flow. Keep the redirect.
- Marketer login has no password/OTP (see §5.1); auth mockups implying one
  must be ignored.
- Media library is video/audio only per current code; do not add document/
  image-library behaviour from generic references.
- `APP_ENV=dev` in production (per `07-cloudflare-live-context.md` and
  `wrangler.toml [vars]`): **infrastructure finding, explicitly out of
  scope.** Not changed by this audit or by any redesign stage.
- The unrelated Cloudflare Pages project `my-website` (omidadli.site) is out
  of scope and untouched.

## 9. Proposed staged implementation order

Exactly the handoff order; each stage is a separate commit, gated by
format/lint/typecheck/tests for the touched area, and may not start while
the previous stage has an unresolved redesign-introduced regression.

| Stage | Scope | Gate before commit |
| --- | --- | --- |
| 1 | Foundations: semantic token aliases (§6 map), hero/CTA contrast, dark-mode remaps; preserve reduced-motion & cold-load gate | `npm ci` baseline green → token change → web tests + a11y suite |
| 2 | Shared primitives: extend Button/Input/Card/Modal/Toast/Skeleton/Empty/Error/StatusBadge; map Field/DataTable/Tabs patterns before inventing Select/Textarea/Tabs/Table | ui tests (`ui.test.tsx`, `refresh.test.tsx`) |
| 3 | Auth + Onboarding with real fields/logic (§5.1), approved mascot states | auth flow tests, responsive check 360–430px |
| 4 | Marketer shell + pages (§5.2), one-next-action Home hierarchy | flows/pages tests, mentor capabilities checklist |
| 5 | Manager shell + pages (§5.3), desktop-first cockpit, mascot rare | manager/report/retake flows |
| 6 | Admin shell + core (dashboard/users/teams/reports) | admin tests |
| 7 | Admin content workflows (content/brand/package/quiz/media/mentor/assignments) | content/media/quiz tests |
| 8 | Notifications + Push campaigns + Automations (ops-console treatment; dry-run/test-send/runs/trace legible) | push/automation test suites (largest set — run in full) |
| 9 | Policies/Audit/Archive/Profile + edge states; permanent deletion unmistakable | audit read-only check, archive confirms |
| 10 | Full regression/a11y/performance pass; no feature changes | full web+functions tests, e2e, Lighthouse comparison vs `docs/DESIGN-REFRESH.md` baseline |

## 10. Verification status of this audit

- ✅ Commit identity verified against handoff baseline.
- ✅ All handoff `.md` files read; repo route tables and pages inventoried.
- ✅ Mascot shipped asset visually verified against the identity lock.
- ⚠️ Automated checks **not run**: the audit sandbox has no `node_modules`
  (`tsc: not found`). First action of Stage 1 is `npm ci` and a recorded
  green baseline (typecheck, lint, web tests) **before** any token change.
- ❌ No production verification claimed. No Cloudflare access was used; the
  live-context file was treated as read-only background, per instructions.
- ❌ No screenshot QA yet — that belongs to Stages 3–5 and 10, against the
  approved reference boards listed in §2.

## 11. Intentionally unchanged by this audit

All product code, styles, routes, APIs, database schema/migrations, Worker
bindings, cron schedules, secrets, `wrangler.toml`, deployment workflow,
mascot assets, and the unrelated `my-website` project. The only addition is
this report.

---

*Next step: user confirmation of §8.1 (primary-green interpretation), then
Stage 1 — Foundations only.*
