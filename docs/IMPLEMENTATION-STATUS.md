# Implementation status (live)

All 15 build prompts (§32.2 / §34) are implemented on branch `arena/01a0e829-seylane-sabz-learning` (PR #7).
What is still open needs accounts, keys or devices the owner has to provide. See [`USER-TODO.md`](./USER-TODO.md).

| PROMPT | Scope | Status | Where |
|---|---|---|---|
| 001 | Foundation & design system | ✅ | `apps/web/src/components/ui`, `styles/index.css`, CI |
| 002 | Auth (F1): register/login/refresh/logout/reset, lockout, onboarding | ✅ | `functions/src/routes/auth.ts`, `auth/*`, `pages/auth/*` |
| 003 | Firestore schema/rules/indexes, repeatable seed (catalog + logos/images → Storage) | ✅ | `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `scripts/seed-catalog.ts`, `functions/src/seed/*` |
| 004 | Admin content (brands/products/packages/sections, uploads) + sample training packages | ✅ | `pages/admin/Content*`, `PackageEditorPage`, `services/content.ts` |
| 005 | Quiz builder (versioned questions, settings) | ✅ | `pages/admin/QuizBuilderPage.tsx` |
| 006 | Paths & assignments (global ∪ team ∪ user) | ✅ | `pages/admin/AssignmentsPage.tsx`, `services/assignments.ts` |
| 007 | Users, teams, policies, audit | ✅ | `pages/admin/{Users,Teams,Policies,Audit}Page.tsx` |
| 008 | Marketer home / catalog with real images | ✅ | `pages/m/{Home,Learn,Package}Page.tsx` |
| 009 | Player + tracking (playedDelta, offline queue, idempotency) | ✅ | `pages/m/SectionPage.tsx`, `lib/tracker.ts`, `lib/offline-queue.ts` |
| 010 | Quiz + sequential lock + retakes | ✅ | `pages/m/QuizPage.tsx`, `services/learning.ts` |
| 011 | Deadlines, notifications (FCM + in-app), quiet hours, scheduled jobs | ✅ | `services/notify.ts`, `functions/src/index.ts` |
| 012 | Points, badges, manager messages | ✅ | `pages/m/{Cards,Messages}Page.tsx` |
| 013 | Manager panel (team scope), reports + CSV, retake approvals | ✅ | `pages/manager/*`, `components/reports/*` |
| 014 | AI mentor: rules R1–R6 + Gemini RAG chat with guardrails and fallback | ✅ | `services/mentor.ts`, `llm/*`, `components/learning/Mentor*` |
| 015 | Analytics events, monitoring, PWA, Capacitor Android + APK CI, release docs | ✅ | `lib/telemetry.ts`, `lib/native.ts`, `apps/web/android`, `.github/workflows/android.yml`, `docs/RELEASE.md` |
| 16 | Beta with a real team (30–50 people) | ⏳ owner | needs the deployed dev environment |

## Tests

| Suite | Count | Runs |
|---|---|---|
| Functions unit + API (Vitest + supertest, memory backend) | 92 | local + CI |
| Web unit/integration (Vitest + Testing Library, mocked API) | 37 | local + CI |
| Emulator: security rules + API on Firestore (`functions/test-emulator/rules.test.ts`) | 6 | CI only (no JDK in the dev sandbox) |
| E2E Playwright: foundation (5) + §28.2 journeys on the real seed (5) | 10 | CI only |
| Android debug APK (Gradle) | — | CI only (`android.yml`) |

### §28.2 key test cases → tests

| # | Case | Test |
|---|---|---|
| 1 | Anti-cheat seek | `functions/test/learning.test.ts` «28.2 #1», `unit.test.ts` anti-cheat, `apps/web/src/lib/tracker.test.tsx` |
| 2 | Sequential lock + idempotent submit | `learning.test.ts` «28.2 #2», E2E `journey.spec.ts` (marketer, fresh marketer) |
| 3 | Attempt limit → 409 unless approved | `learning.test.ts` «28.2 #3» |
| 4 | Deadline escalation | `notify.test.ts` «deadlines & escalation» |
| 5 | Manager scope 403 | `manager.test.ts` «28.2 #5», emulator rules |
| 6 | No double points | `learning.test.ts` «28.2 #6» |
| 7 | Offline sync | `learning.test.ts` «28.2 #7», `tracker.test.tsx` offline queue |
| 8 | Question versioning | `learning.test.ts` «28.2 #8» |
| 9 | Assignment union | `assignments.test.ts` «28.2 #9» |
| 10 | Mentor «نمی‌دانم» | `mentor.test.ts` «28.2 #10» |
| 11 | Quiet hours | `notify.test.ts` «quiet hours» |
| 12 | Duplicate registration | `auth.test.ts` «28.2 #12» |

## §37 checklists

- **§37.1 (every PR):** tests green ✅ • 0 TS/lint errors ✅ • RTL + tokens ✅ • Loading/Empty/Error ✅ • §25 events: server-side events plus client events (`/me/events`) ✅ • API docs (§21.4.1) ✅ • no paid deps, no secrets ✅ • a11y basics (focus ring, ≥48px, jsx-a11y lint) ✅
- **§37.2 (features):** §5.2 AC covered by the tests above ✅ • demo users + seed for the client demo ✅
- **§37.3 (release):** regression checklist + runbook ✅ (`RELEASE.md`) • Lighthouse ≥ 90 ⏳ needs the deployed URL • dev/prod deploy ⏳ needs the Firebase/Cloudflare secrets
- **§37.4 (product):** 9 MVP features built ✅ • deployed APK + PWA + panels ⏳ owner setup • beta + KPI baseline ⏳ owner

## Decisions recorded (§36)

D27–D39. The latest are D38 (Android appId + push gated on `google-services.json`) and D39 (refresh-token grace window in the local backend).
