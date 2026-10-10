import { api } from '../api.js'
import { el, faNum, esc, fullName, icon, money, formatDate } from '../utils.js'
import { toast, openModal, emptyState, skeletonRows } from '../ui.js'
import { jdateInput } from '../jdate.js'
import { printDocument } from '../print.js'
import { openInvoiceForm } from '../invoice-form.js'
import { openPaymentForm } from '../payment-form.js'
import { showContextMenu } from '../contextmenu.js'
import { openPersonViewModal, personFormModal } from '../person-form.js'

// ============================================================ انواع گزارش (ترتیب: تفصیلی ابتدا)
const KINDS = {
  detail: { label: 'گزارش تفصیلی اشخاص', types: [] },
  persons: { label: 'گزارش کلی اشخاص (مانده حساب)', types: [] },
  costcenters: { label: 'گزارش مراکز هزینه', types: [] },
}

// ============================================================ بارگذاری کامل اشخاص
async function loadAllPeople() {
  const all = []
  let page = 1
  for (;;) {
    const res = await api.get(`/api/people?page=${page}&pageSize=200`)
    all.push(...(res.data || []))
    if (!res.data || !res.data.length || all.length >= res.total) break
    page++
  }
  return all
}

// ============================================================ فیلتر شخص (کشویی با جستجو + امکان برداشتن)
function personDropdown({ value = 0, onSelect, hideAll = false }) {
  let people = []
  let current = value
  let open = false

  const wrap = el('div', { class: 'person-dd-wrap' })
  const label = el('span', {}, current ? '…' : 'انتخاب کنید')
  const clearBtn = el('button', { class: 'icon-btn dd-clear', title: 'حذف فیلتر شخص', style: current ? '' : 'display:none' }, el('span', { html: icon('x', 14) }))
  const btn = el('button', { class: 'btn btn-ghost person-dd-btn', type: 'button' }, [
    el('span', { html: icon('user', 16) }),
    label,
    clearBtn,
    el('span', { html: icon('chevronDown', 15) }),
  ])
  const search = el('input', { class: 'input dd-search', placeholder: 'جستجو با نام یا شناسه…', autocomplete: 'off' })
  const list = el('div', { class: 'person-dd-list' })
  const panel = el('div', { class: 'person-dd-panel' }, [search, list])
  wrap.append(btn, panel)

  const docClose = (e) => { if (open && !wrap.contains(e.target)) setOpen(false) }
  document.addEventListener('mousedown', docClose)

  function setOpen(v) {
    open = v
    panel.classList.toggle('open', v)
    if (v) { search.value = ''; renderList(); requestAnimationFrame(() => search.focus()) }
  }

  function matches(p, q) {
    if (!q) return true
    const hay = [p.first_name, p.last_name, p.company_name, p.national_code, p.mobile, String(p.id)].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(q)
  }

  function renderList() {
    const q = search.value.trim().toLowerCase()
    list.innerHTML = ''
    if (!hideAll) {
      const resetItem = el('div', { class: 'dd-item' + (current === 0 ? ' active' : '') }, [
      el('div', { class: 'dd-item-main' }, [el('strong', {}, 'همه اشخاص'), el('span', {}, 'نمایش بدون فیلتر شخص')]),
      ])
      resetItem.addEventListener('click', () => {
      current = 0; label.textContent = 'انتخاب کنید'; clearBtn.style.display = 'none'; setOpen(false); onSelect(0)
      })
      list.append(resetItem)
    }

    const filtered = people.filter((p) => matches(p, q))
    const shown = filtered.slice(0, 120)
    if (!shown.length) { list.append(el('div', { class: 'dd-empty' }, 'موردی یافت نشد')); return }
    for (const p of shown) {
      const item = el('div', { class: 'dd-item' + (p.id === current ? ' active' : '') }, [
        el('div', { class: 'dd-item-main' }, [
          el('strong', {}, esc(fullName(p))),
          el('span', {}, `شناسه ${faNum(p.id)}${p.national_code ? ` — ${faNum(p.national_code)}` : ''}`),
        ]),
      ])
      item.addEventListener('click', () => {
        current = p.id; label.textContent = fullName(p); clearBtn.style.display = ''; setOpen(false); onSelect(p.id)
      })
      list.append(item)
    }
    if (filtered.length > shown.length)
      list.append(el('div', { class: 'dd-empty' }, `${faNum(filtered.length - shown.length)} مورد دیگر — برای دیدن، جستجو کنید`))
  }

  search.addEventListener('input', renderList)
  btn.addEventListener('click', (e) => {
    if (clearBtn.contains(e.target)) { current = 0; label.textContent = 'انتخاب کنید'; clearBtn.style.display = 'none'; onSelect(0); return }
    setOpen(!open)
  })

  function setPeople(all) {
    people = all
    if (current) { const p = all.find((x) => x.id === current); if (p) label.textContent = fullName(p) }
  }

  return { el: wrap, setPeople, get value() { return current }, reset() { current = 0; label.textContent = 'انتخاب کنید'; clearBtn.style.display = 'none' } }
}

// ============================================================ فیلتر مرکز هزینه (کشویی با جستجو)
function costCenterDropdown({ onSelect }) {
  let centers = []
  let current = ''
  let open = false

  const wrap = el('div', { class: 'person-dd-wrap' })
  const label = el('span', {}, 'همه مراکز هزینه')
  const clearBtn = el('button', { class: 'icon-btn dd-clear', title: 'حذف فیلتر', style: 'display:none' }, el('span', { html: icon('x', 14) }))
  const btn = el('button', { class: 'btn btn-ghost person-dd-btn', type: 'button' }, [
    el('span', { html: icon('folder', 16) }),
    label,
    clearBtn,
    el('span', { html: icon('chevronDown', 15) }),
  ])
  const search = el('input', { class: 'input dd-search', placeholder: 'جستجوی مرکز هزینه…', autocomplete: 'off' })
  const list = el('div', { class: 'person-dd-list' })
  const panel = el('div', { class: 'person-dd-panel' }, [search, list])
  wrap.append(btn, panel)

  const docClose = (e) => { if (open && !wrap.contains(e.target)) setOpen(false) }
  document.addEventListener('mousedown', docClose)

  function setOpen(v) {
    open = v; panel.classList.toggle('open', v)
    if (v) { search.value = ''; renderList(); requestAnimationFrame(() => search.focus()) }
  }

  function renderList() {
    const q = search.value.trim().toLowerCase()
    list.innerHTML = ''
    const resetItem = el('div', { class: 'dd-item' + (current === '' ? ' active' : '') }, [
      el('div', { class: 'dd-item-main' }, [el('strong', {}, 'همه مراکز هزینه'), el('span', {}, 'نمایش بدون فیلتر')]),
    ])
    resetItem.addEventListener('click', () => { current = ''; label.textContent = 'همه مراکز هزینه'; clearBtn.style.display = 'none'; setOpen(false); onSelect(0) })
    list.append(resetItem)

    const filtered = centers.filter((c) => {
      if (!q) return true
      return [c.name, c.code, String(c.id)].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
    if (!filtered.length) { list.append(el('div', { class: 'dd-empty' }, 'مرکزی یافت نشد')); return }
    for (const c of filtered) {
      const item = el('div', { class: 'dd-item' + (String(c.id) === current ? ' active' : '') }, [
        el('div', { class: 'dd-item-main' }, [
          el('strong', {}, esc(c.name)),
          el('span', {}, c.code ? `کد: ${esc(c.code)}` : `شناسه: ${faNum(c.id)}`),
        ]),
      ])
      item.addEventListener('click', () => { current = String(c.id); label.textContent = c.name; clearBtn.style.display = ''; setOpen(false); onSelect(c.id) })
      list.append(item)
    }
  }

  search.addEventListener('input', renderList)
  btn.addEventListener('click', (e) => {
    if (clearBtn.contains(e.target)) { current = ''; label.textContent = 'همه مراکز هزینه'; clearBtn.style.display = 'none'; onSelect(0); return }
    setOpen(!open)
  })

  function setCenters(arr) { centers = arr }

  return { el: wrap, setCenters, get value() { return current }, reset() { current = ''; label.textContent = 'همه مراکز هزینه'; clearBtn.style.display = 'none' } }
}

// ============================================================ کمکی‌ها
function fetchLedger(params) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) { if (v) p.set(k, String(v)) }
  return api.get(`/api/ledger?${p}`)
}

