const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createRequire } = require('node:module');
const isSea = () => false; const getAsset = () => Buffer.alloc(0)
const { db, reopenDb, DATA_DIR, DB_PATH } = require('./db-bundle.cjs');
// سرویس‌های جدید (CJS — سازگار با باندل Electron)
// require is available in CJS
const documents = require('./documents.cjs')
const { exportInvoiceToExcel, openWithDefaultApp } = require('./excel-export.cjs')

// __dirname available in CJS
// در نسخه‌ی exe (Electron) مسیر پوشه‌ی کلاینت از طریق متغیر محیطی تعیین می‌شود
const CLIENT_DIR = process.env.HESAB_CLIENT_DIR || path.join(__dirname, 'client')
const envPort = parseInt(process.env.PORT, 10)
const PORT = Number.isFinite(envPort) && envPort > 0 ? envPort : 3000

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19)

// ============================================================ helpers

function sendJson(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 30_000_000) {
        reject(new Error('بدنه‌ی درخواست بیش از حد بزرگ است'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!data) return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch {
        reject(new Error('JSON نامعتبر'))
      }
    })
    req.on('error', reject)
  })
}

const wrap = (fn) => async (req, res, ...args) => {
  try {
    await fn(req, res, ...args)
  } catch (err) {
    console.error('[API]', err)
    sendJson(res, err.status || 500, { error: err.message })
  }
}

function parseId(s) {
  const id = parseInt(s, 10)
  if (!Number.isFinite(id) || id <= 0) {
    const e = new Error('شناسه نامعتبر است')
    e.status = 400
    throw e
  }
  return id
}

