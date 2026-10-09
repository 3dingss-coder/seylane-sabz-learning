# Phase 1 — Whole-Project Audit (seylane-sabz-learning)

> **Historical auth notes only:** this audit predates the current phone-auth changes. Its password/demo login, reset, and runtime claims do not describe the current checkout. Seed phones are data fixtures, not credentials; public phone-only login never issues a session. See `docs/USER-TODO.md` and `CLOUDFLARE_CONFIGURATION_REPORT.md` for current limits.

Date: 2026-09-29 · Branch audited: `main` @ `7eb0114` (PR #8, CI green) · **Report only — no code changed.**

---

## 1. Method & verification basis

| Layer | Method |
|---|---|
| Static | Full read of `functions/src` (app, config, routes, services, stores, auth, blob, http, llm, push, mail, seed) and `apps/web/src` (all pages, layouts, components, lib, styles), `vite.config.ts`, `index.html`, `public/*`, `firestore.rules`, `storage.rules`, `.github/workflows/*`, `PRODUCT-MASTER-SPEC.md`, `docs/*` |
| Runtime | `npm ci` then local stack: API on memory backend (`PORT=5001`, fresh seed: 16 brands / 243 products / 8 packages) + Vite dev server (5199). ~40 live API probes: login/lockout/rate-limit, register/duplicate, manager cross-team probes, upload-url → PUT → finalize (fake bytes, real bytes, mime mismatch, oversize, bad ticket), heartbeat anti-cheat, quiz start/submit/gating, YouTube URL validation, X-Access-Token, health |
| Tests | `npm test` (functions 12 files/58 tests + web 11 files/101 tests), `npm run lint`, `typecheck`, `build`, `format:check` — **all green locally** (see §2) |
| Spec | Cross-checked §11, §15, §16, §17, §18, §19, §21.5, §22–§29, §32, §36 (D1–D40), §37 against behavior |

**Not verifiable here (flagged, not silent):** Playwright browsers could not be downloaded in this sandbox (CDN blocked), so Playwright e2e / axe / Lighthouse were **not re-run locally** — they are green in CI on main (run `36491323143`, 2026-09-29). Production Firebase-mode runtime (Firestore/Storage/FCM/Blaze) cannot be exercised in this environment; findings about it are from code + rules review and are labeled accordingly.

Historical local demo note (2026-09-29 only): manual checks once used role-based demo credentials, now retired and deliberately omitted from this record. Local seed phones in the current checkout are fixtures only and cannot authenticate.

---

## 2. Baseline gates (all green)

| Gate | Result |
|---|---|
| `npm ci` | exit 0 |
| `npm test` (functions) | 12 files / 58 tests — pass |
| `npm test` (web) | 11 files / 101 tests — pass |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 (2092 modules, 24.4 s) |
| `npm run format:check` | exit 0 |
| CI on main (`7eb0114`) | success (quality + emulator + e2e + lighthouse jobs) |

---

## 3. Findings summary

| ID | Sev | Area | Title | Location |
|---|---|---|---|---|
| SEC-01 | **High** | Security | Self-service password change does not revoke existing sessions / refresh tokens | `functions/src/services/users.ts:250` |
| BUG-01 | Medium | Frontend | YouTube player destroyed and rebuilt when `lastPositionSec` updates at section completion | `apps/web/src/pages/m/SectionPage.tsx:298` |
| UX-01 | Medium | UX/nav | `/mentor` page unreachable on mobile (no bottom-nav entry) | `apps/web/src/components/layout/BottomNav.tsx:14` |
| SEC-02 | Medium | Security/dev | Dev API binds `0.0.0.0` by default; comment claims `127.0.0.1` intent | `functions/src/local.ts:25` |
| CONS-01 | Medium | Consistency | Manager report includes inactive members, dashboard excludes them | `functions/src/services/reports.ts:119,197` |
| BUG-02 | Medium (suspected) | Responsive | Mentor page fixed-height container can squeeze the chat input on small phones | `apps/web/src/pages/m/MentorPage.tsx:17` |
| FE-01 | Low | Copy | Quiz settings hint says policy default 70%; actual default is 80% | `apps/web/src/pages/admin/QuizBuilderPage.tsx:139` |
| FE-02 | Low | PWA | `showNotification` rejection unhandled in push service worker | `apps/web/public/push-sw.js:16` |
| FE-03 | Low (suspected) | a11y | `aria-label` on non-interactive `<span>` (unread dot) | `apps/web/src/pages/m/MessagesPage.tsx:113` |
| BACK-01 | Low | Backend | Rotated refresh-token docs accumulate until re-presented / logout | `functions/src/auth/memory.ts:94` |
| BACK-02 | Low | Dead code | `DocStore.increment` implemented in both stores, never called | `functions/src/store/memory.ts:231` |
| BACK-03 | Low | UX/API | Path deadlines in the past are silently skipped on apply | `functions/src/services/assignments.ts` (`applyPathDeadlines`) |
| BACK-04 | Low | Consistency | Firestore `batchSet` commits 400-item chunks non-atomically (all current callers self-heal) | `functions/src/store/firestore.ts` |
| DOC-01 | Low | Docs | README/IMPLEMENTATION-STATUS still say 12 brands / 238 products; seed now makes 16 / 243 | `README.md`, `docs/IMPLEMENTATION-STATUS.md` |
| DOC-02 | Low | Spec drift | Spec §25.2 says heartbeat "~60 s batch"; client flushes every ~10 s of playback | `PRODUCT-MASTER-SPEC.md` §25.2 vs `apps/web/src/lib/tracker.ts:7` |
| DEV-01 | — (decision) | Deploy | `deploy.yml` targets Firebase Cloud Functions; owner has no Blaze plan → deploy blocked | `.github/workflows/deploy.yml` |

**Critical: none found.** The security-critical paths (uploads, anti-cheat, quiz, RBAC, auth lockout, CSP, rules) were probed live and behave as specified.

---

## 4. Findings in detail

### SEC-01 (High) — Password change leaves existing sessions alive

- **Location:** `functions/src/services/users.ts:250-259` (`changePassword`); `functions/src/auth/memory.ts:146` (`setPassword`); `functions/src/auth/firebase.ts:110`.
- **What's wrong:** `changePassword` verifies the current password and calls `d.auth.setPassword(...)`, but never calls `d.auth.revoke(userId)`. Every other credential-relevant path does revoke: logout (`users.ts:191`), admin role/status change (`users.ts:367`), admin temp-password reset (`users.ts:408`).
  - Memory provider: token revocation works through the `validAfter` generation counter (`auth/memory.ts:129-130`) plus deletion of the user's `_auth_refresh/*` docs (`auth/memory.ts:133-142`). Neither happens on password change, so **every access token (≤1 h) and every refresh token (30-day rotation chain) issued before the change stays valid**. `refresh()` (`auth/memory.ts:94-111`) only checks record existence, rotation grace, and `acc.disabled`.
  - Firebase provider: `updateUser(uid, { password })` does not set `validSince`, so existing ID tokens live out their TTL; refresh tokens persist until revoked.
- **Impact:** the one action a user takes to cut off a compromised account (change password) does not actually cut it off — an attacker holding a stolen refresh token keeps minting access tokens for 30 days (memory mode).
- **Repro (code-verified; runtime-reproducible):** 1) log in, keep the `refreshToken`; 2) `POST /v1/me/password`; 3) `POST /v1/auth/refresh` with the old token → returns `200` + new tokens (before fix). Unit-level: issue → changePassword → `authProvider.refresh(oldToken)` expects `null`.
- **Fix:** add `await d.auth.revoke(user.id)` after `setPassword` in `changePassword` (1 line) + a test asserting old refresh tokens no longer work. For Firebase mode also set `validSince: Date.now()` in the same `updateUser` call.
- **Effort:** trivial. **Verification:** new unit test (memory provider) + live probe.