export function balanceBadge(bal) {
  if (!bal) return el('span', { style: 'color:var(--success);font-weight:700' }, 'تسویه')
  if (bal > 0) return el('span', { style: 'color:var(--danger);font-weight:700' }, `${money(bal)} بدهکار`)
  return el('span', { style: 'color:var(--success);font-weight:700' }, `${money(-bal)} بستانکار`)
}

function balanceText(bal) {
  if (!bal) return 'تسویه'
  return bal > 0 ? `${money(bal)} بدهکار` : `${money(-bal)} بستانکار`
}

function typeBadge(label, color) {
  return el('span', { class: `badge badge-${color}` }, [el('span', { class: 'dot' }), label])
}

function kindBadge(r) {
  if (r.kind === 'invoice') return r.type === 'sell' ? typeBadge('فاکتور فروش', 'green') : typeBadge('فاکتور خرید', 'blue')
  if (r.kind === 'third_party') return typeBadge('پرداخت شخص ثالث', 'orange')
  return r.type === 'receive' ? typeBadge('دریافت', 'green') : typeBadge('پرداخت', 'red')
}

function isCredit(r) {
  if (r.kind === 'third_party') {
    // پرداخت شخص ثالث بابت فاکتور خرید → کاهش بستانکاری → بدهکار
    // پرداخت شخص ثالث بابت فاکتور فروش → باید از سرور فیلتر شود (نباید نمایش داده شود)
    return r.type === 'buy'
  }
  return r.type === 'buy' || r.type === 'receive'
}

