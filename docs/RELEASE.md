# Release checklist & runbook

> وضعیت فعلی: این سند جایگزین راهنمای قدیمی Firebase/Pages است. سورس این checkout برای Cloudflare Workers + D1/R2 تنظیم شده، اما وضعیت زندهٔ داشبورد تأیید نشده است. گزارش اصلی: [`CLOUDFLARE_CONFIGURATION_REPORT.md`](../CLOUDFLARE_CONFIGURATION_REPORT.md). این PR برای deploy، migration یا تغییر production مجوز نمی‌دهد.

## 1. Blockerهای قبل از هر انتشار عمومی

- [ ] مالک باید identity provider و session model موردتأیید را انتخاب و پیکربندی کند. شمارهٔ موبایل به‌تنهایی اثبات هویت نیست؛ provider یا credential پیامکی/OTP در مخزن وجود ندارد.
- [ ] ورود شماره‌ای به حساب موجود session یا داده نمی‌دهد. ثبت‌نام عمومی فقط با پاسخ یکسان `202` کار می‌کند؛ برای شمارهٔ جدید ممکن است یک رکورد غیرفعال `marketer` ایجاد شود، اما هیچ token، user ID یا دسترسی صادر نمی‌شود. پاسخ وجود/نبود حساب را افشا نمی‌کند.
- [ ] مسیرهای password login، staff login، reset/change password و SMS/OTP عمداً حذف شده‌اند. ورود تازهٔ staff/admin در Cloudflare تا افزودن روش identity/session موردتأیید پشتیبانی نمی‌شود.
- [ ] شماره‌های seed/demo credential ورود نیستند. `--superadmin-phone` ممکن است برای شمارهٔ تازه رکورد **فعال** با role `superadmin` بسازد، اما phone را verify و password/OTP/login/session ایجاد نمی‌کند. اگر شماره از قبل وجود داشته باشد، `ensureUser` رکورد قبلی را بدون تغییر role برمی‌گرداند. فقط owner در مقصد تأییدشده این flag را اجرا کند.
- [ ] وضعیت واقعی Worker، D1، R2، custom domains، Cron Triggers، variables/secrets، Workers Builds، plan/limits و GitHub Actions secrets را مالک در dashboard بررسی کند. مقادیر `wrangler.toml` و GitHub checkها به‌تنهایی live state را ثابت نمی‌کنند.
- [ ] پیش از هر تغییر production، owner باید backup قابل‌بازیابی، migration plan، exact D1 ID/binding و R2 inventory/rollback را تأیید کند. در این PR هیچ production deploy/migration/data/R2/secret change اجرا نشده است.

## 2. کنترل‌های مخزن و CI

- GitHub CI در `.github/workflows/ci.yml` از `npm ci` و `package-lock.json` استفاده می‌کند، سپس format/lint/build/typecheck/tests، index coverage و `wrangler deploy --dry-run` را اجرا می‌کند.
- Playwright و Lighthouse فقط مسیرهای عمومی را بررسی می‌کنند؛ authenticated panels به session موردتأیید نیاز دارند و نباید با demo password یا phone-only shortcut دور زده شوند.
- Cloudflare Workers Builds یک check خارجی و جداست. CI/local build موفقیت Workers Builds را ثابت نمی‌کند. برای `UnknownLockfileVersion` باید Cloudflare build image و Bun version واقعی را در owner dashboard/check logs بررسی کرد؛ `bun.lock` را با `--frozen-lockfile` و Bun واقعی آزمون کنید و پس از آزمون `git diff -- bun.lock` را کنترل کنید.
- `deploy.yml` با push به `main` یا `workflow_dispatch` اجرا می‌شود؛ به workflow CI وابستگی صریح ندارد. وقتی Cloudflare credentials موجود باشند، D1 را با name/ID موجود تطبیق می‌دهد، migrationهای افزایشی `0001` و `0002` را اجرا می‌کند و سپس `wrangler deploy` را اجرا می‌کند. این workflow production-affecting است؛ قبل از merge باید owner و branch protection آن را بررسی کنند.
- Deploy job با نبود Cloudflare credentials از deploy صرف‌نظر می‌کند؛ نبود job به‌معنی تأیید live config نیست.

## 3. دستورهای امن توسعه و تست محلی

