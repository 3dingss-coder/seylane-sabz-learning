# Netlify — راهنمای قدیمی، API غیرفعال

> این سند قدیمی دربارهٔ Netlify و memory backend منسوخ است. API پشتیبانی‌شده در `functions/src/cloudflare-worker.ts` اجرا می‌شود؛ مرجع تنظیمات و checklist مالک [`CLOUDFLARE_CONFIGURATION_REPORT.md`](../CLOUDFLARE_CONFIGURATION_REPORT.md) است.

`netlify.toml` صرفاً باقی‌ماندهٔ میزبانی static است. `netlify/functions/api.js` اکنون عمداً برای هر درخواست `503 UNAVAILABLE` برمی‌گرداند و هیچ Worker dependency، حافظهٔ موقت، session یا دادهٔ کاربر نمی‌سازد. مسیر `/v1/*` در Netlify نشانهٔ API زنده نیست و نباید برای ورود، پروفایل یا پنل‌ها استفاده شود.

اگر مالک بخواهد فرانت‌اند را از Netlify ارائه کند، باید `VITE_API_BASE` را به Cloudflare Worker موردتأیید تنظیم کند، سپس CORS/domain و build outputs را جداگانه تأیید کند. این سند وجود live Netlify site، API binding، deployment موفق یا تنظیم dashboard را تأیید نمی‌کند.

هیچ ورود با شمارهٔ موجود، ورود با password، reset-password، staff-login یا OTP در Netlify ارائه نمی‌شود. شمارهٔ seed/fixture credential نیست؛ ثبت‌نام عمومی نیز session نمی‌دهد و پاسخ آن وجود/نبود حساب را افشا نمی‌کند. برای auth limitations و موارد نیازمند owner، به [`docs/USER-TODO.md`](./USER-TODO.md) و گزارش Cloudflare مراجعه کنید.