### BUG-01 (Medium) — YouTube player rebuilt at section completion

- **Location:** `apps/web/src/pages/m/SectionPage.tsx` — `YouTubeView` effect deps `[videoId, start]` (line ~376) where `start = s.lastPositionSec`; triggered by `Player.onResult` (lines 57-66) which calls `qc.invalidateQueries({ queryKey: ['me'] })` the moment the section completes, refetching `['me','section',id]` and changing `lastPositionSec`.
- **What's wrong:** when the user finishes a YouTube section, the refetch changes `start`, the effect re-runs, `player.destroy()` + a brand-new `YT.Player` load at the final timestamp → visible spinner flicker / "replay at the end" right as the quiz CTA appears. File-based sections are unaffected (`FileView` only applies `start` in `onLoadedMetadata`, element is stable).
- **Repro:** open any YouTube section (admin can add one in the package editor), play to 100%; at the completion moment the player reloads. (Verified by code path; needs a browser to see the flicker.)
- **Fix:** make the initial position a mount-only value: read `start` from a ref, deps `[videoId]` (or key the component by `sectionId` and pass `start` via an untracked prop).
- **Effort:** trivial. **Verification:** unit test with a stubbed YT API asserting the player is constructed once per `videoId`.

### UX-01 (Medium) — Mentor module has no mobile entry point

