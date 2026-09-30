# Release checklist & runbook (spec §22.3, §37.3)

## 1. One-time setup (owner: project owner — see `docs/USER-TODO.md`)

| What | Where | Used by |
|---|---|---|
| Firebase projects `dev` + `prod` (Blaze plan), Auth Email/Password enabled, Firestore (Native) + Storage created | Firebase console | everything |
| Service account JSON per project (roles: Firebase Admin, Cloud Functions Admin, Service Account User, **Service Account Token Creator**, Datastore Import Export Admin if backups) | GitHub secret `FIREBASE_SERVICE_ACCOUNT_DEV` / `_PROD` | `deploy.yml` |
| Project ids | secrets `FIREBASE_PROJECT_DEV` / `_PROD` | `deploy.yml` |
| Web API key (Project settings → General) | secret `FIREBASE_WEB_API_KEY` | API sign-in (D35) |
| Gemini key (optional, free tier) | secret `GEMINI_API_KEY` | mentor: grounded chat, image/PDF/video/audio understanding, embeddings, Persian TTS, Live voice — see [`MENTOR-AI.md`](./MENTOR-AI.md) |
| Groq key (optional, free tier) | secret `GROQ_API_KEY` | Persian speech-to-text (Whisper) + the fast answer lane for voice calls |
| Backup bucket (optional) | secret `BACKUP_BUCKET` (`gs://…`) | `dailyBackup` job |
| Cloudflare Pages project + API token (Pages:Edit) + account id | secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PAGES_PROJECT` | PWA deploy |
| API origin | repo variable `VITE_API_BASE` = `https://europe-west1-<project>.cloudfunctions.net/api` | PWA + APK builds |
| CORS allowlist | repo variable `ALLOWED_ORIGINS` = `https://<pages-domain>,https://localhost` | API (`https://localhost` = Android app) |
| Sentry DSN (optional, free tier) | repo variable `VITE_SENTRY_DSN` | client error reporting |
| Android FCM config | Firebase → add Android app `ir.seylanesabz.learning` → download `google-services.json` → `base64 -w0` → secret `GOOGLE_SERVICES_JSON_BASE64` | native push |
| Release keystore | `keytool -genkeypair -v -keystore release.jks -alias seylane -keyalg RSA -keysize 2048 -validity 10000` → secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. **Back up the keystore offline: losing it means you can never update the app on Cafe Bazaar.** | `android.yml` |

## 2. First deploy (dev)

1. Merge the PR to `main`. CI goes green, then `deploy.yml` deploys Functions + Firestore rules/indexes + Storage rules, and deploys the PWA to Cloudflare Pages (branch `dev`).
2. Seed the catalog + sample training content (one time, idempotent; the superadmin password is read from the environment, not the command line):
   ```bash
   cd functions
   GOOGLE_APPLICATION_CREDENTIALS=../sa-dev.json GCLOUD_PROJECT=<dev-project-id> \
   STORAGE_BUCKET=<dev-project-id>.appspot.com FIREBASE_WEB_API_KEY=<key> \
   SEED_SUPERADMIN_PASSWORD='<strong password>' \
     npm run seed -- --superadmin-phone 09xxxxxxxxx --report ../docs/SEED-REPORT.md
   ```
   Do **not** pass `--demo` on prod: it creates the demo users with the shared password `demo1234`.
3. Smoke test (below), then build the APK with `VITE_API_BASE` set (the `Android` workflow runs automatically; artifact `seylane-learning-debug-apk`).

## 3. Release checklist (every release)

- [ ] CI green: format, lint, typecheck, unit (functions + web), emulator (rules + API on Firestore), E2E (Playwright journeys)
- [ ] `Android` workflow green; signed APK/AAB artifact produced
- [ ] Smoke test on dev: login (each role) → marketer home shows next item → play a section to completion → quiz pass → next section unlocked → manager report + CSV → admin publish a package
- [ ] Real Android device: install APK, login persists after app restart, back button, push (if configured), YouTube section (with VPN), audio section
- [ ] Lighthouse (mobile) ≥ 90 on `/login` and marketer home
- [ ] Spec §20/§21 in sync with the code (`PRODUCT-MASTER-SPEC.md`)
- [ ] Bump `versionCode` / `versionName` in `apps/web/android/app/build.gradle` before a Cafe Bazaar upload
- [ ] Prod deploy: Actions → Deploy → Run workflow → `prod`
- [ ] Upload the signed AAB/APK to Cafe Bazaar (Pishkhan), release notes in Persian

## 4. Runbook

| Symptom | Check | Fix |
|---|---|---|
| Everyone gets «اتصال اینترنت برقرار نیست» | `curl $VITE_API_BASE/v1/health` | Function down → Cloud Console → Functions → logs; redeploy |
| Web works, APK does not | CORS: `ALLOWED_ORIGINS` must include `https://localhost`; APK built with `VITE_API_BASE`? | fix variable, re-run `Android` workflow |
| Login fails for all users | `FIREBASE_WEB_API_KEY` set? Auth Email/Password enabled? | set secret, redeploy |
| Images missing | Storage rules deployed? `brands/`, `products/` objects exist? | `firebase deploy --only storage`; re-run seed |
| Heartbeats rejected (429) | per-user rate limit 20/min (in-memory per instance) | expected under abuse; see Cloud Logging `rate_limited` |
| Mentor answers only from rules | `GEMINI_API_KEY` missing/quota; Gemini blocked from region | set key; fallback is by design |
| Voice call has no transcript | `GROQ_API_KEY` missing/quota | set key (Whisper free tier); typed input still works |
| Voice call has no audio | Gemini TTS preview quota is tiny; `mentor_voice_tts_failed` event | expected — the client falls back to the device voice; upgrade TTS or add a Persian provider (`MENTOR-AI.md` §۹) |
| Mentor «نمی‌دانم» too often | knowledge index empty (run `POST /v1/admin/jobs/knowledge-reindex`) or content lacks transcripts | reindex; upload media/transcripts; check `GET /v1/admin/knowledge` coverage |
| Mentor knowledge stale after an edit | incremental reindex runs daily 08:30 Tehran | `POST /v1/admin/knowledge/rebuild` (superadmin) |
| No push on Android | `GOOGLE_SERVICES_JSON_BASE64` set? `VITE_PUSH_ENABLED` is set automatically when it is | add secret, rebuild APK; in-app notifications still work |
| Scheduled jobs not running | Cloud Scheduler enabled (Blaze)? | Console → Cloud Scheduler; manual trigger: `POST /v1/admin/jobs/:name` (superadmin). Job list: `flush-push`, `deadline-sweep`, `weekly-digest`, `daily-reminders`, `mentor-daily`, `knowledge-reindex` |
| Client errors | Cloud Logging / `analytics_events` where `name == client_error`; Sentry if DSN set | — |
| Restore data | daily export in `BACKUP_BUCKET` | `gcloud firestore import gs://<bucket>/<date>` |

Rollback: re-run `Deploy` from the previous green commit (Actions → Deploy → select run → Re-run), or `npx firebase-tools@14 deploy --only functions` from that commit. Cloudflare Pages: Deployments → previous → Rollback.
