# Changelog

## 2026-09-30 — منتور هوشمند: دانش‌نامه‌ی چندوجهی، تماس صوتی و موتور رفتاری (F14-V)

**چرا:** منتور نسخه‌ی MVP فقط روی متنِ تأییدشده جست‌وجو می‌کرد و یک مدل داشت. نیاز واقعی تیم فروش سه چیز است: پاسخ به «هر» سؤالی از «هر» نوع محتوایی (متن، تصویر، صدا، ویدیو، PDF)، گفت‌وگوی صوتی طبیعی، و راهنمایی روزانه‌ی «الان چه کار کنم؟». سند کامل: [`docs/MENTOR-AI.md`](./MENTOR-AI.md) — فهرست کلیدها: [`docs/USER-TODO.md`](./USER-TODO.md) §۳.۵.

**لایه‌ی چندمدلی (`functions/src/ai/`)**

| جزء | کار |
|---|---|
| `hub.ts` | مسیریابی بر اساس «کار» (chat/classify/vision/transcribe/synthesize/embed/realtime) با failover، تله‌متری هر فراخوانی و رد صریح قابلیت‌های پشتیبانی‌نشده |
| `gemini.ts` | چت، درک تصویر/PDF/ویدیو، TTS فارسی (PCM 24k)، ایمبدینگ دسته‌ای، توکن موقت Live برای تماس دوطرفه |
| `groq.ts` | Whisper فارسی برای گفتار→متن + لِین سریع مدل کوچک؛ TTS را عمداً رد می‌کند (صدای فارسی ندارد) |
| `local.ts` | ایمبدینگ آفلاین ۱۲۸بُعدی به‌عنوان پشتیبان اضطراری (بدون کلید) |
| `handoff.ts` | «پاکت» مهرشده‌ی زمینه بین مرحله‌ها؛ مدل‌ها آزادانه با هم چت نمی‌کنند، ارجاع‌ها قابل اثبات‌اند |
| `prompts.ts` | کتابخانه‌ی پرامپت با `PROMPT_VERSION` (پاسخ، استخراج رسانه، دسته‌بندی، لحن صوتی، مربی، قاضی، پیام رفتاری) |

**دانش و بازیابی** — `services/knowledge.ts` همه‌ی برندها/محصولات/بسته‌ها/قسمت‌ها (با متن آموزش)/آزمون‌ها (بدون کلید پاسخ)/سیاست‌ها/پلی‌های فروش/FAQ/استخراج رسانه‌ها را در یک ایندکس افزایشی جمع می‌کند (فقط تغییر‌یافته‌ها بازنویسی و دوباره ایمبد می‌شوند). `services/retrieval.ts` بازیابی ترکیبی BM25 + کسینوس با گسترش مترادف فارسی، تنوع بین بسته‌ها و **آستانه‌ی اطمینان روی سیگنال خام** دارد؛ زیر آستانه، پاسخ «نمی‌دانم + نزدیک‌ترین مطلب» است و هیچ مدلی صدا زده نمی‌شود.

**درک چندوجهی** — `services/media-ingest.ts`: ویدیو/صدای آپلودی (Whisper، و برای فایل‌های کوچک درک تصویری Gemini)، تصویر محصول (بسته‌بندی/ادعاها)، PDF و YouTube (مستقیم با URL). خروجی به‌صورت دانش ساخت‌یافته در `media_extractions` و کلیدش به `EXTRACTOR_VERSION` گره خورده؛ فایل سالمِ خوانده‌شده دوباره خوانده نمی‌شود. کرون `knowledge-reindex` روزانه همین کار + بازسازی افزایشی را انجام می‌دهد.

**تماس صوتی** — `services/voice.ts`: مسیر turn (MediaRecorder → Whisper با پرامپت واژگان برند/محصول → همان خط تولید مستند → Gemini TTS که PCM خامش با `wrapPcmAsWav` به WAV قابل پخش در مرورگر تبدیل می‌شود) و مسیر Live دوطرفه با توکن موقت (کلید اصلی هرگز به کلاینت نمی‌رسد، فکت‌ها از ابزار `voice/ground` می‌آید). سهمیه‌ی دوگانه‌ی دقیقه‌ای از سیاست‌ها؛ پایان تماس = ثبت خلاصه (با رضایت) + استخراج «کارهای گفته‌شده».

**موتور رفتاری** — `services/behavior.ts`: سیگنال → وضعیت (`momentum`/`pressure`/`health`/`risk` + دلیل متنی) → قواعد B1–B12 با اولویت و کانال (کارت/چت/صدا/Push/نقش مدیر)، dedupe روزانه و حداکثر ۲ مداخله در روز؛ بحرانی‌ها با رعایت ساعت سکوت به مدیر escalated می‌شوند. جمله‌بندی پیام با مدل انجام می‌شود، **تصمیم با قاعده**.