- **Location:** `apps/web/src/components/layout/BottomNav.tsx:14-19` (tabs: `/, /learn, /messages, /cards`); desktop sidebar has `/mentor` (`layouts/MarketerLayout.tsx:18`).
- **What's wrong:** on a phone, `/mentor` is only reachable via the home nudge card (`pages/m/HomePage.tsx:132`, `to={topNudge.actionRef ?? '/mentor'}`) — i.e., **only while a nudge exists**. The floating «از منتور بپرس» button (`components/learning/MentorSheet.tsx`) opens a package-scoped modal, not the page. A marketer with no active nudge can never reach the global Mentor page on mobile.
- **Why it matters:** spec §17.1.8 (M10) treats the Mentor as a core marketer module; nudges expire/throttle, so the module becomes a dead end most of the time.
- **Fix options (product decision needed):** (a) 5th bottom tab — breaks the deliberate 4-tab §16.5 layout; (b) permanent mentor card/CTA on home or in Profile (my recommendation, keeps the 4-tab design).
- **Effort:** small. **Verification:** manual on mobile viewport; e2e can assert the entry point.

### SEC-02 (Medium) — Dev API default host contradicts its comment (LAN exposure)

- **Location:** `functions/src/local.ts:25-26` — comment: *“HOST=127.0.0.1 keeps the API private so preview tools only expose the web app (5173)”*; code: `process.env.HOST ?? '0.0.0.0'`.
- **What's wrong:** a bare `npm start` on a laptop binds the dev API (with seeded **superadmin** demo credentials documented in the README) to all interfaces — reachable by anyone on the LAN/Wi-Fi.
- **Repro:** `npm start`, then `curl http://<laptop-lan-ip>:5001/v1/health` from another device.
- **Fix:** default to `127.0.0.1` and set `HOST=0.0.0.0` explicitly in the sandbox/preview flows (or at minimum make comment and behavior agree).
- **Effort:** trivial. **Caveat:** flipping the default requires checking the sandbox preview setup uses an explicit HOST (this environment does: I start it with `PORT=5001`, default host).

### CONS-01 (Medium, suspected intent) — Manager dashboard vs report membership mismatch

- **Location:** `functions/src/services/reports.ts:119-122` (`managerDashboard` filters `teamMembers(...)` by `status === 'active'`) vs `reports.ts:197-199` (`managerReport` uses all `teamMembers(...)`).
- **What's wrong:** a deactivated marketer disappears from the dashboard KPIs but still appears in the completion report rows and member list. Either is defensible; the inconsistency is not.
- **Repro:** admin deactivates a team marketer (UsersPage) → manager dashboard count drops, `/manager/reports` still lists them.
- **Fix:** apply the same filter in both (or add an explicit “include inactive” filter to the report) + unit test.
- **Effort:** trivial.

### BUG-02 (Medium, suspected) — Mentor page layout on small phones

- **Location:** `apps/web/src/pages/m/MentorPage.tsx:17` — `h-[calc(100dvh-12rem)]` (mobile) wrapping PageHeader + up to 3 nudge cards + `MentorChat` (`min-h-0 flex-1`).
- **What's wrong (suspected):** the 12rem allowance must cover top bar + bottom nav + page padding; with 3 long nudge cards the `flex-1` chat is compressed and the input row can become cramped or land under the bottom nav on short screens (≈ 360×640, landscape-adjacent heights). Could not be reproduced in a real browser in this sandbox.
- **Fix:** replace the fixed height with a flex column in the page flow (`min-h-0` + normal page scroll), or reduce to `h-[calc(100dvh-13rem)]` with `overflow` safety.
- **Effort:** trivial. **Verification:** manual / Playwright on 360×640 and 375×667 viewports.

### FE-01 (Low) — Wrong policy default in quiz-settings hint

- **Location:** `apps/web/src/pages/admin/QuizBuilderPage.tsx:139` — `policy.data?.passScore ?? 70`; actual default is `passScore: 80` (`functions/src/domain/policy.ts:5`, spec §18.9). Server always resolves `quiz.passScore ?? policy.passScore` (`learning.ts:437,565`).
- **Effect:** while the policies query is loading (and if it ever errors) the hint shows ۷۰٪ instead of ۸۰٪ — misleading for the admin.
- **Fix:** `?? 80` (or import the shared constant). **Effort:** trivial.