// ============================================================ گزارش تفصیلی اشخاص (جدید)
function mountDetailReport(container, opts = {}) {
  const locked = !!opts.presetPersonId
  const state = { personId: opts.presetPersonId || 0, from: '', to: '', data: [], opening: 0, finalBalance: 0, loading: false, settings: {} }
  let personObj = null
  let companyName = ''

  const personDD = personDropdown({ hideAll: true, onSelect: (id) => { state.personId = id; if (id) load(); else { state.data = []; render(); } } })
  if (locked) personDD.el.style.display = 'none'
  const fromInput = jdateInput({ placeholder: 'از تاریخ' })
  const toInput = jdateInput({ placeholder: 'تا تاریخ' })
  const tableWrap = el('div', { class: 'table-wrap' })

  const toolbar = el('div', { class: 'toolbar', style: 'flex-wrap:wrap;gap:10px' }, [
    personDD.el,
    el('div', { class: 'search-box', style: 'max-width:210px' }, [el('span', { html: icon('calendar', 18) }), fromInput.el]),
    el('div', { class: 'search-box', style: 'max-width:210px' }, [el('span', { html: icon('calendar', 18) }), toInput.el]),
    el('button', { class: 'btn btn-primary', onclick: applyDate }, [el('span', { html: icon('search', 16) }), 'نمایش گزارش']),
    el('div', { class: 'toolbar-spacer' }),
    el('button', { class: 'btn btn-ghost', onclick: doPrint }, [el('span', { html: icon('printer', 16) }), 'چاپ گزارش']),
    el('button', { class: 'btn btn-ghost', onclick: exportExcel }, [el('span', { html: icon('fileDown', 16) }), 'خروجی اکسل']),
  ])

  container.innerHTML = ''
  container.append(toolbar, tableWrap)

  function applyDate() {
    state.from = fromInput.getValue().trim()
    state.to = toInput.getValue().trim()
    if (state.personId) load()
  }

  async function load() {
    if (!state.personId) { personObj = null; return }
    state.loading = true; render()
    try {
      const [res, p] = await Promise.all([
        fetchLedger({ kind: 'all', from: state.from, to: state.to, person_id: state.personId }),
        api.get(`/api/people/${state.personId}`).catch(() => null),
      ])
      state.data = res.data || []
      state.opening = res.openingBalance || 0
      state.finalBalance = res.finalBalance || 0
      personObj = p
    } catch (err) { toast(err.message, 'error'); state.data = [] }
    finally { state.loading = false; render() }
  }

  // توصیف ردیف‌ها مطابق الگوی جدید درخواست کاربر
  // فاکتور: (نوع فاکتور خرید/فروش)(شناسه فاکتور)- بابت (شرح کالا)-(شماره فاکتور)-(توضیحات فاکتور)
  // تراکنش: (نوع سند پرداخت/دریافت/شخص ثالث)(شناسه سند)-(نحوه تراکنش)-(شماره فاکتور)-(توضیحات تراکنش)
  function buildDescription(r) {
    const parts = []
    if (r.kind === 'invoice') {
      parts.push(`${esc(r.label)} (${faNum(r.id)})`, `بابت ${esc(r.items_summary || '—')}`)
      if (r.number) parts.push(`شماره ${esc(r.number)}`)
    } else {
      const docType = r.kind === 'third_party' ? 'پرداخت شخص ثالث' : r.type === 'receive' ? 'سند دریافت' : 'سند پرداخت'
      parts.push(`${docType} (${faNum(r.id)})`, esc(r.number || 'نقدی'))
      if (r.invoice_number) parts.push(`فاکتور ${esc(r.invoice_number)}`)
    }
    if (r.notes) parts.push(esc(String(r.notes)))
    return parts.join(' - ')
  }

  function render() {
    if (state.loading) {
      tableWrap.innerHTML = ''
      tableWrap.append(el('table', { class: 'data' }, [el('tbody', {}, skeletonRows(6))]))
      return
    }
    if (!state.personId) {
      tableWrap.innerHTML = ''
      tableWrap.append(emptyState({ icon: 'user', title: 'یک شخص را انتخاب کنید', sub: 'برای مشاهده گزارش تفصیلی، ابتدا شخص مورد نظر را از لیست بالا انتخاب کنید.' }))
      return
    }
    const hasOpening = !!(state.from && state.opening)
    if (!state.data.length && !hasOpening) {
      tableWrap.innerHTML = ''
      tableWrap.append(emptyState({ icon: 'doc', title: 'رکوردی یافت نشد', sub: 'برای این شخص در بازه انتخابی تراکنشی ثبت نشده است.' }))
      return
    }

    // مرتب‌سازی صعودی بر اساس تاریخ (برای محاسبه مانده)
    const sorted = [...state.data].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))

    // محاسبه مانده هر ردیف (صعودی)
    let runningDebit = 0, runningCredit = 0
    if (state.from && state.opening) {
      if (state.opening > 0) runningCredit = state.opening
      else runningDebit = -state.opening
    }
    const rows = sorted.map((r, i) => {
      if (isCredit(r)) runningCredit += Number(r.amount) || 0
      else runningDebit += Number(r.amount) || 0
      const net = runningDebit - runningCredit
      return { ...r, _idx: i, _debit: isCredit(r) ? 0 : Number(r.amount) || 0, _credit: isCredit(r) ? Number(r.amount) || 0 : 0, _net: net }
    })
    // نمایش صعودی (قدیمی‌ترین ابتدا)
    const displayRows = rows

    tableWrap.innerHTML = ''
    // هدر اطلاعات شخص
    if (personObj) {
      const info = el('div', { class: 'person-info-header', style: 'background:var(--bg-2);border:1px solid var(--border);border-radius:8px;padding:14px 18px;margin-bottom:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;font-size:13px' })
      const fields = [
        ['شناسه', faNum(personObj.id || '')],
        ['نام', esc(fullName(personObj))],
        ['کد ملی', personObj.national_code ? faNum(personObj.national_code) : '—'],
        ['شرکت', personObj.company_name ? esc(personObj.company_name) : '—'],
        ['تلفن', personObj.phone ? esc(personObj.phone) : '—'],
        ['موبایل', personObj.mobile ? faNum(personObj.mobile) : '—'],
        ['آدرس', personObj.address ? esc(personObj.address) : '—'],
        ['کدپستی', personObj.postal_code ? faNum(personObj.postal_code) : '—'],
      ]
      for (const [k, v] of fields) info.append(el('div', {}, [el('strong', {}, `${k}: `), v]))
      tableWrap.append(info)
    }
    const table = el('table', { class: 'data detail-report-table' })
    const heads = ['ردیف', 'تاریخ', 'شرح', 'مقدار', 'قیمت', 'بدهکار', 'بستانکار', 'تشخیص', 'مانده']
    table.append(el('thead', {}, [el('tr', {}, heads.map((h, i) => el('th', { class: i !== 2 ? 'num' : '' }, h)))]))
    const tb = el('tbody', {})

    let rowNum = 0

    // ردیف مانده ابتدای بازه (در ابتدای لیست)
    if (hasOpening) {
      rowNum++
      const openDetect = state.opening > 0 ? 'بستانکار' : 'بدهکار'
      const openColor = state.opening > 0 ? 'var(--success)' : 'var(--danger)'
      const openDebit = state.opening > 0 ? 0 : Math.abs(state.opening)
      const openCredit = state.opening > 0 ? Math.abs(state.opening) : 0
      tb.append(el('tr', { style: 'font-weight:600;background:var(--bg-2)' }, [
        el('td', { class: 'num' }, faNum(rowNum)),
        el('td', { class: 'num' }, '—'),
        el('td', {}, 'مانده ابتدای بازه'),
        el('td', {}, ''),
        el('td', {}, ''),
        el('td', { class: 'num' }, money(openDebit)),
        el('td', { class: 'num' }, money(openCredit)),
        el('td', { class: 'num', style: `color:${openColor};font-weight:600` }, openDetect),
        el('td', { class: 'num', style: 'font-weight:700' }, money(Math.abs(state.opening))),
      ]))
    }

    for (const r of displayRows) {
      rowNum++
      const desc = buildDescription(r)
      const detectText = r._net > 0 ? 'بدهکار' : r._net < 0 ? 'بستانکار' : 'بی حساب'
      const detectColor = r._net > 0 ? 'var(--danger)' : r._net < 0 ? 'var(--success)' : 'var(--text-2)'
      const tr = el('tr', {}, [
        el('td', { class: 'num' }, faNum(rowNum)),
        el('td', { class: 'num' }, formatDate(r.date)),
        el('td', { html: desc }),
        el('td', { class: 'num' }, r.kind === 'invoice' ? `${faNum(r.qty || 0)} ${esc(r.qty_unit || 'عدد')}` : '—'),
        el('td', { class: 'num', style: 'font-weight:600' }, r.kind === 'invoice' ? money(r.amount) : '—'),
        el('td', { class: 'num', style: 'font-weight:600' }, money(r._debit)),
        el('td', { class: 'num', style: 'font-weight:600' }, money(r._credit)),
        el('td', { class: 'num', style: `color:${detectColor};font-weight:600` }, detectText),
        el('td', { class: 'num', style: 'font-weight:700' }, money(Math.abs(r._net))),
      ])
      tr.addEventListener('dblclick', () => {
        if (r.kind === 'invoice') openInvoiceForm({ id: r.id, onSaved: load })
        else openPaymentForm({ id: r.id, onSaved: load })
      })
      tb.append(tr)
    }

    // ردیف جمع کل (شامل مانده ابتدای بازه)
    let totalDebit = rows.reduce((s, r) => s + r._debit, 0)
    let totalCredit = rows.reduce((s, r) => s + r._credit, 0)
    if (hasOpening) {
      if (state.opening > 0) totalCredit += Math.abs(state.opening)
      else totalDebit += Math.abs(state.opening)
    }
    const finalNet = totalDebit - totalCredit
    const finalDetect = finalNet > 0 ? 'بدهکار' : finalNet < 0 ? 'بستانکار' : 'بی حساب'
    const finalColor = finalNet > 0 ? 'var(--danger)' : finalNet < 0 ? 'var(--success)' : 'var(--text-2)'
    tb.append(el('tr', { style: 'background:var(--bg-2);font-weight:700;border-top:2px solid var(--border)' }, [
      el('td', { colspan: 2 }, `تعدیل: ${faNum(rows.length)}`),
      el('td', {}, ''),
      el('td', {}, ''),
      el('td', {}, ''),
      el('td', { class: 'num' }, totalDebit ? money(totalDebit) : ''),
      el('td', { class: 'num' }, totalCredit ? money(totalCredit) : ''),
      el('td', { class: 'num', style: `color:${finalColor};font-weight:700` }, finalDetect),
      el('td', { class: 'num', style: 'font-weight:700' }, money(Math.abs(finalNet))),
    ]))

    table.append(tb)
    tableWrap.append(table)
  }

  // ---------- چاپ ----------
  function buildPrintHtml() {
    const person = personObj || {}
    const sorted = [...state.data].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))
    let runningDebit = 0, runningCredit = 0
    if (state.from && state.opening) {
      if (state.opening > 0) runningCredit = state.opening
      else runningDebit = -state.opening
    }
    const hasOpening = !!(state.from && state.opening)
    const openNum = hasOpening ? 1 : 0
    const openHtml = hasOpening
      ? `<tr style="font-weight:600;background:#f0f0f0"><td>${faNum(1)}</td><td>—</td><td>مانده ابتدای بازه</td><td></td><td></td><td>${state.opening > 0 ? '' : money(Math.abs(state.opening))}</td><td>${state.opening > 0 ? money(Math.abs(state.opening)) : ''}</td><td>${state.opening > 0 ? 'بستانکار' : 'بدهکار'}</td><td>${money(Math.abs(state.opening))}</td></tr>`
      : ''
    const trs = sorted.map((r, i) => {
      if (isCredit(r)) runningCredit += Number(r.amount) || 0
      else runningDebit += Number(r.amount) || 0
      const net = runningDebit - runningCredit
      const detect = net > 0 ? 'بدهکار' : net < 0 ? 'بستانکار' : 'بی حساب'
      const desc = buildDescription(r)
      return `<tr>
        <td>${faNum(i + 1 + openNum)}</td>
        <td>${formatDate(r.date)}</td>
        <td>${desc}</td>
        <td>${r.kind === 'invoice' ? `${faNum(r.qty || 0)} ${esc(r.qty_unit || 'عدد')}` : '—'}</td>
        <td>${r.kind === 'invoice' ? money(r.amount) : '—'}</td>
        <td>${isCredit(r) ? '' : money(Number(r.amount) || 0)}</td>
        <td>${isCredit(r) ? money(Number(r.amount) || 0) : ''}</td>
        <td>${detect}</td>
        <td>${money(Math.abs(net))}</td>
      </tr>`
    }).join('')

    // ردیف جمع (شامل مانده ابتدای بازه)
    let totalDebit = sorted.reduce((s, r) => s + (isCredit(r) ? 0 : Number(r.amount) || 0), 0)
    let totalCredit = sorted.reduce((s, r) => s + (isCredit(r) ? Number(r.amount) || 0 : 0), 0)
    if (hasOpening) {
      if (state.opening > 0) totalCredit += Math.abs(state.opening)
      else totalDebit += Math.abs(state.opening)
    }
    const finalNet = totalDebit - totalCredit
    const finalDetect = finalNet > 0 ? 'بدهکار' : finalNet < 0 ? 'بستانکار' : 'بی حساب'
    const summaryRow = `<tr style="font-weight:700;background:#f5f5f5">
      <td colspan="2">تعدیل: ${faNum(sorted.length)}</td><td></td><td></td><td></td>
      <td>${totalDebit ? money(totalDebit) : ''}</td>
      <td>${totalCredit ? money(totalCredit) : ''}</td>
      <td>${finalDetect}</td>
      <td>${money(Math.abs(finalNet))}</td>
    </tr>`

    // openRow now part of openHtml above

    const dateRange = state.from || state.to ? `از ${faNum(state.from || '…')} تا ${faNum(state.to || '…')}` : 'کل دوره'
    const companyPhone = state.settings.company_phone || ''
    const companyAddress = state.settings.company_address || ''
    const companyPostal = state.settings.company_postal || ''

    const personInfoHtml = `
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:12px;flex-wrap:wrap;gap:6px;border:1px solid #ccc;border-radius:6px;padding:10px 14px;background:#f9f9f9">
          <div><strong>شناسه:</strong> ${faNum(person.id || '')}</div>
          <div><strong>نام:</strong> ${esc(fullName(person))}</div>
          ${person.national_code ? `<div><strong>کد ملی:</strong> ${faNum(person.national_code)}</div>` : ''}
          ${person.company_name ? `<div><strong>شرکت:</strong> ${esc(person.company_name)}</div>` : ''}
          ${person.phone ? `<div><strong>تلفن:</strong> ${esc(person.phone)}</div>` : ''}
          ${person.mobile ? `<div><strong>موبایل:</strong> ${faNum(person.mobile)}</div>` : ''}
          ${person.address ? `<div><strong>آدرس:</strong> ${esc(person.address)}</div>` : ''}
          ${person.postal_code ? `<div><strong>کدپستی:</strong> ${faNum(person.postal_code)}</div>` : ''}
        </div>`

    return `
      <div class="print-doc" dir="rtl" style="font-family:'Vazirmatn',Tahoma,sans-serif">
        <style>@page{size:landscape;margin:15mm}</style>
        <header style="text-align:center;margin-bottom:20px;border-bottom:2px solid #333;padding-bottom:15px">
          <div style="font-size:20px;font-weight:700;margin-bottom:8px">${esc(state.settings.company_name || 'گزارش تفصیلی حساب شخص')}</div>
          <div style="font-size:13px;color:#555">
            ${companyPhone ? `تلفن: ${esc(companyPhone)}` : ''}
            ${companyPhone && companyPostal ? ' — ' : ''}
            ${companyPostal ? `کد پستی: ${esc(companyPostal)}` : ''}
          </div>
          ${companyAddress ? `<div style="font-size:12px;color:#777;margin-top:4px">آدرس: ${esc(companyAddress)}</div>` : ''}
        </header>

        ${personInfoHtml}

        <div style="display:flex;justify-content:space-between;margin-bottom:15px;font-size:13px;flex-wrap:wrap;gap:8px">
          <div><strong>بازه:</strong> ${esc(dateRange)}</div>
          <div><strong>تاریخ چاپ:</strong> ${new Date().toLocaleDateString('fa-IR')}</div>
        </div>
        ${state.from && state.opening ? `<div style="margin-bottom:15px;font-size:13px"><strong>مانده ابتدای بازه:</strong> ${balanceText(-state.opening)}</div>` : ''}

        <table class="p-items" style="width:100%;border-collapse:collapse;font-size:12px" dir="rtl">
          <thead>
            <tr style="background:#333;color:#fff">
              <th style="padding:8px;border:1px solid #555">ردیف</th>
              <th style="padding:8px;border:1px solid #555">تاریخ</th>
              <th style="padding:8px;border:1px solid #555">شرح</th>
              <th style="padding:8px;border:1px solid #555">مقدار</th>
              <th style="padding:8px;border:1px solid #555">قیمت</th>
              <th style="padding:8px;border:1px solid #555">بدهکار</th>
              <th style="padding:8px;border:1px solid #555">بستانکار</th>
              <th style="padding:8px;border:1px solid #555">تشخیص</th>
              <th style="padding:8px;border:1px solid #555">مانده</th>
            </tr>
          </thead>
          <tbody>
            ${openHtml}
            ${trs}
            ${summaryRow}
          </tbody>
        </table>

        <footer style="display:flex;justify-content:space-between;margin-top:40px;font-size:12px">
          <div style="text-align:center">حسابداری</div>
          <div style="text-align:center">مدیر عامل</div>
          <div style="text-align:center">تنظیم کننده</div>
        </footer>
      </div>`
  }

  function doPrint() {
    const hasOpening = !!(state.from && state.opening)
    if (!state.data.length && !hasOpening) { toast('گزارشی برای چاپ وجود ندارد', 'error'); return }
    printDocument(buildPrintHtml())
  }

  function exportExcel() {
    if (!state.data.length) { toast('گزارشی برای خروجی وجود ندارد', 'error'); return }
    const csv = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const sorted = [...state.data].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))
    let runningDebit = 0, runningCredit = 0
    if (state.from && state.opening) { if (state.opening > 0) runningCredit = state.opening; else runningDebit = -state.opening }
    const lines = ['\uFEFFردیف,تاریخ,شرح,مقدار,قیمت,بدهکار,بستانکار,تشخیص,مانده']
    sorted.forEach((r, i) => {
      if (isCredit(r)) runningCredit += Number(r.amount) || 0; else runningDebit += Number(r.amount) || 0
      const net = runningDebit - runningCredit
      const detect = net > 0 ? 'بدهکار' : net < 0 ? 'بستانکار' : 'بی حساب'
      lines.push([i + 1, r.date, buildDescription(r), r.kind === 'invoice' ? `${r.qty || 0} ${r.qty_unit || 'عدد'}` : '', r.kind === 'invoice' ? r.amount : '', isCredit(r) ? '' : r.amount, isCredit(r) ? r.amount : '', detect, Math.abs(net)].map(csv).join(','))
    })
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `detailed-report-${state.personId}-${state.from || 'all'}-${state.to || 'all'}.csv`
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
    toast('خروجی اکسل (CSV) دانلود شد')
  }

  // راه‌اندازی
  ;(async () => {
    try {
      const [allPeople, settings] = await Promise.all([loadAllPeople(), api.get('/api/settings')])
      personDD.setPeople(allPeople)
      state.settings = settings || {}
      companyName = settings.company_name || ''
      if (locked && state.personId) {
        const p = allPeople.find((x) => x.id === state.personId)
        if (p) {
          personObj = p
          // نمایش نام شخص در لیبل (حتی اگر dropdown مخفی باشد)
        }
        load()
      }
    } catch { /* ignore */ }
  })()
  render()
}

