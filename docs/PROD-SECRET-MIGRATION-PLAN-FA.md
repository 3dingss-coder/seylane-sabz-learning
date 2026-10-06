# برنامه انتقال امن `LOCAL_AUTH_SECRET` و فعال‌سازی `APP_ENV=prod`

**وضعیت: فقط برنامه. هیچ مرحله‌ای روی production اجرا نشده است و هر مرحله تأیید صریح مالک می‌خواهد.**

## چرا لازم است
- Worker production الان `APP_ENV="dev"` دارد، پس fail-fast جدید (نبود D1 / نبود secret) روی آن فعال نیست.
- اگر `LOCAL_AUTH_SECRET` در production تنظیم نشده باشد، secret امضا از D1 (`_system/auth_secret`) خوانده می‌شود.
- با `APP_ENV=prod` این مسیر بسته می‌شود:
  - بدون `LOCAL_AUTH_SECRET` (حداقل ۱۶ کاراکتر) Worker بالا نمی‌آید (۵۰۳).
  - با مقدار متفاوت از secret فعلی، **همه کاربران logout می‌شوند**.

## پیش‌نیازها (قبل از هر تغییر)
1. PR merge شده باشد. **توجه:** merge به `main` خودش `deploy.yml` را اجرا و production را deploy می‌کند؛ زمان merge را با مالک هماهنگ کنید.
2. backup جدید D1 (workflow «D1 production backup») و ثبت Time Travel bookmark.
3. تأیید اینکه آیا `LOCAL_AUTH_SECRET` از قبل در Worker production وجود دارد (Dashboard → Workers → Settings → Variables and Secrets؛ مقدار نمایش داده نمی‌شود، فقط وجود آن).

## حالت A: secret از قبل در production تنظیم است
فقط `APP_ENV` را به `prod` تغییر دهید. نشست‌ها دست‌نخورده می‌مانند.

## حالت B: secret تنظیم نیست (secret فعلی در D1 است)
1. فقط‌خواندنی، روی D1 production:
   `SELECT json_extract(data,'$.value') FROM docs WHERE col='_system' AND id='auth_secret';`
   (نام ستون/ردیف را قبل از اجرا با schema واقعی تطبیق دهید). مقدار را در چت/لاگ/commit قرار ندهید.
2. همان مقدار را به‌عنوان secret ثبت کنید:
   `wrangler secret put LOCAL_AUTH_SECRET` (روی Worker production، با ورودی مستقیم از stdin).
3. تأیید: health و یک login/refresh با کاربر موجود.
4. فقط بعد از ۳، `APP_ENV` را به `prod` تغییر دهید.

## تأیید بعد از تغییر
- `GET /v1/health` → ۲۰۰، `env=prod`، `dependencies.d1=true`، `dependencies.r2=true`.
- refresh با token قدیمی موفق باشد (نشست‌ها حفظ شده).
- login و register و `me/home` بدون ۵xx.

## بازگشت
- `APP_ENV` را به `dev` برگردانید (یا آخرین deployment سالم را در Dashboard فعال کنید).
- rollback کد: `git revert` روی commitهای این PR.

## موارد باز
- تست Range روی media با کاربر enrolled/admin هنوز انجام نشده.
- p95 ثبت‌نام روی preview نزدیک ۲ ثانیه است؛ بهینه‌سازی (حذف verify دوم در register) نیازمند تأیید جدا است.