### FE-02 (Low) — Unhandled `showNotification` rejection in push SW

- **Location:** `apps/web/public/push-sw.js:16` — `event.waitUntil(self.registration.showNotification(...))` with no `.catch`. If permission was revoked (push still in flight) or `dir`/payload issues arise, the rejection is unhandled in the service worker (silent console noise; notification silently dropped — acceptable, but should be caught).
- **Fix:** append `.catch(() => {})`. **Effort:** trivial.

### FE-03 (Low, suspected) — `aria-label` on decorative span

- **Location:** `apps/web/src/pages/m/MessagesPage.tsx:113` — `<span … aria-label="خوانده نشده" />`.
- **What's wrong (suspected):** `aria-label` on a generic-role span is not a permitted usage (axe `aria-prohibited-attr`/`aria-allowed-attr` family). The repo's axe e2e covers login/home/manager/admin pages, not `/messages` — so this is not currently caught.
- **Fix:** render `<span className="sr-only">خوانده نشده</span>` or add `role="status"`. **Effort:** trivial. **Verify:** extend axe e2e to `/messages`.

### BACK-01 (Low) — Refresh-token docs accumulate (memory provider, Firestore mode)

- **Location:** `functions/src/auth/memory.ts:94-111` — rotation marks the old doc (`rotatedAt`) but only deletes it if the old token is re-presented after the 30 s grace; `issue()` (lines 50-67) creates a new doc per login/refresh. Logout/`revoke` cleans up (lines 138-142), but a user who never reuses an old token and stays logged in leaves one doc per refresh cycle (~hourly).
- **Impact:** unbounded (slow) `_auth_refresh` growth on Firestore; irrelevant for memory mode.
- **Fix:** periodic cleanup in a scheduled job (delete docs with `rotatedAt` older than grace + N days) or a TTL policy. **Effort:** small.

### BACK-02 (Low) — Dead `DocStore.increment`

- **Location:** `functions/src/store/memory.ts:231`, `functions/src/store/firestore.ts:102`, interface `store/types.ts:59`. Zero callers in `src/`, `test/`, or the web app.
- **Fix:** remove the method + interface entry, or keep with a comment if intended for Phase 2/3 work. **Effort:** trivial.

### BACK-03 (Low) — Past path deadlines silently skipped

- **Location:** `functions/src/services/assignments.ts` → `applyPathDeadlines`: `if (deadlineAt <= now) continue;`
- **What's wrong:** if a path is (re)saved with a `startAt` that pushes an item's deadline into the past, that item gets no deadline and no warning — the admin UI shows no “skipped” info (the API returns only `updated`).
- **Fix:** return the skipped list in the response and surface it in the UI (Persian warning), or clamp to “today + buffer”. **Effort:** small.

### BACK-04 (Low, informational) — `batchSet` is not atomic across 400-item chunks

- **Location:** `functions/src/store/firestore.ts` (`batchSet` loops 400-item `commit()`s).
- **Callers:** section/question reorder (`content.ts:812,958`), mark-all-read (`notify.ts:351`), seed (`seed.ts:270`). All are idempotent/self-healing (a stale `order` or `readAt` fixes itself on the next action; re-running seed is the remedy). No action needed; noting for future bulk features.

### DOC-01 (Low) — Stale counts in docs

- README and `docs/IMPLEMENTATION-STATUS.md` say **12 brands / 238 products**; the seed (per D27–D31 reactivations) now creates **16 brands / 243 products** (verified in the live seed log; `docs/SEED-REPORT.md` is already correct).
- **Fix:** update the two docs. **Effort:** trivial.

### DOC-02 (Low) — Spec §25.2 heartbeat cadence drift

