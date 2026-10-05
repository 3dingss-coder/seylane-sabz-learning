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
- [ ] ایمیل گزارش هفتگی مدیر (اختیاری): Secret `SMTP_URL` به شکل `smtps://user:pass@smtp.example.com:465` و `MAIL_FROM` (مثلاً `آکادمی سیلانه <no-reply@دامنه‌شما>`). سرویس رایگان مثل Brevo (۳۰۰ ایمیل/روز) کافی است. مدیرانی که ایمیل دارند شنبه‌ها گزارش افراد عقب‌مانده را می‌گیرند؛ بدون SMTP فقط نوتیف داخل اپ ارسال می‌شود
- [ ] اولین استقرار: `firebase deploy --only functions,firestore,storage` (به‌صورت خودکار بعد از merge به main انجام می‌شود)
- [ ] پس از اولین استقرار روی Cloudflare: `wrangler deployments status` / `npm run deploy -w functions` (اگر با CLI می‌کنید)؛ سپس با `POST /v1/admin/jobs/deadline-sweep` اجرای دستی را امتحان کنید. (تأیید `[triggers] crons` در صفحه Triggers فقط بعد از باز کردن کامنت این بلوک — بند §۴ را ببینید)
- [ ] اجرای Seed روی پروژه واقعی با ساخت حساب مدیر ارشد (دستور در RELEASE.md §2) — **بدون `--demo`**
- [ ] اصلاح CSS‌به‌عمل CI (اختیاری، ولی چک main را سبز می‌کند): در `.github/workflows/ci.yml` خط `- run: npm run build` را بالای `- run: npm run typecheck` بیاورید. دلیل قرمزی فعلی: `functions/src/cloudflare-worker.ts` فایل تولیدیِ `functions/lib/seed-snapshot.json` را import می‌کند که فقط با build ساخته می‌شود (`TS2307`)؛ این ایراد از قبل روی `main` وجود داشت و ربطی به ممیزی ادمین ندارد. در این محیط workflow قابل تغییر نبود (توکن App اجازهٔ نوشتن روی `.github/workflows/*` ندارد)

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

## ۳.۵ کلیدهای هوش مصنوعی منتور — **چه چیزی باید تهیه شود**

> معماری کامل: [`docs/MENTOR-AI.md`](./MENTOR-AI.md). منتور بدون هیچ کلیدی هم کار می‌کند (حالت استخراجی/قاعده‌محور)، ولی برای «پاسخ باکیفیت به هر سؤال، با تصویر و صدا»، این دو کلید لازم است. **هر دو طرح رایگان دارند و برای MVP کافی‌اند.**

