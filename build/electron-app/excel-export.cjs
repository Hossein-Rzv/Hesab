// ============================================================
// server/excel-export.cjs — سرویس خروجی Excel فاکتور
// Template رسمی «فرم خام» به‌عنوان Contract حفظ می‌شود؛ هر بار
// یک Copy ساخته و روی Copy اطلاعات درج می‌شود. Template اصلی
// هرگز تغییر نمی‌کند.
//
// روش کار: xlsx یک ZIP است. برای حفظ کامل Style/Border/Formula/
// Merge و Sheet2 (عدد به حروف)، فقط sheet1.xml و calcChain.xml
// را ویرایش می‌کنیم؛ بقیه اجزا بایت‌به‌بایت از Template کپی
// می‌شوند. ZIP خروجی با روش «stored» (بدون فشرده‌سازی) ساخته
// می‌شود — Excel آن را کاملاً استاندارد می‌پذیرد و به zlib
// نیاز نیست.
// ============================================================
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const zlib = require('node:zlib')
const { execFile } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
// مسیر Template: در dev، این فایل در server/templates است (نسبت به همین فایل: ./templates).
// در بسته Electron هم build همین ساختار را به app/server/templates کپی می‌کند — یک مسیر برای هر دو.
const TEMPLATE_PATH = path.join(__dirname, 'templates', 'work-form.xlsx')

// ---------------- ابزار ZIP (stored / بدون فشرده‌سازی) ----------------

function crc32(buf) {
  let table = crc32._t
  if (!table) {
    table = crc32._t = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

function dosDateTime(d) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((Math.floor(d.getSeconds() / 2)) & 0x1f)
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f)
  return { time, date }
}

