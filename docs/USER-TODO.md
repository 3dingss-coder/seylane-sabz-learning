# کارهایی که باید توسط شما انجام شود / کارهای باقی‌مانده

> این فهرست همه مواردی است که من در محیط توسعه نمی‌توانستم انجام دهم (نیاز به حساب، کلید، دستگاه واقعی یا تصمیم شما).
> راهنمای فنی قدم‌به‌قدم: [`docs/RELEASE.md`](./RELEASE.md).

## ۱. راه‌اندازی زیرساخت (ضروری برای استقرار)

- [ ] ساخت دو پروژه Firebase (dev و prod) با **طرح Blaze** (نیاز به کارت بین‌المللی — ریسک R1)
- [ ] فعال کردن Authentication → Email/Password، ساخت Firestore (Native) و Storage
- [ ] ساخت Service Account برای هر پروژه با نقش‌های: Firebase Admin، Cloud Functions Admin، Service Account User، **Service Account Token Creator**، و برای بکاپ: **Datastore Import Export Admin**
- [ ] ثبت Secretها در GitHub (Settings → Secrets and variables → Actions):
  - `FIREBASE_SERVICE_ACCOUNT_DEV`، `FIREBASE_SERVICE_ACCOUNT_PROD`، `FIREBASE_PROJECT_DEV`، `FIREBASE_PROJECT_PROD`
  - `FIREBASE_WEB_API_KEY`
  - `GEMINI_API_KEY` (اختیاری؛ بدون آن منتور فقط از قواعد پاسخ می‌دهد)
  - `BACKUP_BUCKET` (اختیاری؛ باکت `gs://` برای بکاپ روزانه)
  - `CLOUDFLARE_API_TOKEN`، `CLOUDFLARE_ACCOUNT_ID`، `CLOUDFLARE_PAGES_PROJECT`
- [ ] ثبت Variableها: `VITE_API_BASE` (آدرس API)، `ALLOWED_ORIGINS` (دامنه وب + `https://localhost` برای اپ اندروید)، `VITE_SENTRY_DSN` (اختیاری)
- [ ] اولین استقرار: `firebase deploy --only functions,firestore,storage` (به‌صورت خودکار بعد از merge به main انجام می‌شود)
- [ ] اجرای Seed روی پروژه واقعی با ساخت حساب مدیر ارشد (دستور در RELEASE.md §2) — **بدون `--demo`**

## ۲. اپ اندروید و انتشار

- [ ] **تأیید شناسه اپ** `ir.seylanesabz.learning` (بعد از اولین انتشار در کافه‌بازار قابل تغییر نیست — D38)
- [ ] افزودن اپ اندروید در Firebase و دانلود `google-services.json` → Secret `GOOGLE_SERVICES_JSON_BASE64` (برای Push و Crashlytics)
- [ ] ساخت Keystore امضا و ثبت ۴ Secret امضا (`ANDROID_KEYSTORE_*`) — **نسخه پشتیبان آفلاین از Keystore نگه دارید**
- [ ] تست APK روی گوشی واقعی (ورود ماندگار، دکمه بازگشت، پخش صوت/ویدیو، Push)
- [ ] ساخت حساب توسعه‌دهنده کافه‌بازار و آپلود AAB/APK امضاشده، توضیحات و اسکرین‌شات‌ها
- [ ] Crashlytics: بعد از `google-services.json` قابل فعال‌سازی است (فعلاً خطاها با رویداد `client_error` + Sentry اختیاری پایش می‌شوند)
- [ ] Web Push (FCM برای PWA): نیاز به کلید VAPID پروژه Firebase — فعلاً نوتیف داخل‌اپ کار می‌کند

## ۳. محتوا و داده

- [ ] بازبینی آزمون‌های نمونه (همه با برچسب «نیاز به بازبینی» ساخته شده‌اند) از پنل ادمین → آزمون‌ها
- [ ] لوگوی واقعی برندهای **فورمی، آتل، آیس بابل** (فعلاً لوگوی هلدینگ — D34) از پنل ادمین → محتوا
- [ ] تعیین برند/محصول برای «معرفی کلی دارت» (پیش‌نویس در تب «بدون تخصیص»)
- [ ] زیرنویس (VTT) رسانه‌ها — V1
- [ ] YouTube در ایران نیاز به VPN دارد (D17/D23 پذیرفته‌شده)؛ جایگزین: آپلود مستقیم فایل ویدیو

## ۴. محدودیت‌ها و موارد V1 (آگاهانه در MVP انجام نشده)

- [ ] کد دعوت / ایمیل گزارش هفتگی مدیر (V1) — ثبت‌نام فعلاً باز است (D18)
- [ ] Rate limiter درون‌حافظه‌ای است (به‌ازای هر instance)؛ برای مقیاس بالا → Redis/Firestore counter (V1)
- [ ] بررسی زمان واقعی (wall-clock) Heartbeat سمت سرور: فعلاً سقف ۷۰ ثانیه برای هر heartbeat و ۲۰ درخواست در دقیقه اعمال می‌شود؛ یک کلاینت دست‌ساز می‌تواند سریع‌تر از زمان واقعی پیشرفت ثبت کند (بهبود V1)
- [ ] بازیابی رمز با شماره موبایل: از طریق «بازنشانی رمز» توسط ادمین (ارسال SMS هزینه دارد)
- [ ] صفحه مدیریت Jobها در پنل ادمین ساخته نشده (اجرای دستی: `POST /v1/admin/jobs/:name`)
- [ ] PersianCalendarPicker کیت کمکی منتقل نشد؛ انتخاب تاریخ با ورودی استاندارد + نمایش شمسی

## ۵. تست‌هایی که فقط در CI اجرا می‌شوند

محیط توسعه من به Maven/Google Storage/مرورگر Playwright دسترسی نداشت؛ بنابراین این‌ها فقط در GitHub Actions اجرا و سبز شده‌اند:
Emulator (Rules + API روی Firestore)، E2E (Playwright با Seed واقعی)، ساخت APK (Gradle).
آدرس‌های امضاشده Storage Emulator و استقرار واقعی روی Firebase هنوز در محیط واقعی تست نشده‌اند.
