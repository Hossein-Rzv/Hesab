import { api } from '../api.js'
import { el, faNum, esc, fullName, icon } from '../utils.js'
import { toast, confirmDialog, renderPagination, emptyState, skeletonRows } from '../ui.js'
import { personFormModal, openPersonViewModal } from '../person-form.js'
import { openInvoiceForm } from '../invoice-form.js'
import { openPaymentForm } from '../payment-form.js'
import { openReportModal } from './reports.js'
import { showContextMenu } from '../contextmenu.js'

const PAGE_SIZE = 10

export function renderPeoplePage(root) {
  const state = { page: 1, q: '', total: 0, data: [], loading: true }

  const searchInput = el('input', {
    class: 'input',
    placeholder: 'جستجو با نام، کد ملی، موبایل…',
    oninput: debounceInput,
  })

  const tableWrap = el('div', { class: 'table-wrap' })
  const pagination = el('div', { class: 'pagination' })

  const toolbar = el('div', { class: 'toolbar' }, [
    el('div', { class: 'search-box' }, [el('span', { html: icon('search', 18) }), searchInput]),
    el('div', { class: 'toolbar-spacer' }),
    el('button', { class: 'btn btn-primary', onclick: () => addPerson() }, [
      el('span', { html: icon('plus', 17) }),
      'افزودن شخص',
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
      const res = await api.get(
        `/api/people?q=${encodeURIComponent(state.q)}&page=${state.page}&pageSize=${PAGE_SIZE}`
      )
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
          icon: 'users',
          title: 'شخصی یافت نشد',
          sub: state.q ? 'جستجوی شما نتیجه‌ای نداشت' : 'برای شروع، اولین شخص را اضافه کنید.',
          action: el('button', { class: 'btn btn-primary', onclick: () => addPerson() }, 'افزودن شخص'),
        })
      )
      return
    }

    tableWrap.innerHTML = ''
    const table = el('table', { class: 'data' })
    const thead = el('thead', {}, [
      el('tr', {}, [
        el('th', {}, 'شناسه'),
        el('th', {}, 'نام'),
        el('th', {}, 'کد ملی'),
        el('th', {}, 'موبایل'),
        el('th', {}, 'تلفن'),
        el('th', {}, 'نام شرکت'),
        el('th', {}, 'عملیات'),
      ]),
    ])
    const tbody = el('tbody', {})
    for (const p of state.data) {
      const nameParts = [p.first_name, p.last_name].filter(Boolean)
      const tr = el('tr', {}, [
        el('td', {}, el('span', { class: 'badge badge-purple' }, faNum(p.id))),
        el('td', {}, [
          el('span', { class: 'cell-main' }, esc(nameParts.join(' ') || '—')),
          p.company_name ? el('span', { class: 'cell-sub' }, esc(p.company_name)) : null,
        ]),
        el('td', { class: 'num' }, p.national_code ? faNum(p.national_code) : '—'),
        el('td', { class: 'num' }, p.mobile ? faNum(p.mobile) : '—'),
        el('td', { class: 'num' }, p.phone ? faNum(p.phone) : '—'),
        el('td', {}, p.company_name ? esc(p.company_name) : '—'),
        el('td', {}, [
          el('div', { class: 'actions' }, [
            el('button', { class: 'icon-btn info', title: 'مشاهده', onclick: () => openPersonViewModal(p) }, el('span', { html: icon('eye', 17) })),
            el('button', { class: 'icon-btn', title: 'ویرایش', onclick: () => editPerson(p) }, el('span', { html: icon('edit', 17) })),
            el('button', { class: 'icon-btn danger', title: 'حذف', onclick: () => delPerson(p) }, el('span', { html: icon('trash', 17) })),
          ]),
        ]),
      ])
      tr.addEventListener('contextmenu', (e) => rowMenu(e, p))
      tbody.append(tr)
    }
    table.append(thead, tbody)
    tableWrap.append(table)
  }

  function rowMenu(e, p) {
    e.preventDefault()
    const name = fullName(p)
    showContextMenu(e.clientX, e.clientY, [
      { label: 'مشاهده‌ی شخص', icon: 'eye', action: () => openPersonViewModal(p) },
      { label: 'ویرایش شخص', icon: 'edit', action: () => editPerson(p) },
      { sep: true },
      { label: 'فاکتور جدید', icon: 'doc', action: () => openInvoiceForm({ prefill: { seller: p }, onSaved: () => load() }) },
      { label: 'ثبت دریافت جدید', icon: 'trendingUp', action: () => openPaymentForm({ prefill: { person: p, transaction_type: 'receive' }, onSaved: () => load() }) },
      { label: 'ثبت پرداخت جدید', icon: 'trendingDown', action: () => openPaymentForm({ prefill: { person: p, transaction_type: 'pay' }, onSaved: () => load() }) },
      { sep: true },
      { label: `گزارش فاکتورهای ${name}`, icon: 'doc', action: () => openReportModal({ personId: p.id, personName: name, kind: 'invoices' }) },
      { label: `مانده حساب ${name}`, icon: 'card', action: () => openReportModal({ personId: p.id, personName: name, kind: 'all' }) },
    ])
  }

  function addPerson() {
    personFormModal({ onSaved: () => load() })
  }

  function editPerson(p) {
    personFormModal({ person: p, onSaved: () => load() })
  }

  async function delPerson(p) {
    const ok = await confirmDialog({
      title: 'حذف شخص',
      message: `آیا از حذف «${fullName(p)}» مطمئن هستید؟ این عمل قابل بازگشت نیست.`,
    })
    if (!ok) return
    try {
      await api.del(`/api/people/${p.id}`)
      toast('شخص با موفقیت حذف شد')
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  load()
}
