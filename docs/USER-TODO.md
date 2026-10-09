# کارهایی که باید توسط شما انجام شود / کارهای باقی‌مانده

> این فهرست همه مواردی است که من در محیط توسعه نمی‌توانستم انجام دهم (نیاز به حساب، کلید، دستگاه واقعی یا تصمیم شما).
> راهنمای فنی قدم‌به‌قدم: [`docs/RELEASE.md`](./RELEASE.md).

## ۱. وضعیت زیرساخت و کارهای مالک

- [ ] فایل [`CLOUDFLARE_CONFIGURATION_REPORT.md`](../CLOUDFLARE_CONFIGURATION_REPORT.md) را برای مقادیر تأییدشده از مخزن، شناسه‌های اعلام‌شده در سورس، موانع و checklist داشبورد بخوانید. هیچ مقدار این فایل به‌تنهایی وضعیت زندهٔ Cloudflare را ثابت نمی‌کند.
- [ ] در داشبورد Cloudflare، Worker، حساب، دیتابیس D1، باکت R2، دامنه‌ها، Cron Triggers، متغیرها/secretها، deploymentهای فعلی، مصرف/محدودیت منابع و نسخهٔ تنظیمات Workers Builds را با گزارش تطبیق دهید. شناسهٔ D1 را تغییر ندهید و دیتابیس تازه نسازید.
- [ ] وضعیت GitHub Actions secrets/variables و اتصال خودکار Workers Builds را بررسی کنید؛ secretها را در issue، chat، گزارش یا Git commit قرار ندهید. Worker Build جدا از build محلی است.
- [ ] پیش از هر release مالک باید صریحاً identity provider و session model موردتأیید را انتخاب و فراهم کند. شمارهٔ تلفن به‌تنهایی اثبات هویت نیست و در مخزن provider یا credential پیامکی/OTP پیکربندی نشده است.
- [ ] تا حل blocker هویت، ورود تازهٔ بازاریاب/مدیر/ادمین از شماره ممکن نیست. ثبت‌نام عمومی پاسخ یکسان `202` می‌دهد؛ فقط برای شماره‌ای که از قبل به حساب وصل نیست، ممکن است رکورد غیرفعال با نقش `marketer` ساخته شود. هیچ session، user ID یا اطلاعاتی برگردانده نمی‌شود؛ پاسخ وجود/نبود حساب را اعلام نمی‌کند. رکورد غیرفعال قابل استفاده نیست.
- [ ] شماره‌های seed/fixture credential نیستند. `--superadmin-phone` در محیط owner مورداعتماد ممکن است برای شمارهٔ تازه رکورد فعال `superadmin` بسازد؛ شماره verify نمی‌شود و password/OTP/login/session ایجاد نمی‌شود. اگر شماره از قبل یک حساب داشته باشد، `ensureUser` همان رکورد را بدون تغییر role برمی‌گرداند. پیش از هر seed روی پروژهٔ زنده، approval و مقصد را دوباره بررسی کنید.
- [ ] endpointهای login با رمز، staff login، reset/change password و درخواست کد عمداً حذف شده‌اند. session معتبرِ از قبل صادرشده فقط از مسیر refresh می‌تواند ادامه پیدا کند؛ Firebase Web API key حذف نشده چون در refresh قدیمی Firebase مصرف می‌شود و خودش اثبات هویت نیست.
- [ ] production در نبود D1 و rate limiter پایدار fail-closed می‌شود. مهاجرت افزایشی D1 در workflow فقط پس از owner review و اجرای release موردتأیید انجام شود؛ در این تغییر هیچ migration یا deploy تولیدی اجرا نشده است.
- [ ] R2 migration/purge در `wrangler.toml` خاموش است. پیش از فعال‌سازی، owner باید inventory زنده، پشتیبان، objectها، byte verification، شرط‌های نوشتن اتمیک و امکان rollback را جداگانه بررسی کند.

## ۱.۱. مواردی که فعلاً نباید انجام شوند

- رمز مدیر، OTP آزمایشی، credential جعلی، token یا کلید API به مخزن/گزارش اضافه نکنید.
- با phone-only session حساب‌های موجود را باز نکنید؛ duplicate phoneها را merge یا overwrite نکنید.
- از branch فعلی production deploy، اجرای production migration، تغییر production data/R2 objects یا secretها انجام ندهید.
- نتیجهٔ `npm run build` محلی را موفقیت Workers Builds یا تأیید تنظیمات زنده تلقی نکنید.

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
- [ ] لوگوی واقعی برندهای **فورمی، آتل، بابل** (فعلاً لوگوی هلدینگ — D34) از پنل ادمین → محتوا
- [ ] تعیین برند/محصول برای «معرفی کلی دارت» (پیش‌نویس در تب «بدون تخصیص»)
- [ ] زیرنویس (VTT) رسانه‌ها — V1
- [ ] YouTube در ایران نیاز به VPN دارد (D17/D23 پذیرفته‌شده)؛ جایگزین: آپلود مستقیم فایل ویدیو

## ۳.۵ پیکربندی اختیاری هوش مصنوعی منتور

