import { api } from '../api.js'
import { el, faNum, esc, fullName, icon, money, formatDate } from '../utils.js'
import { toast, confirmDialog, renderPagination, emptyState, skeletonRows } from '../ui.js'
import { openPaymentForm } from '../payment-form.js'
import { showContextMenu } from '../contextmenu.js'
import { openReportModal } from './reports.js'
import { attachmentViewButton, openEntityAttachment, deletePaymentAttachmentFromMenu } from '../attachments.js'

const PAGE_SIZE = 10

export function renderPaymentsPage(root) {
  const state = { page: 1, q: '', total: 0, data: [], loading: true }

  const searchInput = el('input', { class: 'input', placeholder: 'جستجو با نام شخص، نوع انتقال یا شماره فاکتور…', oninput: debounceInput })
  const tableWrap = el('div', { class: 'table-wrap' })
  const pagination = el('div', { class: 'pagination' })

  const toolbar = el('div', { class: 'toolbar' }, [
    el('div', { class: 'search-box' }, [el('span', { html: icon('search', 18) }), searchInput]),
    el('div', { class: 'toolbar-spacer' }),
    el('button', { class: 'btn btn-primary', onclick: () => openPaymentForm({ onSaved: load }) }, [
      el('span', { html: icon('plus', 17) }),
      'ثبت دریافت / پرداخت',
    ]),
  ])

  root.innerHTML = ''
  root.append(toolbar, tableWrap, pagination)

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
      const res = await api.get(`/api/payments?${params}`)
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
          icon: 'card',
          title: 'تراکنشی یافت نشد',
          sub: state.q ? 'جستجوی شما نتیجه‌ای نداشت' : 'هنوز تراکنشی ثبت نشده است.',
          action: el('button', { class: 'btn btn-primary', onclick: () => openPaymentForm({ onSaved: load }) }, 'ثبت دریافت / پرداخت'),
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
          el('th', {}, 'شخص'),
          el('th', {}, 'نوع تراکنش'),
          el('th', {}, 'نوع انتقال'),
          el('th', {}, 'بابت فاکتور'),
          el('th', { class: 'num' }, 'مبلغ'),
          el('th', { class: 'num' }, 'تاریخ'),
          el('th', {}, 'عملیات'),
        ]),
      ])
    )
    const tbody = el('tbody', {})
    for (const pay of state.data) {
      const tr = el('tr', {}, [
        el('td', {}, el('span', { class: 'badge badge-purple' }, faNum(pay.id))),
        el('td', {}, [
          el('span', { class: 'cell-main' }, esc(fullName(pay))),
          el('span', { class: 'cell-sub' }, `شناسه ${faNum(pay.person_id)}`),
        ]),
        el('td', {}, txBadge(pay.transaction_type)),
        el('td', {}, pay.transfer_type ? esc(pay.transfer_type) : '—'),
        el('td', {}, pay.invoice_number ? esc(pay.invoice_number) : '—'),
        el(
          'td',
          { class: 'num', style: `color:${pay.transaction_type === 'receive' ? 'var(--success)' : 'var(--danger)'};font-weight:700` },
          `${pay.transaction_type === 'receive' ? '+' : '−'} ${money(pay.amount)}`
        ),
        el('td', { class: 'num' }, formatDate(pay.payment_date)),
        el('td', {}, [
          el('div', { class: 'actions' }, [
            el('button', { class: 'icon-btn', title: 'ویرایش', onclick: () => openPaymentForm({ id: pay.id, onSaved: load }) }, el('span', { html: icon('edit', 17) })),
            pay.attachment_count ? attachmentViewButton('payment', pay.id) : null,
            el('button', { class: 'icon-btn danger', title: 'حذف', onclick: () => delPayment(pay) }, el('span', { html: icon('trash', 17) })),
          ]),
        ]),
      ])
      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        const menuItems = [
          { label: 'ویرایش تراکنش', icon: 'edit', action: () => openPaymentForm({ id: pay.id, onSaved: load }) },
          {
            label: 'گزارش تراکنش‌های شخص',
            icon: 'doc',
            action: () =>
              openReportModal({
                personId: pay.person_id,
                personName: fullName(pay),
                kind: 'payments',
              }),
          },
        ]
        if (pay.attachment_count) {
          menuItems.push({ label: 'مشاهده پیوست', icon: 'fileDown', action: () => openEntityAttachment('payment', pay.id) })
          menuItems.push({ label: 'حذف پیوست', icon: 'trash', danger: true, action: async () => {
            const done = await deletePaymentAttachmentFromMenu(pay.id)
            if (done) load()
          } })
        }
        showContextMenu(e.clientX, e.clientY, menuItems)
      })
      tbody.append(tr)
    }
    table.append(tbody)
    tableWrap.append(table)
  }

  async function delPayment(pay) {
    const ok = await confirmDialog({
      title: 'حذف تراکنش',
      message: `آیا از حذف تراکنش ${money(pay.amount)} ${pay.transfer_type || ''} مطمئن هستید؟ در صورت تعلق به فاکتور، مانده‌ی فاکتور نیز به‌روزرسانی می‌شود.`,
    })
    if (!ok) return
    try {
      await api.del(`/api/payments/${pay.id}`)
      toast('تراکنش حذف شد')
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  load()
}

export function txBadge(type) {
  return type === 'receive'
    ? el('span', { class: 'badge badge-green' }, [el('span', { class: 'dot' }), 'دریافت'])
    : el('span', { class: 'badge badge-red' }, [el('span', { class: 'dot' }), 'پرداخت'])
}