| اولویت | کلید | برای چه کاری | طرح رایگان | اگر تهیه نشود |
|---|---|---|---|---|
| **۱ (ضروری)** | `GEMINI_API_KEY` از [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | چت مستند فارسی، درک تصویر/PDF/ویدیو/صوت، ایمبدینگ دانشنامه، صدای منتور (TTS)، تماس Live | Flash و Flash-Lite رایگان با سقف روزانه؛ ایمبدینگ رایگان؛ TTS پیش‌نمایش سقف کم | منتور فقط از قواعد و متن آماده پاسخ می‌دهد؛ فایل‌های رسانه‌ای خوانده نمی‌شوند؛ صدای سرور نداریم (فقط صدای خود دستگاه) |
| **۲ (بسیار توصیه‌شده)** | `GROQ_API_KEY` از [console.groq.com/keys](https://console.groq.com/keys) | تبدیل گفتار فارسی به متن (Whisper) + پاسخ‌های کوتاه و سریع در تماس صوتی | Whisper: ۲۰ درخواست/دقیقه، ۲۰۰۰ درخواست و ۲۸٬۸۰۰ ثانیه صدا در روز — عملاً بی‌نهایت برای یک تیم | تماس صوتی فقط با تایپ کار می‌کند (ضبط صدا ترنسکریپت نمی‌شود) |

نکاتی که موقع تهیه‌ی کلید باید بدانید:

- [ ] **یک API key برای Gemini بسازید و در Secret `GEMINI_API_KEY` بگذارید** (همان Secret موجود در بند ۱). مدل‌ها با Variableهای `GEMINI_CHAT_MODEL` (پیش‌فرض `gemini-2.5-flash`)، `GEMINI_VISION_MODEL`، `GEMINI_TTS_MODEL`، `GEMINI_EMBED_MODEL` و `GEMINI_LIVE_MODEL` قابل تغییرند. اگر مدلی در پروژه‌ی شما هنوز در دسترس نبود، فقط همان Variable را عوض کنید؛ کد خودش failover می‌کند.
- [ ] **کلید Groq را در Secret `GROQ_API_KEY` بگذارید.** محدودیت‌ها در سطح «سازمان» اعمال می‌شود؛ ساختن چند کلید سهمیه را بیشتر نمی‌کند.
- [ ] **صدای فارسی را فقط از Gemini بخواهید.** Groq صدای فارسی ندارد (فقط انگلیسی/عربی) و Grok/xAI هم فارسی را پوشش نمی‌دهد — این موضوع در کد به‌صورت صریح مدیریت شده (درخواست TTS به Groq هرگز فرستاده نمی‌شود).
- [ ] **سقف TTS پیش‌نمایش Gemini کم است**؛ برای تماس‌های طولانی سه راه دارید: (۱) کلاینت به‌صورت خودکار با صدای دستگاه ادامه می‌دهد (همین حالا پیاده‌سازی شده، هزینه صفر)، (۲) فعال‌کردن صورتحساب Gemini (پولی، مصرف کم)، (۳) افزودن ارائه‌دهنده‌ی فارسی دیگر (Azure `fa-IR` یا ElevenLabs `fas`) — کد آماده‌ی افزودن ارائه‌دهنده است و منطق کسب‌وکار تغییر نمی‌کند.
- [ ] **اگر می‌خواهید سقف‌ها را سخت‌گیرانه ببندید:** `/admin/policies` → «منتور هوشمند» و «تماس صوتی» (سقف پیام روزانه، دقیقه‌ی صوتی هر کاربر و کل سیستم). این‌ها را قبل از تحویل به تیم واقعی تنظیم کنید.

## ۴. محدودیت‌ها و موارد V1 (آگاهانه در MVP انجام نشده)

- [ ] کد دعوت (V1) — ثبت‌نام فعلاً باز است (D18)
- [ ] Rate limiter درون‌حافظه‌ای است (به‌ازای هر instance)؛ برای مقیاس بالا → Redis/Firestore counter (V1)
- [ ] بازیابی رمز با شماره موبایل: از طریق «بازنشانی رمز» توسط ادمین (ارسال SMS هزینه دارد)
- [x] **Cron Triggers روی Cloudflare فعال شد** (یادآوری‌ها، هشدار مهلت‌ها، خلاصهٔ هفتگی، flush Push): بلوک `[triggers] crons` در `wrangler.toml` باز است و `functions/src/services/cron.ts` چهار schedule را dispatch می‌کند؛ تست `functions/test/cron.test.ts` هم‌سانی لیست را نگهبانی می‌کند. پس از هر استقرار، در Workers → Settings → Triggers باید چهار schedule دیده شود. اجرای دستی هر کار: `POST /v1/admin/jobs/<name>`.
- [ ] صفحه مدیریت Jobها در پنل ادمین ساخته نشده (اجرای دستی: `POST /v1/admin/jobs/:name`؛ همان جدولی که cron از آن استفاده می‌کند)
- [ ] `mentor_chat_opened` و رویدادهای صوتی در `analytics_events` ثبت می‌شوند؛ مصرف آن‌ها در «گزارش‌ها → کیفیت منتور» دیده می‌شود (داشبورد تحلیلی جداگانه ساخته نشده)

## ۵. تست‌هایی که فقط در CI اجرا می‌شوند

محیط توسعه من به Maven/Google Storage/مرورگر Playwright دسترسی نداشت؛ بنابراین این‌ها فقط در GitHub Actions اجرا و سبز شده‌اند:
Emulator (Rules + API روی Firestore + آداپتور Storage)، E2E (Playwright با Seed واقعی روی Chromium و WebKit)، بررسی دسترس‌پذیری axe، Lighthouse CI، ساخت APK (Gradle).
آدرس‌های امضاشده (Signed URL) آپلود Storage نیاز به Service Account واقعی دارند و فقط بعد از استقرار قابل تست‌اند (یک آپلود لوگو از پنل ادمین کافی است).
Push واقعی (اندروید و وب)، ایمیل SMTP و Crashlytics هم فقط با پروژه Firebase و کلیدهای شما قابل تست نهایی‌اند.