function buildStoredZip(entries) {
  // entries: [{ name, data: Buffer }] — همان ترتیب Template حفظ می‌شود
  const chunks = []
  const central = []
  let offset = 0
  const now = dosDateTime(new Date())
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8')
    const crc = crc32(e.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // UTF-8 flag
    local.writeUInt16LE(0, 8) // stored
    local.writeUInt16LE(now.time, 10)
    local.writeUInt16LE(now.date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(e.data.length, 18)
    local.writeUInt32LE(e.data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    chunks.push(local, nameBuf, e.data)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0x0800, 8)
    cd.writeUInt16LE(0, 10)
    cd.writeUInt16LE(now.time, 12)
    cd.writeUInt16LE(now.date, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(e.data.length, 20)
    cd.writeUInt32LE(e.data.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt16LE(0, 30) // extra
    cd.writeUInt16LE(0, 32) // comment
    cd.writeUInt16LE(0, 34) // disk
    cd.writeUInt16LE(0, 36) // internal attrs
    cd.writeUInt32LE(0, 38) // external attrs
    cd.writeUInt32LE(offset, 42)
    central.push(Buffer.concat([cd, nameBuf]))

    offset += 30 + nameBuf.length + e.data.length
  }
  const cdBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cdBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...chunks, cdBuf, eocd])
}

/** خواندن اجزای ZIP از طریق Central Directory — پشتیبانی stored و deflate (zlib هسته node، بدون child process).
 *  خروجی: [{ name, data, order }] به ترتیب Central Directory.
 *  توجه: spawn کردن PowerShell از پردازه‌ای که better-sqlite3 بار دارد روی Node 24
 *  باعث crash تأخیری native می‌شود؛ به همین دلیل استخراج Template کاملاً درون‌پردازه‌ای انجام می‌شود. */
function readZipCentralDirectory(buf) {
  // یافتن End of Central Directory از انتهای فایل
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('ساختار ZIP فایل Template معتبر نیست')
  const count = buf.readUInt16LE(eocd + 10)
  let ptr = buf.readUInt32LE(eocd + 16)
  const entries = []
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error('Central Directory فایل Template نامعتبر است')
    const method = buf.readUInt16LE(ptr + 10)
    const compressedSize = buf.readUInt32LE(ptr + 20)
    const nameLen = buf.readUInt16LE(ptr + 28)
    const extraLen = buf.readUInt16LE(ptr + 30)
    const commentLen = buf.readUInt16LE(ptr + 32)
    const localOffset = buf.readUInt32LE(ptr + 42)
    const name = buf.slice(ptr + 46, ptr + 46 + nameLen).toString('utf8')
    // Local Header: offset + 30 + nameLen(+extraLen محلی که ممکن است با central فرق کند)
    const lhNameLen = buf.readUInt16LE(localOffset + 26)
    const lhExtraLen = buf.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + lhNameLen + lhExtraLen
    const raw = buf.slice(dataStart, dataStart + compressedSize)
    let data
    if (method === 0) data = Buffer.from(raw)
    else if (method === 8) data = zlib.inflateRawSync(raw)
    else throw new Error(`روش فشرده‌سازی پشتیبانی‌نشده (${method}) در جزء ${name} فایل Template`)
    entries.push({ name, data, order: n })
    ptr += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

/** استخراج کامل Template — کاملاً درون‌پردازه‌ای (بدون spawn) */
function extractTemplate() {
  const buf = fs.readFileSync(TEMPLATE_PATH)
  const entries = readZipCentralDirectory(buf)
  if (!entries.some((e) => e.name === 'xl/worksheets/sheet1.xml')) {
    throw new Error('ساختار فایل Template معتبر نیست')
  }
  return entries
}

// ---------------- کمکی‌های XML ----------------

function escXml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function cellRef(col, row) {
  let s = ''
  let c = col
  while (c > 0) {
    const m = (c - 1) % 26
    s = String.fromCharCode(65 + m) + s
    c = Math.floor((c - 1) / 26)
  }
  return s + row
}

/** درج ردیف بازنویسی‌شده در sheetData (جایگزین محدوده from..to) */
function replaceRows(xml, newRowsXml, fromRow, toRow) {
  const re = new RegExp(`<row r="${fromRow}"[^>]*>[\\s\\S]*?</row>`)
  const m = xml.match(re)
  if (!m) throw new Error('ردیف کالا در Template یافت نشد — ساختار Template تغییر کرده است')
  // ردیف‌های from+1..to را هم حذف کن
  let out = xml.replace(re, '\u0000PLACEHOLDER\u0000')
  for (let r = fromRow + 1; r <= toRow; r++) {
    const re2 = new RegExp(`<row r="${r}"[^>]*>[\\s\\S]*?</row>`)
    out = out.replace(re2, '')
  }
  return out.replace('\u0000PLACEHOLDER\u0000', newRowsXml)
}

// ---------------- ساخت ردیف‌ها از روی Contract Template ----------------
// ردیف ۱۱ (کالا) و ردیف ۱۲ (جمع) Template به‌عنوان Contract استفاده می‌شوند:
// ردیف‌های جدید عیناً از XML همان ردیف‌ها ساخته می‌شوند تا Style/Font/Border/
// Height و Number Format بایت‌به‌بایت با Template یکی باشد.

/** استخراج XML یک ردیف از sheetData */
function getRowXml(xml, rowNo) {
  const m = xml.match(new RegExp(`<row r="${rowNo}"[^>]*>[\\s\\S]*?</row>`))
  return m ? m[0] : null
}

/** تغییر شماره ردیف و همه cell refهای یک row XML (فرمول‌ها دست‌نخورده می‌مانند) */
function renumberRowXml(rowXml, toRow) {
  let out = rowXml.replace(/<row r="\d+"/, `<row r="${toRow}"`)
  out = out.replace(/r="([A-Z]+)\d+"/g, (m, col) => `r="${col}${toRow}"`)
  return out
}

/** جایگزینی محتوای یک سلول در row XML با حفظ کامل attrs (s و ...) */
function replaceCellContent(rowXml, ref, innerXml) {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(/>|>[\\s\\S]*?</c>)`)
  const m = rowXml.match(re)
  if (!m) return rowXml
  const attrs = m[1].replace(/\s+t="s"/g, '').replace(/\s+t="str"/g, '')
  if (innerXml == null || innerXml === '') return rowXml.replace(re, () => `<c r="${ref}"${attrs}/>`)
  // محتوای <is> الزامات اتریبیوت t="inlineStr" دارد؛ بدون آن Excel فایل را خراب تشخیص
  // می‌دهد و پیام بازسازی نمایش می‌دهد.
  const typeAttr = innerXml.startsWith('<is>') ? ' t="inlineStr"' : ''
  // جایگزینی با تابع تا $ داخل فرمول‌ها (مثل SUM($J$11:...)) به‌عنوان گروه regex تفسیر نشود
  return rowXml.replace(re, () => `<c r="${ref}"${attrs}${typeAttr}>${innerXml}</c>`)
}

/** تاریخ شمسی ۸ رقمی → فرمت دارای اسلش (مثال: 1404/05/01) */
function formatJalaliDate(v) {
  const s = String(v || '').trim()
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6, 8)}`
  return s // قبلاً فرمت‌دار است — دست نمی‌زنیم
}

/**
 * ساخت ردیف کالا از روی ردیف ۱۱ Template — همه Styleها عیناً از Contract.
 * فرمول‌های J و L متناسب با شماره ردیف جدید بازنویسی می‌شوند.
 */
function buildItemRowFromContract(row11Xml, rowNo, idx, item) {
  let row = renumberRowXml(row11Xml, rowNo)
  const qty = Number(item.quantity) || 0
  const price = Number(item.unit_price) || 0
  const tax = Number(item.tax_amount) || 0
  const name = String(item.product_name || '').slice(0, 500)
  const jVal = qty * price
  row = replaceCellContent(row, `A${rowNo}`, `<v>${idx + 1}</v>`)
  row = replaceCellContent(row, `B${rowNo}`, `<is><t xml:space="preserve">${escXml(name)}</t></is>`)
  row = replaceCellContent(row, `G${rowNo}`, `<v>${qty}</v>`)
  row = replaceCellContent(row, `H${rowNo}`, `<is><t xml:space="preserve">${escXml(String(item.unit || ''))}</t></is>`)
  row = replaceCellContent(row, `I${rowNo}`, `<v>${price}</v>`)
  row = replaceCellContent(row, `J${rowNo}`, `<f>I${rowNo}*G${rowNo}</f><v>${jVal}</v>`)
  row = replaceCellContent(row, `K${rowNo}`, `<v>${tax}</v>`)
  row = replaceCellContent(row, `L${rowNo}`, `<f>J${rowNo}+K${rowNo}</f><v>${jVal + tax}</v>`)
  return row
}

/**
 * ساخت ردیف جمع از روی ردیف ۱۲ Template — فرمول‌های SUM با آخرین ردیف کالا
 * به‌روزرسانی و مقدار cache محاسبه‌شده درج می‌شود.
 */
function buildTotalRowFromContract(row12Xml, rowNo, itemCount, sums) {
  let row = renumberRowXml(row12Xml, rowNo)
  const last = 10 + itemCount
  row = replaceCellContent(row, `J${rowNo}`, `<f>SUM($J$11:J${last})</f><v>${sums.j}</v>`)
  row = replaceCellContent(row, `K${rowNo}`, `<f>SUM($K$11:K${last})</f><v>${sums.k}</v>`)
  row = replaceCellContent(row, `L${rowNo}`, `<f>SUM($L$11:L${last})</f><v>${sums.l}</v>`)
  return row
}

/** شیفت یک row XML به پایین به اندازه delta */
function shiftRowXml(rowXml, delta) {
  const m = rowXml.match(/<row r="(\d+)"/)
  if (!m) return rowXml
  return renumberRowXml(rowXml, Number(m[1]) + delta)
}

/** شیفت mergeهایی که از ردیف minRow به بعد هستند (درج ردیف = Excel Insert) */
function shiftMerges(xml, minRow, delta) {
  return xml.replace(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g, (m, c1, r1, c2, r2) => {
    const a = Number(r1) >= minRow ? Number(r1) + delta : Number(r1)
    const b = Number(r2) >= minRow ? Number(r2) + delta : Number(r2)
    return `<mergeCell ref="${c1}${a}:${c2}${b}"/>`
  })
}

/** شیفت anchor اشیاء drawing (شماره ردیف 0-based) */
function shiftDrawingRows(drawingXml, fromRow0, delta) {
  return drawingXml.replace(
    new RegExp(`<xdr:row>${fromRow0}</xdr:row>`, 'g'),
    `<xdr:row>${fromRow0 + delta}</xdr:row>`
  )
}

/**
 * تنظیم مقدار سلول ساده در ردیف مشخص — فقط سلول‌های مقداری مشخصات
 * فروشنده/خریدار را بازنویسی می‌کند؛ Style حفظ می‌شود.
 * مقادیر متنی باید inlineStr باشند وگرنه Excel آن‌ها را عددی تفسیر می‌کند.
 */
function setCellValues(xml, updates) {
  // updates: [{ ref: 'D3', value: '...', text: true|false }]
  for (const u of updates) {
    const re = new RegExp(`<c r="${u.ref}"([^>]*?)(/>|>[\\s\\S]*?</c>)`)
    const m = xml.match(re)
    if (!m) continue
    let attrs = m[1]
    if (u.value === '' || u.value == null) {
      // خالی کردن مقدار — سلول و style باقی می‌ماند (نمونه‌های قدیمی Template هم پاک می‌شوند)
      xml = xml.replace(re, () => `<c r="${u.ref}"${attrs}/>`)
      continue
    }
    // حذف t="s" (shared) — مقدار inline می‌شود
    attrs = attrs.replace(/\s+t="s"/g, '').replace(/\s+t="str"/g, '')
    if (u.text) {
      // جایگزینی با تابع تا کاراکترهای $ و ... در متن کاربر به‌عنوان گروه regex تفسیر نشوند
      xml = xml.replace(
        re,
        () => `<c r="${u.ref}"${attrs} t="inlineStr"><is><t xml:space="preserve">${escXml(String(u.value))}</t></is></c>`
      )
    } else {
      xml = xml.replace(re, () => `<c r="${u.ref}"${attrs}><v>${Number(u.value)}</v></c>`)
    }
  }
  return xml
}

// ---------------- سازگاری ردیف‌ها با Sheet2 (عدد به حروف) ----------------

function fixSheet2Refs(sheet2Xml, totalRow) {
  // جمع کل از ستون L ردیف جمع به Sheet2!H1 می‌رود؛ اگر تعداد کالاها بیش از یک باشد،
  // ردیف جمع جابجا شده و reference باید به‌روزرسانی شود (Template اصلی: ردیف 12)
  const oldRef = "'فرم خام'!L12"
  if (totalRow === 12) return sheet2Xml // ساختار Template بدون تغییر مانده است
  const newRef = `'فرم خام'!L${totalRow}`
  return sheet2Xml.split(oldRef).join(newRef)
}

// ---------------- Export اصلی ----------------

async function exportInvoiceToExcel({ invoice, outPath }) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    const e = new Error('فایل Template اکسل یافت نشد: ' + TEMPLATE_PATH)
    e.status = 500
    throw e
  }
  const entries = extractTemplate()
  const byName = new Map(entries.map((e) => [e.name, e.data]))

  let sheet1 = byName.get('xl/worksheets/sheet1.xml').toString('utf8')
  let sheet2 = byName.get('xl/worksheets/sheet2.xml').toString('utf8')
  const items = (invoice.items || []).filter((it) => it.product_name || Number(it.quantity))
  if (!items.length) {
    const e = new Error('فاکتور برای خروجی اکسل حداقل یک قلم دارد باید')
    e.status = 400
    throw e
  }

  const itemCount = items.length
  const delta = itemCount - 1 // تعداد ردیف‌های درج‌شده بین اولین کالا و ردیف جمع
  const totalRow = 11 + itemCount // در Template اصلی: 12

  // ---- Contract ردیف‌ها از خود Template استخراج می‌شود ----
  const row11Xml = getRowXml(sheet1, 11)
  const row12Xml = getRowXml(sheet1, 12)
  if (!row11Xml || !row12Xml) {
    const e = new Error('ردیف کالا یا ردیف جمع در Template یافت نشد — ساختار Template تغییر کرده است')
    e.status = 500
    throw e
  }

  // ---- مقادیر cache فرمول‌ها ----
  const sums = { j: 0, k: 0, l: 0 }
  for (const it of items) {
    const q = Number(it.quantity) || 0
    const p = Number(it.unit_price) || 0
    const t = Number(it.tax_amount) || 0
    sums.j += q * p
    sums.k += t
    sums.l += q * p + t
  }

  // ---- ۱) ردیف‌های کالا (از Contract ردیف ۱۱) + ردیف جمع (از Contract ردیف ۱۲) ----
  const itemRowsXml = items.map((it, i) => buildItemRowFromContract(row11Xml, 11 + i, i, it)).join('')
  const totalRowXml = buildTotalRowFromContract(row12Xml, totalRow, itemCount, sums)

  // ---- ۲) شیفت ردیف‌های پایینی (۱۳ به بعد: مبلغ به حروف/امضا) به اندازه delta — مثل Insert Row اکسل ----
  const dimMatch = sheet1.match(/<dimension ref="A1:L(\d+)"\/>/)
  let maxRow = 15
  if (dimMatch) {
    const n = Number(dimMatch[1])
    if (Number.isFinite(n) && n >= 12) maxRow = n
  }
  const shiftedRows = []
  {
    const reRow = /<row r="(\d+)"[^>]*>[\s\S]*?<\/row>/g
    const found = []
    let mm
    while ((mm = reRow.exec(sheet1)) !== null) {
      if (Number(mm[1]) >= 13) found.push(mm[0])
    }
    for (const rxml of found) sheet1 = sheet1.replace(rxml, '')
    for (const rxml of found) shiftedRows.push(shiftRowXml(rxml, delta))
  }

  // ---- ۳) جایگزینی ردیف‌های ۱۱ و ۱۲: کالاها + ردیف جمع + ردیف‌های شیفت‌شده ----
  const newRows = itemRowsXml + totalRowXml + shiftedRows.join('')
  sheet1 = replaceRows(sheet1, newRows, 11, 12)

  // ۲) مشخصات فروشنده (فاکتور خرید) یا شرکت (فاکتور فروش) — D3/I3/L3 و C4/I4/L4
  const seller = invoice.seller || {}
  const buyer = invoice.buyer || {}
  const settings = invoice.settings || {}
  const isBuy = invoice.invoice_type === 'buy'
  // در فاکتور خرید: فروشنده = طرف حساب؛ در فاکتور فروش: فروشنده = شرکت (تنظیمات)
  const sellerInfo = isBuy
    ? {
        name: seller.company_name || [seller.first_name, seller.last_name].filter(Boolean).join(' '),
        national: seller.company_national_id || seller.national_code || '',
        economic: seller.company_economic_code || '',
        address: seller.address || '',
        postal: seller.postal_code || '',
        phone: seller.phone || seller.mobile || '',
      }
    : {
        name: settings.company_name || '',
        national: '', // اطلاعات شرکت: کد اقتصادی در تنظیمات موجود است
        economic: settings.company_economic_code || '',
        address: settings.company_address || '',
        postal: '',
        phone: settings.company_phone || '',
      }
  const buyerInfo = isBuy
    ? {
        name: settings.company_name || '',
        national: '',
        economic: settings.company_economic_code || '',
        address: settings.company_address || '',
        postal: '',
        phone: settings.company_phone || '',
      }
    : {
        name: buyer.company_name || [buyer.first_name, buyer.last_name].filter(Boolean).join(' '),
        national: buyer.company_national_id || buyer.national_code || '',
        economic: buyer.company_economic_code || '',
        address: buyer.address || '',
        postal: buyer.postal_code || '',
        phone: buyer.phone || buyer.mobile || '',
      }

  // شناسه‌های ملی/پستی/تلفن به‌صورت متن تا صفر ابتدایی حفظ شود
  sheet1 = setCellValues(sheet1, [
    { ref: 'D3', value: sellerInfo.name, text: true },
    { ref: 'I3', value: sellerInfo.national, text: true },
    { ref: 'L3', value: sellerInfo.economic, text: true },
    { ref: 'C4', value: sellerInfo.address, text: true },
    { ref: 'I4', value: sellerInfo.postal, text: true },
    { ref: 'L4', value: sellerInfo.phone, text: true },
    { ref: 'D6', value: buyerInfo.name, text: true },
    { ref: 'I6', value: buyerInfo.national, text: true },
    { ref: 'L6', value: buyerInfo.economic, text: true },
    { ref: 'C7', value: buyerInfo.address, text: true },
    { ref: 'I7', value: buyerInfo.postal, text: true },
    { ref: 'L7', value: buyerInfo.phone, text: true },
    // L1 = سلول مقدار «تاریخ:» (برچسب در K1 است) — با فرمت تاریخ شمسی دارای اسلش (1404/05/01)
    { ref: 'L1', value: formatJalaliDate(invoice.invoice_date), text: true },
  ])

  // ۳) Sheet2 — reference جمع کل را به ردیف جمع جدید ببر
  sheet2 = fixSheet2Refs(sheet2, totalRow)

  // ۳-۲) mergeها: شیفت mergeهای ردیف ۱۲ به بعد + merge B:F برای هر ردیف کالای جدید
  sheet1 = shiftMerges(sheet1, 12, delta)
  {
    const extraMerges = items
      .map((_, i) => `<mergeCell ref="B${11 + i}:F${11 + i}"/>`)
      .slice(1) // B11:F11 در Template موجود است
      .join('')
    if (extraMerges) {
      sheet1 = sheet1.replace(/<mergeCell ref="B11:F11"\/>/, `<mergeCell ref="B11:F11"/>${extraMerges}`)
      const mc = sheet1.match(/<mergeCells count="(\d+)">/)
      if (mc) sheet1 = sheet1.replace(/<mergeCells count="\d+">/, `<mergeCells count="${Number(mc[1]) + itemCount - 1}">`)
    }
  }

  // ۳-۳) dimension به‌روزرسانی شود
  sheet1 = sheet1.replace(/<dimension ref="A1:L\d+"\/>/, `<dimension ref="A1:L${maxRow + delta}"/>`)

  // ۴) calcChain — فرمول‌ها تغییر کرده‌اند؛ حذف آن امن است (Excel خودش می‌سازد)
  const outEntries = []
  for (const e of entries) {
    if (e.name === 'xl/calcChain.xml') continue
    outEntries.push({ name: e.name, data: e.data })
  }
  const idx1 = outEntries.findIndex((e) => e.name === 'xl/worksheets/sheet1.xml')
  if (idx1 >= 0) outEntries[idx1] = { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet1, 'utf8') }
  const idx2 = outEntries.findIndex((e) => e.name === 'xl/worksheets/sheet2.xml')
  if (idx2 >= 0) outEntries[idx2] = { name: 'xl/worksheets/sheet2.xml', data: Buffer.from(sheet2, 'utf8') }
  // حذف ارجاع calcChain از workbook.rels و [Content_Types]
  for (let i = 0; i < outEntries.length; i++) {
    if (outEntries[i].name === 'xl/_rels/workbook.xml.rels') {
      let rels = outEntries[i].data.toString('utf8')
      rels = rels.replace(/<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/, '')
      outEntries[i] = { name: outEntries[i].name, data: Buffer.from(rels, 'utf8') }
    }
    if (outEntries[i].name === '[Content_Types].xml') {
      let ct = outEntries[i].data.toString('utf8')
      ct = ct.replace(/<Override[^>]*calcChain[^>]*\/>/, '')
      outEntries[i] = { name: outEntries[i].name, data: Buffer.from(ct, 'utf8') }
    }
  }

  // ۵) drawing — اشیاء لنگرشده در ردیف ۱۲ (0-based 11) همراه ردیف جمع شیفت می‌شوند
  // ۶) fullCalcOnLoad — اکسل هنگام باز کردن، همه فرمول‌ها (هر دو شیت) را بازمحاسبه می‌کند
  for (let i = 0; i < outEntries.length; i++) {
    if (delta > 0 && outEntries[i].name === 'xl/drawings/drawing1.xml') {
      const dx = outEntries[i].data.toString('utf8')
      outEntries[i] = { name: outEntries[i].name, data: Buffer.from(shiftDrawingRows(dx, 11, delta), 'utf8') }
    }
    if (outEntries[i].name === 'xl/workbook.xml') {
      let wb = outEntries[i].data.toString('utf8')
      if (/<calcPr[^>]*\/>/.test(wb)) {
        wb = wb.replace(/<calcPr([^>]*?)\/>/, (m2, attrs) => `<calcPr${attrs.replace(/\s+fullCalcOnLoad="[^"]*"/g, '')} fullCalcOnLoad="1"/>`)
      } else {
        wb = wb.replace(/<\/workbook>/, '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>')
      }
      outEntries[i] = { name: outEntries[i].name, data: Buffer.from(wb, 'utf8') }
    }
  }

  const zip = buildStoredZip(outEntries)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, zip)
  return outPath
}

/** باز کردن فایل با برنامه‌ی پیش‌فرض سیستم‌عامل (بدون shell injection) */
function openWithDefaultApp(filePath) {
  if (process.platform === 'win32') {
    // execFile آرگومان‌ها را quote می‌کند؛ عنوان خالی اول برای start الزامی است
    return new Promise((resolve, reject) => {
      execFile('cmd.exe', ['/d', '/s', '/c', 'start', '', filePath], (err) => {
        if (err) reject(new Error('باز کردن فایل ناموفق بود: ' + err.message))
        else resolve()
      })
    })
  }
  if (process.platform === 'darwin') {
    return new Promise((resolve, reject) => {
      execFile('open', [filePath], (err) => (err ? reject(err) : resolve()))
    })
  }
  return new Promise((resolve, reject) => {
    execFile('xdg-open', [filePath], (err) => (err ? reject(err) : resolve()))
  })
}

module.exports = { exportInvoiceToExcel, openWithDefaultApp, readZipCentralDirectory, buildStoredZip, TEMPLATE_PATH }
