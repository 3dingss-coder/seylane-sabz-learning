# API کمپین‌های Push (ادمین)

همه مسیرها زیر `/v1/admin/push-campaigns` هستند و پشت احراز هویت + نقش **admin یا superadmin** قرار دارند (کاربران با نقش‌های دیگر پاسخ ۴۰۳ می‌گیرند). ارسال عمومی (public) وجود ندارد.

| روش | مسیر | توضیح |
|---|---|---|
| GET | `/dashboard` | شمارش وضعیت‌ها و جمع درخواست‌های FCM از داده‌های واقعی |
| GET | `?cursor=&status=&includeArchived=` | فهرست صفحه‌بندی‌شده (cursor) |
| POST | `/` | ساخت پیش‌نویس یا کمپین زمان‌بندی‌شده (`scheduledAt` UTC) |
| POST | `/audience-preview` | تعداد تقریبی کاربران و دستگاه‌های فعال |
| GET | `/:id` | جزئیات، خلاصه و بخش‌ها (حداکثر ۲۰۰ بخش) |
| PATCH | `/:id` | ویرایش؛ **باید `version` فعلی را بفرستد** (تعارض → 409) |
| POST | `/:id/send` | ارسال فوری؛ **الزامی: هدر `Idempotency-Key`** (۸ تا ۱۰۰ کاراکتر `[A-Za-z0-9_-]`) |
| POST | `/:id/cancel` | لغو کمپین زمان‌بندی‌شده |
| DELETE | `/:id` | آرشیو (تاریخچه و گزارش حذف نمی‌شود) |

## قواعد ورودی
- `title`: ۲ تا ۸۰ کاراکتر؛ `body`: ۲ تا ۳۰۰ کاراکتر؛ `name`: تا ۸۰ کاراکتر.
- `imageUrl`: فقط `https://` عمومی؛ بدون userinfo، `localhost` یا IP خصوصی.
- `actionRef` (مقصد): فقط مسیرهای داخلی با پیشوندهای `/learn`، `/packages`، `/sections`، `/quiz`، `/messages`، `/cards`، `/mentor`، `/profile`. `//`، `http(s):`، `javascript:`، `data:` و مسیرهای `..` رد می‌شوند. پیش‌فرض: `/`.
- `scheduledAt`: حداقل ۱ دقیقه در آینده.
- `audience.type`: `all` | `team` | `role` | `user`؛ `channel`: `any` | `web` | `android`.

## نمونه پاسخ خطا
```json
{ "error": { "code": "VALIDATION", "message": "…", "details": [{ "field": "actionRef", "message": "…" }] } }
```

## محدودیت نرخ
- `POST /:id/send`: ۱۰ بار در ساعت برای هر کاربر.

## گزارش‌دهی
- `attempted`: درخواست‌های ارسال‌شده به FCM.
- `accepted`: درخواست‌هایی که FCM پذیرفته است.
- `failed`: هیچ درخواست Push پذیرفته نشده است؛ از جمله خطای Provider یا نبود دستگاه Push برای تمام مخاطبان.
- `invalid`: توکن‌های نامعتبر که پاک می‌شوند (به‌عنوان موفق شمرده نمی‌شوند).
- `noDevice`: کاربران بدون توکن مناسب؛ اعلان داخل برنامه ممکن است ساخته شود، اما این به معنی ارسال Push نیست.
- **نرخ پذیرش = accepted ÷ attempted.** این معیار **تحویل** یا **دیده‌شدن** اعلان نیست.
