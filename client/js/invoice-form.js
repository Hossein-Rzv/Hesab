import { api } from './api.js'
import { el, faNum, esc, enNum, fullName, icon, money } from './utils.js'
import { toast, openModal, fieldWrap, buttonLoading } from './ui.js'
import { personField } from './picker.js'
import { jdateInput } from './jdate.js'
import { todayJalaali } from './jalaali.js'
import { printDocument } from './print.js'
import { openPaymentForm, txTypeLabel } from './payment-form.js'
import { attachmentField } from './attachments.js'
import { sendToExcelButton } from './excel-export.js'

const UNITS = ['عدد', 'کیلوگرم', 'گرم', 'بسته', 'کارتن', 'متر', 'مترمربع', 'لیتر', 'شیشه', 'جعبه', 'سرویس', 'ست']

let vatPercent = 10
api
  .get('/api/settings')
  .then((s) => {
    if (s.vat_percent) vatPercent = Number(s.vat_percent)
  })
  .catch(() => {})

export function counterpartyLabel(type) {
  return type === 'sell' ? 'خریدار / مشتری' : 'فروشنده / تأمین‌کننده'
}

/**
 * فرم ثبت/ویرایش فاکتور
 * prefill: { seller, type, invoice_date }
 */
export function openInvoiceForm({ id = null, onSaved, prefill = {} } = {}) {
  let inv = null
  const isEdit = !!id

  // state
  let invoiceType = prefill.type === 'sell' ? 'sell' : 'buy'
  let discount = 0
  let vat = 0
  let items = [{ product_name: '', quantity: 1, unit: '', unit_price: 0 }]

  const sellerF = personField({ label: counterpartyLabel(invoiceType), required: true, hint: 'با وارد کردن شناسه، اطلاعات شخص بارگیری می‌شود.' })

// انتخابگر مرکز هزینه (مودال شبیه انتخاب اشخاص)
  let selectedCC = null
  let costCenters = []
  api.get('/api/cost-centers').then((d) => { costCenters = d || [] }).catch(() => {})
  const ccInfoEl = el('div', { class: 'person-field-info' }, 'برای انتخاب مرکز هزینه، روی دکمه «انتخاب» کلیک کنید.')
  const costCenterField = el('div', { class: 'field' }, [
    el('label', {}, 'مرکز هزینه'),
    el('div', { class: 'person-field' }, [
      el('div', { class: 'person-field-row' }, [
        el('button', { class: 'btn btn-ghost', type: 'button', onclick: openCostCenterPicker }, [
          el('span', { html: icon('search', 16) }), 'انتخاب',
        ]),
        el('button', { class: 'icon-btn danger', type: 'button', title: 'پاک کردن', onclick: () => { selectedCC = null; ccInfoEl.className = 'person-field-info'; ccInfoEl.textContent = 'برای انتخاب مرکز هزینه، روی دکمه «انتخاب» کلیک کنید.' } }, [
          el('span', { html: icon('x', 17) }),
        ]),
      ]),
      ccInfoEl,
    ]),
  ])
  function openCostCenterPicker() {
    const searchInput = el('input', { class: 'input', placeholder: 'جستجوی مرکز هزینه…', autofocus: '' })
    const listEl = el('div', { class: 'picker-list' })
    listEl.append(el('div', { class: 'page-loading', style: 'padding:30px' }, 'در حال بارگذاری…'))
    let timer = null
    function renderList(q) {
      const filtered = costCenters.filter((c) => {
        if (!q) return true
        return [c.name, c.code, String(c.id)].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase())
      })
      listEl.innerHTML = ''
      if (!filtered.length) { listEl.append(el('div', { class: 'dd-empty' }, 'مرکزی یافت نشد')); return }
      for (const c of filtered) {
        listEl.append(el('div', { class: 'picker-row', onclick: () => { m.close(); selectCostCenter(c) } }, [
          el('div', { class: 'pr-main' }, [
            el('div', { class: 'pr-name' }, esc(c.name)),
            c.code ? el('div', { class: 'pr-sub' }, `کد: ${esc(c.code)}`) : null,
          ]),
          el('div', { class: 'pr-id' }, `شناسه ${faNum(c.id)}`),
        ]))
      }
    }
    searchInput.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => renderList(searchInput.value.trim()), 250) })
    const m = openModal({
      title: 'انتخاب مرکز هزینه', size: 'modal-sm',
      body: el('div', {}, [
        el('div', { class: 'picker-search' }, [el('span', { html: icon('search', 18) }), searchInput]),
        listEl,
        el('button', { class: 'picker-add', onclick: () => { m.close(); quickCostCenterForm() } }, [
          el('span', { html: icon('plus', 18) }), 'افزودن مرکز هزینه جدید',
        ]),
      ]),
    })
    renderList('')
  }
  function quickCostCenterForm() {
    const nameInput = el('input', { class: 'input', placeholder: 'نام مرکز هزینه…', autofocus: '' })
    const codeInput = el('input', { class: 'input', placeholder: 'کد (اختیاری)…' })
    const form = el('div', { class: 'form-grid' }, [
      el('div', { class: 'field' }, [el('label', {}, ['نام', el('span', { class: 'req' }, '*')]), nameInput]),
      el('div', { class: 'field' }, [el('label', {}, 'کد'), codeInput]),
    ])
    const m = openModal({
      title: 'مرکز هزینه جدید', size: 'modal-sm', body: form,
      footer: (foot) => {
        foot.append(
          el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'انصراف'),
          el('button', { class: 'btn btn-primary', onclick: async () => {
            const name = nameInput.value.trim()
            if (!name) { toast('نام مرکز هزینه اجباری است', 'error'); return }
            try {
              const cc = await api.post('/api/cost-centers', { name, code: codeInput.value.trim() })
              costCenters.push(cc)
              toast('مرکز هزینه جدید اضافه شد')
              m.close()
              selectCostCenter(cc)
            } catch (err) { toast(err.message, 'error') }
          } }, 'ذخیره'),
        )
      },
    })
  }
  function selectCostCenter(cc) {
    selectedCC = cc
    ccInfoEl.className = 'person-field-info ok'
    ccInfoEl.innerHTML = ''
    ccInfoEl.append(
      el('span', {}, [el('strong', {}, esc(cc.name)), cc.code ? ` — کد ${esc(cc.code)}` : '']),
      el('span', { class: 'pf-badge' }, `شناسه ${faNum(cc.id)}`),
    )
  }
  const numberInput = el('input', { class: 'input', placeholder: 'مثلاً F-1404-001' })
  const dateInput = jdateInput({ onChange: () => {} })
  const discountInput = numberInputEl(0)
  const vatInput = numberInputEl(0)
  const notesInput = el('textarea', { class: 'input', placeholder: 'توضیحات…', rows: 2 })

  const itemsWrap = el('div', { class: 'items-editor' })
  const summaryEl = el('div', { class: 'items-summary' })
  const itemsBody = el('tbody', {})

  // بخش پرداخت‌های ثبت‌شده برای این فاکتور (فقط در حالت ویرایش)
  const paymentsWrap = el('div', { class: 'inv-payments' })

  // ---------- پیوست فاکتور ----------
  const attachment = attachmentField({ entityType: 'invoice', entityId: id })
  const paymentsBox = el('div', { class: 'field span-2' }, [
    el('label', {}, 'پرداخت‌های این فاکتور'),
    paymentsWrap,
    el('span', { class: 'hint' }, 'یک فاکتور ممکن است توسط چند شخص یا توسط خود شرکت پرداخت شود.'),
  ])
  paymentsBox.style.display = 'none'

  function numberInputEl(initial) {
    const inp = el('input', { class: 'input num', inputmode: 'numeric', value: initial ? String(initial) : '' })
    inp.addEventListener('input', () => {
      inp.value = enNum(inp.value)
    })
    return inp
  }

  function buildItemsEditor() {
    itemsWrap.innerHTML = ''
    const t = el('table', { class: 'data' })
    const head = el('thead', {}, [
      el('tr', {}, [
        el('th', {}, 'کالا'),
        el('th', {}, 'تعداد'),
        el('th', {}, 'واحد'),
        el('th', {}, 'قیمت واحد'),
        el('th', {}, 'جمع'),
        el('th', {}, ''),
      ]),
    ])
    itemsBody.innerHTML = ''
    t.append(head, itemsBody)
    itemsWrap.append(t)

    const addBtn = el(
      'button',
      {
        class: 'btn btn-ghost btn-sm',
        style: 'margin:12px;width:calc(100% - 24px)',
        onclick: () => {
          items.push({ product_name: '', quantity: 1, unit: '', unit_price: 0 })
          renderItems()
        },
      },
      [el('span', { html: icon('plus', 15) }), 'افزودن قلم']
    )
    itemsWrap.append(addBtn)
  }

  function renderItems() {
    itemsBody.innerHTML = ''
    items.forEach((it, idx) => {
      const productInput = el('input', {
        class: 'input',
        placeholder: 'نام کالا / خدمات',
        value: it.product_name,
        oninput: (e) => (it.product_name = e.target.value),
      })
      const qtyInput = numberInputEl(it.quantity)
      qtyInput.classList.add('qty-in')
      qtyInput.addEventListener('input', () => {
        it.quantity = parseFloat(enNum(qtyInput.value)) || 0
        updateRow(idx)
      })
      const unitInput = el('input', { class: 'input', list: 'unit-list', placeholder: 'واحد', value: it.unit, oninput: (e) => (it.unit = e.target.value) })
      const priceInput = numberInputEl(it.unit_price)
      priceInput.classList.add('price-in')
      priceInput.addEventListener('input', () => {
        it.unit_price = parseFloat(enNum(priceInput.value)) || 0
        updateRow(idx)
      })
      const rowTotal = el('td', { class: 'num total-cell' }, money(rowSum(it)))

      const tr = el('tr', {}, [
        el('td', {}, productInput),
        el('td', {}, qtyInput),
        el('td', {}, unitInput),
        el('td', {}, priceInput),
        rowTotal,
        el('td', {}, [
          el(
            'button',
            {
              class: 'icon-btn danger',
              title: 'حذف قلم',
              onclick: () => {
                items.splice(idx, 1)
                renderItems()
                updateSummary()
              },
            },
            el('span', { html: icon('x', 16) })
          ),
        ]),
      ])
      tr.dataset.idx = idx
      itemsBody.append(tr)
    })

    if (!document.getElementById('unit-list')) {
      document.body.append(el('datalist', { id: 'unit-list' }, UNITS.map((u) => el('option', { value: u }))))
    }
  }

  function rowSum(it) {
    return (Number(it.quantity) || 0) * (Number(it.unit_price) || 0)
  }

  function updateRow(idx) {
    const tr = itemsBody.querySelector(`tr[data-idx="${idx}"]`)
    if (tr) tr.querySelector('.total-cell').textContent = money(rowSum(items[idx]))
    updateSummary()
  }

  function updateSummary() {
    const itemsTotal = items.reduce((s, it) => s + rowSum(it), 0)
    const d = parseFloat(enNum(discountInput.value)) || 0
    const v = parseFloat(enNum(vatInput.value)) || 0
    const grand = itemsTotal - d + v
    summaryEl.innerHTML = ''
    summaryEl.append(
      chip('جمع اقلام', money(itemsTotal)),
      chip('تخفیف', money(d)),
      chip('ارزش افزوده', money(v)),
      el('div', { class: 'summary-chip total' }, [el('span', {}, 'جمع کل'), el('strong', {}, money(grand))])
    )
  }

  // لود فاکتور برای ویرایش
  async function loadInvoice() {
    try {
      inv = await api.get(`/api/invoices/${id}`)
      invoiceType = inv.invoice_type
      discount = Number(inv.discount_amount) || 0
      vat = Number(inv.vat_amount) || 0
      items = inv.items.map((x) => ({ product_name: x.product_name, quantity: x.quantity, unit: x.unit, unit_price: x.unit_price }))
      if (!items.length) items = [{ product_name: '', quantity: 1, unit: '', unit_price: 0 }]

      setSegActive(invoiceType)
      sellerF.setValue(inv.seller_id, {
        id: inv.seller_id,
        first_name: inv.seller_first_name,
        last_name: inv.seller_last_name,
        company_name: inv.seller_company_name,
      })
      numberInput.value = inv.invoice_number || ''
      if (inv.cost_center_id) { api.get(`/api/cost-centers/${inv.cost_center_id}`).then((cc) => selectCostCenter(cc)).catch(() => {}) }
      dateInput.setValue(inv.invoice_date)
      discountInput.value = discount ? String(discount) : ''
      vatInput.value = vat ? String(vat) : ''
      notesInput.value = inv.notes || ''
      renderItems()
      updateSummary()
      renderInvoicePayments(inv)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  function renderInvoicePayments(invoice) {
    const pays = invoice.payments || []
    paymentsBox.style.display = 'block'
    paymentsWrap.innerHTML = ''
    const balance = (Number(invoice.total_amount) || 0) - (Number(invoice.paid_amount) || 0)
    if (!pays.length) {
      paymentsWrap.append(el('div', { class: 'inv-pay-empty' }, 'هنوز پرداختی برای این فاکتور ثبت نشده است.'))
    } else {
      const list = el('div', { class: 'inv-pay-list' })
      for (const p of pays) {
        list.append(
          el('div', { class: 'inv-pay-row' }, [
            el('div', { class: 'inv-pay-main' }, [
              el('strong', {}, esc(fullName(p))),
              el('span', {}, `${txTypeLabel(p.transaction_type)} — ${esc(p.transfer_type || '—')} — ${faNum(p.payment_date)}`),
            ]),
            el('div', { class: 'inv-pay-amt', style: `color:${p.transaction_type === 'receive' ? 'var(--success)' : 'var(--danger)'}` }, money(p.amount)),
          ])
        )
      }
      paymentsWrap.append(list)
    }
    paymentsWrap.append(
      el('div', { class: 'inv-pay-foot' }, [
        el('div', { class: 'inv-pay-sum' }, [
          el('span', {}, `جمع پرداخت‌ها: ${money(invoice.paid_amount)}`),
          el('span', { style: `color:${balance > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:700` }, balance > 0 ? `مانده: ${money(balance)}` : 'تسویه‌شده'),
        ]),
        el(
          'button',
          {
            class: 'btn btn-ghost btn-sm',
            onclick: () => {
              const party = { id: inv.seller_id, first_name: inv.seller_first_name, last_name: inv.seller_last_name, company_name: inv.seller_company_name }
              openPaymentForm({
                prefill: {
                  invoice: {
                    id: inv.id,
                    invoice_number: inv.invoice_number,
                    invoice_type: inv.invoice_type,
                    total_amount: inv.total_amount,
                    paid_amount: inv.paid_amount,
                    seller_id: inv.seller_id,
                    seller_first_name: inv.seller_first_name,
                    seller_last_name: inv.seller_last_name,
                    seller_company_name: inv.seller_company_name,
                  },
                  person: party,
                  amount: balance > 0 ? balance : '',
                  notes: inv.invoice_number ? `پرداخت بابت فاکتور ${inv.invoice_number}` : '',
                },
                onSaved: () => loadInvoice(),
              })
            },
          },
          [el('span', { html: icon('plus', 15) }), 'ثبت پرداخت برای این فاکتور']
        ),
      ])
    )
  }

  const seg = el('div', { class: 'segmented' }, [])
  function setSegActive(t) {
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.type === t))
  }
  function setCounterpartyLabel() {
    const lbl = sellerF.el.querySelector('label')
    if (lbl && lbl.firstChild) lbl.firstChild.nodeValue = counterpartyLabel(invoiceType)
  }

  const typeField = el('div', { class: 'field span-2' }, [
    el('label', {}, ['نوع فاکتور', el('span', { class: 'req' }, '*')]),
    seg,
  ])
  for (const [label, val] of [['خرید', 'buy'], ['فروش', 'sell']]) {
    seg.append(
      el(
        'button',
        {
          type: 'button',
          dataset: { type: val },
          class: val === invoiceType ? 'active' : '',
          onclick: () => {
            invoiceType = val
            setSegActive(val)
            setCounterpartyLabel()
          },
        },
        label
      )
    )
  }

  buildItemsEditor()
  renderItems()

  // پیش‌فرض‌ها از منوی راست‌کلیک
  if (prefill.seller) sellerF.setValue(prefill.seller.id, prefill.seller)
  if (prefill.invoice_date) dateInput.setValue(prefill.invoice_date)
  else dateInput.setValue(todayJalaali())

  const vatCalcBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-ghost btn-sm',
      title: 'محاسبه‌ی خودکار مالیات بر اساس درصد تنظیم‌شده',
      onclick: () => {
        const itemsTotal = items.reduce((s, it) => s + rowSum(it), 0)
        const d = parseFloat(enNum(discountInput.value)) || 0
        const base = Math.max(0, itemsTotal - d)
        vatInput.value = String(Math.round((base * (Number(vatPercent) || 0)) / 100))
        updateSummary()
        toast(`مالیات بر ارزش افزوده با درصد ${faNum(vatPercent)}٪ محاسبه شد`)
      },
    },
    [el('span', { html: icon('refresh', 14) }), 'محاسبه‌ی خودکار']
  )

  const vatField = el('div', { class: 'field' }, [
    el('label', {}, ['مبلغ ارزش افزوده']),
    el('div', { class: 'input-row' }, [vatInput, vatCalcBtn]),
    el('span', { class: 'hint' }, `درصد مالیات: ${faNum(vatPercent)}٪ — قابل تغییر در «تنظیمات»`),
  ])

  // چیدمان: اقلام ← تخفیف/ارزش افزوده ← جمع اقلام، تخفیف، ارزش افزوده، جمع کل
  const form = el('div', { class: 'form-grid' }, [
    typeField,
    sellerF.el,
    fieldWrap('شماره فاکتور', numberInput, { hint: 'اختیاری' }),
    fieldWrap('تاریخ فاکتور (شمسی)', dateInput.el, { required: true }),
    costCenterField,
    el('div', { class: 'field span-2' }, [el('label', {}, 'اقلام فاکتور'), itemsWrap]),
    el('div', { class: 'field span-2' }, [
      el('div', { class: 'subgrid' }, [
        fieldWrap('مبلغ تخفیف', discountInput, { hint: 'به‌صورت دستی قابل تغییر است' }),
        vatField,
      ]),
    ]),
    el('div', { class: 'field span-2' }, [el('label', {}, 'جمع اقلام، تخفیف، ارزش افزوده و جمع کل'), summaryEl]),
    paymentsBox,
    attachment.el,
    el('div', { class: 'field span-2' }, [el('label', {}, 'توضیحات'), notesInput]),
  ])

  discountInput.addEventListener('input', updateSummary)
  vatInput.addEventListener('input', updateSummary)

  let m
  m = openModal({
    title: isEdit ? 'ویرایش فاکتور' : 'فاکتور جدید',
    size: 'modal-xl',
    body: form,
    footer: (foot) => {
      foot.append(
        el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'انصراف'),
        isEdit ? sendToExcelButton(id) : null,
        el('button', { class: 'btn btn-primary', onclick: save }, isEdit ? 'ذخیره تغییرات' : 'ثبت فاکتور')
      )
    },
  })

  if (isEdit) loadInvoice()
  else updateSummary()

  async function save(ev) {
    const btn = ev.currentTarget
    if (!sellerF.validate()) {
      toast('طرف حساب را انتخاب کنید', 'error')
      return
    }
    if (!dateInput.getValue().trim()) {
      toast('تاریخ فاکتور را وارد کنید', 'error')
      return
    }
    const validItems = items.filter((it) => it.product_name.trim() && (Number(it.quantity) || 0) > 0)
    if (!validItems.length) {
      toast('حداقل یک قلم فاکتور معتبر وارد کنید', 'error')
      return
    }

    const itemsTotal = items.reduce((s, it) => s + rowSum(it), 0)
    const d = parseFloat(enNum(discountInput.value)) || 0
    const v = parseFloat(enNum(vatInput.value)) || 0
    const grand = itemsTotal - d + v

    const payload = {
      invoice_number: numberInput.value.trim(),
      seller_id: sellerF.id,
      invoice_date: dateInput.getValue().trim(),
      invoice_type: invoiceType,
      discount_amount: d,
      vat_amount: v,
      total_amount: grand,
      cost_center_id: selectedCC ? selectedCC.id : null,
      notes: notesInput.value.trim(),
      items: items.map((it) => ({
        product_name: it.product_name.trim(),
        quantity: Number(it.quantity) || 0,
        unit: it.unit.trim(),
        unit_price: Number(it.unit_price) || 0,
        total_price: rowSum(it),
      })),
    }
    const attPayload = attachment.payload()
    if (attPayload) payload.attachment = attPayload

    buttonLoading(btn, true)
    try {
      if (isEdit) await api.put(`/api/invoices/${id}`, payload)
      else await api.post('/api/invoices', payload)
      attachment.markSaved?.()
      toast(isEdit ? 'فاکتور به‌روزرسانی شد' : 'فاکتور با موفقیت ثبت شد')
      m.close()
      onSaved?.(payload)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      buttonLoading(btn, false)
    }
  }
}