**کیفیت و پاسخ‌دهی** — عدد/درصد/تومان/ساعت در پاسخ باید در منابع باشد، وگرنه قاضی بازنویسی می‌کند و در نهایت پاسخ استخراجی («طبق محتوای آموزش: …») جایگزین می‌شود. داشبورد `GET /admin/reports/mentor-quality` نرخ «نمی‌دانم»، تأخیر هر مرحله، failover هر ارائه‌دهنده، دقیقه‌های صوتی و رضایت 👍/👎 را نشان می‌دهد.

**رابط‌ها** — نقاط پایانی بازاریاب: `/me/mentor/ask`, `/me/mentor/behavior`, `/me/mentor/voice/{session,turn,ground,transcript}`, `/me/mentor/coach/{start,turn,debrief}`. ادمین: گزارش کیفیت، `GET /admin/knowledge`، `POST /admin/knowledge/{extract,rebuild}`. وب: کارت «وضعیت مسیر» + برگه‌ی تماس صوتی + دکمه‌ی تماس در چت + فیلدهای سیاست صوتی در `/admin/policies`. کارهای زمان‌بندی: `mentor-daily` (ناج‌ها + سوئیپ رفتاری) و `knowledge-reindex`.

**تست و گیت:** `functions/test/mentor-ai.test.ts` با ۲۷ تست جدید (گاردریل‌ها، «نمی‌دانم» با صفر فراخوانی مدل، رد ادعای عددی بی‌منبع، افزایشی بودن ایندکس، جداسازی دسترسی، سقف صوتی، مسیر STT→پاسخ→TTS، قواعد B1–B12، همه‌ی نقاط پایانی) — جمع functions 145 و web 64 تست؛ lint/typecheck/format سبز.

**کلیدها:** `GEMINI_API_KEY` و `GROQ_API_KEY` (هر دو رایگان). بدون آن‌ها منتور خاموش نمی‌شود، فقط به حالت قاعده‌محور/متن برمی‌گردد.

## 2026-09-30 — Admin panel audit: 30 bugs found, all fixed (admin → marketer sync)

**Ops note:** `[triggers] crons` in `wrangler.toml` is commented out until the plan is confirmed (see `docs/USER-TODO.md` §4). The `Workers Builds` check that fails instantly on this PR is unrelated: Cloudflare posts it in the same second it starts for every PR (it never builds pull requests on this project). Separately, `npm run typecheck` is red on `main` for a pre-existing reason: CI typechecks before `npm run build`, which is what generates `functions/lib/seed-snapshot.json`; the one-line `ci.yml` reorder is recorded as a patch in `docs/USER-TODO.md` §1 because workflow files could not be pushed from this environment. `deploy.yml` untouched.

**Why:** the admin section had accumulated behaviour that either did nothing on the deployed target
or said "done" when it wasn't. Full pass over every admin screen + its API, verified against a live
seeded instance and against the marketer panel. Details: [`docs/AUDIT-ADMIN-FA.md`](./AUDIT-ADMIN-FA.md).

**Headline fixes:**

| Area | Fix |
|---|---|
| Scheduled jobs | `scheduled()` entrypoint + one job table in `functions/src/services/cron.ts` — on Cloudflare/Netlify **no** reminder/deadline/digest job ever ran, so every policy setting was inert; Firebase `onSchedule` and `POST /admin/jobs/:name` now dispatch through the same table. The `[triggers] crons` block ships **commented out**: Cloudflare validates cron plans at deploy time (a local `deploy --dry-run` accepts it), and a rejected deploy pins the live site to the previous version — re-enable it after confirming the plan and that the schedules show up in the console |
| Reminders | `runDailyReminders` honours `policy.reminderInactiveDays` (was a hard-coded 20 h) |
| Path deadlines | step deadline = 23:59 of the target day in the policy timezone, skipped past deadlines are reported as Persian warnings, path edits validate before writing (no half-applied path), an empty path is rejected, `recipients` is returned so a 0-audience target warns instead of lying |
| Content | section reorder works with archived sections, restoring a section appends it, `POST /admin/packages/:id/unarchive` + a «بایگانی» tab (archived packages used to be unreachable forever), publish returns the fresh doc + `notified/recipients`, `needsReview` clears when a question is edited |
| Users/teams | team↔manager relations are fixed on both sides (clearing, moving, demoting, archiving) and the API's `warnings` are shown in the dialogs |
| Notifications | push/message `actionRef` now points at `/messages` (`/notifications` had no route → marketer 404); admin panel got a «صندوق من» inbox; seeded demo notes use the valid `note` type |
| Web (time zones) | date/time fields read and write the Asia/Tehran wall clock (`toZonedInput`/`fromZonedInput`) instead of the browser's zone — an admin outside Iran no longer shifts deadlines by hours on every save |
| Web (components) | Modal Esc stack (nested confirm no longer closes the parent dialog and discards a one-time password), `StatusBadge` fallback for unknown statuses, `SectionEditor` no longer round-trips seconds through a minutes field, `PoliciesPage` keeps unsaved edits and re-syncs after save |
| Reports | audit `from`/`to` validated (bad date → 400 instead of 500) with a real upper bound; completion-report range uses Tehran days |

