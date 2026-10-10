// ---------- ارقام و قالب‌بندی ----------

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** تبدیل ارقام انگلیسی به فارسی */
export function faNum(input) {
  return String(input ?? '').replace(/\d/g, (d) => FA_DIGITS[+d])
}

/** تبدیل ارقام فارسی/عربی به انگلیسی */
export function enNum(input) {
  return String(input ?? '')
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}

/** مبلغ با جداکننده‌ی هزارگان و ارقام فارسی */
export function money(n) {
  const num = Number(n) || 0
  const rounded = Math.round(num)
  return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(rounded)
}

export const MONTHS_FA = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]

/** نام ماه شمسی */
export function monthName(m) {
  return MONTHS_FA[(Number(m) || 1) - 1] || ''
}

/** نام کامل شخص: نام شرکت یا نام + نام خانوادگی */
export function fullName(p) {
  if (!p) return ''
  if (p.company_name) return p.company_name
  return [p.first_name, p.last_name].filter(Boolean).join(' ')
}

export function initials(p) {
  if (!p) return '؟'
  if (p.company_name) return p.company_name.trim().charAt(0)
  return (p.first_name || '').trim().charAt(0) || '؟'
}

// ---------- DOM ----------

/** ساخت المان: el('div', {class:'x', onclick: fn}, [children]) */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue
    if (k === 'class') node.className = v
    else if (k === 'html') node.innerHTML = v
    else if (k === 'dataset') Object.assign(node.dataset, v)
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v)
    else if (k === 'value') node.value = v
    else if (k === 'checked') node.checked = v
    else if (k === 'disabled') node.disabled = true
    else node.setAttribute(k, v)
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue
    node.append(c.nodeType ? c : document.createTextNode(String(c)))
  }
  return node
}

/** فرمت تاریخ شمسی: تبدیل YYYYMMDD به YYYY/MM/DD با ارقام فارسی */
export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const s = String(dateStr).replace(/\//g, '')
  if (s.length === 8) {
    return faNum(s.slice(0, 4) + '/' + s.slice(4, 6) + '/' + s.slice(6, 8))
  }
  // اگر قبلاً با / باشد
  return faNum(dateStr)
}

export function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function debounce(fn, ms) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}

export function emptyVal(v) {
  return v == null || String(v).trim() === ''
}

// ---------- آیکون‌ها (SVG) ----------

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  card: '<rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/><path d="M7 15h4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
  trendingUp: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  trendingDown: '<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15.36-6.36L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.36 6.36L3 16"/><path d="M3 21v-5h5"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  fileDown: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6M9 15l3 3 3-3"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
}

export function icon(name, size = 19) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="${size}" height="${size}">${ICONS[name] || ''}</svg>`
}
