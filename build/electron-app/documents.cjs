// ============================================================
// server/documents.cjs — سرویس مدیریت اسناد و پیوست‌ها
// مسیر ریشه از تنظیمات «documents_path» خوانده می‌شود؛ ساختار:
//   [Root]/[PersonId]_[SafeName]/[StoredFileName]
// نام اصلی فایل در دیتابیس نگه داشته می‌شود.
// ============================================================
'use strict'
const fs = require('node:fs')
const path = require('node:path')

let _getSetting = null
/** تزریق تابع خواندن تنظیمات (برای جلوگیری از وابستگی دایره‌ای با server.js) */
function init(getSettingFn) {
  _getSetting = getSettingFn
}

const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/

/** نام پوشه‌ی امن برای شخص — ترکیب شناسه یکتا + نام پاک‌سازی‌شده */
function personFolderName(person) {
  if (!person) return 'unknown'
  const id = person.id != null ? String(person.id) : 'x'
  const rawName = person.company_name || [person.first_name, person.last_name].filter(Boolean).join(' ') || 'شخص'
  const safe = rawName.replace(INVALID_CHARS, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'شخص'
  return `${id}_${safe}`
}

/** مسیر ریشه‌ی اسناد — در صورت نبود تنظیم، null */
function getStoragePath() {
  const p = String(_getSetting ? _getSetting('documents_path') : '').trim()
  return p || null
}

/** اعتبارسنجی مسیر: وجود/قابلیت ساخت/دسترسی نوشتن */
function validateStoragePath(p) {
  if (!p) return { ok: false, error: 'محل ذخیره اسناد در تنظیمات تعیین نشده است.' }
  try {
    fs.mkdirSync(p, { recursive: true })
    const probe = path.join(p, `.hesab-probe-${process.pid}.tmp`)
    fs.writeFileSync(probe, 'ok')
    fs.rmSync(probe, { force: true })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `دسترسی به مسیر اسناد ممکن نیست: ${err.message}` }
  }
}

/** ذخیره‌ی فایل پیوست برای شخص — نام تکراری overwrite نمی‌شود */
function saveAttachment({ person, sourcePath, originalName }) {
  const root = getStoragePath()
  if (!root) {
    const e = new Error('محل ذخیره اسناد تعیین نشده است — از تنظیمات مسیر را انتخاب کنید.')
    e.status = 400
    throw e
  }
  const v = validateStoragePath(root)
  if (!v.ok) {
    const e = new Error(v.error)
    e.status = 500
    throw e
  }
  const dir = path.join(root, personFolderName(person))
  fs.mkdirSync(dir, { recursive: true })

  const base = path.basename(String(originalName || 'file'))
  const ext = path.extname(base)
  const stem = base.slice(0, base.length - ext.length) || 'فایل'
  const safeStem = stem.replace(INVALID_CHARS, '-').trim() || 'فایل'
  // نام ذخیره‌شده: نام اصلی + timestamp + تصادفی → بدون overwrite
  const storedName = `${safeStem}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`
  const dest = path.join(dir, storedName)
  fs.copyFileSync(sourcePath, dest)
  const size = fs.statSync(dest).size
  return { stored_name: storedName, file_path: dest, file_size: size }
}

/** حذف فایل پیوست (در صورت نیاز — مثلا rollback) */
function deleteAttachment(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.rmSync(filePath, { force: true })
  } catch { /* ignore */ }
}

/** بررسی وجود فایل روی دیسک */
function fileExists(filePath) {
  try {
    return !!filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

module.exports = { init, personFolderName, getStoragePath, validateStoragePath, saveAttachment, deleteAttachment, fileExists, INVALID_CHARS }
