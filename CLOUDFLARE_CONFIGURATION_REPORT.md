# Cloudflare Configuration Report

> **Audit boundary — 2026-10-09:** this report records values visible in the repository and owner checks required in Cloudflare. No Cloudflare dashboard/API evidence was available in this audit; therefore **no live Worker setting, resource binding, secret, domain, Cron Trigger, deployment, or Workers Build is marked verified**. A source value is not evidence that the same value is active remotely. No secret value, API token, account credential, or user data belongs in this file.

## A. Configuration confirmed from the repository

| Area | Value in tracked source | What it establishes—and what it does not |
|---|---|---|
| Worker | `name = "seylane-sabz-learning"`; entry `functions/src/cloudflare-worker.ts` | Desired Wrangler configuration only; deployed Worker/version is unknown. |
| Compatibility | `compatibility_date = "2025-04-01"`; no `nodejs_compat` flag is declared | The Worker code uses Web APIs/`Uint8Array`; `Buffer` references found by source search are in the Node/local adapter, not the Worker entrypoint. A local `wrangler@4.149.0 deploy --dry-run` completed on 2026-10-09 and emitted the Worker bundle plus DB/R2/ASSETS bindings; this is not a remote Workers Build or deployed-runtime check. |
| Build | `wrangler.toml` runs `npm run build`; root build runs Functions build + seed snapshot, then web build | Local/GitHub workflow config, not the Cloudflare Workers Builds command or runtime selection. |
| Static assets | `apps/web/dist`, binding `ASSETS`; SPA fallback; Worker-first routing for `/v1/*` | Repository route configuration only. No custom domain or `workers.dev` setting is declared here. |
| Source variables | `APP_ENV="prod"`, `PLAYBACK_BUDGET="on"`, `RATE_LIMIT_SCALE="1"`, `APP_URL="https://academy-seylaneh.site"`, `R2_MIGRATE_PURGE="off"` | These literal values are committed in `wrangler.toml`. They are not a readout of dashboard overrides or the deployed version. |
| D1 binding | `DB` → name `seylane-sabz-db`, database ID `f7a2ed30-00f4-42e6-b26f-343c24fe1853` | The intended binding/name/ID in source; existence, ownership, region, schema state and live binding remain unverified. |
| R2 binding | `MEDIA_BUCKET` → bucket name `seylane-sabz-media` | Intended source binding only; bucket existence, contents, lifecycle and live binding remain unverified. No R2 bucket UUID is present in the repository. |
| Cron | `*/15 * * * *`, `0 * * * *`, `30 4 * * *`, `30 6 * * *` (UTC per source comment) | The Worker has a `scheduled` handler. The `CRON_JOBS` map assigns, respectively: push flush + knowledge reindex; deadline sweep + weekly digest; mentor/behavior sweep; daily reminders. Actual dashboard triggers and run history are unknown. `migrate-blobs` is intentionally **not** on these schedules. |
| Logging | `[observability] enabled = true`, `head_sampling_rate = 1` | Desired Wrangler observability settings only; retention, actual logging and dashboard configuration are unverified. |
| Production persistence | `buildCloudflareDeps` rejects `APP_ENV=prod` if D1 `DB` is absent; its memory store is for non-production only. The legacy Netlify API shim now returns `503` and does not construct a memory-backed API. | Source behavior. It does not prove the live deployment uses this commit. |
| CORS | Production allows the request's own origin and configured exact `ALLOWED_ORIGINS`; arbitrary `*.pages.dev`/`*.workers.dev` preview origins are not accepted by default. No `ALLOWED_ORIGINS` value is set in `wrangler.toml`. | Source behavior after this change. A separate web origin must be explicitly allowlisted in the owner-controlled Worker environment; dashboard value is unknown. |
| Migration behavior | `.github/workflows/deploy.yml` looks up the configured D1 name, compares its UUID with `wrangler.toml`, then applies additive `0001_init.sql` and `0002_d1_tx_scopes.sql` before `wrangler deploy`. | Workflow source only. It does not show that a migration/deploy ran in this audit. |

The Worker requires D1 for production user/session/progress/rate-limit persistence; it does not silently fall back to in-memory production state. R2 is used for non-staging blob paths when the binding is available; D1 remains the source/fallback for resumable upload parts and migration data. `R2_MIGRATE_PURGE` is off in source. The manual `migrate-blobs` job must not be treated as an automatic migration plan.

## B. Known resource identifiers (source-declared, not live-verified)