// ============================================================ هسته‌ی گزارش (سایر انواع)
function mountReport(container, { preset = {} } = {}) {
  const state = {
    kind: preset.kind || 'persons',
    from: '',
    to: '',
    personId: preset.personId || 0,
    costCenterId: 0,
    type: '',
    data: [],
    sums: {},
    loading: true,
    personFilter: '',
    settings: {},
  }
  let personName = preset.personName || ''

  // فیلتر مرکز هزینه با جستجو
  const ccDD = costCenterDropdown({ onSelect: (id) => { state.costCenterId = id; load() } })
  api.get('/api/cost-centers').then((d) => ccDD.setCenters(d || [])).catch(() => {})

  const typeSeg = el('div', { class: 'segmented' }, [])
  function renderTypeSeg() {
    typeSeg.innerHTML = ''
    for (const [label, val] of KINDS[state.kind]?.types || []) {
      typeSeg.append(el('button', {
        class: state.type === val ? 'active' : '',
        dataset: { val },
        onclick: () => { state.type = val; typeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.val === val)); load() },
      }, label))
    }
  }

  const fromInput = jdateInput({ placeholder: 'از تاریخ' })
  const toInput = jdateInput({ placeholder: 'تا تاریخ' })
  const personDD = personDropdown({
    value: state.personId,
    onSelect: (id) => { state.personId = id; load() },
  })

  function updateFilterVisibility() {
    const isPersons = state.kind === 'persons'
    const isCC = state.kind === 'costcenters'
    typeSeg.style.display = isPersons ? 'none' : ''
    // فیلتر شخص در گزارش مراکز هزینه بی‌معنی است — مخفی می‌شود
    personDD.el.style.display = isCC ? 'none' : ''
    // فیلتر مرکز هزینه فقط برای گزارش‌هایی که سرور از آن پشتیبانی می‌کند نمایش داده شود (فاکتورها و مراکز هزینه)
    ccDD.el.style.display = isCC || state.kind === 'invoices' ? '' : 'none'
  }

  /** فرمت شرح مشترک برای گزارش مراکز هزینه (شامل شخص و شناسه شخص) */
  function ccDescription(r) {
    const who = `${esc(r.person_name || '')} (${faNum(r.person_id || '')})`
    if (r.kind === 'invoice') {
      const parts = [`${esc(r.label)} (${faNum(r.id)})`, `بابت ${esc(r.items_summary || '—')}`, `طرف حساب: ${who}`]
      if (r.number) parts.push(`شماره ${esc(r.number)}`)
      return parts.join(' - ')
    }
    const docType = r.kind === 'third_party' ? 'پرداخت شخص ثالث' : r.type === 'receive' ? 'سند دریافت' : 'سند پرداخت'
    const parts = [`${docType} (${faNum(r.id)})`, esc(r.number || 'نقدی'), `توسط ${who}`]
    if (r.invoice_number) parts.push(`فاکتور ${esc(r.invoice_number)}`)
    return parts.join(' - ')
  }

  /** رندر جدول گزارش مراکز هزینه با مانده ابتدای بازه و تعدیل */
  function renderCostCentersTable() {
    const hasOpening = !!(state.from && state.sums.openingBalance)
    if (!state.data.length && !hasOpening) {
      tableWrap.innerHTML = ''
      tableWrap.append(emptyState({ icon: 'folder', title: 'رکوردی یافت نشد', sub: 'برای این مرکز هزینه در بازه انتخابی فاکتوری ثبت نشده است.' }))
      return
    }
    tableWrap.innerHTML = ''
    const table = el('table', { class: 'data detail-report-table' })
    const heads = ['ردیف', 'مرکز هزینه', 'تاریخ', 'شرح', 'مقدار', 'قیمت', 'بدهکار', 'بستانکار', 'تشخیص', 'مانده']
    table.append(el('thead', {}, [el('tr', {}, heads.map((h, i) => el('th', { class: i !== 3 ? 'num' : '' }, h)))]))
    const tb = el('tbody', {})
    let runningDebit = 0
    let runningCredit = 0
    const opening = state.sums.openingBalance || 0
    if (hasOpening) {
      if (opening > 0) runningCredit = opening
      else runningDebit = -opening
      tb.append(el('tr', { style: 'font-weight:600;background:var(--bg-2)' }, [
        el('td', { class: 'num' }, faNum(1)),
        el('td', {}, '—'),
        el('td', { class: 'num' }, '—'),
        el('td', {}, 'مانده ابتدای بازه'),
        el('td', {}, ''),
        el('td', {}, ''),
        el('td', { class: 'num' }, money(opening > 0 ? 0 : Math.abs(opening))),
        el('td', { class: 'num' }, money(opening > 0 ? Math.abs(opening) : 0)),
        el('td', { class: 'num', style: `color:${opening > 0 ? 'var(--success)' : 'var(--danger)'};font-weight:600` }, opening > 0 ? 'بستانکار' : 'بدهکار'),
        el('td', { class: 'num', style: 'font-weight:700' }, money(Math.abs(opening))),
      ]))
    }
    let rowNum = hasOpening ? 1 : 0
    for (const r of state.data) {
      rowNum++
      const isCred = r.flow > 0
      if (isCred) runningCredit += Number(r.amount) || 0
      else runningDebit += Number(r.amount) || 0
      const net = runningDebit - runningCredit
      const detectText = net > 0 ? 'بدهکار' : net < 0 ? 'بستانکار' : 'بی حساب'
      const detectColor = net > 0 ? 'var(--danger)' : net < 0 ? 'var(--success)' : 'var(--text-2)'
      const tr = el('tr', {}, [
        el('td', { class: 'num' }, faNum(rowNum)),
        el('td', {}, r.cc_name ? esc(r.cc_name) : '—'),
        el('td', { class: 'num' }, formatDate(r.date)),
        el('td', { html: ccDescription(r) }),
        el('td', { class: 'num' }, r.kind === 'invoice' ? `${faNum(r.qty || 0)} ${esc(r.qty_unit || 'عدد')}` : '—'),
        el('td', { class: 'num' }, r.kind === 'invoice' ? money(r.amount) : '—'),
        el('td', { class: 'num', style: 'font-weight:600' }, money(isCred ? 0 : Number(r.amount) || 0)),
        el('td', { class: 'num', style: 'font-weight:600' }, money(isCred ? Number(r.amount) || 0 : 0)),
        el('td', { class: 'num', style: `color:${detectColor};font-weight:600` }, detectText),
        el('td', { class: 'num', style: 'font-weight:700' }, money(Math.abs(net))),
      ])
      tr.title = 'دابل‌کلیک: ویرایش — راست‌کلیک: منوی عملیات'
      tr.addEventListener('dblclick', () => { if (r.kind === 'invoice') openInvoiceForm({ id: r.id, onSaved: load }); else openPaymentForm({ id: r.id, onSaved: load }) })
      tb.append(tr)
    }
    // تعدیل (جمع کل شامل مانده ابتدای بازه)
    let totalDebit = state.data.reduce((s, r) => s + (r.flow > 0 ? 0 : Number(r.amount) || 0), 0)
    let totalCredit = state.data.reduce((s, r) => s + (r.flow > 0 ? Number(r.amount) || 0 : 0), 0)
    if (hasOpening) {
      if (opening > 0) totalCredit += Math.abs(opening)
      else totalDebit += Math.abs(opening)
    }
    const finalNet = totalDebit - totalCredit
    const finalDetect = finalNet > 0 ? 'بدهکار' : finalNet < 0 ? 'بستانکار' : 'بی حساب'
    const finalColor = finalNet > 0 ? 'var(--danger)' : finalNet < 0 ? 'var(--success)' : 'var(--text-2)'
    tb.append(el('tr', { style: 'background:var(--bg-2);font-weight:700;border-top:2px solid var(--border)' }, [
      el('td', { colspan: 3 }, `تعدیل: ${faNum(state.data.length)}`),
      el('td', {}, ''),
      el('td', {}, ''),
      el('td', {}, ''),
      el('td', { class: 'num' }, totalDebit ? money(totalDebit) : ''),
      el('td', { class: 'num' }, totalCredit ? money(totalCredit) : ''),
      el('td', { class: 'num', style: `color:${finalColor};font-weight:700` }, finalDetect),
      el('td', { class: 'num', style: 'font-weight:700' }, money(Math.abs(finalNet))),
    ]))
    table.append(tb)
    tableWrap.append(table)
  }

  /** چاپ گزارش مراکز هزینه (عمودی مثل گزارش کلی) */
  function printCostCenters() {
    const opening = state.sums.openingBalance || 0
    const hasOpening = !!(state.from && opening)
    let runningDebit = 0
    let runningCredit = 0
    if (hasOpening) { if (opening > 0) runningCredit = opening; else runningDebit = -opening }
    const openHtml = hasOpening
      ? `<tr style="font-weight:600;background:#f0f0f0"><td>${faNum(1)}</td><td>—</td><td>—</td><td>مانده ابتدای بازه</td><td></td><td></td><td>${opening > 0 ? '' : money(Math.abs(opening))}</td><td>${opening > 0 ? money(Math.abs(opening)) : ''}</td><td>${opening > 0 ? 'بستانکار' : 'بدهکار'}</td><td>${money(Math.abs(opening))}</td></tr>`
      : ''
    const rows = state.data.map((r, i) => {
      const isCred = r.flow > 0
      if (isCred) runningCredit += Number(r.amount) || 0
      else runningDebit += Number(r.amount) || 0
      const net = runningDebit - runningCredit
      const detect = net > 0 ? 'بدهکار' : net < 0 ? 'بستانکار' : 'بی حساب'
      return `<tr><td>${faNum(i + 1 + (hasOpening ? 1 : 0))}</td><td>${esc(r.cc_name || '—')}</td><td>${formatDate(r.date)}</td><td>${ccDescription(r)}</td><td>${r.kind === 'invoice' ? `${faNum(r.qty || 0)} ${esc(r.qty_unit || 'عدد')}` : '—'}</td><td>${r.kind === 'invoice' ? money(r.amount) : '—'}</td><td>${isCred ? '' : money(r.amount)}</td><td>${isCred ? money(r.amount) : ''}</td><td>${detect}</td><td>${money(Math.abs(net))}</td></tr>`
    }).join('')
    let totalDebit = state.data.reduce((s, r) => s + (r.flow > 0 ? 0 : Number(r.amount) || 0), 0)
    let totalCredit = state.data.reduce((s, r) => s + (r.flow > 0 ? Number(r.amount) || 0 : 0), 0)
    if (hasOpening) { if (opening > 0) totalCredit += Math.abs(opening); else totalDebit += Math.abs(opening) }
    const finalNet = totalDebit - totalCredit
    const finalDetect = finalNet > 0 ? 'بدهکار' : finalNet < 0 ? 'بستانکار' : 'بی حساب'
    const summaryRow = `<tr style="font-weight:700;background:#f5f5f5"><td colspan="3">تعدیل: ${faNum(state.data.length)}</td><td></td><td></td><td></td><td>${totalDebit ? money(totalDebit) : ''}</td><td>${totalCredit ? money(totalCredit) : ''}</td><td>${finalDetect}</td><td>${money(Math.abs(finalNet))}</td></tr>`
    const dateRange = state.from || state.to ? `از ${faNum(state.from || '…')} تا ${faNum(state.to || '…')}` : 'کل دوره'
    const doc = `<div class="print-doc" dir="rtl" style="font-family:'Vazirmatn',Tahoma,sans-serif">
      <style>@page{size:landscape;margin:15mm}</style>
      <header style="text-align:center;margin-bottom:20px;border-bottom:2px solid #333;padding-bottom:15px">
        <div style="font-size:20px;font-weight:700;margin-bottom:8px">${esc(state.settings.company_name || 'گزارش مراکز هزینه')}</div>
        ${state.settings.company_phone ? `<div style="font-size:13px;color:#555">تلفن: ${esc(state.settings.company_phone)}</div>` : ''}
        ${state.settings.company_address ? `<div style="font-size:12px;color:#777;margin-top:4px">آدرس: ${esc(state.settings.company_address)}</div>` : ''}
      </header>
      <div style="display:flex;justify-content:space-between;margin-bottom:15px;font-size:13px"><div><strong>بازه:</strong> ${esc(dateRange)}</div><div><strong>تاریخ چاپ:</strong> ${new Date().toLocaleDateString('fa-IR')}</div></div>
      <table class="p-items" style="width:100%;border-collapse:collapse;font-size:12px" dir="rtl">
        <thead><tr style="background:#333;color:#fff">${['ردیف', 'مرکز هزینه', 'تاریخ', 'شرح', 'مقدار', 'قیمت', 'بدهکار', 'بستانکار', 'تشخیص', 'مانده'].map((h) => `<th style="padding:8px;border:1px solid #555">${h}</th>`).join('')}</tr></thead>
        <tbody>${openHtml}${rows}${summaryRow}</tbody>
      </table>
      <footer style="display:flex;justify-content:space-between;margin-top:40px;font-size:12px"><div style="text-align:center">حسابداری</div><div style="text-align:center">مدیر عامل</div><div style="text-align:center">تنظیم کننده</div></footer>
    </div>`
    printDocument(doc)
  }

  /** خروجی اکسل گزارش مراکز هزینه */
  function exportCostCenters() {
    if (!state.data.length) { toast('گزارشی برای خروجی وجود ندارد', 'error'); return }
    const csv = (v) => { const s = String(v ?? '').replace(/<[^>]*>/g, ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const opening = state.sums.openingBalance || 0
    const hasOpening = !!(state.from && opening)
    const lines = ['\uFEFF' + ['ردیف', 'مرکز هزینه', 'تاریخ', 'شرح', 'مقدار', 'قیمت', 'بدهکار', 'بستانکار', 'تشخیص', 'مانده'].map(csv).join(',')]
    let n = 0
    if (hasOpening) {
      n++
      lines.push([n, '—', '—', 'مانده ابتدای بازه', '', '', opening > 0 ? '' : Math.abs(opening), opening > 0 ? Math.abs(opening) : '', opening > 0 ? 'بستانکار' : 'بدهکار', Math.abs(opening)].map(csv).join(','))
    }
    state.data.forEach((r) => {
      n++
      const desc = ccDescription(r).replace(/<[^>]*>/g, '')
      lines.push([n, r.cc_name || '—', r.date, desc, r.kind === 'invoice' ? `${r.qty || 0} ${r.qty_unit || 'عدد'}` : '', r.kind === 'invoice' ? r.amount : '', r.flow > 0 ? '' : r.amount, r.flow > 0 ? r.amount : '', Math.abs(r.run_balance || 0)].map(csv).join(','))
    })
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `cost-centers-report-${state.from || 'all'}-${state.to || 'all'}.csv`
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
    toast('خروجی اکسل (CSV) دانلود شد')
  }

  const statCards = el('div', { class: 'stats-grid', style: 'grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin:16px 0' })

  function setStatCards(kind, s) {
    statCards.innerHTML = ''
    const mk = (label, value, sub) =>
      el('div', { class: 'stat-card' }, [
        el('div', { class: 'stat-icon' }, el('span', { html: icon('card', 20) })),
        el('div', { class: 'stat-info' }, [el('div', { class: 'st-label' }, label), el('div', { class: 'st-value' }, value), sub ? el('div', { class: 'st-sub' }, sub) : null]),
      ])
    if (kind === 'persons') {
      const withBalance = (s.data || []).filter((b) => b.balance !== 0)
      statCards.append(
        mk('اشخاص دارای مانده', faNum(withBalance.length)),
        mk('طلب شرکت از اشخاص (بدهکاران)', money(s.totalDebt || 0)),
        mk('بدهی شرکت به اشخاص (بستانکاران)', money(s.totalCredit || 0)),
        mk('خالص', money(s.net || 0), s.net > 0 ? 'شرکت طلبکار است' : s.net < 0 ? 'شرکت بدهکار است' : 'تسویه')
      )
    } else if (kind === 'costcenters') {
      const withBal = (s.data || []).filter((r) => r.run_balance)
      const last = withBal.length ? withBal[withBal.length - 1].run_balance : (s.finalBalance || 0)
      statCards.append(
        mk('تعداد رکوردها', faNum(s.count || 0)),
        mk('جمع فاکتورها', money((s.data || []).filter((r) => r.kind === 'invoice').reduce((a, r) => a + (Number(r.amount) || 0), 0))),
        mk('مانده ابتدای بازه', s.openingBalance ? balanceText(-s.openingBalance) : '—'),
        mk('مانده نهایی', Math.abs(s.finalBalance ?? last) ? balanceText(s.finalBalance ?? last) : 'تسویه')
      )
    } else if (kind === 'payments') {
      statCards.append(mk('تعداد', faNum(s.count || 0)), mk('جمع دریافتی', money(s.receiveSum || 0)), mk('جمع پرداختی', money(s.paySum || 0)), mk('خالص حساب شرکت', money((s.receiveSum || 0) - (s.paySum || 0))))
    } else if (kind === 'invoices') {
      statCards.append(mk('تعداد', faNum(s.count || 0)), mk('جمع کل', money(s.invoiceSum || 0)), mk('پرداخت‌شده', money(s.paidSum || 0)), mk('مانده', money((s.invoiceSum || 0) - (s.paidSum || 0)), `بدهکاران: ${money(s.receivable || 0)} — بستانکاران: ${money(s.payable || 0)}`))
    } else {
      statCards.append(mk('تعداد رکوردها', faNum(s.count || 0)), mk('جمع کل فاکتورها', money(s.invoiceSum || 0)), mk('جمع دریافتی / پرداختی', money(s.paymentSum || 0)), mk('مانده فاکتورها', money((s.invoiceSum || 0) - (s.paidSum || 0)), `بدهکاران: ${money(s.receivable || 0)} — بستانکاران: ${money(s.payable || 0)}`))
    }
  }

  const tableWrap = el('div', { class: 'table-wrap' })
  const toolbar = el('div', { class: 'toolbar', style: 'flex-wrap:wrap;gap:10px' }, [
    // kindSeg حذف شد — تب‌ها در سطح بالاتر مدیریت می‌شوند
    el('div', { class: 'search-box', style: 'max-width:210px' }, [el('span', { html: icon('calendar', 18) }), fromInput.el]),
    el('div', { class: 'search-box', style: 'max-width:210px' }, [el('span', { html: icon('calendar', 18) }), toInput.el]),
    personDD.el,
    ccDD.el,
    typeSeg,
    el('div', { class: 'toolbar-spacer' }),
    el('button', { class: 'btn btn-primary', onclick: applyDate }, [el('span', { html: icon('search', 16) }), 'اعمال بازه تاریخ']),
    el('button', { class: 'btn btn-ghost', onclick: doPrint }, [el('span', { html: icon('printer', 16) }), 'چاپ گزارش']),
    el('button', { class: 'btn btn-ghost', onclick: exportExcel }, [el('span', { html: icon('fileDown', 16) }), 'خروجی اکسل']),
  ])

  container.innerHTML = ''
  container.append(toolbar, statCards, tableWrap)

  function applyDate() { state.from = fromInput.getValue().trim(); state.to = toInput.getValue().trim(); load() }

  async function load() {
    state.loading = true; renderTable()
    try {
      const res = await fetchLedger({ kind: state.kind, from: state.from, to: state.to, person_id: state.personId, cost_center_id: state.costCenterId, type: state.type })
      state.data = res.data || []; state.sums = res; setStatCards(state.kind, res)
    } catch (err) { toast(err.message, 'error'); state.data = []; state.sums = {}; setStatCards(state.kind, {}) }
    finally { state.loading = false; renderTable() }
  }

  function renderTable() {
    if (state.loading) { tableWrap.innerHTML = ''; tableWrap.append(el('table', { class: 'data' }, [el('tbody', {}, skeletonRows(6))])); return }
    if (state.kind === 'costcenters') return renderCostCentersTable()
    let filtered = state.data
    if (!filtered.length) { tableWrap.innerHTML = ''; tableWrap.append(emptyState({ icon: 'doc', title: 'رکوردی یافت نشد', sub: 'با فیلترهای داده‌شده نتیجه‌ای وجود ندارد.' })); return }
    tableWrap.innerHTML = ''
    const table = el('table', { class: 'data' })
    const heads = tableHeads()
    table.append(el('thead', {}, [el('tr', {}, heads.map((h, i) => el('th', { class: i !== 2 ? 'num' : '' }, h)))]))
    const tb = el('tbody', {})
    for (const r of filtered) {
      const tr = el('tr', {}, rowCells(r))
      tr.title = 'دابل‌کلیک: مشاهده گزارش تفصیلی — راست‌کلیک: منوی عملیات'
      tr.addEventListener('dblclick', () => editRow(r))
      tr.addEventListener('contextmenu', (e) => rowMenu(e, r))
      tb.append(tr)
    }
    table.append(tb)
    tableWrap.append(table)
  }

  function tableHeads() {
    if (state.kind === 'persons') return ['شناسه', 'شخص', 'بدهکار', 'بستانکار', 'مانده']
    if (state.kind === 'invoices') return ['شناسه', 'شماره فاکتور', 'طرف حساب', 'تاریخ', 'نوع', 'مرکز هزینه', 'مبلغ کل', 'پرداخت‌شده', 'مانده فاکتور']
    if (state.kind === 'payments') return ['شناسه', 'شخص', 'نوع تراکنش', 'نوع انتقال', 'بابت فاکتور', 'مبلغ', 'تاریخ']
    if (state.personId) return ['تاریخ', 'نوع', 'شماره / شرح', 'مبلغ', 'مانده فاکتور', 'مانده حساب']
    return ['تاریخ', 'نوع', 'شماره / شرح', 'شخص', 'مبلغ', 'مانده فاکتور']
  }

  function rowCells(r) {
    if (state.kind === 'persons') {
      const person = { id: r.person_id, first_name: r.first_name, last_name: r.last_name, company_name: r.company_name }
      return [
        el('td', {}, el('span', { class: 'badge badge-purple' }, faNum(r.person_id))),
        el('td', {}, [el('span', { class: 'cell-main' }, esc(fullName(person))), el('span', { class: 'cell-sub' }, `${faNum(r.count)} رکورد`)]),
        el('td', { class: 'num' }, r.debit ? money(r.debit) : '—'),
        el('td', { class: 'num' }, r.credit ? money(r.credit) : '—'),
        el('td', { class: 'num' }, balanceBadge(r.balance)),
      ]
    }
    if (state.kind === 'invoices') {
      const raw = r.raw
      const party = { first_name: raw.seller_first_name, last_name: raw.seller_last_name, company_name: raw.seller_company_name }
      return [
        el('td', {}, el('span', { class: 'badge badge-purple' }, faNum(r.id))),
        el('td', {}, r.number ? esc(r.number) : '—'),
        el('td', {}, esc(fullName(party))),
        el('td', { class: 'num' }, formatDate(r.date)),
        el('td', {}, r.type === 'sell' ? typeBadge('فاکتور فروش', 'green') : typeBadge('فاکتور خرید', 'blue')),
        el('td', {}, r.raw.cost_center_name ? esc(r.raw.cost_center_name) : '—'),
        el('td', { class: 'num' }, money(r.amount)),
        el('td', { class: 'num' }, money(r.paid)),
        invoiceBalanceCell(r),
      ]
    }
    if (state.kind === 'payments') {
      return [
        el('td', {}, el('span', { class: 'badge badge-purple' }, faNum(r.id))),
        el('td', {}, esc(r.person_name)),
        el('td', {}, r.type === 'receive' ? typeBadge('دریافت', 'green') : typeBadge('پرداخت', 'red')),
        el('td', {}, r.number ? esc(r.number) : '—'),
        el('td', {}, r.invoice_number ? esc(r.invoice_number) : '—'),
        el('td', { class: 'num', style: `color:${r.type === 'receive' ? 'var(--success)' : 'var(--danger)'};font-weight:700` }, `${r.type === 'receive' ? '+' : '−'} ${money(r.amount)}`),
        el('td', { class: 'num' }, formatDate(r.date)),
      ]
    }
    const amountTd = el('td', { class: 'num', style: `color:${isCredit(r) ? 'var(--success)' : 'var(--danger)'};font-weight:700` }, `${isCredit(r) ? '+' : '−'} ${money(r.amount)}`)
    if (state.personId) {
      return [el('td', { class: 'num' }, formatDate(r.date)), el('td', {}, kindBadge(r)), el('td', {}, r.number ? esc(r.number) : '—'), amountTd, invoiceBalanceCell(r), el('td', { class: 'num' }, balanceBadge(-r.run_balance))]
    }
    return [el('td', { class: 'num' }, formatDate(r.date)), el('td', {}, kindBadge(r)), el('td', {}, r.number ? esc(r.number) : '—'), el('td', {}, esc(r.person_name)), amountTd, invoiceBalanceCell(r)]
  }

  function invoiceBalanceCell(r) {
    if (r.kind === 'payment') return el('td', { class: 'num' }, '—')
    const b = Number(r.balance) || 0
    const badge = b > 0 ? (r.type === 'sell' ? typeBadge('بدهکار', 'red') : typeBadge('بستانکار', 'blue')) : null
    return el('td', { class: 'num' }, [
      el('span', { style: `font-weight:700;color:${b > 0 ? 'var(--danger)' : 'var(--success)'}` }, b > 0 ? money(b) : 'تسویه'),
      badge ? el('span', { style: 'margin-inline-start:8px' }, badge) : null,
    ])
  }

  function editRow(r) {
    if (state.kind === 'persons') { personStatementModal({ id: r.person_id, first_name: r.first_name, last_name: r.last_name, company_name: r.company_name }); return }
    if (r.kind === 'invoice') openInvoiceForm({ id: r.id, onSaved: load })
    else openPaymentForm({ id: r.id, onSaved: load })
  }

  async function rowMenu(e, r) {
    e.preventDefault()
    if (state.kind === 'persons') {
      const person = { id: r.person_id, first_name: r.first_name, last_name: r.last_name, company_name: r.company_name }
      showContextMenu(e.clientX, e.clientY, [
        { label: 'گزارش تفصیلی شخص', icon: 'doc', action: () => personStatementModal(person) },
        { label: 'مشاهده‌ی شخص', icon: 'user', action: () => openPersonViewModal(person) },
        { label: 'ویرایش شخص', icon: 'edit', action: () => personFormModal({ person, onSaved: () => { load(); loadPeople() } }) },
        { sep: true },
        { label: 'فاکتور جدید', icon: 'doc', action: () => openInvoiceForm({ prefill: { seller: person }, onSaved: load }) },
        { label: 'ثبت دریافت جدید', icon: 'trendingUp', action: () => openPaymentForm({ prefill: { person, transaction_type: 'receive' }, onSaved: load }) },
        { label: 'ثبت پرداخت جدید', icon: 'trendingDown', action: () => openPaymentForm({ prefill: { person, transaction_type: 'pay' }, onSaved: load }) },
      ])
      return
    }
    const person = await api.get(`/api/people/${r.person_id}`).catch(() => null)
    showContextMenu(e.clientX, e.clientY, [
      { label: r.kind === 'invoice' ? 'ویرایش فاکتور' : 'ویرایش تراکنش', icon: 'edit', action: () => editRow(r) },
      { label: `مشاهده‌ی «${r.person_name}»`, icon: 'user', action: () => person && openPersonViewModal(person, { onEdited: () => { load(); loadPeople() } }) },
      { label: `ویرایش «${r.person_name}»`, icon: 'edit', action: () => person && personFormModal({ person, onSaved: () => { load(); loadPeople() } }) },
      { sep: true },
      { label: 'فاکتور جدید', icon: 'doc', action: () => person && openInvoiceForm({ prefill: { seller: person }, onSaved: load }) },
      { label: 'ثبت دریافت جدید', icon: 'trendingUp', action: () => person && openPaymentForm({ prefill: { person, transaction_type: 'receive' }, onSaved: load }) },
      { label: 'ثبت پرداخت جدید', icon: 'trendingDown', action: () => person && openPaymentForm({ prefill: { person, transaction_type: 'pay' }, onSaved: load }) },
    ])
  }

  async function loadPeople() {
    try { const all = await loadAllPeople(); personDD.setPeople(all) } catch { /* ignore */ }
  }

  function reportTitle() {
    let t = KINDS[state.kind]?.label || 'گزارش'
    if (state.from || state.to) t += ` — از ${faNum(state.from || '…')} تا ${faNum(state.to || '…')}`
    if (state.personId) t += ` — ${personName || ''}`
    return t
  }

  function doPrint() {
    if (state.kind === 'costcenters') {
      const hasOpening = !!(state.from && state.sums.openingBalance)
      if (!state.data.length && !hasOpening) { toast('گزارشی برای چاپ وجود ندارد', 'error'); return }
      return printCostCenters()
    }
    if (!state.data.length) { toast('گزارشی برای چاپ وجود ندارد', 'error'); return }
    const { head, map } = printRows()
    const rows = state.data.map((r, i) => `<tr>${map(r, i).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')
    const doc = `<div class="print-doc" dir="rtl"><style>@page{size:portrait;margin:15mm}</style><header class="p-head"><div class="p-brand"><strong>${esc(reportTitle())}</strong><span>${new Date().toLocaleDateString('fa-IR')}</span></div><div class="p-meta"><span>تعداد: ${faNum(state.data.length)}</span></div></header><table class="p-items"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><footer class="p-foot"><div>حسابداری</div><div>مدیر عامل</div><div>تنظیم کننده</div></footer></div>`
    printDocument(doc)
  }

  function printRows() {
    if (state.kind === 'persons') return { head: ['#', 'شخص', 'بدهکار', 'بستانکار', 'مانده'], map: (r, i) => [faNum(i + 1), esc(fullName(r)), r.debit ? money(r.debit) : '—', r.credit ? money(r.credit) : '—', balanceText(r.balance)] }
    if (state.kind === 'invoices') return {
      head: ['#', 'شماره فاکتور', 'طرف حساب', 'تاریخ', 'نوع', 'مرکز هزینه', 'مبلغ کل', 'پرداخت‌شده', 'مانده'],
      map: (r, i) => { const raw = r.raw; const party = fullName({ first_name: raw.seller_first_name, last_name: raw.seller_last_name, company_name: raw.seller_company_name }); return [faNum(i + 1), esc(r.number || '—'), esc(party), formatDate(r.date), r.type === 'sell' ? 'فروش' : 'خرید', raw.cost_center_name ? esc(raw.cost_center_name) : '—', money(r.amount), money(r.paid), r.balance ? money(r.balance) : 'تسویه'] },
    }
    if (state.kind === 'payments') return {
      head: ['#', 'شخص', 'نوع تراکنش', 'نوع انتقال', 'بابت فاکتور', 'مبلغ', 'تاریخ'],
      map: (r, i) => [faNum(i + 1), esc(r.person_name), r.type === 'receive' ? 'دریافت' : 'پرداخت', esc(r.number || '—'), r.invoice_number ? esc(r.invoice_number) : '—', money(r.amount), formatDate(r.date)],
    }
    return {
      head: state.personId ? ['#', 'تاریخ', 'نوع', 'شماره / شرح', 'مبلغ', 'مانده فاکتور', 'مانده حساب'] : ['#', 'تاریخ', 'نوع', 'شماره / شرح', 'شخص', 'مبلغ', 'مانده فاکتور'],
      map: (r, i) => {
        const cells = [faNum(i + 1), formatDate(r.date), r.label, esc(r.number || '—')]
        if (state.personId) cells.push(`${isCredit(r) ? '+' : '−'} ${money(r.amount)}`, r.kind === 'invoice' ? (r.balance ? money(r.balance) : 'تسویه') : '—', balanceText(-r.run_balance))
        else cells.push(esc(r.person_name), `${isCredit(r) ? '+' : '−'} ${money(r.amount)}`, r.kind === 'invoice' ? (r.balance ? money(r.balance) : 'تسویه') : '—')
        return cells
      },
    }
  }

  function exportExcel() {
    if (state.kind === 'costcenters') return exportCostCenters()
    if (!state.data.length) { toast('گزارشی برای خروجی وجود ندارد', 'error'); return }
    const csv = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const { head, map } = printRows()
    const lines = ['\uFEFF' + head.map(csv).join(',')]
    for (const r of state.data) lines.push(map(r, 0).map(csv).join(','))
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `report-${state.kind}-${state.from || 'all'}-${state.to || 'all'}.csv`
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
    toast('خروجی اکسل (CSV) دانلود شد')
  }

  loadPeople()
  api.get('/api/settings').then((s) => { state.settings = s || {} }).catch(() => {})
  if (state.personId && !personName) api.get(`/api/people/${state.personId}`).then((p) => { personName = fullName(p) }).catch(() => {})
  renderTypeSeg(); updateFilterVisibility(); load()
  return { reload: load, resetFilter: () => { personDD.reset(); state.personId = 0; load() } }
}

// ============================================================ مودال گزارش تفصیلی یک شخص (از راست‌کلیک)
export function personStatementModal(person) {
  const name = fullName(person)
  const body = el('div', {})
  const m = openModal({
    title: `گزارش تفصیلی — ${name}`,
    size: 'modal-xl',
    body,
    footer: (foot) => foot.append(
      el('button', { class: 'btn btn-ghost', onclick: () => openInvoiceForm({ prefill: { seller: person }, onSaved: () => {} }) }, 'فاکتور جدید'),
      el('button', { class: 'btn btn-ghost', onclick: () => openPaymentForm({ prefill: { person, transaction_type: 'receive' }, onSaved: () => {} }) }, 'ثبت دریافت'),
      el('button', { class: 'btn btn-ghost', onclick: () => openPaymentForm({ prefill: { person, transaction_type: 'pay' }, onSaved: () => {} }) }, 'ثبت پرداخت'),
      el('button', { class: 'btn btn-primary', onclick: () => { m.close(); personFormModal({ person, onSaved: () => {} }) } }, 'ویرایش شخص'),
      el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'بستن')
    ),
  })
  // mountDetailReport با person از پیش انتخاب‌شده
  mountDetailReport(body, { presetPersonId: person.id })
  return m
}

// ============================================================ صفحه اصلی گزارش‌ها
export function renderReportsPage(root) {
  root.innerHTML = ''

  // تب‌های گزارش
  const tabs = el('div', { class: 'segmented', style: 'margin-bottom:16px' })
  const contentArea = el('div', {})
  root.append(tabs, contentArea)

  let currentTab = 'detail'
  let mounted = {}
  let reportAPIs = {}

  function switchTab(tab) {
    currentTab = tab
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab))
    contentArea.innerHTML = ''
    if (tab === 'detail') {
      if (!mounted.detail) mounted.detail = el('div', {})
      contentArea.append(mounted.detail)
      if (!mounted.detail._init) { mountDetailReport(mounted.detail); mounted.detail._init = true }
    } else {
      if (!mounted[tab]) mounted[tab] = el('div', {})
      contentArea.append(mounted[tab])
      if (!mounted[tab]._init) { reportAPIs[tab] = mountReport(mounted[tab], { preset: { kind: tab } }); mounted[tab]._init = true }
      if (reportAPIs[tab]?.resetFilter) reportAPIs[tab].resetFilter()
    }
  }

  for (const [val, cfg] of Object.entries(KINDS)) {
    tabs.append(el('button', {
      class: val === currentTab ? 'active' : '',
      dataset: { tab: val },
      onclick: () => switchTab(val),
    }, cfg.label))
  }

  switchTab(currentTab)
}

/** باز کردن گزارش در مودال */
export function openReportModal({ personId = 0, personName = '', kind = 'all', title = '' } = {}) {
  const body = el('div', {})
  const m = openModal({ title: title || `گزارش${personName ? ` — ${personName}` : ''}`, size: 'modal-xl', body })
  mountReport(body, { preset: { personId, personName, kind } })
  return m
}
