import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// مسیر داده را می‌توان با متغیر محیطی HESAB_DATA_DIR تغییر داد (در نسخه‌ی exe به پوشه‌ی AppData اشاره می‌کند)
const dataDir = process.env.HESAB_DATA_DIR || path.join(__dirname, '..', 'data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

export const DATA_DIR = dataDir
export const DB_PATH = path.join(dataDir, 'hesab.db')
export let db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

/** پس از بازیابی از پشتیبان، کانکشن را دوباره باز می‌کند */
export function reopenDb() {
  try {
    db.close()
  } catch {
    /* ignore */
  }
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
}

db.exec(`
CREATE TABLE IF NOT EXISTS people (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL DEFAULT '',
  national_code         TEXT,
  company_name          TEXT,
  company_economic_code TEXT,
  company_national_id   TEXT,
  phone                 TEXT,
  mobile                TEXT,
  address               TEXT,
  postal_code           TEXT,
  bank_card_number      TEXT,
  bank_account_number   TEXT,
  bank_sheba_number     TEXT,
  bank_name             TEXT,
  notes                 TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS invoices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number  TEXT,
  seller_id       INTEGER NOT NULL REFERENCES people(id),
  invoice_date    TEXT NOT NULL,
  invoice_type    TEXT NOT NULL CHECK (invoice_type IN ('buy', 'sell')),
  discount_amount REAL NOT NULL DEFAULT 0,
  vat_amount      REAL NOT NULL DEFAULT 0,
  total_amount    REAL NOT NULL DEFAULT 0,
  paid_amount     REAL NOT NULL DEFAULT 0,
  payer_id        INTEGER REFERENCES people(id),
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id   INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  quantity     REAL NOT NULL DEFAULT 1,
  unit         TEXT NOT NULL DEFAULT '',
  unit_price   REAL NOT NULL DEFAULT 0,
  total_price  REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id        INTEGER NOT NULL REFERENCES people(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('receive', 'pay')),
  transfer_type    TEXT NOT NULL DEFAULT '',
  amount           REAL NOT NULL DEFAULT 0,
  payment_date     TEXT NOT NULL,
  invoice_id       INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS cost_centers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  code        TEXT DEFAULT '',
  description TEXT DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`)

// ---------- مهاجرت دیتابیس‌های قدیمی ----------
// ۱) افزودن ستون invoice_id به payments
// ۲) تبدیل مقادیر قدیمی deposit/withdrawal به receive/pay
function migratePaymentsSchema() {
  const cols = db.prepare('PRAGMA table_info(payments)').all()
  const hasInvoiceId = cols.some((c) => c.name === 'invoice_id')
  if (!hasInvoiceId) {
    db.exec('PRAGMA foreign_keys = OFF')
    db.exec('BEGIN')
    try {
      db.exec('ALTER TABLE payments RENAME TO payments_old')
      db.exec(`
        CREATE TABLE payments (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          person_id        INTEGER NOT NULL REFERENCES people(id),
          transaction_type TEXT NOT NULL CHECK (transaction_type IN ('receive', 'pay')),
          transfer_type    TEXT NOT NULL DEFAULT '',
          amount           REAL NOT NULL DEFAULT 0,
          payment_date     TEXT NOT NULL,
          invoice_id       INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
          notes            TEXT,
          created_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
          updated_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        )
      `)
      db.exec(`
        INSERT INTO payments (id, person_id, transaction_type, transfer_type, amount, payment_date, invoice_id, notes, created_at, updated_at)
        SELECT id, person_id,
               CASE transaction_type WHEN 'deposit' THEN 'receive' WHEN 'withdrawal' THEN 'pay' ELSE transaction_type END,
               transfer_type, amount, payment_date, NULL, notes, created_at, updated_at
        FROM payments_old
      `)
      db.exec('DROP TABLE payments_old')
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    db.exec('PRAGMA foreign_keys = ON')
  } else {
    // فقط به‌روزرسانی مقادیر قدیمی
    db.prepare("UPDATE payments SET transaction_type = 'receive' WHERE transaction_type = 'deposit'").run()
    db.prepare("UPDATE payments SET transaction_type = 'pay' WHERE transaction_type = 'withdrawal'").run()
  }
}
migratePaymentsSchema()

// ۳) افزودن ستون cost_center_id به invoices
function migrateCostCenter() {
  const cols = db.prepare('PRAGMA table_info(invoices)').all()
  const hasCC = cols.some((c) => c.name === 'cost_center_id')
  if (!hasCC) {
    db.exec('ALTER TABLE invoices ADD COLUMN cost_center_id INTEGER REFERENCES cost_centers(id) ON DELETE SET NULL')
  }
}
migrateCostCenter()

// ۴) جدول پیوست‌ها (Non-Destructive — فقط ایجاد جدول جدید؛ جداول موجود دست نمی‌خورند)
// EntityType: 'invoice' یا 'payment' — EntityId: کلید پایدار رکورد مربوطه
function migrateAttachments() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type       TEXT NOT NULL CHECK (entity_type IN ('invoice', 'payment')),
      entity_id         INTEGER NOT NULL,
      original_file_name TEXT NOT NULL DEFAULT '',
      stored_file_name  TEXT NOT NULL DEFAULT '',
      file_path         TEXT NOT NULL DEFAULT '',
      file_extension    TEXT NOT NULL DEFAULT '',
      file_size         INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id)')
}
migrateAttachments()

db.exec(`
CREATE INDEX IF NOT EXISTS idx_invoices_seller ON invoices(seller_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payer  ON invoices(payer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date   ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_payments_person ON payments(person_id);
CREATE INDEX IF NOT EXISTS idx_payments_date   ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_people_national ON people(national_code);
`)

// ---------- تنظیمات پیش‌فرض (در هر اجرا اطمینان از وجود آن‌ها) ----------
const SETTING_DEFAULTS = {
  currency: 'ریال',
  vat_percent: '10',
  auto_backup: '0',
  backup_interval_days: '1',
  company_name: '',
  company_register_no: '',
  company_economic_code: '',
  company_phone: '',
  company_address: '',
  transfer_types: JSON.stringify(['نقدی', 'چک', 'حواله', 'کارت به کارت', 'پایا', 'ساتنا', 'پوز', 'صیادی', 'قسطی', 'سایر']),
  documents_path: '',
}

function ensureSettingsDefaults() {
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const [k, v] of Object.entries(SETTING_DEFAULTS)) insert.run(k, v)
}
ensureSettingsDefaults()

// ۵) ارتقای ساختار Sheetها در صورت نبود جدول (بدون تغییر رفتار)
// (محل نگه‌داری نسخه‌ی ساختار برای مهاجرت‌های آینده)

// ارتقای مقادیر پیش‌فرض قدیمی (فقط وقتی کاربر هنوز مقدار پیش‌فرض قبلی را دارد)
{
  const migrateDefault = db.prepare('UPDATE settings SET value = ? WHERE key = ? AND value = ?')
  migrateDefault.run('ریال', 'currency', 'تومان')
  migrateDefault.run('10', 'vat_percent', '9')
}