| Resource | Identifier in repository | Evidence | Live status |
|---|---|---|---|
| Worker | `seylane-sabz-learning` | `wrangler.toml` `name` | **Unknown** |
| D1 database | `seylane-sabz-db` | `wrangler.toml` `database_name` | **Unknown** |
| D1 database UUID | `f7a2ed30-00f4-42e6-b26f-343c24fe1853` | `wrangler.toml` `database_id` | **Unknown** |
| D1 binding | `DB` | `wrangler.toml` `binding` | **Unknown** |
| R2 bucket | `seylane-sabz-media` | `wrangler.toml` `bucket_name` | **Unknown** |
| R2 binding | `MEDIA_BUCKET` | `wrangler.toml` `binding` | **Unknown** |
| Asset binding | `ASSETS` | `wrangler.toml` `[assets]` | **Unknown** |
| Public URL variable | `https://academy-seylaneh.site` | `wrangler.toml` `APP_URL` | **Not evidence of a configured Cloudflare route/domain** |
| Cloudflare Account ID | Not present in tracked Wrangler configuration | Workflow expects a protected GitHub secret named `CLOUDFLARE_ACCOUNT_ID` | **Unknown; value intentionally omitted** |

## C. Owner dashboard checklist

Use Cloudflare/GitHub’s authenticated dashboards. Record only non-secret identifiers/status in an owner-controlled system; never copy secret values into this report, the repository, a PR comment, or chat.

- [ ] **Worker and account:** confirm the Cloudflare account, exact Worker name, deployed commit/version, environment, last deployment and whether the deployed version matches the intended Git branch.
- [ ] **Route/domain:** verify the actual custom domain/route, `workers.dev` setting, DNS/TLS and which deployment serves `academy-seylaneh.site`. `APP_URL` is only a configured string; it does not prove the route exists.
- [ ] **D1:** confirm that binding `DB` points to the exact pre-existing database UUID shown above; inspect migration/schema status, database location/limits, backup/Time Travel availability and a tested restore path. Do not create a replacement database or change the UUID as a troubleshooting shortcut.
- [ ] **R2:** confirm `MEDIA_BUCKET` maps to the expected bucket; review object counts/sizes, lifecycle rules, access/CORS, large objects and whether a backup/inventory exists. Keep purge disabled until an independently reviewed migration/rollback plan is approved.
- [ ] **Cron:** compare the four live schedules with section A; review last successful run, errors, missed runs, overlap/late completion, quotas and timezone. The source runs jobs sequentially and gives a Cron invocation a 14-minute wait budget; an expired wait does not cancel an in-flight D1/R2 operation.
- [ ] **Workers Builds:** capture the connected repository/branch, build image, Node/Bun version, package-manager selection, lockfile discovery, build command, deployed commit and full build log. A GitHub CI result or local `wrangler deploy --dry-run` is not a Workers Builds result.
- [ ] **Variables and secrets:** check presence and environment scope without exposing values. Source/runtime names include `ALLOWED_ORIGINS`, `APP_VERSION`, `LOCAL_AUTH_SECRET`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `FCM_SERVICE_ACCOUNT_JSON`, Gemini/Groq model variables, and GitHub Actions `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`. The current deploy workflow syncs `GEMINI_API_KEY` and `FCM_SERVICE_ACCOUNT_JSON` after `wrangler deploy` but does **not** sync `GROQ_API_KEY`; Groq features may therefore remain disabled unless the key is separately configured in the Worker environment. Optional build variables include `VITE_API_BASE`, `VITE_SENTRY_DSN`, and the Firebase Web Push configuration. Missing optional AI/FCM credentials disable those features; no SMS/OTP provider is configured by these values.
- [ ] **CORS:** if the web app calls the API cross-origin, allow only the exact approved site origins in the production Worker environment. Do not restore a wildcard preview-host allowance in production.
- [ ] **Release controls:** review branch protection, required CI checks, Cloudflare deployment approval and GitHub Actions permissions. `deploy.yml` runs on pushes to `main` and `workflow_dispatch`, has no explicit dependency on successful CI, and does not restrict manual dispatch to `main`; it can apply remote D1 migrations and deploy when credentials exist.
- [ ] **Observability:** confirm Worker logs/metrics, retention, alerting and visibility for HTTP 503, D1/R2 timeouts, scheduled jobs and error-rate changes.

Cloudflare scheduled invocations can run for up to 15 minutes; Cron CPU limits are separate from wall time. Runtime references: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [Scheduled handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/).

## D. Mismatches, risks and unknowns

