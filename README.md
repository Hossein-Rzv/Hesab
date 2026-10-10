# حسابداری من — مدیریت اشخاص، فاکتورها و پرداخت‌ها

وب‌اپلیکیشن کاملاً محلی (بدون نیاز به اینترنت) برای مدیریت **اشخاص**، **فاکتورها** و **پرداخت‌ها** با دیتابیس **SQLite** داخلی.

- فقط **Node.js ۲۲.۵+** و دیتابیس داخلی `node:sqlite`: بدون هیچ وابستگی/npm — فقط `node server.js`.
- طراحی لایه‌بندی شده: سرور در `server.js` + منطق دیتابیس در `server/db.js`.

## سرور HowTo

1. `node server.js`  
   `node --disable-warning=ExperimentalWarning server.js`  
2. http://localhost:3000

پیش‌فرض: پورت ۳۰۰۰; در صورت اشغال بودن چک کن `server.log` یا تغییر پورت در کد.

## ساختار

- `server.js` — HTTP + API + static
- `server/db.js` — SQLite schema + seed
- `client/` — index.html, css, js
- `data/` — DB و بک‌آپ‌ها

## Data

دیتابیس در `data/hesab.db` ساخته می‌شود. پشتیبان در `data/backups/` (با رمز در صورت تنظیم).

## لینک‌های بعدی

- `FactorDb/.gitignore` — ignore node_modules, data/*.db و dist/