**Tests:** `functions/test/admin-sync.test.ts` (11) + `functions/test/cron.test.ts` (2) +
`apps/web/src/lib/dates.test.ts` (4) added; `functions/test/assignments.test.ts` deadline expectation
updated to the documented end-of-day rule. Gate green: format, lint, build, typecheck, 118 functions +
64 web tests, `check:indexes` (67 query shapes, 0 missing indexes).

**Needs an owner action:** Cloudflare Cron Triggers are not on the free plan — see `docs/USER-TODO.md` §1/§4 for the external-scheduler fallback.

---

## 2026-09-29 — Performance pass: removed legacy-browser machinery (perf, no behavior change on modern browsers)

**Why:** the production build was paying for browsers from ~2017 (browserslist floor: iOS 12 / Chrome 64 /
KaiOS / UC / QQ). Every modern page load fetched an extra 128 KB (48.6 KB gzip) core-js polyfill chunk plus
two no-op legacy bootstrap scripts, the build emitted a second ES5/SystemJS copy of the whole app, and CSS
got a postcss-preset-env fallback pass. The spec never mandated such old engines — the floor was an
implementation choice.

**Changes (7 files):**

| File | Change |
|---|---|
| `apps/web/vite.config.ts` | removed `@vitejs/plugin-legacy` (`modernPolyfills` + `renderLegacyChunks`) and the `legacyCss()` plugin; added `build.target` pinned to the new floor |
| `apps/web/legacy-css.ts` | **deleted** (Tailwind v4 cascade layers are supported by every browser above the new floor) |
| `apps/web/package.json` | `browserslist` floor raised to 2023+ engines (Chrome/Edge/Android-WebView 110+, Firefox 115+, Safari/iOS 16.4+, Samsung 22+); removed devDeps `@vitejs/plugin-legacy`, `terser`, `postcss`, `postcss-preset-env` |
| `functions/package.json` | removed unused devDep `firebase` (client SDK — never imported; emulator tests use `@firebase/rules-unit-testing`) |
| `package-lock.json` | synced (`npm install`); **93 packages removed** from the install tree |
| `README.md` | "Browser support" section rewritten for the new floor + rollback note |
| `scripts/start.mjs` | stale "legacy-browser bundle" comment removed |

**Measured effect (production build, `npm run build` in `apps/web`):**

| Metric | Before | After |
|---|---|---|
| Build time | 42.2 s (vite 27.4 s) | **16.3 s (vite 5.2 s)** |
| Initial JS, modern browser (gzip) | 180.7 KB (132.0 main + 48.6 polyfills) | **128.9 KB** (−29%) |
| Initial CSS (gzip) | 9.8 KB | **7.9 KB** (−20%, fallbacks gone) |
| Total JS in `dist/` | ~1.14 MB raw / ~345 KB gzip | **608 KB raw / 190 KB gzip** (−47% raw) |
| `index.html` scripts | 7 tags (incl. 2 no-op legacy bootstraps) | **1 tag** |
| SW precache | 802.9 KiB | **634.2 KiB** |

**Verified:** `lint`, `typecheck`, `test` (functions 58 + web 101 — same counts), `format:check` all green;
production build served via `vite preview` (page + login + manifest + SW all 200). Heavy deps
(`@sentry/react`, `firebase/*`, Capacitor) were already lazy-imported behind feature guards and are
unchanged.

**What this means:** phones/engines older than ~2023 (iOS < 16.4, Android WebView < 110, KaiOS/UC/QQ
browsers) can no longer load the app. This is an internal training PWA — flag if any sales-rep device
needs the old support.

**Rollback:** restore `apps/web/legacy-css.ts` + the two vite plugins + the 4 devDeps, lower the
`browserslist` floor, and re-sync the lockfile (the old values are in git history, commit before this
change).

**Not changed (checked, already fine):** fonts (3 woff2, ~102 KB total), route code-splitting (Admin/
Manager/Gallery are lazy chunks), workbox runtime caching of the 71 MB local catalog mirror
(`public/catalog`, git-ignored client assets — needed for local dev/offline; excluded from precache),
`sync-assets` (already incremental), API seed (skipped when persisted data exists).