1. **No live evidence:** this audit did not inspect Cloudflare’s dashboard or API. Every binding, domain, Cron Trigger, variable/secret, deployed version and Workers Build remains unverified, regardless of matching source values.
2. **Deploy workflow is production-affecting:** push to `main` triggers it independently of the CI workflow; a manual dispatch is not constrained to `main`. With credentials present, the job applies remote additive migrations and deploys. No merge, dispatch, production migration or deploy was performed for this work.
3. **Two lockfiles / different build paths:** GitHub CI uses Node 22 + `npm ci` and `package-lock.json` v3; `bun.lock` is lockfile version 1 and already has a pending source change. Bun 1.4.2 `bun install --frozen-lockfile --ignore-scripts` succeeded against a temporary copy of the workspace manifests; the frozen install left the checked-out lockfiles' pre-run hashes unchanged. The `--ignore-scripts` install did not validate dependency lifecycle scripts or a Bun application build. Cloudflare’s package-manager/runtime selection is not declared in `wrangler.toml`; the local check is not evidence of a Workers Build result.
4. **Cross-origin configuration is absent from source:** `ALLOWED_ORIGINS` is supported by code but not set in `wrangler.toml`. A separate production frontend origin requires an exact owner-configured value. Arbitrary preview-host origins are intentionally denied in production.
5. **Missing route/account declarations:** `account_id`, custom domain/route and `workers_dev` are not declared in the tracked Wrangler file. Their live values must come from Cloudflare, not inference from `APP_URL`.
6. **D1/R2 IDs do not prove resource state:** the D1 UUID and R2 bucket name above are only source identifiers. The deploy workflow’s guard is useful protection against a name/ID mismatch, but a source review is not a successful remote lookup.
7. **R2 large-object constraint:** the migration uses conditional single-PUT for objects up to 16 MiB and refuses an automatic overwrite-prone multipart completion for larger objects because multipart `complete()` has no equivalent conditional-write option. Such objects remain in D1 pending a separately designed safe path. Source-copy verification is byte-for-byte; purge remains off.
8. **Timeout semantics:** D1/R2 call deadlines bound the caller’s wait, not the underlying operation. A timeout can leave commit outcome unknown or a late mutation. The current code uses version guards/staging; source parts are kept until a complete destination is atomically swapped and are then removed. The library endpoint recognizes a complete destination on retry after an ambiguous timeout; operators must still inspect outcomes rather than retry blindly.
9. **Cron delivery is not externally verified:** source schedules and handler mappings match, but actual dashboard triggers, successful invocations and Cloudflare plan limits are unknown. A caught Cron error is logged; do not infer success from a deployed Worker alone.
10. **No phone-auth claim:** phone-only login deliberately creates no session; public signup may create only an inactive marketer record and returns no identity/session. No SMS/OTP sign-in or public session issuer is wired; the legacy Firebase adapter only verifies/refreshes existing sessions and does not establish initial identity. A seeded `superadmin` phone record is not phone verification or a login credential.
11. **Buffer/runtime scope:** Node `Buffer` usage is confined by source search to local/legacy Node adapters and tests; Worker-facing binary APIs use `Uint8Array`. There is no `nodejs_compat` flag in `wrangler.toml`. A fresh local `wrangler@4.149.0 deploy --dry-run` succeeded, but an external Workers Build and the deployed runtime remain unverified.
12. **Production build variables:** deploy workflow supplies selected Vite build variables and pushes optional `GEMINI_API_KEY`/`FCM_SERVICE_ACCOUNT_JSON` to Worker secrets, but does not sync `GROQ_API_KEY`. Which GitHub variables/secrets are actually configured—and which deployment received them—is unknown.
13. **Dependency audit:** `npm audit` on 2026-10-09 reports 21 findings (11 moderate, 8 high, 2 critical), including direct dependencies and transitive packages. Several suggested remediations are major-version changes; no automatic or blind dependency upgrade was applied. Review advisories and compatibility before release.

## E. Recommended next steps (owner-controlled)

1. Resolve the identity/session blocker first. Select and configure an approved identity provider and session/revocation policy; do not add phone-only login, fake OTP, or a secret fallback.
2. Complete section C from the authenticated dashboards and verify D1/R2/domain/cron identifiers before running any production-affecting workflow.
3. In the authenticated Workers Builds settings, confirm the package manager/runtime and capture the remote build result. A local Bun 1.4.2 frozen-lockfile install against temporary workspace manifests passed with lifecycle scripts disabled, and a local Wrangler dry-run passed; neither is a remote Workers Build. Keep tracked lockfiles unchanged unless a reviewed package-manager migration is separately approved.
4. Before a release, update deployment protections: require green CI, restrict manual dispatch to the production branch, add an approval gate, and review the token’s least-privilege scope. These workflow changes are recommendations, not claimed live settings.
5. Rehearse schema, storage, timeout, upload-concurrency and Cron behavior in a separate staging account/database/bucket with a tested backup/restore. Review large R2 objects separately; do not enable purge or automatic multipart migration as a blind upgrade.
6. Only after explicit owner approval, schedule production migration/deployment, retain the prior Worker version and backup reference, and record exact D1 migration IDs, deployed Worker version and smoke-test results. Worker rollback alone does not roll back D1 data or R2 objects.

**Actions not performed:** no Cloudflare dashboard/API changes, production deploy, remote D1 migration, production data/R2 mutation, secret/token edit, or Workers Build declaration has been made by this report.
