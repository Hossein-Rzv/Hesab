import { api } from '../api.js'
import { el, faNum, esc, icon } from '../utils.js'
import { toast, confirmDialog, emptyState, skeletonRows, openModal, fieldWrap, buttonLoading } from '../ui.js'

const PAGE_SIZE = 20

export function renderCostCentersPage(root) {
  const state = { data: [], loading: true }

  const tableWrap = el('div', { class: 'table-wrap' })

  const toolbar = el('div', { class: 'toolbar' }, [
    el('div', { style: 'flex:1' }),
    el('div', { class: 'toolbar-spacer' }),
    el('button', { class: 'btn btn-primary', onclick: () => addCC() }, [
      el('span', { html: icon('plus', 17) }),
      'افزودن مرکز هزینه',
    ]),
  ])

  root.innerHTML = ''
  root.append(toolbar, tableWrap)

  async function load() {
    state.loading = true
    renderTable()
    try {
      state.data = await api.get('/api/cost-centers')
    } catch (err) {
      toast(err.message, 'error')
      state.data = []
    } finally {
      state.loading = false
      renderTable()
    }
  }

  function renderTable() {
    if (state.loading) {
      tableWrap.innerHTML = ''
      tableWrap.append(el('table', { class: 'data' }, [el('tbody', {}, skeletonRows(4))]))
      return
    }
    if (!state.data.length) {
      tableWrap.innerHTML = ''
      tableWrap.append(
        emptyState({
          icon: 'card',
          title: 'مرکز هزینه‌ای تعریف نشده',
          sub: 'مراکز هزینه را برای دسته‌بندی فاکتورها و گزارش‌گیری تعریف کنید.',
          action: el('button', { class: 'btn btn-primary', onclick: () => addCC() }, 'افزودن مرکز هزینه'),
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
          el('th', {}, 'نام مرکز هزینه'),
          el('th', {}, 'کد'),
          el('th', {}, 'توضیحات'),
          el('th', {}, 'عملیات'),
        ]),
      ])
    )
    const tbody = el('tbody', {})
    for (const cc of state.data) {
      const tr = el('tr', {}, [
        el('td', {}, el('span', { class: 'badge badge-purple' }, faNum(cc.id))),
        el('td', {}, el('span', { class: 'cell-main' }, esc(cc.name))),
        el('td', {}, cc.code ? faNum(cc.code) : '—'),
        el('td', {}, cc.description ? esc(cc.description) : '—'),
        el('td', {}, [
          el('div', { class: 'actions' }, [
            el('button', { class: 'icon-btn', title: 'ویرایش', onclick: () => editCC(cc) }, el('span', { html: icon('edit', 17) })),
            el('button', { class: 'icon-btn danger', title: 'حذف', onclick: () => delCC(cc) }, el('span', { html: icon('trash', 17) })),
          ]),
        ]),
      ])
      tbody.append(tr)
    }
    table.append(tbody)
    tableWrap.append(table)
  }

  function ccFormModal({ cc = null, onSaved } = {}) {
    const isEdit = !!cc
    const nameInput = el('input', { class: 'input', placeholder: 'مثلاً بخش فروش', value: cc?.name || '' })
    const codeInput = el('input', { class: 'input', placeholder: 'مثلاً CC-001', value: cc?.code || '' })
    const descInput = el('textarea', { class: 'input', placeholder: 'توضیحات اختیاری…', rows: 3 })
    descInput.value = cc?.description || ''

    const grid = el('div', { class: 'form-grid' }, [
      fieldWrap('نام مرکز هزینه', nameInput, { required: true, className: 'span-2' }),
      fieldWrap('کد مرکز هزینه', codeInput),
      fieldWrap('توضیحات', descInput, { className: 'span-2' }),
    ])

    const m = openModal({
      title: isEdit ? 'ویرایش مرکز هزینه' : 'افزودن مرکز هزینه جدید',
      size: 'modal-md',
      body: grid,
      footer: (foot) => {
        foot.append(
          el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'انصراف'),
          el('button', { class: 'btn btn-primary', onclick: save }, isEdit ? 'ذخیره تغییرات' : 'افزودن')
        )
      },
    })

    async function save(ev) {
      const btn = ev.currentTarget
      const payload = {
        name: nameInput.value.trim(),
        code: codeInput.value.trim(),
        description: descInput.value.trim(),
      }
      if (!payload.name) {
        nameInput.focus()
        toast('وارد کردن «نام» اجباری است', 'error')
        return
      }
      buttonLoading(btn, true)
      try {
        if (isEdit) await api.put(`/api/cost-centers/${cc.id}`, payload)
        else await api.post('/api/cost-centers', payload)
        toast(isEdit ? 'مرکز هزینه به‌روزرسانی شد' : 'مرکز هزینه جدید افزوده شد')
        m.close()
        onSaved?.()
      } catch (err) {
        toast(err.message, 'error')
      } finally {
        buttonLoading(btn, false)
      }
    }
  }

  function addCC() {
    ccFormModal({ onSaved: load })
  }

  function editCC(cc) {
    ccFormModal({ cc, onSaved: load })
  }

  async function delCC(cc) {
    const ok = await confirmDialog({
      title: 'حذف مرکز هزینه',
      message: `آیا از حذف مرکز هزینه «${esc(cc.name)}» مطمئن هستید؟`,
    })
    if (!ok) return
    try {
      await api.del(`/api/cost-centers/${cc.id}`)
      toast('مرکز هزینه حذف شد')
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  load()
}
