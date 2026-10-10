import { api } from '../api.js'
import { el, faNum, esc, fullName, icon, money, formatDate } from '../utils.js'
import { toast, confirmDialog, openModal, renderPagination, emptyState, skeletonRows } from '../ui.js'
import { openInvoiceForm, printInvoice, counterpartyLabel } from '../invoice-form.js'
import { openPaymentForm, txTypeLabel } from '../payment-form.js'
import { showContextMenu } from '../contextmenu.js'
import { openReportModal } from './reports.js'
import { openEntityAttachment, deleteAttachmentWithConfirm } from '../attachments.js'
import { sendToExcelButton } from '../excel-export.js'

/** دکمه مشاهده پیوست ردیف فاکتور — فقط وقتی attachment_count > 0 */
function attachmentViewRowButton(invoiceId) {
  return el('button', {
    class: 'icon-btn',
    title: 'مشاهده پیوست',
    onclick: () => openEntityAttachment('invoice', invoiceId),
  }, el('span', { html: icon('fileDown', 17) }))
}

/** حذف پیوست فاکتور از لیست/منو — با تأیید، سپس رفرش لیست */
async function deleteInvoiceAttachment(invoiceId) {
  try {
    const res = await api.get(`/api/attachments/invoice/${invoiceId}`)
    const list = res.data || []
    if (!list.length) {
      toast('این رکورد پیوست ندارد', 'error')
      return
    }
    const done = await deleteAttachmentWithConfirm(list[0])
    if (done) load()
  } catch (err) {
    toast(err.message, 'error')
  }
}

const PAGE_SIZE = 10

