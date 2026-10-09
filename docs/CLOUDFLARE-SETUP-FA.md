# Cloudflare — راهنمای تطبیق با سورس فعلی

> راهنمای قدیمیِ این فایل شامل ادعاهای منسوخ (ساخت خودکار D1، login با credentialهای دمو، و روشن‌کردن Pages به‌عنوان مسیر اصلی) بود. آن دستورها را اجرا نکنید. مرجع اصلیِ مقادیر سورس، شناسه‌های شناخته‌شده، موارد تأییدنشدهٔ داشبورد و ترتیب کار مالک: [`CLOUDFLARE_CONFIGURATION_REPORT.md`](../CLOUDFLARE_CONFIGURATION_REPORT.md).

## آنچه سورس مخزن می‌گوید

- Worker ورودی `functions/src/cloudflare-worker.ts` است و `wrangler.toml` نام Worker، assets، bindingها و cron را تعریف می‌کند. این مقدارها **تنظیمات مخزن‌اند**؛ ثابت نمی‌کنند همان binding/نسخه اکنون در حساب Cloudflare فعال است.
- Worker در production برای persistence به D1 نیاز دارد و در نبود binding `DB` fail-closed می‌شود؛ برای session, users, progress یا rate limit، fallback حافظه‌ای تولیدی ندارد.
- `wrangler.toml` یک D1 database name/ID و یک R2 bucket name اعلام می‌کند. owner باید هر دو را در داشبورد با resource زنده و backup تطبیق دهد. workflow دیگر D1 را خودکار نمی‌سازد یا به ID تازه عوض نمی‌کند.
- workflow deploy در `.github/workflows/deploy.yml` پس از push به `main` یا اجرای دستی فعال می‌شود. اگر Cloudflare credentials حاضر باشند، D1 name و `database_id` را تطبیق می‌دهد، migrationهای `0001` و `0002` را اعمال می‌کند و Worker را deploy می‌کند؛ Pages deploy فقط با متغیر اختیاری تنظیم می‌شود. Workflow به CI سبز وابستگی صریح ندارد و production-affecting است.
- `R2_MIGRATE_PURGE` اکنون `off` است. جابه‌جایی D1 به R2 و پاک‌سازی منبع به owner inventory، پشتیبان، byte verification و تأیید جداگانه نیاز دارد.
- ورود به شمارهٔ موجود از phone-only مسیر session نمی‌دهد. ثبت‌نام عمومی پاسخ یکسان می‌دهد؛ شمارهٔ تازه ممکن است فقط رکورد غیرفعال `marketer` بسازد، بدون session. حساب‌های seed و شمارهٔ `superadmin` هویت را تأیید نمی‌کنند و حساب دمو password ندارد.

## پیش از هر تغییر در داشبورد

1. گزارش [`CLOUDFLARE_CONFIGURATION_REPORT.md`](../CLOUDFLARE_CONFIGURATION_REPORT.md) را بخوانید و فقط در داشبورد owner مقادیر live را تأیید کنید.
2. Worker name و deployed commit، Account ID، D1 name/ID و binding، R2 bucket و binding، custom domains/routes و Cron Triggers را تطبیق دهید. resource جدید نسازید و D1 ID را عوض نکنید مگر owner با backup و plan جداگانه تصویب کند.
3. در Workers Builds، Git branch/source، Node/Bun version واقعی، package-manager selection، lockfile و build logs را ببینید. CI مخزن از `npm ci`/`package-lock.json` استفاده می‌کند؛ status محلی یا `wrangler deploy --dry-run` جایگزین Workers Build نیست.
4. GitHub Actions Secrets/Variables را فقط در Settings بررسی کنید؛ هیچ secret، API token، service-account JSON یا user data را در این فایل، chat، log یا Git قرار ندهید.
5. پیش از هر deploy، owner باید مشکل هویت، branch protection/deploy approval، backup/restore و migration plan را حل کند. این PR به deploy یا production migration مجوز نمی‌دهد.

## مواردی که این فایل تضمین نمی‌کند

- وجود D1/R2 resource در حساب، اتصال binding در live Worker، فعال بودن domain/route، cron یا deploy موفق را تأیید نمی‌کند.
- `workers.dev`, `pages.dev`, Firebase، OTP/SMS، یا accountهای fixture روش login نیستند.
- وجود Cloudflare API token یا secret را ادعا نمی‌کند و از owner درخواست نمی‌کند آن‌ها را برای ما ارسال کند.
- build موفق محلی، GitHub Actions، Workers Builds یا تنظیمات dashboard را به‌تنهایی تأیید نمی‌کند.
