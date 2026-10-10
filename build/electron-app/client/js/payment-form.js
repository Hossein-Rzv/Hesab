import { api } from './api.js'
import { el, faNum, esc, enNum, fullName, icon, money } from './utils.js'
import { toast, openModal, fieldWrap, buttonLoading, emptyState } from './ui.js'
import { personField } from './picker.js'
import { jdateInput } from './jdate.js'
import { todayJalaali } from './jalaali.js'
import { attachmentField } from './attachments.js'

const DEFAULT_TRANSFER_TYPES = ['نقدی', 'چک', 'حواله', 'کارت به کارت', 'پایا', 'ساتنا', 'پوز', 'صیادی', 'قسطی', 'سایر']
let transferTypes = DEFAULT_TRANSFER_TYPES

api
  .get('/api/settings')
  .then((s) => {
    if (Array.isArray(s.transfer_types) && s.transfer_types.length) transferTypes = s.transfer_types
  })
  .catch(() => {})

export function txTypeLabel(t) {
  return t === 'pay' ? 'پرداخت' : 'دریافت'
}

/**
 * فرم ثبت/ویرایش تراکنش (دریافت / پرداخت)
 * prefill: { person, transaction_type, amount, transfer_type, payment_date, notes, invoice }
 *   invoice: { id, invoice_number, invoice_type, seller_id, seller_first_name, seller_last_name, seller_company_name, total_amount, paid_amount }
 * onSaved(payload) — پس از ذخیره‌ی موفق
 */