export function renderInvoicesPage(root) {
  const state = { page: 1, q: '', type: '', total: 0, data: [], loading: true }

  const searchInput = el('input', { class: 'input', placeholder: 'جستجو با شماره فاکتور یا نام طرف…', oninput: debounceInput })
  const typeSeg = el('div', { class: 'segmented' }, [segBtn('همه', ''), segBtn('خرید', 'buy'), segBtn('فروش', 'sell')])

  const tableWrap = el('div', { class: 'table-wrap' })
  const pagination = el('div', { class: 'pagination' })

  const toolbar = el('div', { class: 'toolbar' }, [
    el('div', { class: 'search-box' }, [el('span', { html: icon('search', 18) }), searchInput]),
    typeSeg,
    el('div', { class: 'toolbar-spacer' }),
    el('button', { class: 'btn btn-primary', onclick: () => openInvoiceForm({ onSaved: load }) }, [
      el('span', { html: icon('plus', 17) }),
      'فاکتور جدید',
    ]),
  ])

  root.innerHTML = ''
  root.append(toolbar, tableWrap, pagination)

  function segBtn(label, val) {
    return el(
      'button',
      {
        class: val === state.type ? 'active' : '',
        onclick: (e) => {
          state.type = val
          state.page = 1
          typeSeg.querySelectorAll('button').forEach((b) => b.classList.remove('active'))
          e.currentTarget.classList.add('active')
          load()
        },
      },
      label
    )
  }

  function debounceInput() {
    clearTimeout(debounceInput._t)
    debounceInput._t = setTimeout(() => {
      state.q = searchInput.value.trim()
      state.page = 1
      load()
    }, 350)
  }

  async function load() {
    state.loading = true
    renderTable()
    try {
      const params = new URLSearchParams({ page: String(state.page), pageSize: String(PAGE_SIZE) })
      if (state.q) params.set('q', state.q)
      if (state.type) params.set('type', state.type)
      const res = await api.get(`/api/invoices?${params}`)
      state.data = res.data
      state.total = res.total
      state.page = res.page
    } catch (err) {
      toast(err.message, 'error')
      state.data = []
      state.total = 0
    } finally {
      state.loading = false
      renderTable()
      renderPagination(pagination, {
        page: state.page,
        total: state.total,
        pageSize: PAGE_SIZE,
        onChange: (p) => {
          state.page = p
          load()
        },
      })
    }
  }

  function renderTable() {
    if (state.loading) {
      tableWrap.innerHTML = ''
      tableWrap.append(el('table', { class: 'data' }, [el('tbody', {}, skeletonRows(6))]))
      return
    }
    if (!state.data.length) {
      tableWrap.innerHTML = ''
      tableWrap.append(
        emptyState({
          icon: 'doc',
          title: 'فاکتوری یافت نشد',
          sub: state.q || state.type ? 'فیلتر شما نتیجه‌ای نداشت' : 'هنوز فاکتوری ثبت نشده است.',
          action: el('button', { class: 'btn btn-primary', onclick: () => openInvoiceForm({ onSaved: load }) }, 'فاکتور جدید'),
        })
      )
      return
    }

    tableWrap.innerHTML = ''
    const table = el('table', { class: 'data' })
    table.append(
      el('thead', {}, [
        el('tr', {}, [
          el('th', {}, 'شناسه'),
          el('th', {}, 'شماره فاکتور'),
          el('th', {}, 'طرف حساب'),
          el('th', {}, 'تاریخ'),
          el('th', {}, 'نوع'),
          el('th', { class: 'num' }, 'مبلغ کل'),
          el('th', { class: 'num' }, 'پرداخت‌شده'),
          el('th', { class: 'num' }, 'مانده'),
          el('th', {}, 'عملیات'),
        ]),
      ])
    )
    const tbody = el('tbody', {})
    for (const inv of state.data) {
      const party = { first_name: inv.seller_first_name, last_name: inv.seller_last_name, company_name: inv.seller_company_name }
      const balance = (Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0)
      const tr = el('tr', {}, [
        el('td', {}, el('span', { class: 'badge badge-purple' }, faNum(inv.id))),
        el('td', {}, inv.invoice_number ? esc(inv.invoice_number) : '—'),
        el('td', {}, [
          el('span', { class: 'cell-main' }, esc(fullName(party))),
          el('span', { class: 'cell-sub' }, `${counterpartyLabel(inv.invoice_type)} — شناسه ${faNum(inv.seller_id)}`),
        ]),
        el('td', { class: 'num' }, formatDate(inv.invoice_date)),
        el('td', {}, invoiceTypeBadge(inv.invoice_type)),
        el('td', { class: 'num' }, money(inv.total_amount)),
        el('td', { class: 'num' }, money(inv.paid_amount)),
        el(
          'td',
          {
            class: 'num',
            style: `font-weight:700;color:${balance > 0 ? 'var(--danger)' : 'var(--success)'}`,
          },
          balance > 0 ? money(balance) : 'تسویه'
        ),
        el('td', {}, [
          el('div', { class: 'actions' }, [
            el('button', { class: 'icon-btn info', title: 'مشاهده', onclick: () => viewInvoice(inv.id) }, el('span', { html: icon('eye', 17) })),
            el('button', { class: 'icon-btn', title: 'ویرایش', onclick: () => openInvoiceForm({ id: inv.id, onSaved: load }) }, el('span', { html: icon('edit', 17) })),
            inv.attachment_count ? attachmentViewRowButton(inv.id) : null,
            sendToExcelButton(inv.id),
            el('button', { class: 'icon-btn danger', title: 'حذف', onclick: () => delInvoice(inv) }, el('span', { html: icon('trash', 17) })),
          ]),
        ]),
      ])
      tr.addEventListener('contextmenu', (e) => rowMenu(e, inv))
      tbody.append(tr)
    }
    table.append(tbody)
    tableWrap.append(table)
  }

  function partyOf(inv) {
    return { first_name: inv.seller_first_name, last_name: inv.seller_last_name, company_name: inv.seller_company_name }
  }

  function rowMenu(e, inv) {
    e.preventDefault()
    const balance = (Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0)
    const items = [
      { label: 'مشاهده فاکتور', icon: 'eye', action: () => viewInvoice(inv.id) },
      { label: 'ویرایش فاکتور', icon: 'edit', action: () => openInvoiceForm({ id: inv.id, onSaved: load }) },
      { label: 'چاپ فاکتور', icon: 'printer', action: () => printInvoiceById(inv.id) },
      { label: 'ثبت پرداخت / دریافت برای فاکتور', icon: 'card', action: () => payInvoice(inv, balance) },
    ]
    if (balance > 0) {
      items.push({
        label: `تسویه‌ی مانده (${money(balance)})`,
        icon: 'check',
        action: () => payInvoice(inv, balance, true),
      })
    }
    items.push({
      label: 'گزارش فاکتورهای شخص',
      icon: 'doc',
      action: () =>
        openReportModal({
          personId: inv.seller_id,
          personName: fullName(partyOf(inv)),
          kind: 'invoices',
        }),
    })
    if (inv.attachment_count) {
      items.push({ label: 'مشاهده پیوست', icon: 'fileDown', action: () => openEntityAttachment('invoice', inv.id) })
      items.push({ label: 'حذف پیوست', icon: 'trash', danger: true, action: () => deleteInvoiceAttachment(inv.id) })
    }
    showContextMenu(e.clientX, e.clientY, items)
  }

  // ثبت پرداخت/دریافت بابت فاکتور — مبلغ پرداخت‌شده‌ی فاکتور خودکار به‌روزرسانی می‌شود
  function payInvoice(inv, balance, settle = false) {
    const party = { id: inv.seller_id, ...partyOf(inv) }
    const invoice = {
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
    openPaymentForm({
      prefill: {
        invoice,
        person: party,
        amount: settle && balance > 0 ? balance : '',
        notes: inv.invoice_number ? `پرداخت بابت فاکتور ${inv.invoice_number}` : `پرداخت بابت فاکتور شناسه ${faNum(inv.id)}`,
      },
      onSaved: () => load(),
    })
  }

  async function printInvoiceById(id) {
    try {
      const inv = await api.get(`/api/invoices/${id}`)
      printInvoice(inv)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function delInvoice(inv) {
    const ok = await confirmDialog({
      title: 'حذف فاکتور',
      message: `آیا از حذف فاکتور ${inv.invoice_number ? `«${inv.invoice_number}» ` : ''}با مبلغ ${money(inv.total_amount)} مطمئن هستید؟ پرداخت‌های مرتبط به این فاکتور حذف نمی‌شوند.`,
    })
    if (!ok) return
    try {
      await api.del(`/api/invoices/${inv.id}`)
      toast('فاکتور حذف شد')
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function viewInvoice(id) {
    try {
      const inv = await api.get(`/api/invoices/${id}`)
      const party = partyOf(inv)
      const balance = (Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0)

      const itemsTable = el('div', { class: 'table-wrap', style: 'margin-top:4px' })
      const t = el('table', { class: 'data' })
      t.append(
        el('thead', {}, [
          el('tr', {}, [
            el('th', {}, '#'),
            el('th', {}, 'کالا'),
            el('th', { class: 'num' }, 'تعداد'),
            el('th', {}, 'واحد'),
            el('th', { class: 'num' }, 'قیمت واحد'),
            el('th', { class: 'num' }, 'جمع'),
          ]),
        ])
      )
      const tb = el('tbody', {})
      inv.items.forEach((it, i) => {
        tb.append(
          el('tr', {}, [
            el('td', {}, faNum(i + 1)),
            el('td', {}, esc(it.product_name)),
            el('td', { class: 'num' }, faNum(it.quantity)),
            el('td', {}, it.unit || '—'),
            el('td', { class: 'num' }, money(it.unit_price)),
            el('td', { class: 'num' }, money(it.total_price)),
          ])
        )
      })
      t.append(tb)
      itemsTable.append(t)

      const summary = el('div', { class: 'items-summary' }, [
        chip('جمع اقلام', money(inv.items.reduce((s, x) => s + (Number(x.total_price) || 0), 0))),
        chip('تخفیف', money(inv.discount_amount)),
        chip('ارزش افزوده', money(inv.vat_amount)),
        el('div', { class: 'summary-chip total' }, [el('span', {}, 'جمع کل'), el('strong', {}, money(inv.total_amount))]),
        chip('پرداخت‌شده', money(inv.paid_amount)),
        chip('مانده', money(balance)),
      ])

      // پیوست‌های این فاکتور
      const attachments = inv.attachments || []
      const attachmentsBox = attachments.length
        ? el('div', { class: 'detail-sec' }, [
            el('h4', {}, 'پیوست‌ها'),
            el('div', { class: 'inv-pay-list' }, attachments.map((a) =>
              el('div', { class: 'inv-pay-row' }, [
                el('div', { class: 'inv-pay-main' }, [
                  el('strong', {}, esc(a.original_file_name || a.stored_file_name)),
                  el('span', {}, a.exists ? `اندازه ${faNum(Math.max(1, Math.round((a.file_size || 0) / 1024)))} کیلوبایت` : 'فایل روی دیسک یافت نشد'),
                ]),
                el('button', { class: 'btn btn-ghost btn-sm', onclick: () => openEntityAttachment('invoice', inv.id) }, [
                  el('span', { html: icon('eye', 15) }),
                  'مشاهده پیوست',
                ]),
                el('button', { class: 'icon-btn danger', title: 'حذف پیوست', onclick: async () => {
                  const done = await deleteAttachmentWithConfirm(a)
                  if (done) { m.close(); load() }
                } }, el('span', { html: icon('trash', 15) }))
              ])
            )),
          ])
        : null

      // پرداخت‌های این فاکتور
      const paysBox = el('div', { class: 'detail-sec' }, [
        el('h4', {}, 'پرداخت‌های این فاکتور'),
        (inv.payments || []).length
          ? el('div', { class: 'inv-pay-list' }, (inv.payments || []).map((p) =>
              el('div', { class: 'inv-pay-row' }, [
                el('div', { class: 'inv-pay-main' }, [
                  el('strong', {}, esc(fullName(p))),
                  el('span', {}, `${txTypeLabel(p.transaction_type)} — ${esc(p.transfer_type || '—')} — ${formatDate(p.payment_date)}`),
                ]),
                el('div', { class: 'inv-pay-amt', style: `color:${p.transaction_type === 'receive' ? 'var(--success)' : 'var(--danger)'}` }, money(p.amount)),
              ])
            ))
          : el('p', { style: 'font-size:13px;color:var(--muted)' }, 'هنوز پرداختی ثبت نشده است.'),
      ])

      let m
      m = openModal({
        title: `فاکتور ${inv.invoice_number ? esc(inv.invoice_number) : `شناسه ${faNum(inv.id)}`}`,
        size: 'modal-lg',
        body: el('div', {}, [
          el('div', { class: 'detail-grid' }, [
            detail('شناسه فاکتور', faNum(inv.id)),
            detail('نوع فاکتور', inv.invoice_type === 'sell' ? 'فروش' : 'خرید'),
            detail('تاریخ', formatDate(inv.invoice_date)),
            detail(counterpartyLabel(inv.invoice_type), `${esc(fullName(party))} (${faNum(inv.seller_id)})`),
          ]),
          el('div', { class: 'detail-sec' }, [el('h4', {}, 'اقلام فاکتور'), itemsTable, summary]),
          attachmentsBox,
          paysBox,
          inv.notes
            ? el('div', { class: 'detail-sec' }, [el('h4', {}, 'توضیحات'), el('p', { style: 'font-size:14px;color:var(--text-2)' }, esc(inv.notes))])
            : null,
        ]),
        footer: (foot) =>
          foot.append(
            el('button', { class: 'btn btn-ghost', onclick: () => { m.close(); payInvoice(inv, balance) } }, [
              el('span', { html: icon('plus', 16) }),
              'ثبت پرداخت / دریافت',
            ]),
            el('button', { class: 'btn btn-ghost', onclick: () => printInvoice(inv) }, [el('span', { html: icon('printer', 16) }), 'چاپ فاکتور']),
            el('button', { class: 'btn btn-primary', onclick: () => { m.close(); openInvoiceForm({ id: inv.id, onSaved: load }) } }, 'ویرایش'),
            el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'بستن')
          ),
      })
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  function chip(label, value) {
    return el('div', { class: 'summary-chip' }, [el('span', {}, label), el('strong', {}, value)])
  }

  function detail(label, value) {
    return el('div', { class: 'detail-item' }, [el('div', { class: 'd-label' }, label), el('div', { class: 'd-value' }, value)])
  }

  load()
}

export function invoiceTypeBadge(type) {
  return type === 'sell'
    ? el('span', { class: 'badge badge-green' }, [el('span', { class: 'dot' }), 'فروش'])
    : el('span', { class: 'badge badge-blue' }, [el('span', { class: 'dot' }), 'خرید'])
}