> این فهرست از `functions/src/config.ts`, `functions/src/ai/hub.ts` و `.github/workflows/deploy.yml` تطبیق داده شده است. کلیدها اختیاری‌اند و هیچ مقدار secret در مخزن قرار ندارد. این سند دربارهٔ رایگان‌بودن، quota یا قیمت فعلی ارائه‌دهنده وعده نمی‌دهد؛ پیش از مصرف، شرایط جاری همان ارائه‌دهنده را مالک بررسی کند.

| کلید | قابلیت‌هایی که در سورس route می‌شوند | اگر پیکربندی نشود |
|---|---|---|
| `GEMINI_API_KEY` | Gemini برای chat/vision/embedding/TTS و در صورت فعال بودن، realtime؛ مدل‌ها از طریق `GEMINI_CHAT_MODEL`, `GEMINI_VISION_MODEL`, `GEMINI_EMBED_MODEL`, `GEMINI_TTS_MODEL`, `GEMINI_LIVE_MODEL` قابل تنظیم‌اند. | مسیر Gemini غیرفعال می‌شود؛ Groq/legacy/local فقط قابلیت‌های اعلام‌شدهٔ خود را دارند؛ نباید نتیجهٔ multimodal یا TTS تضمین شود. |
| `GROQ_API_KEY` | Groq برای chat/classification/transcription؛ `GROQ_CHAT_MODEL`, `GROQ_FAST_MODEL`, `GROQ_STT_MODEL` مدل‌ها را تنظیم می‌کنند. | این مسیر provider غیرفعال است؛ Gemini یا fallbackهای موجود ممکن است برای بعضی taskها استفاده شوند. |
| `FCM_SERVICE_ACCOUNT_JSON` | فقط ارسال Push واقعی FCM در Worker، اگر credential معتبر باشد. | `DisabledPushSender` انتخاب می‌شود؛ fake delivery یا موفقیت جعلی نداریم. |

**نکتهٔ deployment:** `.github/workflows/deploy.yml` در سورس فعلی Secretهای `GEMINI_API_KEY` و `FCM_SERVICE_ACCOUNT_JSON` را به Worker sync می‌کند؛ `GROQ_API_KEY` و override مدل‌ها در همان workflow نگاشت نشده‌اند. مالک باید در Cloudflare Variables/Secrets وضعیت واقعی را بررسی کند یا wiring امن را جداگانه تصویب کند. هیچ کلید یا service-account را در گزارش، Issue، chat یا Git قرار ندهید.

## ۴. محدودیت‌ها و blockerهای باقی‌مانده

- [ ] **هویت و نشست**: ورود با شمارهٔ تنها غیرفعال است؛ برای شمارهٔ موجود، session یا داده برگردانده نمی‌شود. ثبت‌نام فقط درخواست عمومی می‌پذیرد و در صورت جدیدبودن شماره ممکن است رکورد غیرفعال `marketer` بسازد؛ هیچ نشست یا دسترسی صادر نمی‌شود. پاسخ ثبت‌نام برای شمارهٔ موجود/جدید یکسان است.
- [ ] **ادمین و مدیر**: مسیر login تازه وجود ندارد. تا انتخاب و پیکربندی روش هویت/session موردتأیید، Cloudflare نمی‌تواند login مدیریتی امن پشتیبانی کند؛ شمارهٔ seed‌شدهٔ superadmin هویت مدیر را ثابت نمی‌کند.
- [ ] **رمز و کد پیامکی**: login/reset/change-password، OTP/SMS و hidden verification نداریم. provider واقعی پیامک یا هویت وصل نشده؛ هیچ fake provider ساخته نشده است.
- [ ] Rate limiter در Cloudflare باید با D1 binding پایدار کار کند؛ production بدون D1/rate storage fail-closed است. limit محلی فقط برای dev/test است.
- [ ] Cloudflare cron در سورس تعریف شده است؛ schedule زنده را فقط owner در dashboard تأیید می‌کند.
- [ ] مدیریت دستی jobها و گزارش کیفیت منتور را owner با checklist گزارش تنظیمات بررسی کند.

## ۵. بررسی‌ها و تأیید نهایی

- [ ] نتایج دقیق unit/API/UI/E2E، typecheck، build، lint و audit در pull request و گزارش نهایی این تغییر بررسی شوند؛ status قدیمی CI/Workers Build قابل تعمیم به commit جدید نیست.
- [ ] Workers Builds یک check خارجی است. داشبورد owner باید build image/runtime version، build command، package manager، lockfile discovery، D1/R2 bindings، environment variables/secrets، cron و deployed commit را نشان دهد. build محلی موفق به‌تنهایی آن check را سبز نمی‌کند.
- [ ] تست login واقعی، refresh session قدیمی، Android/Web Push، ایمیل و Crashlytics فقط پس از فراهم‌شدن credentialهای موردتأیید و در محیط آزمایشی امن انجام شود.
- [ ] لاگ‌های Cloudflare و D1 باید timeout/operation outcome را به‌عنوان «نامعلوم» بررسی کنند؛ timeout درخواست، underlying write را لغو نمی‌کند.