export function openPaymentForm({ id = null, onSaved, prefill = {} } = {}) {
  const isEdit = !!id
  let txType = prefill.transaction_type === 'receive' ? 'receive' : 'pay' // پیش‌فرض: پرداخت
  let pay = null
  let invoice = prefill.invoice || null
  let typeTouched = false // اگر کاربر خودش نوع تراکنش را دستی تغییر داد، پیشنهاد خودکار اعمال نشود

  const personF = personField({ label: 'شخص (دریافت از / پرداخت به)', required: true, hint: 'با وارد کردن شناسه، اطلاعات شخص بارگیری می‌شود.' })
  const amountInput = el('input', { class: 'input num', inputmode: 'numeric', placeholder: 'مثلاً ۵٬۰۰۰٬۰۰۰' })
  amountInput.addEventListener('input', () => (amountInput.value = enNum(amountInput.value)))
  const dateInput = jdateInput({ onChange: () => {} })
  const notesInput = el('textarea', { class: 'input', placeholder: 'توضیحات…', rows: 2 })

  // ---------- پیوست پرداخت ----------
  const attachment = attachmentField({ entityType: 'payment', entityId: id })

  const transferInput = el('input', { class: 'input', list: 'transfer-list', placeholder: 'انتخاب یا تایپ کنید…' })
  if (!document.getElementById('transfer-list')) {
    document.body.append(el('datalist', { id: 'transfer-list' }, transferTypes.map((t) => el('option', { value: t }))))
  }

  const seg = el('div', { class: 'segmented' }, [])
  for (const [label, val] of [['دریافت', 'receive'], ['پرداخت', 'pay']]) {
    seg.append(
      el(
        'button',
        {
          type: 'button',
          dataset: { type: val },
          class: val === txType ? 'active' : '',
          onclick: () => {
            typeTouched = true
            txType = val
            seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.type === val))
          },
        },
        label
      )
    )
  }

  // ---------- انتخاب فاکتور (اختیاری) ----------
  const invoiceIdInput = el('input', { class: 'input', placeholder: 'شناسه‌ی فاکتور', inputmode: 'numeric', autocomplete: 'off' })
  const invoiceInfo = el('div', { class: 'inv-link-info' })
  const invoiceField = el('div', { class: 'field' }, [
    el('label', {}, 'پرداخت بابت فاکتور (اختیاری)'),
    el('div', { class: 'person-field-row' }, [
      invoiceIdInput,
      el(
        'button',
        { class: 'btn btn-ghost', type: 'button', onclick: openInvoicePicker },
        [el('span', { html: icon('doc', 16) }), 'انتخاب فاکتور']
      ),
      el(
        'button',
        { class: 'icon-btn danger', type: 'button', title: 'حذف فاکتور', onclick: clearInvoice },
        el('span', { html: icon('x', 17) })
      ),
    ]),
    el('span', { class: 'hint' }, 'اگر تراکنش بابت یک فاکتور است، آن را انتخاب کنید تا به‌صورت خودکار از مانده‌ی فاکتور کسر شود.'),
    invoiceInfo,
  ])

  function renderInvoiceInfo() {
    if (!invoice) {
      invoiceInfo.innerHTML = ''
      invoiceIdInput.value = ''
      return
    }
    invoiceIdInput.value = String(invoice.id)
    const party = fullName({ first_name: invoice.seller_first_name, last_name: invoice.seller_last_name, company_name: invoice.seller_company_name })
    const invType = invoice.invoice_type === 'buy' ? 'فاکتور خرید' : 'فاکتور فروش'
    const balance = (Number(invoice.total_amount) || 0) - (Number(invoice.paid_amount) || 0)
    invoiceInfo.innerHTML = ''
    invoiceInfo.append(
      el('div', { class: 'inv-link-line' }, [
        el('span', { html: icon('doc', 15) }),
        el('span', {}, [
          el('strong', {}, esc(invoice.invoice_number || `فاکتور ${faNum(invoice.id)}`)),
          ` — ${invType} — طرف حساب: ${esc(party)}`,
        ]),
        el('span', { class: 'inv-bal', style: `color:${balance > 0 ? 'var(--danger)' : 'var(--success)'}` }, balance > 0 ? `مانده: ${money(balance)}` : 'تسویه‌شده'),
      ])
    )
  }

  function openInvoicePicker() {
    const search = el('input', { class: 'input', placeholder: 'جستجو با شماره فاکتور یا نام طرف…', autofocus: '' })
    const list = el('div', { class: 'picker-list' })
    list.append(el('div', { class: 'page-loading', style: 'padding:30px' }, 'در حال بارگذاری…'))
    const m = openModal({
      title: 'انتخاب فاکتور',
      size: 'modal-lg',
      body: el('div', {}, [
        el('div', { class: 'picker-search' }, [el('span', { html: icon('search', 18) }), search]),
        list,
      ]),
    })

    async function run(q) {
      list.innerHTML = ''
      list.append(el('div', { class: 'page-loading', style: 'padding:30px' }, 'در حال جستجو…'))
      try {
        const params = new URLSearchParams({ pageSize: '200' })
        if (q) params.set('q', q)
        const res = await api.get(`/api/invoices?${params}`)
        list.innerHTML = ''
        const rows = res.data || []
        if (!rows.length) {
          list.append(emptyState({ icon: 'doc', title: 'فاکتوری یافت نشد', sub: 'هنوز فاکتوری ثبت نشده است.' }))
          return
        }
        for (const inv of rows) {
          const balance = (Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0)
          const party = fullName({ first_name: inv.seller_first_name, last_name: inv.seller_last_name, company_name: inv.seller_company_name })
          const row = el('div', { class: 'picker-row' }, [
            el('div', { class: 'pr-main' }, [
              el('div', { class: 'pr-name' }, `${inv.invoice_number ? esc(inv.invoice_number) : `فاکتور ${faNum(inv.id)}`} — ${inv.invoice_type === 'buy' ? 'خرید' : 'فروش'} — ${esc(party)}`),
              el('div', { class: 'pr-sub' }, `تاریخ ${faNum(inv.invoice_date)} — مبلغ ${money(inv.total_amount)}`),
            ]),
            el('div', { class: 'pr-id', style: `color:${balance > 0 ? 'var(--danger)' : 'var(--success)'}` }, balance > 0 ? `مانده ${money(balance)}` : 'تسویه'),
          ])
          row.addEventListener('click', () => {
            m.close()
            invoice = {
              id: inv.id,
              invoice_number: inv.invoice_number,
              invoice_type: inv.invoice_type,
              total_amount: inv.total_amount,
              paid_amount: inv.paid_amount,
              seller_id: inv.seller_id,
              seller_first_name: inv.seller_first_name,
              seller_last_name: inv.seller_last_name,
              seller_company_name: inv.seller_company_name,
            }
            typeTouched = false
            renderInvoiceInfo()
            // پیشنهاد شخص = طرف حساب فاکتور (کاربر می‌تواند شخص ثالث را جایگزین کند)
            personF.setValue(inv.seller_id, {
              id: inv.seller_id,
              first_name: inv.seller_first_name,
              last_name: inv.seller_last_name,
              company_name: inv.seller_company_name,
            })
            syncWithInvoice()
            toast(`فاکتور ${inv.invoice_number || faNum(inv.id)} انتخاب شد`)
          })
          list.append(row)
        }
      } catch (err) {
        list.innerHTML = ''
        list.append(emptyState({ icon: 'alert', title: 'خطا', sub: err.message }))
      }
    }

    let t
    search.addEventListener('input', () => {
      clearTimeout(t)
      t = setTimeout(() => run(search.value.trim()), 300)
    })
    run('')
  }

  function clearInvoice() {
    invoice = null
    typeTouched = false
    renderInvoiceInfo()
    // باز کردن قفل نوع تراکنش
    seg.querySelectorAll('button').forEach((b) => { b.disabled = false; b.style.opacity = '' })
    // باز کردن قفل شخص
    personF.setLocked && personF.setLocked(false)
  }

  /** تنظیم خودکار نوع تراکنش بر اساس فاکتور و شخص */
  function syncWithInvoice() {
    const person = personF.getPerson()
    if (!invoice || !person) return
    let suggested
    if (Number(person.id) === Number(invoice.seller_id)) {
      suggested = invoice.invoice_type === 'buy' ? 'pay' : 'receive'
    } else {
      // شخص ثالث پرداخت می‌کند
      suggested = 'receive'
    }
    txType = suggested
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.type === txType))
    // قفل کردن نوع تراکنش هنگام انتخاب فاکتور
    seg.querySelectorAll('button').forEach((b) => { b.disabled = true; b.style.opacity = '0.5' })
    // قفل کردن شخص در فاکتور فروش (فقط در فاکتور فروش شخص ثالث مجاز نیست)
    if (invoice.invoice_type === 'sell') {
      personF.setLocked && personF.setLocked(true)
    }
  }

  // تغییر شخص — اگر فاکتوری متصل باشد، نوع پیشنهادی با قاعده‌ی «شخص ثالث» به‌روزرسانی می‌شود
  personF.el.addEventListener('personchange', () => syncWithInvoice())

  // پیش‌فرض‌های اولیه (مثلاً از منوی راست‌کلیک)
  if (prefill.person) personF.setValue(prefill.person.id, prefill.person)
  if (prefill.amount) amountInput.value = String(prefill.amount)
  if (prefill.transfer_type) transferInput.value = prefill.transfer_type
  if (prefill.payment_date) dateInput.setValue(prefill.payment_date)
  else dateInput.setValue(todayJalaali())
  if (prefill.notes) notesInput.value = prefill.notes
  if (prefill.invoice) {
    invoice = prefill.invoice
    renderInvoiceInfo()
  }

  if (isEdit) {
    api
      .get(`/api/payments/${id}`)
      .then((p) => {
        pay = p
        txType = p.transaction_type
        seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.type === txType))
        personF.setValue(p.person_id, {
          id: p.person_id,
          first_name: p.first_name,
          last_name: p.last_name,
          company_name: p.company_name,
        })
        amountInput.value = p.amount ? String(p.amount) : ''
        dateInput.setValue(p.payment_date)
        transferInput.value = p.transfer_type || ''
        notesInput.value = p.notes || ''
        if (p.invoice_id) {
          invoice = {
            id: p.invoice_id,
            invoice_number: p.invoice_number,
            invoice_type: p.invoice_type,
            total_amount: p.invoice_total,
            paid_amount: p.invoice_paid,
            seller_id: p.invoice_seller_id,
            seller_first_name: p.invoice_seller_first_name,
            seller_last_name: p.invoice_seller_last_name,
            seller_company_name: p.invoice_seller_company_name,
          }
          renderInvoiceInfo()
        }
      })
      .catch((err) => toast(err.message, 'error'))
  }

  const form = el('div', { class: 'form-grid' }, [
    personF.el,
    el('div', { class: 'field' }, [el('label', {}, ['نوع تراکنش', el('span', { class: 'req' }, '*')]), seg, el('span', { class: 'hint' }, 'دریافت: پول از شخص به حساب شرکت — پرداخت: پول از حساب شرکت به شخص')]),
    fieldWrap('نوع انتقال', transferInput, { hint: 'نقدی، چک، حواله، کارت به کارت و …' }),
    fieldWrap('مبلغ تراکنش', amountInput, { required: true }),
    fieldWrap('تاریخ تراکنش (شمسی)', dateInput.el, { required: true }),
    invoiceField,
    attachment.el,
    el('div', { class: 'field span-2' }, [el('label', {}, 'توضیحات'), notesInput]),
  ])

  let m
  m = openModal({
    title: isEdit ? 'ویرایش تراکنش' : 'ثبت تراکنش جدید',
    size: 'modal-lg',
    body: form,
    footer: (foot) => {
      foot.append(
        el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'انصراف'),
        el('button', { class: 'btn btn-primary', onclick: save }, isEdit ? 'ذخیره تغییرات' : 'ثبت تراکنش')
      )
    },
  })

  async function save(ev) {
    const btn = ev.currentTarget
    if (!personF.validate()) {
      toast('شخص را انتخاب کنید', 'error')
      return
    }
    const amount = parseFloat(enNum(amountInput.value)) || 0
    if (amount <= 0) {
      toast('مبلغ تراکنش باید بیشتر از صفر باشد', 'error')
      return
    }
    if (!dateInput.getValue().trim()) {
      toast('تاریخ تراکنش را وارد کنید', 'error')
      return
    }
    const payload = {
      person_id: personF.id,
      transaction_type: txType,
      transfer_type: transferInput.value.trim(),
      amount,
      payment_date: dateInput.getValue().trim(),
      invoice_id: invoice ? invoice.id : null,
      notes: notesInput.value.trim(),
    }
    const attPayload = attachment.payload()
    if (attPayload) payload.attachment = attPayload
    buttonLoading(btn, true)
    try {
      const saved = isEdit ? await api.put(`/api/payments/${id}`, payload) : await api.post('/api/payments', payload)
      attachment.markSaved?.()
      toast(isEdit ? 'تراکنش به‌روزرسانی شد' : 'تراکنش با موفقیت ثبت شد')
      m.close()
      onSaved?.(payload, saved)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      buttonLoading(btn, false)
    }
  }

  return { close: () => m.close() }
}