```bash
npm ci
npm run format:check
npm run lint
npm run build
npm run typecheck
npm test
npm run test:e2e -w apps/web
```

این‌ها فقط local/CI هستند. از اجرای دستور Remote D1/Worker، `wrangler deploy` یا seed علیه پروژهٔ production در جریان این PR خودداری کنید.

## 4. Owner preflight (فقط پس از تصویب مستقل release)

1. از گزارش [`CLOUDFLARE_CONFIGURATION_REPORT.md`](../CLOUDFLARE_CONFIGURATION_REPORT.md) استفاده کنید و dashboard را با `wrangler.toml`, migrations و workflows تطبیق دهید. Account ID، D1 ID/binding، R2 bucket، Worker name, route/domain و production variables باید از منبع زنده تأیید شوند.
2. Workers Builds: branch اتصال‌یافته، build command، package manager، Bun runtime، lockfile، build image و deployed commit را ثبت کنید؛ خطای `UnknownLockfileVersion` را با Bun واقعی بازتولید کنید، نه با npm.
3. قبل از هر migration از backup و restore آن در محیط غیرتولیدی مطمئن شوید. migrationهای موجود additive هستند؛ هیچ migration یا cleanup را برای رفع warningها حدس‌زده/دستی اجرا نکنید.
4. R2 migration در config فعلی `R2_MIGRATE_PURGE=off` دارد. owner باید D1/R2 object inventory، preconditionهای atomic write و verification را بررسی کند؛ پاک‌سازی D1 بدون تصویب صریح ممنوع است.
5. بعد از حل هویت، تست احراز هویت و دسترسی را در staging با test identities مجاز انجام دهید؛ ورود admin را با شمارهٔ seedشده اثبات‌شده فرض نکنید.
6. پس از approval، زمان deploy، Worker version, migration ID, backup reference و smoke-test result را ثبت کنید. rollback به Worker نسخهٔ قبلی به‌تنهایی migration/data را rollback نمی‌کند.

## 5. Runbook و ریسک‌های شناخته‌شده

| موضوع | رفتار/کنترل در سورس | اقدام owner |
|---|---|---|
| D1/production persistence | Worker با `APP_ENV=prod` بدون binding `DB` fail-closed می‌شود؛ memory fallback برای production مجاز نیست. | binding و database ID را در داشبورد تأیید کنید. |
| Rate limit | Worker در D1 از limiter مشترک استفاده می‌کند؛ registration/login path در نبود persistence لازم fail-closed است. | quota، storage و رفتار 429 را در staging پایش کنید. |
| Session | session refresh از قبل معتبر می‌تواند ادامه پیدا کند؛ شماره session جدید نمی‌دهد. | identity provider و revocation/refresh policy را تصویب کنید. |
| Timeout | timeout promise را لغو نمی‌کند؛ write/migration ممکن است دیرتر commit شود. | outcome نامعلوم را ثبت/بازبینی کنید؛ retry کور یا ادعای cancellation نکنید. |
| R2 migration | source copy با byte verification و conditional single-put انجام می‌شود؛ multipart completion شرط اتمیک ندارد؛ D1 purge پیش‌فرض خاموش است. | فایل‌های بزرگ/همزمان را قبل از هر migration جداگانه بررسی کنید. |
| Cron | scheduleها در `wrangler.toml` هستند و Worker `scheduled` آن‌ها را dispatch می‌کند. | schedule و اجرای واقعی را در Cloudflare dashboard بررسی کنید. |
| Firebase Web API key | حذف نشده؛ می‌تواند برای Firebase refresh قدیمی / Web Push لازم باشد، اما مدرک هویت نیست. | فقط variable لازم را تأیید کنید؛ key را در گزارش/گیت قرار ندهید. |
| Workers Build | آخرین check شناخته‌شدهٔ PR #62 ناموفق بوده؛ جزئیات log از GitHub check در دسترس نبود. | پس از push همین commit، check تازه را ببینید؛ local build جایگزین نیست. |

## 6. Rollback

Rollback فقط پس از بررسی owner و backup انجام شود. برگشت Worker code، schema/data/R2 objects را خودکار به حالت قبل برنمی‌گرداند. هیچ `git reset --hard` یا پاک‌سازی فایل‌محور بخشی از این runbook نیست.