// ============================================================ چاپ فاکتور

export async function printInvoice(inv) {
  const [settings, party] = await Promise.all([
    api.get('/api/settings').catch(() => ({})),
    api.get(`/api/people/${inv.seller_id}`),
  ])
  const itemsTotal = inv.items.reduce((s, x) => s + (Number(x.total_price) || 0), 0)
  const rows = inv.items
    .map(
      (it, i) =>
        `<tr><td>${faNum(i + 1)}</td><td>${esc(it.product_name)}</td><td class="num">${faNum(it.quantity)}</td><td>${esc(it.unit || '')}</td><td class="num">${money(it.unit_price)}</td><td class="num">${money(it.total_price)}</td></tr>`
    )
    .join('')
  const partyTitle = inv.invoice_type === 'sell' ? 'خریدار / مشتری' : 'فروشنده / تأمین‌کننده'
  // نام مرکز هزینه (اگر وجود داشته باشد)
  let costCenterName = ''
  if (inv.cost_center_id) {
    try {
      const cc = await api.get(`/api/cost-centers/${inv.cost_center_id}`)
      costCenterName = cc.name || ''
    } catch { /* ignore */ }
  }
  const doc = `
    <div class="print-doc" dir="rtl">
      <header class="p-head">
        <div class="p-brand">
          <strong>${esc(settings.company_name || 'حسابداری من')}</strong>
          ${settings.company_register_no ? `<span>شماره ثبت: ${esc(settings.company_register_no)}</span>` : ''}
          ${settings.company_economic_code ? `<span>کد اقتصادی: ${esc(settings.company_economic_code)}</span>` : ''}
          ${settings.company_phone ? `<span>تلفن: ${esc(settings.company_phone)}</span>` : ''}
          ${settings.company_address ? `<span>${esc(settings.company_address)}</span>` : ''}
        </div>
        <div class="p-title">${inv.invoice_type === 'sell' ? 'فاکتور فروش' : 'فاکتور خرید'}</div>
        <div class="p-meta">
          <span>شماره: ${esc(inv.invoice_number || `INV-${inv.id}`)}</span>
          <span>تاریخ: ${faNum(inv.invoice_date)}</span>
          ${costCenterName ? `<span>مرکز هزینه: ${esc(costCenterName)}</span>` : ''}
        </div>
      </header>
      <section class="p-parties">
        <div class="p-party">
          <h4>${partyTitle}</h4>
          <p>${esc(fullName(party))}</p>
          ${party.national_code ? `<p>کد ملی: ${esc(party.national_code)}</p>` : ''}
          ${party.company_national_id ? `<p>شناسه ملی: ${esc(party.company_national_id)}</p>` : ''}
          ${party.address ? `<p>${esc(party.address)}</p>` : ''}
          ${party.phone || party.mobile ? `<p>تلفن: ${esc([party.phone, party.mobile].filter(Boolean).join(' - '))}</p>` : ''}
        </div>
      </section>
      <table class="p-items">
        <thead><tr><th>#</th><th>کالا / خدمات</th><th>تعداد</th><th>واحد</th><th>قیمت واحد</th><th>جمع</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <section class="p-totals">
        <div><span>جمع اقلام</span><strong>${money(itemsTotal)}</strong></div>
        <div><span>تخفیف</span><strong>${money(inv.discount_amount)}</strong></div>
        <div><span>ارزش افزوده</span><strong>${money(inv.vat_amount)}</strong></div>
        <div class="grand"><span>جمع کل</span><strong>${money(inv.total_amount)}</strong></div>
        <div><span>پرداخت‌شده</span><strong>${money(inv.paid_amount)}</strong></div>
        <div><span>مانده</span><strong>${money((Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0))}</strong></div>
      </section>
      ${inv.notes ? `<section class="p-notes"><h4>توضیحات</h4><p>${esc(inv.notes)}</p></section>` : ''}
      <footer class="p-foot"><div>مهر و امضا</div><div>مهر و امضا</div></footer>
    </div>`
  printDocument(doc)
}

function chip(label, value) {
  return el('div', { class: 'summary-chip' }, [el('span', {}, label), el('strong', {}, value)])
}