function paginate(url) {
  const q = new URL(url, 'http://x').searchParams
  const page = Math.max(1, parseInt(q.get('page'), 10) || 1)
  const pageSize = Math.min(200, Math.max(1, parseInt(q.get('pageSize'), 10) || 20))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

function fullName(p) {
  if (!p) return ''
  if (p.company_name) return p.company_name
  return [p.first_name, p.last_name].filter(Boolean).join(' ')
}

function like(q) {
  return `%${q}%`
}

// ============================================================ people

const personColumns = `
  id, first_name, last_name, national_code, company_name, company_economic_code,
  company_national_id, phone, mobile, address, postal_code, bank_card_number,
  bank_account_number, bank_sheba_number, bank_name, notes, created_at, updated_at
`

const personFields = [
  'first_name', 'last_name', 'national_code', 'company_name', 'company_economic_code',
  'company_national_id', 'phone', 'mobile', 'address', 'postal_code', 'bank_card_number',
  'bank_account_number', 'bank_sheba_number', 'bank_name', 'notes',
]

function extractPerson(body) {
  const p = {}
  for (const f of personFields) p[f] = body[f] != null ? String(body[f]).trim() : ''
  if (!p.first_name) {
    const e = new Error('نام اجباری است')
    e.status = 400
    throw e
  }
  return p
}

async function peopleIndex(req, res) {
  const { page, pageSize, offset } = paginate(req.url)
  const q = (new URL(req.url, 'http://x').searchParams.get('q') || '').trim()
  const where = q
    ? `WHERE first_name LIKE ? OR last_name LIKE ? OR company_name LIKE ?
       OR national_code LIKE ? OR mobile LIKE ? OR phone LIKE ?`
    : ''
  const params = q ? [like(q), like(q), like(q), like(q), like(q), like(q)] : []
  const total = db.prepare(`SELECT COUNT(*) AS c FROM people ${where}`).get(...params).c
  const data = db
    .prepare(
      `SELECT ${personColumns} FROM people ${where}
       ORDER BY id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset)
  sendJson(res, 200, { data, total, page, pageSize })
}

async function peopleSearch(req, res) {
  const q = (new URL(req.url, 'http://x').searchParams.get('q') || '').trim()
  const data = db
    .prepare(
      `SELECT id, first_name, last_name, company_name, national_code, mobile
       FROM people
       WHERE first_name LIKE ? OR last_name LIKE ? OR company_name LIKE ?
          OR national_code LIKE ? OR mobile LIKE ? OR phone LIKE ?
       ORDER BY id DESC LIMIT 30`
    )
    .all(like(q), like(q), like(q), like(q), like(q), like(q))
  sendJson(res, 200, data)
}

async function personGet(req, res, id) {
  const row = db.prepare(`SELECT ${personColumns} FROM people WHERE id = ?`).get(id)
  if (!row) return sendJson(res, 404, { error: 'شخص یافت نشد' })
  sendJson(res, 200, row)
}

async function personCreate(req, res) {
  const p = extractPerson(req.body)
  const info = db
    .prepare(
      `INSERT INTO people (${personFields.join(', ')}, created_at, updated_at)
       VALUES (${personFields.map(() => '?').join(', ')}, ?, ?)`
    )
    .run(...personFields.map((f) => p[f]), now(), now())
  const row = db.prepare(`SELECT ${personColumns} FROM people WHERE id = ?`).get(info.lastInsertRowid)
  sendJson(res, 201, row)
}

async function personUpdate(req, res, id) {
  const p = extractPerson(req.body)
  const info = db
    .prepare(
      `UPDATE people SET ${personFields.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`
    )
    .run(...personFields.map((f) => p[f]), now(), id)
  if (!info.changes) return sendJson(res, 404, { error: 'شخص یافت نشد' })
  const row = db.prepare(`SELECT ${personColumns} FROM people WHERE id = ?`).get(id)
  sendJson(res, 200, row)
}

async function personDelete(req, res, id) {
  const refs = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM invoices WHERE seller_id = ? OR payer_id = ?) AS inv,
              (SELECT COUNT(*) FROM payments WHERE person_id = ?) AS pay`
    )
    .get(id, id, id)
  if (refs.inv > 0 || refs.pay > 0) {
    return sendJson(res, 409, {
      error: `این شخص در ${refs.inv} فاکتور و ${refs.pay} پرداخت استفاده شده است و قابل حذف نیست.`,
    })
  }
  const info = db.prepare('DELETE FROM people WHERE id = ?').run(id)
  if (!info.changes) return sendJson(res, 404, { error: 'شخص یافت نشد' })
  sendJson(res, 200, { ok: true })
}

// ============================================================ invoices

const invoiceFields = [
  'invoice_number', 'seller_id', 'invoice_date', 'invoice_type', 'discount_amount',
  'vat_amount', 'total_amount', 'paid_amount', 'payer_id', 'cost_center_id', 'notes',
]

function extractInvoice(body) {
  const inv = {}
  inv.invoice_number = body.invoice_number != null ? String(body.invoice_number).trim() : ''
  inv.seller_id = parseInt(body.seller_id, 10)
  inv.invoice_date = body.invoice_date || ''
  inv.invoice_type = body.invoice_type === 'buy' ? 'buy' : 'sell'
  inv.discount_amount = Number(body.discount_amount) || 0
  inv.vat_amount = Number(body.vat_amount) || 0
  inv.total_amount = Number(body.total_amount) || 0
  // مبلغ پرداخت‌شده فقط از روی پرداخت‌های ثبت‌شده محاسبه می‌شود
  inv.paid_amount = 0
  inv.payer_id = null
  inv.cost_center_id = body.cost_center_id ? parseInt(body.cost_center_id, 10) : null
  inv.notes = body.notes != null ? String(body.notes).trim() : ''
  if (!inv.seller_id) {
    const e = new Error('انتخاب طرف حساب اجباری است')
    e.status = 400
    throw e
  }
  if (!inv.invoice_date) {
    const e = new Error('تاریخ فاکتور اجباری است')
    e.status = 400
    throw e
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    const e = new Error('حداقل یک قلم فاکتور وارد کنید')
    e.status = 400
    throw e
  }
  return inv
}

const invoiceSelect = `
  SELECT i.*,
         p.first_name  AS seller_first_name,  p.last_name  AS seller_last_name,  p.company_name  AS seller_company_name,
         p2.first_name AS payer_first_name,   p2.last_name AS payer_last_name,   p2.company_name AS payer_company_name,
         cc.name AS cost_center_name, cc.code AS cost_center_code
  FROM invoices i
  JOIN people p  ON p.id  = i.seller_id
  LEFT JOIN people p2 ON p2.id = i.payer_id
  LEFT JOIN cost_centers cc ON cc.id = i.cost_center_id
`

function itemsFor(id) {
  return db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id').all(id)
}

function paymentsForInvoice(id) {
  return db
    .prepare(
      `SELECT pay.*, p.first_name, p.last_name, p.company_name
       FROM payments pay JOIN people p ON p.id = pay.person_id
       WHERE pay.invoice_id = ? ORDER BY pay.id`
    )
    .all(id)
}

async function invoicesIndex(req, res) {
  const url = new URL(req.url, 'http://x')
  const { page, pageSize, offset } = paginate(req.url)
  const type = url.searchParams.get('type') || ''
  const q = (url.searchParams.get('q') || '').trim()
  const costCenterId = parseInt(url.searchParams.get('cost_center_id'), 10) || 0
  const conditions = []
  const params = []
  if (type === 'buy' || type === 'sell') {
    conditions.push('i.invoice_type = ?')
    params.push(type)
  }
  if (costCenterId) {
    conditions.push('i.cost_center_id = ?')
    params.push(costCenterId)
  }
  if (q) {
    conditions.push(
      '(i.invoice_number LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ? OR p.company_name LIKE ?)'
    )
    params.push(like(q), like(q), like(q), like(q))
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM invoices i JOIN people p ON p.id = i.seller_id ${where}`)
    .get(...params).c
  const data = db
    .prepare(`${invoiceSelect} ${where} ORDER BY i.id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset)
  const attMap = attachmentCountMap('invoice', data.map((r) => r.id))
  for (const r of data) r.attachment_count = attMap.get(Number(r.id)) || 0
  sendJson(res, 200, { data, total, page, pageSize })
}

async function invoiceGet(req, res, id) {
  const row = db.prepare(`${invoiceSelect} WHERE i.id = ?`).get(id)
  if (!row) return sendJson(res, 404, { error: 'فاکتور یافت نشد' })
  row.items = itemsFor(id)
  row.payments = paymentsForInvoice(id)
  row.attachments = attachmentsFor('invoice', id)
  row.attachment_count = row.attachments.length
  sendJson(res, 200, row)
}

function writeInvoiceItems(invoiceId, items) {
  const insItem = db.prepare(
    'INSERT INTO invoice_items (invoice_id, product_name, quantity, unit, unit_price, total_price) VALUES (?, ?, ?, ?, ?, ?)'
  )
  for (const it of items) {
    insItem.run(
      invoiceId,
      String(it.product_name || '').trim() || 'بدون عنوان',
      Number(it.quantity) || 0,
      String(it.unit || '').trim(),
      Number(it.unit_price) || 0,
      Number(it.total_price) || 0
    )
  }
}

async function invoiceCreate(req, res) {
  const inv = extractInvoice(req.body)
  const att = req.body.attachment || null
  if (att) documents.validateStoragePath(documents.getStoragePath() || '')
  const src = resolveAttachmentSource(att)
  try {
    db.exec('BEGIN')
    try {
      const info = db
        .prepare(
          `INSERT INTO invoices (${invoiceFields.join(', ')}, created_at, updated_at)
           VALUES (${invoiceFields.map(() => '?').join(', ')}, ?, ?)`
        )
        .run(...invoiceFields.map((f) => inv[f]), now(), now())
      writeInvoiceItems(info.lastInsertRowid, req.body.items)
      if (src) {
        const person = db.prepare('SELECT * FROM people WHERE id = ?').get(inv.seller_id)
        storeAttachmentRecord({ entityType: 'invoice', entityId: info.lastInsertRowid, person, srcPath: src.srcPath, originalName: att.name })
      }
      db.exec('COMMIT')
      const row = db.prepare('SELECT * FROM invoices WHERE id = ?').get(info.lastInsertRowid)
      sendJson(res, 201, row)
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  } finally {
    if (src && src.tmpPath) { try { fs.rmSync(src.tmpPath, { force: true }) } catch { /* ignore */ } }
  }
}

async function invoiceUpdate(req, res, id) {
  const inv = extractInvoice(req.body)
  const existing = db.prepare('SELECT paid_amount FROM invoices WHERE id = ?').get(id)
  if (!existing) return sendJson(res, 404, { error: 'فاکتور یافت نشد' })
  inv.paid_amount = Number(existing.paid_amount) || 0
  const att = req.body.attachment || null
  const src = resolveAttachmentSource(att)
  let oldFiles = []
  try {
    db.exec('BEGIN')
    try {
      const info = db
        .prepare(
          `UPDATE invoices SET ${invoiceFields.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`
        )
        .run(...invoiceFields.map((f) => inv[f]), now(), id)
      db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id)
      writeInvoiceItems(id, req.body.items)
      if (src) {
        // پیوست جدید جایگزین پیوست قبلی می‌شود (فایل قدیمی بعد از COMMIT حذف می‌شود)
        const person = db.prepare('SELECT * FROM people WHERE id = ?').get(inv.seller_id)
        const rep = replaceAttachment({ entityType: 'invoice', entityId: id, person, srcPath: src.srcPath, originalName: att.name })
        oldFiles = rep.oldFiles
      }
      db.exec('COMMIT')
      recomputeInvoicePaid(id)
      // حذف فایل‌های قدیمی فقط بعد از COMMIT موفق
      for (const f of oldFiles) documents.deleteAttachment(f)
      sendJson(res, 200, { ok: true })
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  } finally {
    if (src && src.tmpPath) { try { fs.rmSync(src.tmpPath, { force: true }) } catch { /* ignore */ } }
  }
}

async function invoiceDelete(req, res, id) {
  const info = db.prepare('DELETE FROM invoices WHERE id = ?').run(id)
  if (!info.changes) return sendJson(res, 404, { error: 'فاکتور یافت نشد' })
  // حذف فایل‌های پیوست یتیم (رکوردها به‌صورت آبشاری حذف نمی‌شوند — جدول مستقل است)
  removeAttachmentsOf('invoice', id)
  sendJson(res, 200, { ok: true })
}

// ============================================================ payments

/** مبلغ پرداخت‌شده‌ی فاکتور = جمع پرداخت‌های ثبت‌شده روی آن (سقف: مبلغ کل) */
function recomputeInvoicePaid(invoiceId) {
  if (!invoiceId) return
  const inv = db.prepare('SELECT total_amount FROM invoices WHERE id = ?').get(invoiceId)
  if (!inv) return
  const paid = db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE invoice_id = ?').get(invoiceId).s
  const capped = Math.min(Number(inv.total_amount) || 0, Number(paid) || 0)
  db.prepare('UPDATE invoices SET paid_amount = ?, updated_at = ? WHERE id = ?').run(capped, now(), invoiceId)
}

function extractPayment(body) {
  const pay = {}
  pay.person_id = parseInt(body.person_id, 10)
  pay.transaction_type = body.transaction_type === 'pay' ? 'pay' : 'receive'
  pay.transfer_type = body.transfer_type != null ? String(body.transfer_type).trim() : ''
  pay.amount = Number(body.amount) || 0
  pay.payment_date = body.payment_date || ''
  pay.invoice_id = body.invoice_id ? parseInt(body.invoice_id, 10) : null
  pay.notes = body.notes != null ? String(body.notes).trim() : ''
  if (!pay.person_id) {
    const e = new Error('انتخاب شخص اجباری است')
    e.status = 400
    throw e
  }
  if (!pay.payment_date) {
    const e = new Error('تاریخ تراکنش اجباری است')
    e.status = 400
    throw e
  }
  if (pay.amount <= 0) {
    const e = new Error('مبلغ تراکنش باید بیشتر از صفر باشد')
    e.status = 400
    throw e
  }
  if (pay.invoice_id && !db.prepare('SELECT id FROM invoices WHERE id = ?').get(pay.invoice_id)) {
    const e = new Error('فاکتور انتخاب‌شده یافت نشد')
    e.status = 400
    throw e
  }
  return pay
}

const paymentSelect = `
  SELECT pay.*, p.first_name, p.last_name, p.company_name,
         inv.invoice_number AS invoice_number, inv.invoice_type AS invoice_type,
         inv.total_amount   AS invoice_total,  inv.paid_amount  AS invoice_paid,
         inv.seller_id      AS invoice_seller_id,
         sp.first_name      AS invoice_seller_first_name, sp.last_name AS invoice_seller_last_name,
         sp.company_name    AS invoice_seller_company_name
  FROM payments pay
  JOIN people p ON p.id = pay.person_id
  LEFT JOIN invoices inv ON inv.id = pay.invoice_id
  LEFT JOIN people sp   ON sp.id = inv.seller_id
`

async function paymentsIndex(req, res) {
  const url = new URL(req.url, 'http://x')
  const { page, pageSize, offset } = paginate(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  const conditions = []
  const params = []
  if (q) {
    conditions.push(
      '(p.first_name LIKE ? OR p.last_name LIKE ? OR p.company_name LIKE ? OR pay.transfer_type LIKE ? OR inv.invoice_number LIKE ?)'
    )
    params.push(like(q), like(q), like(q), like(q), like(q))
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM payments pay
       JOIN people p ON p.id = pay.person_id
       LEFT JOIN invoices inv ON inv.id = pay.invoice_id
       ${where}`
    )
    .get(...params).c
  const data = db
    .prepare(`${paymentSelect} ${where} ORDER BY pay.id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset)
  const attMapP = attachmentCountMap('payment', data.map((r) => r.id))
  for (const r of data) r.attachment_count = attMapP.get(Number(r.id)) || 0
  sendJson(res, 200, { data, total, page, pageSize })
}

async function paymentGet(req, res, id) {
  const row = db.prepare(`${paymentSelect} WHERE pay.id = ?`).get(id)
  if (!row) return sendJson(res, 404, { error: 'پرداخت یافت نشد' })
  row.attachments = attachmentsFor('payment', id)
  row.attachment_count = row.attachments.length
  sendJson(res, 200, row)
}

async function paymentCreate(req, res) {
  const pay = extractPayment(req.body)
  const att = req.body.attachment || null
  const src = resolveAttachmentSource(att)
  try {
    db.exec('BEGIN')
    try {
      const info = db
        .prepare(
          `INSERT INTO payments (person_id, transaction_type, transfer_type, amount, payment_date, invoice_id, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(pay.person_id, pay.transaction_type, pay.transfer_type, pay.amount, pay.payment_date, pay.invoice_id, pay.notes, now(), now())
      if (src) {
        const person = db.prepare('SELECT * FROM people WHERE id = ?').get(pay.person_id)
        storeAttachmentRecord({ entityType: 'payment', entityId: info.lastInsertRowid, person, srcPath: src.srcPath, originalName: att.name })
      }
      db.exec('COMMIT')
      recomputeInvoicePaid(pay.invoice_id)
      sendJson(res, 201, { id: info.lastInsertRowid })
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  } finally {
    if (src && src.tmpPath) { try { fs.rmSync(src.tmpPath, { force: true }) } catch { /* ignore */ } }
  }
}

async function paymentUpdate(req, res, id) {
  const pay = extractPayment(req.body)
  const old = db.prepare('SELECT invoice_id FROM payments WHERE id = ?').get(id)
  if (!old) return sendJson(res, 404, { error: 'پرداخت یافت نشد' })
  const att = req.body.attachment || null
  const src = resolveAttachmentSource(att)
  let oldFiles = []
  try {
    db.exec('BEGIN')
    try {
      const info = db
        .prepare(
          `UPDATE payments SET person_id = ?, transaction_type = ?, transfer_type = ?, amount = ?,
           payment_date = ?, invoice_id = ?, notes = ?, updated_at = ? WHERE id = ?`
        )
        .run(pay.person_id, pay.transaction_type, pay.transfer_type, pay.amount, pay.payment_date, pay.invoice_id, pay.notes, now(), id)
      if (!info.changes) {
        const e = new Error('پرداخت یافت نشد')
        e.status = 404
        throw e
      }
      if (src) {
        const person = db.prepare('SELECT * FROM people WHERE id = ?').get(pay.person_id)
        const rep = replaceAttachment({ entityType: 'payment', entityId: id, person, srcPath: src.srcPath, originalName: att.name })
        oldFiles = rep.oldFiles
      }
      db.exec('COMMIT')
      recomputeInvoicePaid(old.invoice_id)
      recomputeInvoicePaid(pay.invoice_id)
      // حذف فایل‌های قدیمی فقط بعد از COMMIT موفق
      for (const f of oldFiles) documents.deleteAttachment(f)
      sendJson(res, 200, { ok: true })
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  } finally {
    if (src && src.tmpPath) { try { fs.rmSync(src.tmpPath, { force: true }) } catch { /* ignore */ } }
  }
}

async function paymentDelete(req, res, id) {
  const old = db.prepare('SELECT invoice_id FROM payments WHERE id = ?').get(id)
  if (!old) return sendJson(res, 404, { error: 'پرداخت یافت نشد' })
  db.prepare('DELETE FROM payments WHERE id = ?').run(id)
  recomputeInvoicePaid(old.invoice_id)
  removeAttachmentsOf('payment', id)
  sendJson(res, 200, { ok: true })
}

// ============================================================ balances (بدهکاری/بستانکاری)

/**
 * محاسبه‌ی مانده‌ی هر شخص از دیدگاه شرکت:
 *   debit  (بدهکار)  = مبلغی که شخص به شرکت بدهکار است
 *   credit (بستانکار) = مبلغی که شرکت به شخص بدهکار است
 *   balance = debit - credit  (مثبت: شخص بدهکار / منفی: شخص بستانکار)
 *
 * قواعد:
 *   - فاکتور فروش به شخص X: X به اندازه‌ی «مبلغ باقی‌مانده» بدهکار می‌شود
 *   - فاکتور خرید از شخص X: شرکت به اندازه‌ی «مبلغ باقی‌مانده» به X بدهکار می‌شود
 *     (باقی‌مانده = کل فاکتور منهای پرداخت‌های اشخاصِ غیر از طرف حساب)
 *   - دریافت از X: بستانکاری X افزایش می‌یابد (طلبش از شرکت / تسویه‌ی بدهی‌اش)
 *   - پرداخت به X: بدهکاری X افزایش می‌یابد
 */
function thirdPartyPaidMap({ from, to, personId }) {
  const conds = []
  const params = []
  if (from) { conds.push('pay.payment_date >= ?'); params.push(from) }
  if (to) { conds.push('pay.payment_date <= ?'); params.push(to) }
  if (personId) { conds.push('i.seller_id = ?'); params.push(personId) }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const rows = db
    .prepare(
      `SELECT pay.invoice_id, pay.person_id, pay.amount, i.seller_id
       FROM payments pay JOIN invoices i ON i.id = pay.invoice_id ${where}`
    )
    .all(...params)
  const map = new Map()
  for (const r of rows) {
    if (Number(r.seller_id) !== Number(r.person_id)) {
      map.set(r.invoice_id, (map.get(r.invoice_id) || 0) + Number(r.amount))
    }
  }
  return map
}

function loadPersonRows() {
  const rows = db.prepare(`SELECT id, first_name, last_name, company_name FROM people ORDER BY id`).all()
  const byId = new Map()
  for (const r of rows) byId.set(r.id, r)
  return { rows, byId }
}

/** مانده‌ی همه‌ی اشخاص (با فیلتر بازه‌ی تاریخ اختیاری) */
function computePersonBalances({ from, to, personId }) {
  const invConds = []
  const invParams = []
  if (from) { invConds.push('i.invoice_date >= ?'); invParams.push(from) }
  if (to) { invConds.push('i.invoice_date <= ?'); invParams.push(to) }
  if (personId) { invConds.push('i.seller_id = ?'); invParams.push(personId) }
  const invWhere = invConds.length ? `WHERE ${invConds.join(' AND ')}` : ''
  const payConds = []
  const payParams = []
  if (from) { payConds.push('pay.payment_date >= ?'); payParams.push(from) }
  if (to) { payConds.push('pay.payment_date <= ?'); payParams.push(to) }
  if (personId) { payConds.push('pay.person_id = ?'); payParams.push(personId) }
  const payWhere = payConds.length ? `WHERE ${payConds.join(' AND ')}` : ''

  const invoices = db
    .prepare(`SELECT id, seller_id, invoice_type, total_amount FROM invoices i ${invWhere}`)
    .all(...invParams)
  const payments = db
    .prepare(`SELECT id, person_id, transaction_type, amount, invoice_id FROM payments pay ${payWhere}`)
    .all(...payParams)

  const third = thirdPartyPaidMap({ from, to, personId })
  const bal = new Map()
  const get = (pid) => {
    if (!bal.has(pid)) bal.set(pid, { debit: 0, credit: 0, count: 0 })
    return bal.get(pid)
  }
  for (const i of invoices) {
    const rem = (Number(i.total_amount) || 0) - (third.get(i.id) || 0)
    const b = get(i.seller_id)
    b.count++
    if (i.invoice_type === 'sell') b.debit += rem
    else b.credit += rem
  }
  // پرداخت‌های شخص ثالث: پرداخت‌کننده بستانکار می‌شود
  // (شرکت پول را از شخص ثالث دریافت کرده و به طرف حساب فاکتور پرداخت کرده)
  // برای تشخیص پرداخت شخص ثالث، باید فاکتورهای مرتبط را بررسی کنیم
  const allInvoiceIds = new Set(payments.filter(p => p.invoice_id).map(p => p.invoice_id))
  const allInvoices = allInvoiceIds.size ? db.prepare(`SELECT id, seller_id FROM invoices WHERE id IN (${[...allInvoiceIds].join(',')})`).all() : []
  const invSellerMap = new Map(allInvoices.map(i => [i.id, i.seller_id]))
  for (const p of payments) {
    const b = get(p.person_id)
    b.count++
    // آیا این پرداخت شخص ثالث است؟ (پرداخت‌کننده غیر از فروشنده فاکتور)
    const sellerOfInv = p.invoice_id ? invSellerMap.get(p.invoice_id) : null
    const isThirdParty = sellerOfInv != null && Number(p.person_id) !== Number(sellerOfInv)
    if (isThirdParty) {
      // پرداخت شخص ثالث: پرداخت‌کننده بستانکار می‌شود
      b.credit += Number(p.amount) || 0
    } else if (p.transaction_type === 'receive') {
      b.credit += Number(p.amount) || 0
    } else {
      b.debit += Number(p.amount) || 0
    }
  }

  const { byId } = loadPersonRows()
  const data = []
  for (const [pid, b] of bal) {
    const person = byId.get(pid)
    if (!person) continue
    let debit = Math.round(b.debit)
    let credit = Math.round(b.credit)
    // اگر بازه‌ی تاریخ تعیین شده، مانده‌ی ابتدای بازه به مانده اضافه شود تا رقم نهایی، مانده‌ی واقعی شخص باشد
    if (from) {
      const open = personOpeningBalance(pid, from)
      if (open > 0) credit += open
      else debit += -open
    }
    data.push({
      person_id: pid,
      first_name: person.first_name,
      last_name: person.last_name,
      company_name: person.company_name,
      debit,
      credit,
      balance: debit - credit,
      count: b.count,
    })
  }
  data.sort((a, b2) => Math.abs(b2.balance) - Math.abs(a.balance))
  return data
}

// ============================================================ stats

async function stats(req, res) {
  const one = (sql, ...params) => db.prepare(sql).get(...params)
  const peopleCount = one('SELECT COUNT(*) AS c FROM people').c
  const invoiceCount = one('SELECT COUNT(*) AS c FROM invoices').c
  const sell = one("SELECT COALESCE(SUM(total_amount), 0) AS s FROM invoices WHERE invoice_type = 'sell'").s
  const buy = one("SELECT COALESCE(SUM(total_amount), 0) AS s FROM invoices WHERE invoice_type = 'buy'").s
  const received = one("SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE transaction_type = 'receive'").s
  const paid = one("SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE transaction_type = 'pay'").s
  const recentInvoices = db
    .prepare(
      `SELECT i.id, i.invoice_number, i.invoice_date, i.invoice_type, i.total_amount,
              p.first_name, p.last_name, p.company_name
       FROM invoices i JOIN people p ON p.id = i.seller_id
       ORDER BY i.id DESC LIMIT 5`
    )
    .all()
  const recentPayments = db
    .prepare(
      `SELECT pay.*, p.first_name, p.last_name, p.company_name, inv.invoice_number
       FROM payments pay JOIN people p ON p.id = pay.person_id
       LEFT JOIN invoices inv ON inv.id = pay.invoice_id
       ORDER BY pay.id DESC LIMIT 5`
    )
    .all()
  const monthly = db
    .prepare(
      `SELECT substr(invoice_date, 1, 7) AS month,
              SUM(CASE WHEN invoice_type = 'sell' THEN total_amount ELSE 0 END) AS sell,
              SUM(CASE WHEN invoice_type = 'buy' THEN total_amount ELSE 0 END) AS buy
       FROM invoices GROUP BY month ORDER BY month DESC LIMIT 6`
    )
    .all()
    .reverse()

  // بستانکارها (شرکت به آن‌ها بدهکار است) و بدهکارها (آن‌ها به شرکت بدهکارند)
  const personBalances = computePersonBalances({})
  const creditors = personBalances
    .filter((b) => b.balance < 0)
    .map((b) => ({ ...b, amount: -b.balance }))
    .sort((a, b2) => b2.amount - a.amount)
    .slice(0, 5)
  const debtors = personBalances
    .filter((b) => b.balance > 0)
    .map((b) => ({ ...b, amount: b.balance }))
    .sort((a, b2) => b2.amount - a.amount)
    .slice(0, 5)

  sendJson(res, 200, {
    peopleCount, invoiceCount, sell, buy, received, paid,
    companyAccount: { received, paid, balance: received - paid },
    creditors, debtors,
    recentInvoices, recentPayments, monthly,
  })
}

// ============================================================ settings

function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? ''
}

// اتصال سرویس اسناد به تنظیمات
documents.init(getSetting)

async function settings(req, res) {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  s.transfer_types = JSON.parse(s.transfer_types || '[]')
  s.vat_percent = parseFloat(s.vat_percent) || 0
  s.auto_backup = s.auto_backup === '1'
  s.backup_interval_days = parseInt(s.backup_interval_days, 10) || 1
  sendJson(res, 200, s)
}

async function settingsUpdate(req, res) {
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )
  const allowed = new Set([
    'currency', 'vat_percent', 'auto_backup', 'backup_interval_days',
    'company_name', 'company_register_no', 'company_economic_code', 'company_phone', 'company_address',
    'transfer_types', 'backup_path', 'restore_password', 'documents_path',
  ])
  // اعتبارسنجی مسیر اسناد قبل از ذخیره
  if (req.body && req.body.documents_path != null) {
    const dp = String(req.body.documents_path).trim()
    if (dp) {
      const v = documents.validateStoragePath(dp)
      if (!v.ok) {
        const e = new Error(v.error)
        e.status = 400
        throw e
      }
    }
  }
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!allowed.has(k)) continue
    let val
    if (k === 'vat_percent') val = String(Math.max(0, Math.min(100, parseFloat(v) || 0)))
    else if (k === 'auto_backup') val = v ? '1' : '0'
    else if (k === 'backup_interval_days') val = String(Math.max(1, Math.min(365, parseInt(v, 10) || 1)))
    else if (k === 'transfer_types') val = JSON.stringify(Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [])
    else val = String(v ?? '').trim()
    upsert.run(k, val)
  }
  sendJson(res, 200, { ok: true })
}

/** مانده‌ی ابتدای بازه‌ی شخص — جمع جریان‌های تراکنش‌های او قبل از تاریخ شروع بازه */
function personOpeningBalance(personId, from) {
  if (!from) return 0
  let bal = 0
  // فاکتورهای قبل از بازه (اثر پرداخت اشخاص ثالث قبل از بازه نیز اعمال می‌شود)
  const third = new Map()
  const thirdRows = db
    .prepare(
      `SELECT pay.invoice_id, pay.amount
       FROM payments pay
       JOIN invoices i ON i.id = pay.invoice_id
       WHERE pay.payment_date < ? AND i.seller_id = ? AND pay.person_id <> ?`
    )
    .all(from, personId, personId)
  for (const r of thirdRows) third.set(r.invoice_id, (third.get(r.invoice_id) || 0) + Number(r.amount))
  const invs = db
    .prepare(`SELECT id, invoice_type, total_amount FROM invoices WHERE seller_id = ? AND invoice_date < ?`)
    .all(personId, from)
  for (const i of invs) {
    const rem = (Number(i.total_amount) || 0) - (third.get(i.id) || 0)
    bal += i.invoice_type === 'sell' ? -rem : rem
  }
  // تراکنش‌های قبل از بازه
  const pays = db
    .prepare(`SELECT transaction_type, amount FROM payments WHERE person_id = ? AND payment_date < ?`)
    .all(personId, from)
  for (const p of pays) bal += p.transaction_type === 'receive' ? Number(p.amount) : -Number(p.amount)
  return bal
}

// ============================================================ ledger (گزارش یکپارچه و تفصیلی)

async function ledger(req, res) {
  const url = new URL(req.url, 'http://x')
  const kind = (url.searchParams.get('kind') || 'all').trim()
  const from = (url.searchParams.get('from') || '').trim()
  const to = (url.searchParams.get('to') || '').trim()
  const personId = parseInt(url.searchParams.get('person_id'), 10) || 0
  const type = (url.searchParams.get('type') || '').trim()
  const third = thirdPartyPaidMap({ from, to })

  // ---------- مانده‌ی اشخاص (گزارش تفصیلی) ----------
  if (kind === 'persons') {
    const data = computePersonBalances({ from, to, personId: personId || undefined })
    const totalDebt = data.filter((b) => b.balance > 0).reduce((s, b) => s + b.balance, 0) // طلب شرکت از اشخاص
    const totalCredit = data.filter((b) => b.balance < 0).reduce((s, b) => s - b.balance, 0) // بدهی شرکت به اشخاص
    return sendJson(res, 200, {
      kind,
      data,
      count: data.length,
      totalDebt,
      totalCredit,
      net: totalDebt - totalCredit,
    })
  }

  // ---------- ردیف‌های فاکتور و پرداخت ----------
  const wantInvoices = kind === 'all' || kind === 'invoices'
  const wantPayments = kind === 'all' || kind === 'payments'
  const data = []
  let invoiceSum = 0
  let paidSum = 0
  let receivable = 0
  let payable = 0
  let paymentSum = 0
  let receiveSum = 0
  let paySum = 0

  if (wantInvoices) {
    const conds = []
    const params = []
    if (from) { conds.push('i.invoice_date >= ?'); params.push(from) }
    if (to) { conds.push('i.invoice_date <= ?'); params.push(to) }
    if (type === 'buy' || type === 'sell') { conds.push('i.invoice_type = ?'); params.push(type) }
    if (personId) { conds.push('i.seller_id = ?'); params.push(personId) }
    const costCenterId = parseInt(url.searchParams.get('cost_center_id'), 10) || 0
    if (costCenterId) { conds.push('i.cost_center_id = ?'); params.push(costCenterId) }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    const rows = db.prepare(`${invoiceSelect} ${where} ORDER BY i.id DESC LIMIT 10000`).all(...params)
    const agg = db
      .prepare(
        `SELECT COALESCE(SUM(i.total_amount),0) AS sum, COALESCE(SUM(i.paid_amount),0) AS paid,
                COALESCE(SUM(CASE WHEN i.invoice_type='sell' THEN i.total_amount - i.paid_amount ELSE 0 END),0) AS rec,
                COALESCE(SUM(CASE WHEN i.invoice_type='buy' THEN i.total_amount - i.paid_amount ELSE 0 END),0) AS pay
         FROM invoices i ${where}`
      )
      .get(...params)
    invoiceSum = agg.sum
    paidSum = agg.paid
    receivable = agg.rec
    payable = agg.pay
    // جمع تعداد اقلام فاکتورها و خلاصه اقلام (برای گزارش تفصیلی)
    const invoiceIds = rows.map((r) => r.id)
    const qtyMap = new Map()
    const qtyUnitMap = new Map()
    const itemsSummaryMap = new Map()
    if (invoiceIds.length) {
      const ph = invoiceIds.map(() => '?').join(',')
      const qtyRows = db.prepare(`SELECT invoice_id, COALESCE(SUM(quantity),0) AS qty FROM invoice_items WHERE invoice_id IN (${ph}) GROUP BY invoice_id`).all(...invoiceIds)
      for (const q of qtyRows) qtyMap.set(q.invoice_id, q.qty)
      // واحد واقعی هر فاکتور: اولین واحد ثبت‌شده در اقلام (سطح Detail — منبع صحیح)
      const unitRows = db.prepare(`SELECT invoice_id, unit FROM invoice_items WHERE invoice_id IN (${ph}) AND COALESCE(unit, '') <> '' ORDER BY id`).all(...invoiceIds)
      for (const u of unitRows) { if (!qtyUnitMap.has(u.invoice_id)) qtyUnitMap.set(u.invoice_id, u.unit) }
      const itemRows = db.prepare(`SELECT invoice_id, product_name, quantity FROM invoice_items WHERE invoice_id IN (${ph}) ORDER BY id`).all(...invoiceIds)
      const byInv = new Map()
      for (const it of itemRows) {
        if (!byInv.has(it.invoice_id)) byInv.set(it.invoice_id, [])
        byInv.get(it.invoice_id).push(it)
      }
      for (const [invId, items] of byInv) {
        const shown = items.slice(0, 3).map((it) => it.product_name)
        const extra = items.length > 3 ? ` و ${items.length - 3} مورد دیگر` : ''
        itemsSummaryMap.set(invId, shown.join('، ') + extra)
      }
    }
    for (const r of rows) {
      const isSell = r.invoice_type === 'sell'
      const counterparty = { id: r.seller_id, first_name: r.seller_first_name, last_name: r.seller_last_name, company_name: r.seller_company_name }
      const totalAmt = Number(r.total_amount) || 0
      data.push({
        kind: 'invoice',
        id: r.id,
        date: r.invoice_date,
        type: r.invoice_type,
        label: isSell ? 'فاکتور فروش' : 'فاکتور خرید',
        number: r.invoice_number,
        person_id: counterparty.id,
        person_name: fullName(counterparty),
        amount: r.total_amount,
        paid: r.paid_amount,
        balance: totalAmt - (Number(r.paid_amount) || 0),
        flow: isSell ? -totalAmt : totalAmt,
        notes: r.notes,
        qty: qtyMap.get(r.id) || 0,
        qty_unit: qtyUnitMap.get(r.id) || '',
        items_summary: itemsSummaryMap.get(r.id) || '',
        cost_center_name: r.cost_center_name || '',
        cost_center_id: r.cost_center_id || null,
        raw: r,
      })
    }
  }

  if (wantPayments) {
    const conds = []
    const params = []
    if (from) { conds.push('pay.payment_date >= ?'); params.push(from) }
    if (to) { conds.push('pay.payment_date <= ?'); params.push(to) }
    if (type === 'receive' || type === 'pay') { conds.push('pay.transaction_type = ?'); params.push(type) }
    if (personId) { conds.push('pay.person_id = ?'); params.push(personId) }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    const rows = db.prepare(`${paymentSelect} ${where} ORDER BY pay.id DESC LIMIT 10000`).all(...params)
    const agg = db
      .prepare(
        `SELECT COALESCE(SUM(pay.amount),0) AS sum,
                COALESCE(SUM(CASE WHEN pay.transaction_type='receive' THEN pay.amount ELSE 0 END),0) AS rec,
                COALESCE(SUM(CASE WHEN pay.transaction_type='pay' THEN pay.amount ELSE 0 END),0) AS pay
         FROM payments pay ${where}`
      )
      .get(...params)
    paymentSum = agg.sum
    receiveSum = agg.rec
    paySum = agg.pay
    for (const r of rows) {
      const isReceive = r.transaction_type === 'receive'
      data.push({
        kind: 'payment',
        id: r.id,
        date: r.payment_date,
        type: r.transaction_type,
        label: isReceive ? 'دریافت' : 'پرداخت',
        number: r.transfer_type,
        person_id: r.person_id,
        person_name: fullName(r),
        amount: r.amount,
        paid: null,
        balance: null,
        flow: isReceive ? Number(r.amount) : -Number(r.amount),
        invoice_number: r.invoice_number || null,
        notes: r.notes,
        raw: r,
      })
    }
  }

  // ---------- پرداخت‌های اشخاص ثالث (برای گزارش تفصیلی) ----------
  let thirdPartyRows = []
  if (personId) {
    // فاکتورهای این شخص — حتی اگر خارج از بازه باشند تا پرداخت اشخاص ثالث در بازه از دست نرود
    const allPersonInvRows = db.prepare(`SELECT id FROM invoices WHERE seller_id = ?`).all(personId)
    const personInvIds = allPersonInvRows.map((r) => r.id)
    if (personInvIds.length) {
      const ph = personInvIds.map(() => '?').join(',')
      const tpConds = [`pay.invoice_id IN (${ph})`, `pay.person_id <> ?`]
      const tpParams = [...personInvIds, personId]
      if (from) { tpConds.push('pay.payment_date >= ?'); tpParams.push(from) }
      if (to) { tpConds.push('pay.payment_date <= ?'); tpParams.push(to) }
      const tpRows = db
        .prepare(`SELECT pay.*, i.invoice_type, i.seller_id, i.invoice_number AS inv_num,
                         pp.first_name AS payer_first, pp.last_name AS payer_last, pp.company_name AS payer_company
                  FROM payments pay
                  JOIN invoices i ON i.id = pay.invoice_id
                  LEFT JOIN people pp ON pp.id = pay.person_id
                  WHERE ${tpConds.join(' AND ')}
                  ORDER BY pay.payment_date, pay.id`)
        .all(...tpParams)
      for (const r of tpRows) {
        const payerName = fullName({ first_name: r.payer_first, last_name: r.payer_last, company_name: r.payer_company })
        const invRow = data.find((d) => d.kind === 'invoice' && d.id === r.invoice_id)
        // فقط فاکتورهای خرید: پرداخت شخص ثالث بستانکاری را کاهش می‌دهد
        // فاکتورهای فروش: پرداخت شخص ثالث فقط بدهی خریدار را کاهش می‌دهد (بدون ایجاد بستانکاری جدید)
        if (r.invoice_type === 'buy') {
          thirdPartyRows.push({
            kind: 'third_party',
            id: r.id,
            date: r.payment_date,
            type: 'pay',
            label: 'پرداخت شخص ثالث',
            number: r.transfer_type || 'نقدی',
            person_id: r.person_id,
            person_name: payerName,
            amount: r.amount,
            flow: -Number(r.amount), // کاهش بستانکاری شخص
            invoice_number: r.inv_num || null,
            invoice_id: r.invoice_id,
            notes: r.notes,
            raw: { ...r, items_summary: invRow?.raw?.items_summary || '' },
          })
        }
      }
    }
  }

  // ---------- گزارش مراکز هزینه (تفصیلی مرکز هزینه) ----------
  if (kind === 'costcenters') {
    const ccId = parseInt(url.searchParams.get('cost_center_id'), 10) || 0
    const conds = []
    const params = []
    if (from) { conds.push('i.invoice_date >= ?'); params.push(from) }
    if (to) { conds.push('i.invoice_date <= ?'); params.push(to) }
    if (ccId) { conds.push('i.cost_center_id = ?'); params.push(ccId) }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    const invRows = db.prepare(`${invoiceSelect} ${where} ORDER BY i.invoice_date, i.id`).all(...params)

    const invIds = invRows.map((r) => r.id)
    const qtyMap2 = new Map()
    const itemsSummaryMap2 = new Map()
    const paymentsByInvoice = new Map()
    if (invIds.length) {
      const ph = invIds.map(() => '?').join(',')
      const qtyRows = db.prepare(`SELECT invoice_id, COALESCE(SUM(quantity),0) AS qty FROM invoice_items WHERE invoice_id IN (${ph}) GROUP BY invoice_id`).all(...invIds)
      for (const q of qtyRows) qtyMap2.set(q.invoice_id, q.qty)
      const itemRows = db.prepare(`SELECT invoice_id, product_name FROM invoice_items WHERE invoice_id IN (${ph}) ORDER BY id`).all(...invIds)
      const byInv = new Map()
      for (const it of itemRows) {
        if (!byInv.has(it.invoice_id)) byInv.set(it.invoice_id, [])
        byInv.get(it.invoice_id).push(it.product_name)
      }
      for (const [invId, names] of byInv) {
        const shown = names.slice(0, 3)
        const extra = names.length > 3 ? ` و ${names.length - 3} مورد دیگر` : ''
        itemsSummaryMap2.set(invId, shown.join('، ') + extra)
      }
      // تراکنش‌های متعلق به فاکتورهای این مرکز هزینه
      const payRows = db
        .prepare(
          `SELECT pay.*, p.first_name, p.last_name, p.company_name
           FROM payments pay JOIN people p ON p.id = pay.person_id
           WHERE pay.invoice_id IN (${ph})
           ORDER BY pay.payment_date, pay.id`
        )
        .all(...invIds)
      for (const p of payRows) {
        if (!paymentsByInvoice.has(p.invoice_id)) paymentsByInvoice.set(p.invoice_id, [])
        paymentsByInvoice.get(p.invoice_id).push(p)
      }
    }

    // جمع پرداخت اشخاص ثالث برای هر فاکتور (کاهش بستانکاری فروشنده در فاکتور خرید)
    const thirdMap = new Map()
    for (const [, pays] of paymentsByInvoice) {
      for (const p of pays) {
        const inv = invRows.find((r) => r.id === p.invoice_id)
        if (inv && inv.invoice_type === 'buy' && Number(p.person_id) !== Number(inv.seller_id)) {
          thirdMap.set(p.invoice_id, (thirdMap.get(p.invoice_id) || 0) + Number(p.amount))
        }
      }
    }

    const ccRowsData = []
    for (const inv of invRows) {
      const isSell = inv.invoice_type === 'sell'
      const party = { id: inv.seller_id, first_name: inv.seller_first_name, last_name: inv.seller_last_name, company_name: inv.seller_company_name }
      const itemsSum = itemsSummaryMap2.get(inv.id) || inv.notes || ''
      const thirdPaid = thirdMap.get(inv.id) || 0
      // فاکتور: خرید → بستانکار مرکز، فروش → بدهکار مرکز (فقط مانده فاکتور — پرداخت‌ها ردیف جدا دارند)
      const rem = (Number(inv.total_amount) || 0) - thirdPaid
      ccRowsData.push({
        kind: 'invoice',
        id: inv.id,
        cc_id: inv.cost_center_id,
        cc_name: inv.cost_center_name || '',
        date: inv.invoice_date,
        type: inv.invoice_type,
        label: isSell ? 'فاکتور فروش' : 'فاکتور خرید',
        number: inv.invoice_number,
        person_id: inv.seller_id,
        person_name: fullName(party),
        person_code: inv.seller_id,
        amount: inv.total_amount,
        qty: qtyMap2.get(inv.id) || 0,
        items_summary: itemsSum,
        flow: isSell ? -rem : rem,
        invoice_number: inv.invoice_number,
        raw: inv,
      })
      for (const p of paymentsByInvoice.get(inv.id) || []) {
        const payer = { id: p.person_id, first_name: p.first_name, last_name: p.last_name, company_name: p.company_name }
        const isThird = !isSell && Number(p.person_id) !== Number(inv.seller_id)
        // فاکتور خرید: پرداخت فروشنده بستانکار مرکز می‌شود؛ پرداخت شخص ثالث هم بستانکار مرکز
        // فاکتور فروش: هر دریافت بدهکار مرکز می‌شود (کاهش طلب مرکز)
        const flow = isSell ? Number(p.amount) : Number(p.amount)
        ccRowsData.push({
          kind: isThird ? 'third_party' : 'payment',
          id: p.id,
          cc_id: inv.cost_center_id,
          cc_name: inv.cost_center_name || '',
          date: p.payment_date,
          type: p.transaction_type,
          label: isThird ? 'پرداخت شخص ثالث' : (p.transaction_type === 'receive' ? 'دریافت' : 'پرداخت'),
          number: p.transfer_type || 'نقدی',
          person_id: p.person_id,
          person_name: fullName(payer),
          person_code: p.person_id,
          amount: p.amount,
          qty: 0,
          items_summary: '',
          flow: isSell ? Number(p.amount) : -Number(p.amount),
          invoice_number: inv.invoice_number,
          invoice_id: inv.id,
          raw: p,
        })
      }
    }

    // مانده ابتدای بازه برای مرکز هزینه (جمع جریان‌های قبل از بازه)
    let ccOpening = 0
    if (from) {
      const beforeRows = []
      const bConds = []
      const bParams = []
      if (ccId) { bConds.push('i.cost_center_id = ?'); bParams.push(ccId) }
      bConds.push('i.invoice_date < ?'); bParams.push(from)
      const beforeInv = db.prepare(`${invoiceSelect} WHERE ${bConds.join(' AND ')}`).all(...bParams)
      const beforeIds = beforeInv.map((r) => r.id)
      const beforePays = beforeIds.length
        ? db.prepare(`SELECT pay.*, i.invoice_type, i.seller_id FROM payments pay JOIN invoices i ON i.id = pay.invoice_id WHERE pay.invoice_id IN (${beforeIds.map(() => '?').join(',')}) AND pay.payment_date < ?`).all(...beforeIds, from)
        : []
      const beforeThird = new Map()
      for (const p of beforePays) {
        if (p.invoice_type === 'buy' && Number(p.person_id) !== Number(p.seller_id)) {
          beforeThird.set(p.invoice_id, (beforeThird.get(p.invoice_id) || 0) + Number(p.amount))
        }
      }
      for (const inv of beforeInv) {
        const rem = (Number(inv.total_amount) || 0) - (beforeThird.get(inv.id) || 0)
        beforeRows.push({ flow: inv.invoice_type === 'sell' ? -rem : rem })
      }
      for (const p of beforePays) {
        const inv = beforeInv.find((r) => r.id === p.invoice_id)
        const isThird = inv && inv.invoice_type === 'buy' && Number(p.person_id) !== Number(inv.seller_id)
        const isSellerPay = inv && inv.invoice_type === 'buy' && Number(p.person_id) === Number(inv.seller_id)
        let f = 0
        if (inv && inv.invoice_type === 'sell') f = Number(p.amount)
        else if (isSellerPay || isThird) f = -Number(p.amount)
        beforeRows.push({ flow: f })
      }
      for (const br of beforeRows) ccOpening += br.flow
    }

    let runBal = ccOpening
    const byKey = new Map()
    const sortedCC = [...ccRowsData].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))
    for (const r of sortedCC) {
      runBal += r.flow
      byKey.set(`${r.kind}:${r.id}`, runBal)
    }
    for (const r of ccRowsData) r.run_balance = byKey.get(`${r.kind}:${r.id}`)

    return sendJson(res, 200, {
      kind,
      data: sortedCC,
      count: sortedCC.length,
      openingBalance: ccOpening,
      finalBalance: runBal,
    })
  }

  // ---------- مانده‌ی جاری (گزارش تفصیلی هر شخص) ----------
  let openingBalance = 0
  let finalBalance = 0
  let thirdPartyPaid = 0
  if (personId) {
    openingBalance = personOpeningBalance(personId, from)
    // اضافه کردن ردیف‌های شخص ثالث به data اصلی
    data.push(...thirdPartyRows)
    let bal = openingBalance
    const byKey = new Map()
    const sorted = [...data].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))
    for (const r of sorted) {
      bal += r.flow
      byKey.set(`${r.kind}:${r.id}`, bal)
    }
    finalBalance = bal
    for (const r of data) r.run_balance = byKey.get(`${r.kind}:${r.id}`)
    for (const r of data) {
      if (r.kind === 'invoice') thirdPartyPaid += third.get(r.id) || 0
    }
  }

  data.sort((a, b) => (a.date === b.date ? b.id - a.id : String(a.date) > String(b.date) ? -1 : 1))
  sendJson(res, 200, {
    data,
    count: data.length,
    invoiceSum, paidSum, receivable, payable,
    paymentSum, receiveSum, paySum,
    finalBalance,
    openingBalance,
    thirdPartyPaid,
  })
}

// ============================================================ backups

const DEFAULT_BACKUP_DIR = path.join(DATA_DIR, 'backups')

function backupDir() {
  const custom = String(getSetting('backup_path') || '').trim()
  if (custom) {
    try {
      fs.mkdirSync(custom, { recursive: true })
      return custom
    } catch {
      /* مسیر نامعتبر — برگشت به پیش‌فرض */
    }
  }
  fs.mkdirSync(DEFAULT_BACKUP_DIR, { recursive: true })
  return DEFAULT_BACKUP_DIR
}

function createBackupFile() {
  const dir = backupDir()
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const name = `hesab-${ts}.db`
  const file = path.join(dir, name)
  fs.copyFileSync(DB_PATH, file)
  const size = fs.statSync(file).size
  // نگه‌داری فقط ۱۰ نسخه‌ی آخر
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort().reverse()
  for (const f of files.slice(10)) {
    try { fs.rmSync(path.join(dir, f)) } catch { /* ignore */ }
  }
  return { file: name, size, date: new Date().toISOString(), dir: customPath ? dir : null }
}

// متغیر موقت برای اطلاع‌رسانی مسیر سفارشی در پاسخ API
let customPath = false

async function backupCreate(req, res) {
  customPath = !!String(getSetting('backup_path') || '').trim()
  const info = createBackupFile()
  customPath = false
  sendJson(res, 201, info)
}

async function backupList(req, res) {
  const dir = backupDir()
  const data = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const st = fs.statSync(path.join(dir, f))
      return { file: f, size: st.size, date: st.mtime.toISOString(), dir }
    })
    .sort((a, b) => b.file.localeCompare(a.file))
  sendJson(res, 200, { data })
}

async function backupRestore(req, res) {
  const file = String((req.body || {}).file || '').trim()
  if (!/^[\w.-]+\.db$/.test(file)) {
    const e = new Error('نام فایل پشتیبان نامعتبر است')
    e.status = 400
    throw e
  }
  const expected = String(getSetting('restore_password') || '').trim()
  if (expected && String((req.body || {}).password || '') !== expected) {
    const e = new Error('رمز بازیابی اطلاعات صحیح نیست')
    e.status = 403
    throw e
  }
  const dir = backupDir()
  const src = path.join(dir, file)
  if (!fs.existsSync(src)) return sendJson(res, 404, { error: 'فایل پشتیبان یافت نشد' })
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  const original = path.join(DATA_DIR, 'hesab-original.tmp.db')
  fs.copyFileSync(DB_PATH, original)
  try {
    db.close()
    fs.copyFileSync(src, DB_PATH)
    reopenDb()
    fs.rmSync(original, { force: true })
    sendJson(res, 200, { ok: true })
  } catch (err) {
    try {
      fs.copyFileSync(original, DB_PATH)
      reopenDb()
      fs.rmSync(original, { force: true })
    } catch { /* ignore */ }
    throw err
  }
}

async function backupDelete(req, res, file) {
  if (!/^[\w.-]+\.db$/.test(file)) {
    const e = new Error('نام فایل پشتیبان نامعتبر است')
    e.status = 400
    throw e
  }
  const dir = backupDir()
  const full = path.join(dir, file)
  if (!fs.existsSync(full)) return sendJson(res, 404, { error: 'فایل پشتیبان یافت نشد' })
  fs.rmSync(full)
  sendJson(res, 200, { ok: true })
}

function startBackupScheduler() {
  const check = () => {
    try {
      if (getSetting('auto_backup') !== '1') return
      const interval = parseInt(getSetting('backup_interval_days'), 10) || 1
      const last = getSetting('last_backup_at')
      if (last) {
        const elapsed = (Date.now() - new Date(last).getTime()) / 86_400_000
        if (elapsed < interval) return
      }
      createBackupFile()
      db.prepare(
        `INSERT INTO settings (key, value) VALUES ('last_backup_at', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run(new Date().toISOString())
      console.log('[پشتیبان‌گیری خودکار] نسخه‌ی جدید ساخته شد.')
    } catch (err) {
      console.error('[پشتیبان‌گیری خودکار] خطا:', err.message)
    }
  }
  check()
  setInterval(check, 30 * 60 * 1000)
}

// ============================================================ cost centers (مراکز هزینه)

const ccColumns = 'id, name, code, description, created_at, updated_at'

async function costCentersIndex(req, res) {
  const data = db.prepare(`SELECT ${ccColumns} FROM cost_centers ORDER BY id`).all()
  sendJson(res, 200, data)
}

async function costCenterGet(req, res, id) {
  const row = db.prepare(`SELECT ${ccColumns} FROM cost_centers WHERE id = ?`).get(id)
  if (!row) return sendJson(res, 404, { error: 'مرکز هزینه یافت نشد' })
  sendJson(res, 200, row)
}

async function costCenterCreate(req, res) {
  const body = req.body || {}
  const name = String(body.name || '').trim()
  if (!name) {
    const e = new Error('نام مرکز هزینه اجباری است')
    e.status = 400
    throw e
  }
  const code = String(body.code || '').trim()
  const description = String(body.description || '').trim()
  const info = db
    .prepare('INSERT INTO cost_centers (name, code, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(name, code, description, now(), now())
  const row = db.prepare(`SELECT ${ccColumns} FROM cost_centers WHERE id = ?`).get(info.lastInsertRowid)
  sendJson(res, 201, row)
}

async function costCenterUpdate(req, res, id) {
  const body = req.body || {}
  const name = String(body.name || '').trim()
  if (!name) {
    const e = new Error('نام مرکز هزینه اجباری است')
    e.status = 400
    throw e
  }
  const code = String(body.code || '').trim()
  const description = String(body.description || '').trim()
  const info = db
    .prepare('UPDATE cost_centers SET name = ?, code = ?, description = ?, updated_at = ? WHERE id = ?')
    .run(name, code, description, now(), id)
  if (!info.changes) return sendJson(res, 404, { error: 'مرکز هزینه یافت نشد' })
  const row = db.prepare(`SELECT ${ccColumns} FROM cost_centers WHERE id = ?`).get(id)
  sendJson(res, 200, row)
}

async function costCenterDelete(req, res, id) {
  const refs = db.prepare('SELECT COUNT(*) AS c FROM invoices WHERE cost_center_id = ?').get(id)
  if (refs.c > 0) {
    return sendJson(res, 409, {
      error: `این مرکز هزینه در ${refs.c} فاکتور استفاده شده و قابل حذف نیست.`,
    })
  }
  const info = db.prepare('DELETE FROM cost_centers WHERE id = ?').run(id)
  if (!info.changes) return sendJson(res, 404, { error: 'مرکز هزینه یافت نشد' })
  sendJson(res, 200, { ok: true })
}

// ============================================================ attachments (پیوست‌ها)

function attachmentRow(a) {
  return {
    id: a.id,
    entity_type: a.entity_type,
    entity_id: a.entity_id,
    original_file_name: a.original_file_name,
    stored_file_name: a.stored_file_name,
    file_path: a.file_path,
    file_extension: a.file_extension,
    file_size: a.file_size,
    created_at: a.created_at,
    exists: documents.fileExists(a.file_path),
  }
}

function attachmentsFor(entityType, entityId) {
  return db
    .prepare('SELECT * FROM attachments WHERE entity_type = ? AND entity_id = ? ORDER BY id')
    .all(entityType, entityId)
    .map(attachmentRow)
}

function attachmentCountMap(entityType, ids) {
  const map = new Map()
  if (!ids.length) return map
  const ph = ids.map(() => '?').join(',')
  const rows = db
    .prepare(`SELECT entity_id, COUNT(*) AS c FROM attachments WHERE entity_type = ? AND entity_id IN (${ph}) GROUP BY entity_id`)
    .all(entityType, ...ids)
  for (const r of rows) map.set(Number(r.entity_id), r.c)
  return map
}

/** فایل انتخاب‌شده (base64 از مرورگر) را موقتاً ذخیره می‌کند */
function writeTempAttachment(dataB64) {
  const buf = Buffer.from(String(dataB64 || ''), 'base64')
  if (!buf.length) return null
  const tmp = path.join(os.tmpdir(), `hesab-att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  fs.writeFileSync(tmp, buf)
  return tmp
}

/**
 * آماده‌سازی منبع فایل پیوست از payload درخواست:
 *  - { path }  → حالت Electron: خود فایل انتخابی کاربر مستقیماً منبع کپی است (بدون کپی اضافی)
 *  - { data }  → حالت مرورگر: base64 به فایل موقت نوشته می‌شود
 * خروجی: { srcPath, tmpPath | null } — tmpPath فقط برای حالت data (بعداً پاک می‌شود)
 */
function resolveAttachmentSource(att) {
  if (!att) return null
  if (att.path) {
    const p = String(att.path)
    if (!documents.fileExists(p)) {
      const e = new Error(`فایل انتخاب‌شده یافت نشد: ${p}`)
      e.status = 400
      throw e
    }
    return { srcPath: p, tmpPath: null }
  }
  if (att.data) {
    const tmp = writeTempAttachment(att.data)
    if (!tmp) {
      const e = new Error('محتوای فایل پیوست نامعتبر است')
      e.status = 400
      throw e
    }
    return { srcPath: tmp, tmpPath: tmp }
  }
  return null
}

/**
 * جایگزینی پیوست یک موجودیت: رکوردهای قبلی حذف و پیوست جدید ثبت می‌شود —
 * همه در همان تراکنش صدا زده‌ی فراخوان اجرا می‌شود؛ حذف فایل قدیمی فقط بعد از COMMIT.
 */
function replaceAttachment({ entityType, entityId, person, srcPath, originalName }) {
  const old = db.prepare('SELECT * FROM attachments WHERE entity_type = ? AND entity_id = ? ORDER BY id').all(entityType, entityId)
  // اول رکوردهای قبلی حذف، بعد پیوست جدید ثبت می‌شود (وگرنه DELETE همه شامل جدید هم می‌شود)
  db.prepare('DELETE FROM attachments WHERE entity_type = ? AND entity_id = ?').run(entityType, entityId)
  const saved = storeAttachmentRecord({ entityType, entityId, person, srcPath, originalName })
  return { saved, oldFiles: old.map((o) => o.file_path) }
}

/**
 * ذخیره‌ی امن پیوست:
 * ۱) فایل ابتدا به محل نهایی کپی می‌شود
 * ۲) سپس داخل تراکنش دیتابیس رکورد ثبت می‌شود
 * ۳) در صورت خطا فایل یتیم حذف می‌شود (rollback)
 */
function storeAttachmentRecord({ entityType, entityId, person, srcPath, tempPath, originalName }) {
  const source = srcPath || tempPath
  if (!source) return null
  const saved = documents.saveAttachment({ person, sourcePath: source, originalName })
  const ext = path.extname(saved.stored_name)
  db.prepare(
    `INSERT INTO attachments (entity_type, entity_id, original_file_name, stored_file_name, file_path, file_extension, file_size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(entityType, entityId, String(originalName || saved.stored_name), saved.stored_name, saved.file_path, ext, saved.file_size, now())
  return saved
}

function removeAttachmentsOf(entityType, entityId) {
  const olds = db.prepare('SELECT * FROM attachments WHERE entity_type = ? AND entity_id = ?').all(entityType, entityId)
  for (const o of olds) documents.deleteAttachment(o.file_path)
  db.prepare('DELETE FROM attachments WHERE entity_type = ? AND entity_id = ?').run(entityType, entityId)
}

async function attachmentsIndex(req, res, m) {
  const type = m[1] === 'payment' ? 'payment' : 'invoice'
  sendJson(res, 200, { data: attachmentsFor(type, parseId(m[2])) })
}

/** حذف پیوست: رکورد دیتابیس + فایل فیزیکی (با تأیید سمت کلاینت انجام می‌شود) */
async function attachmentDelete(req, res, id) {
  const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(parseId(id))
  if (!a) return sendJson(res, 404, { error: 'پیوست یافت نشد' })
  db.prepare('DELETE FROM attachments WHERE id = ?').run(a.id)
  documents.deleteAttachment(a.file_path)
  sendJson(res, 200, { ok: true })
}

async function attachmentOpen(req, res, id) {
  const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(parseId(id))
  if (!a) return sendJson(res, 404, { error: 'پیوست یافت نشد' })
  if (!documents.fileExists(a.file_path)) {
    const e = new Error('فایل پیوست روی دیسک یافت نشد — ممکن است جابجا یا حذف شده باشد')
    e.status = 404
    throw e
  }
  try {
    await openWithDefaultApp(a.file_path)
  } catch (err) {
    const e = new Error('باز کردن فایل با برنامه‌ی پیش‌فرض ناموفق بود: ' + err.message)
    e.status = 500
    throw e
  }
  sendJson(res, 200, { ok: true })
}

async function documentsValidate(req, res) {
  const p = String((req.body || {}).path || '').trim()
  const v = documents.validateStoragePath(p)
  if (!v.ok) return sendJson(res, 400, { error: v.error })
  sendJson(res, 200, { ok: true })
}

// ============================================================ excel export

function buildExcelInvoicePayload(invId) {
  const row = db.prepare(`${invoiceSelect} WHERE i.id = ?`).get(invId)
  if (!row) return null
  const items = itemsFor(invId)
  if (!items.length) return { error: 'این فاکتور قلم قابل ارسال به اکسل ندارد' }
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(row.seller_id)
  const settingsMap = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]))

  // در این برنامه seller_id همیشه «طرف حساب» است:
  // فاکتور خرید → طرف حساب فروشنده است؛ فاکتور فروش → طرف حساب خریدار است.
  const isBuy = row.invoice_type === 'buy'
  const party = {
    company_name: person.company_name,
    first_name: person.first_name,
    last_name: person.last_name,
    national_code: person.national_code,
    company_national_id: person.company_national_id,
    company_economic_code: person.company_economic_code,
    address: person.address,
    postal_code: person.postal_code,
    phone: person.phone,
    mobile: person.mobile,
  }
  const company = {
    company_name: settingsMap.company_name || '',
    company_national_id: '',
    company_economic_code: settingsMap.company_economic_code || '',
    address: settingsMap.company_address || '',
    postal_code: '',
    phone: settingsMap.company_phone || '',
  }
  return {
    invoice: {
      invoice_type: row.invoice_type,
      invoice_number: row.invoice_number,
      invoice_date: row.invoice_date,
      items,
      seller: isBuy ? party : company,
      buyer: isBuy ? company : party,
      settings: settingsMap,
    },
  }
}

// صف سری‌سازی export اکسل — دو export هم‌زمان باعث تداخل temp-filename و
// خروج زودهنگام پردازه روی بعضی سیستم‌ها می‌شود؛ در صف، هر export منتظر قبلی می‌ماند.
let excelExportQueue = Promise.resolve()
function enqueueExcelExport(fn) {
  const run = excelExportQueue.then(fn, fn)
  excelExportQueue = run.catch(() => {})
  return run
}

async function invoiceExcelExport(req, res, id) {
  return enqueueExcelExport(async () => {
    const invId = parseId(id)
    const payload = buildExcelInvoicePayload(invId)
    if (!payload) return sendJson(res, 404, { error: 'فاکتور یافت نشد' })
    if (payload.error) {
      const e = new Error(payload.error)
      e.status = 400
      throw e
    }
    const outPath = path.join(os.tmpdir(), `hesab-factor-${invId}-${Date.now()}.xlsx`)
    try {
      await exportInvoiceToExcel({ ...payload, outPath })
      await openWithDefaultApp(outPath)
      sendJson(res, 200, { ok: true, file: outPath })
    } catch (err) {
      try { fs.rmSync(outPath, { force: true }) } catch { /* ignore */ }
      if (err.status) throw err
      const e = new Error('ایجاد فایل اکسل ناموفق بود: ' + err.message)
      e.status = 500
      throw e
    }
  })
}

async function invoiceExcelPreview(req, res, id) {
  const invId = parseId(id)
  const payload = buildExcelInvoicePayload(invId)
  if (!payload) return sendJson(res, 404, { error: 'فاکتور یافت نشد' })
  if (payload.error) {
    const e = new Error(payload.error)
    e.status = 400
    throw e
  }
  const outPath = path.join(os.tmpdir(), `hesab-factor-${invId}-${Date.now()}.xlsx`)
  try {
    await exportInvoiceToExcel({ ...payload, outPath })
    const buf = fs.readFileSync(outPath)
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="invoice-${invId}.xlsx"`,
      'Cache-Control': 'no-store',
    })
    res.end(buf)
  } catch (err) {
    try { fs.rmSync(outPath, { force: true }) } catch { /* ignore */ }
    if (err.status) throw err
    const e = new Error('ایجاد فایل اکسل ناموفق بود: ' + err.message)
    e.status = 500
    throw e
  }
}

// ============================================================ router

const routes = [
  ['GET', /^\/api\/people\/search$/, (req, res) => peopleSearch(req, res)],
  ['GET', /^\/api\/people$/, (req, res) => peopleIndex(req, res)],
  ['GET', /^\/api\/people\/(\d+)$/, (req, res, m) => personGet(req, res, parseId(m[1]))],
  ['POST', /^\/api\/people$/, (req, res) => personCreate(req, res)],
  ['PUT', /^\/api\/people\/(\d+)$/, (req, res, m) => personUpdate(req, res, parseId(m[1]))],
  ['DELETE', /^\/api\/people\/(\d+)$/, (req, res, m) => personDelete(req, res, parseId(m[1]))],

  ['GET', /^\/api\/invoices$/, (req, res) => invoicesIndex(req, res)],
  ['GET', /^\/api\/invoices\/(\d+)$/, (req, res, m) => invoiceGet(req, res, parseId(m[1]))],
  ['POST', /^\/api\/invoices$/, (req, res) => invoiceCreate(req, res)],
  ['PUT', /^\/api\/invoices\/(\d+)$/, (req, res, m) => invoiceUpdate(req, res, parseId(m[1]))],
  ['DELETE', /^\/api\/invoices\/(\d+)$/, (req, res, m) => invoiceDelete(req, res, parseId(m[1]))],

  ['GET', /^\/api\/payments$/, (req, res) => paymentsIndex(req, res)],
  ['GET', /^\/api\/payments\/(\d+)$/, (req, res, m) => paymentGet(req, res, parseId(m[1]))],
  ['POST', /^\/api\/payments$/, (req, res) => paymentCreate(req, res)],
  ['PUT', /^\/api\/payments\/(\d+)$/, (req, res, m) => paymentUpdate(req, res, parseId(m[1]))],
  ['DELETE', /^\/api\/payments\/(\d+)$/, (req, res, m) => paymentDelete(req, res, parseId(m[1]))],

  ['GET', /^\/api\/cost-centers$/, (req, res) => costCentersIndex(req, res)],
  ['GET', /^\/api\/cost-centers\/(\d+)$/, (req, res, m) => costCenterGet(req, res, parseId(m[1]))],
  ['POST', /^\/api\/cost-centers$/, (req, res) => costCenterCreate(req, res)],
  ['PUT', /^\/api\/cost-centers\/(\d+)$/, (req, res, m) => costCenterUpdate(req, res, parseId(m[1]))],
  ['DELETE', /^\/api\/cost-centers\/(\d+)$/, (req, res, m) => costCenterDelete(req, res, parseId(m[1]))],

  ['GET', /^\/api\/stats$/, (req, res) => stats(req, res)],
  ['GET', /^\/api\/settings$/, (req, res) => settings(req, res)],
  ['PUT', /^\/api\/settings$/, (req, res) => settingsUpdate(req, res)],

  ['GET', /^\/api\/ledger$/, (req, res) => ledger(req, res)],

  ['GET', /^\/api\/attachments\/(invoice|payment)\/(\d+)$/, (req, res, m) => attachmentsIndex(req, res, m)],
  ['POST', /^\/api\/attachments\/open\/(\d+)$/, (req, res, m) => attachmentOpen(req, res, m[1])],
  ['DELETE', /^\/api\/attachments\/(\d+)$/, (req, res, m) => attachmentDelete(req, res, m[1])],
  ['POST', /^\/api\/documents\/validate$/, (req, res) => documentsValidate(req, res)],
  ['POST', /^\/api\/invoices\/(\d+)\/excel$/, (req, res, m) => invoiceExcelExport(req, res, m[1])],
  ['GET', /^\/api\/invoices\/(\d+)\/excel$/, (req, res, m) => invoiceExcelPreview(req, res, m[1])],

  ['GET', /^\/api\/backups$/, (req, res) => backupList(req, res)],
  ['POST', /^\/api\/backups$/, (req, res) => backupCreate(req, res)],
  ['POST', /^\/api\/backups\/restore$/, (req, res) => backupRestore(req, res)],
  ['DELETE', /^\/api\/backups\/([\w.-]+)$/, (req, res, m) => backupDelete(req, res, m[1])],
]

// ============================================================ static files

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
}

function serveStatic(req, res, urlPath) {
  let filePath = urlPath === '/' ? '/index.html' : decodeURIComponent(urlPath)
  // در نسخه‌ی exe فایل‌های کلاینت داخل خود فایل اجرایی جاسازی شده‌اند
  if (isSea && isSea()) {
    const name = `client${filePath}`
    let buf
    try {
      buf = getAsset(name)
    } catch {
      return sendJson(res, 404, { error: 'یافت نشد' })
    }
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    return res.end(buf)
  }
  const full = path.normalize(path.join(CLIENT_DIR, filePath))
  if (!full.startsWith(CLIENT_DIR)) {
    return sendJson(res, 403, { error: 'دسترسی غیرمجاز' })
  }
  fs.stat(full, (err, stat) => {
    if (err || !stat.isFile()) return sendJson(res, 404, { error: 'یافت نشد' })
    const ext = path.extname(full).toLowerCase()
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    fs.createReadStream(full).pipe(res)
  })
}

// ============================================================ server

const HOST = process.env.HOST || '127.0.0.1'

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0]

  if (urlPath.startsWith('/api/')) {
    const handler = routes.find(([method, re]) => method === req.method && re.test(urlPath))
    if (!handler) return sendJson(res, 404, { error: 'مسیر یافت نشد' })
    const [, , fn] = handler
    const m = handler[1].exec(urlPath)
    if (req.method === 'POST' || req.method === 'PUT') {
      readBody(req)
        .then((body) => {
          req.body = body
          return wrap(fn)(req, res, m)
        })
        .catch((err) => sendJson(res, 400, { error: err.message }))
    } else {
      wrap(fn)(req, res, m)
    }
    return
  }

  serveStatic(req, res, urlPath)
})

startBackupScheduler()

server.listen(PORT, HOST, () => {
  console.log(`\n  🚀  برنامه روی آدرس زیر در حال اجراست:`)
  console.log(`\n      http://localhost:${PORT}\n`)
  console.log(`  📁  فایل دیتابیس: data/hesab.db\n`)
})