- Spec says `playback_heartbeat` fires “هر ~۶۰s (Batch)”; the client accumulates and flushes every **10 s** of real playback (`apps/web/src/lib/tracker.ts:7`, within the server's 20/min limit). Implementation is *stricter* than spec (better anti-cheat, slightly more requests).
- **Fix:** update the spec line (no code change). **Effort:** trivial.

### DEV-01 (Decision needed, not a code bug) — Deploy target

- `.github/workflows/deploy.yml` deploys the API to **Firebase Cloud Functions** (+ Cloudflare Pages for the PWA). The owner has no Blaze plan (recorded in `docs/USER-TODO.md`), so the only supported deployment path is currently blocked. The codebase is port-based (`store/`, `auth/`, `blob/` with `memory|firestore` modes) and could run as a plain Node container/Cloudflare Workers with a chosen backend, but that is a new workstream.
- **Needs your decision** before Phase 2+ if a real deploy matters to you; otherwise Phase 2/3/4 proceed on the codebase as-is.

---

## 5. Accepted/known limitations (from `docs/USER-TODO.md` — no action, verified still true)

- YouTube may be unreachable in Iran (D17/D23): `YouTubeView` handles load/error with a Persian message, retry, and a «گزارش مشکل به ادمین» button emitting `youtube_blocked_reported` — verified in code + event whitelist (`routes/me.ts` `CLIENT_EVENTS`).
- In-memory rate limiter: per-instance; with `maxInstances: 10` on Cloud Functions limits are per-instance (documented; live-verified limits work in single-instance mode).
- Open signup (D18): intentional for MVP.

## 6. Security items checked and found sound (verified live)

- **Upload pipeline** (`POST /admin/media/upload-url` → `PUT /v1/uploads/:token` → `POST /admin/media/:id/finalize`): MIME allowlist (400, incl. SVG), size caps at both create and stream (400), **magic-byte sniffing at finalize** — text-as-mp4 and PNG-as-mp4 both rejected with the Persian content-mismatch error, real mp4/PNG accepted, invalid/absent ticket → 403, random private object paths, `X-Content-Type-Options: nosniff` + `Cross-Origin-Resource-Policy` on serving.
- **Anti-cheat**: `playedDeltaSec > 70` → 400; per-user playback budget bank capped at 1.5× real time (`learning.ts:196-230`); `positionSec` ≤ 24 h; completion threshold 85% of duration.
- **Quiz**: `answerKey`/`explanation` never sent before submission (`learning.ts:476-482`); media gate enforced (409 with Persian message before media completion); invalid option key → 400; server-side grading against an attempt snapshot (`learning.ts:587+`); attempts capped + retake-request workflow.
- **RBAC**: manager probing another team's user → 403 indistinguishable from non-existent (`reports.ts:106-117`); role guards on all `/admin/*` and `/manager/*` routes; e2e asserts marketer rejection in the admin panel.
- **Auth**: 5 failed logins → 15-min account lockout (verified: 429 «ورود تا ۱۵ دقیقه بسته شد», correct password also rejected while locked); duplicate register → 409; login rate limit 10/min/IP (verified 429); refresh rotation with 30 s grace; HS256 + revocation counter.
- **CSP/XSS**: `default-src 'none'` + strict script/frame policies (helmet + `public/_headers`); no `innerHTML`/`eval`/`document.write` sinks in `apps/web/src`; React escaping throughout; notification `actionRef` used only as a route path.
- **Rules**: `firestore.rules`/`storage.rules` are deny-by-default, RBAC-scoped, media/ private with signed URLs; catalog images public-read only under `brands/`, `products/`, `branding/` (traversal-guarded — verified the regex + `..` checks).
- **Secrets**: none committed; deploy workflow reads GitHub secrets and deletes the generated `functions/.env` after deploy. (One dev-only default noted in SEC-02 and the `local-dev-secret-change-me` HMAC default in `config.ts:54`, which is only used by the local memory stack — no prod path.)

## 7. Feature gaps (context for Phases 3–4, not bugs)

- **Phase 3 (universal upload):** today only `video|audio|image` kinds (`uploadUrlSchema`, `content.ts:205-216`), fixed `MEDIA_RULES` sizes in `lib/media.ts` (not configurable), `Uploader.tsx` is file-picker-only (no drag&drop, cancel, progress UI beyond XHR progress, preview, replace). All targets for Phase 3 per the brief.
- **Phase 4 (Aparat/embeds):** `extractYoutubeId` handles YouTube URL shapes only (`lib/ids.ts`); `public/_headers` `frame-src` allows only YouTube domains — both are Phase 4 work items.

## 8. Suggested Phase 2 order (after your approval)

1. **SEC-01** (High) — 1-line fix + test.
2. **BUG-01, FE-01, FE-02, FE-03** — trivial frontend fixes (group A, one commit each).
3. **SEC-02, CONS-01, BACK-02, DOC-01, DOC-02** — small backend/docs fixes (group B).
4. **UX-01** — needs your design decision (5th tab vs home/profile entry) before touching.
5. **BUG-02, BACK-01, BACK-03** — small, each with a test/viewport verification.
6. Re-run full gate suite after each group; add tests for SEC-01, CONS-01, BUG-01.

Everything is labeled by verification method above; items marked **suspected** need a browser/device that this sandbox could not provide (Playwright download blocked) — they are low-risk and each has a concrete repro/verify step for when a browser is available.
