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
- [ ] ثبت Variableها: `VITE_API_BASE` (آدرس API)، `ALLOWED_ORIGINS` (دامنه وب + `https://localhost` برای اپ اندروید)، `APP_URL` (آدرس عمومی وب — برای لینک ایمیل و Push وب)، `VITE_SENTRY_DSN` (اختیاری)، `TRUST_PROXY_HOPS` (اختیاری؛ پیش‌فرض ۱ — اگر API را پشت Cloudflare Proxy گذاشتید ۲)
- [ ] ایمیل گزارش هفتگی مدیر (اختیاری): Secret `SMTP_URL` به شکل `smtps://user:pass@smtp.example.com:465` و `MAIL_FROM` (مثلاً `سیلانه‌سبز لرنینگ <no-reply@دامنه‌شما>`). سرویس رایگان مثل Brevo (۳۰۰ ایمیل/روز) کافی است. مدیرانی که ایمیل دارند شنبه‌ها گزارش افراد عقب‌مانده را می‌گیرند؛ بدون SMTP فقط نوتیف داخل اپ ارسال می‌شود
- [ ] اولین استقرار: `firebase deploy --only functions,firestore,storage` (به‌صورت خودکار بعد از merge به main انجام می‌شود)
- [ ] پس از اولین استقرار روی Cloudflare: `wrangler deployments status` / `npm run deploy -w functions` (اگر با CLI می‌کنید) و تأیید اینکه `[triggers] crons` در صفحه Triggers کنسول ثبت شده باشد؛ سپس با `POST /v1/admin/jobs/deadline-sweep` اجرای دستی را امتحان کنید
- [ ] اجرای Seed روی پروژه واقعی با ساخت حساب مدیر ارشد (دستور در RELEASE.md §2) — **بدون `--demo`**

## ۲. اپ اندروید و انتشار

- [ ] **تأیید شناسه اپ** `ir.seylanesabz.learning` (بعد از اولین انتشار در کافه‌بازار قابل تغییر نیست — D38)
- [ ] افزودن اپ اندروید در Firebase و دانلود `google-services.json` → Secret `GOOGLE_SERVICES_JSON_BASE64` (برای Push و Crashlytics)
- [ ] ساخت Keystore امضا و ثبت ۴ Secret امضا (`ANDROID_KEYSTORE_*`) — **نسخه پشتیبان آفلاین از Keystore نگه دارید**
- [ ] تست APK روی گوشی واقعی (ورود ماندگار، دکمه بازگشت، پخش صوت/ویدیو، Push)
- [ ] ساخت حساب توسعه‌دهنده کافه‌بازار و آپلود AAB/APK امضاشده، توضیحات و اسکرین‌شات‌ها
- [ ] Crashlytics: کد و Gradle آماده است و با اضافه شدن Secret `GOOGLE_SERVICES_JSON_BASE64` خودکار فعال می‌شود — بعد از اولین نصب، یک بار در Firebase Console → Crashlytics را باز کنید و گزارش را تأیید کنید
- [ ] Web Push برای PWA (شامل آیفون با «افزودن به صفحه اصلی»، iOS 16.4+): کد آماده است. در Firebase Console → Project settings → Cloud Messaging → Web Push certificates یک کلید VAPID بسازید و این Variableها را ثبت کنید: `VITE_FIREBASE_API_KEY`، `VITE_FIREBASE_PROJECT_ID`، `VITE_FIREBASE_MESSAGING_SENDER_ID`، `VITE_FIREBASE_APP_ID`، `VITE_FIREBASE_VAPID_KEY`. سپس کاربران از «پروفایل → روشن کردن اعلان‌ها» فعالش می‌کنند

## ۳. محتوا و داده

- [ ] بازبینی آزمون‌های نمونه (همه با برچسب «نیاز به بازبینی» ساخته شده‌اند) از پنل ادمین → آزمون‌ها
- [ ] لوگوی واقعی برندهای **فورمی، آتل، آیس بابل** (فعلاً لوگوی هلدینگ — D34) از پنل ادمین → محتوا
- [ ] تعیین برند/محصول برای «معرفی کلی دارت» (پیش‌نویس در تب «بدون تخصیص»)
- [ ] زیرنویس (VTT) رسانه‌ها — V1
- [ ] YouTube در ایران نیاز به VPN دارد (D17/D23 پذیرفته‌شده)؛ جایگزین: آپلود مستقیم فایل ویدیو

## ۴. محدودیت‌ها و موارد V1 (آگاهانه در MVP انجام نشده)

- [ ] کد دعوت (V1) — ثبت‌نام فعلاً باز است (D18)
- [ ] Rate limiter درون‌حافظه‌ای است (به‌ازای هر instance)؛ برای مقیاس بالا → Redis/Firestore counter (V1)
- [ ] بازیابی رمز با شماره موبایل: از طریق «بازنشانی رمز» توسط ادمین (ارسال SMS هزینه دارد)
- [ ] **فعال‌سازی Cron Triggers روی Cloudflare** (یادآوری‌ها، هشدار مهلت‌ها، خلاصهٔ هفتگی، flush Push): چهار cron در `wrangler.toml → [triggers] crons` اعلام شده و `functions/src/services/cron.ts` آن‌ها را dispatch می‌کند. Cron Triggers روی طرح **رایگان Cloudflare در دسترس نیست** — اگر ارتقای پلن ممکن نیست، یک زمان‌بند بیرونی (GitHub Actions `schedule` یا cron-job.org) باید هر ساعت `POST /v1/admin/jobs/<name>` را با توکن superadmin صدا بزند: `deadline-sweep`، `daily-reminders`، `weekly-digest`، `mentor-daily`، `flush-push`. تا زمانی که هیچ‌کدام اجرا نشود، تنظیمات «سیاست‌ها → یادآوری‌ها و مهلت‌ها» روی موبایل بازاریاب اثری ندارد.
- [ ] صفحه مدیریت Jobها در پنل ادمین ساخته نشده (اجرای دستی: `POST /v1/admin/jobs/:name`؛ همان جدولی که cron از آن استفاده می‌کند)

## ۵. تست‌هایی که فقط در CI اجرا می‌شوند

محیط توسعه من به Maven/Google Storage/مرورگر Playwright دسترسی نداشت؛ بنابراین این‌ها فقط در GitHub Actions اجرا و سبز شده‌اند:
Emulator (Rules + API روی Firestore + آداپتور Storage)، E2E (Playwright با Seed واقعی روی Chromium و WebKit)، بررسی دسترس‌پذیری axe، Lighthouse CI، ساخت APK (Gradle).
آدرس‌های امضاشده (Signed URL) آپلود Storage نیاز به Service Account واقعی دارند و فقط بعد از استقرار قابل تست‌اند (یک آپلود لوگو از پنل ادمین کافی است).
Push واقعی (اندروید و وب)، ایمیل SMTP و Crashlytics هم فقط با پروژه Firebase و کلیدهای شما قابل تست نهایی‌اند.
