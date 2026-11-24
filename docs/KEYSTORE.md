# کلید امضا و ساخت نسخهٔ نهایی اندروید (Release Keystore)

برای انتشار نسخه‌های اندروید و به‌روزرسانی بدون مشکل روی دستگاه کاربران، فایل APK باید با یک کلید یکتا و ثابت (Keystore) امضا شود. تغییر کلید امضا باعث عدم امکان به‌روزرسانی برنامه روی گوشی‌های قبلی خواهد شد.

---

## ۱. مشخصات کلید امضای پروژه

- **فایل امضا:** `app/release.keystore`
- **نام مستعار (Alias):** `jibeman`
- **الگوریتم:** RSA 2048-bit (اعتبار ۱۰,۰۰۰ روز)
- **شناسه مالک (Subject):** `CN=Jibeman, OU=Finance, O=Jibeman, L=Tehran, ST=Tehran, C=IR`

---

## ۲. متغیرهای امنیتی در GitHub Actions

گردش‌کار انتشار خودکار در مسیر `.github/workflows/release.yml` قرار دارد. برای ساخت و انتشار خودکار APK روی گیت‌هاب در صورت انتشار تگ یا ریلیز جدید، متغیرهای زیر در **Settings → Secrets and variables → Actions** تنظیم می‌شوند:

| نام متغیر (Secret) | شرح |
|---|---|
| `KEYSTORE_BASE64` | محتوای Base64 فایل `app/release.keystore` |
| `KEYSTORE_PASSWORD` | رمز عبور Keystore |
| `KEY_ALIAS` | نام مستعار کلید (`jibeman`) |
| `KEY_PASSWORD` | رمز عبور اختصاصی کلید |

> **نکته:** در صورتی که `KEYSTORE_BASE64` تنظیم نشده باشد، گردش‌کار CI به عنوان یک مکانیزم پشتیبان (Fallback)، یک کلید خودکار در محیط اجرا می‌سازد تا بیلد متوقف نشود؛ اما برای انتشارهای رسمی همواره از کلید اصلی پروژه استفاده می‌گردد.

---

## ۳. دستور ساخت محلی APK

برای ساخت بستهٔ نهایی APK روی سیستم شخصی:

```bash
# بیلد نسخه Release امضاشده
./gradlew assembleRelease

# مسیر فایل تولیدشده:
# app/build/outputs/apk/release/app-release.apk
```
