process.env.HESAB_DATA_DIR = '/tmp/hesab-test-filter2'
process.env.PORT = '3002'

const fs = require('fs')
const path = require('path')

// Create test DB
try { fs.rmSync('/tmp/hesab-test-filter2', { recursive: true }) } catch (e) {}
fs.mkdirSync('/tmp/hesab-test-filter2', { recursive: true })

// Use better-sqlite3 directly to set up test data
const Database = require('better-sqlite3')
const db = new Database(path.join('/tmp/hesab-test-filter2', 'hesab.db'))
db.pragma('journal_mode = WAL')
db.exec(`
  CREATE TABLE IF NOT EXISTS people (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, last_name TEXT, national_code TEXT, company_name TEXT, economic_code TEXT, national_id TEXT, phone TEXT, mobile TEXT, address TEXT, postal_code TEXT, card_number TEXT, account_number TEXT, sheba_number TEXT, bank_name TEXT, notes TEXT);
  CREATE TABLE IF NOT EXISTS invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, seller_id INTEGER, invoice_number TEXT, invoice_date TEXT, invoice_type TEXT, total_amount REAL DEFAULT 0, discount_amount REAL DEFAULT 0, tax_amount REAL DEFAULT 0, paid_amount REAL DEFAULT 0, cost_center_id INTEGER, notes TEXT);
  CREATE TABLE IF NOT EXISTS invoice_items (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER, item_name TEXT, quantity REAL DEFAULT 0, unit TEXT, unit_price REAL DEFAULT 0, total_price REAL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, person_id INTEGER, transaction_type TEXT, transfer_type TEXT, amount REAL DEFAULT 0, payment_date TEXT, invoice_id INTEGER, notes TEXT);
  CREATE TABLE IF NOT EXISTS cost_centers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, description TEXT);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`)
db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('company_name', 'test')
db.prepare('INSERT INTO people (first_name, last_name) VALUES (?, ?)').run('علی', 'احمدی')
db.prepare('INSERT INTO people (first_name, last_name) VALUES (?, ?)').run('رضا', 'محمدی')
db.prepare('INSERT INTO invoices (seller_id, invoice_number, invoice_date, invoice_type, total_amount) VALUES (?, ?, ?, ?, ?)').run(1, '111', '1404/03/01', 'buy', 5000000)
db.prepare('INSERT INTO payments (person_id, transaction_type, transfer_type, amount, payment_date, invoice_id) VALUES (?, ?, ?, ?, ?, ?)').run(2, 'pay', 'نقدی', 2000000, '1404/03/05', 1)
db.close()
console.log('Test DB created at /tmp/hesab-test-filter2')

// Now start the server
require('../server.js')
