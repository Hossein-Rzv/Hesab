import { el, icon } from './utils.js'

// ============================================================ توست

const toastIcons = {
  success: 'check',
  error: 'alert',
  info: 'info',
  warn: 'alert',
}

export function toast(message, type = 'success', duration = 3200) {
  const wrap = document.getElementById('toasts')
  const node = el('div', { class: `toast t-${type}`, role: 'status' }, [
    el('span', { html: icon(toastIcons[type] || 'info', 19) }),
    el('span', {}, message),
  ])
  wrap.appendChild(node)
  setTimeout(() => {
    node.classList.add('leaving')
    setTimeout(() => node.remove(), 320)
  }, duration)
}

// ============================================================ مودال

export function openModal({ title, body, footer, size = '', onClose }) {
  const backdrop = el('div', { class: 'modal-backdrop' })
  const modal = el('div', { class: `modal ${size}`.trim() })
  const head = el('div', { class: 'modal-head' }, [
    el('h3', {}, title),
    el(
      'button',
      {
        class: 'icon-btn',
        title: 'بستن',
        onclick: () => close(),
      },
      el('span', { html: icon('x', 20) })
    ),
  ])
  const bodyEl = el('div', { class: 'modal-body' })
  if (typeof body === 'function') body(bodyEl)
  else if (body) bodyEl.append(body)

  const foot = el('div', { class: 'modal-foot' })
  if (typeof footer === 'function') footer(foot)
  else if (footer) foot.append(footer)

  modal.append(head, bodyEl)
  if (foot.childNodes.length) modal.append(foot)
  backdrop.append(modal)

  const onKey = (e) => {
    if (e.key === 'Escape') close()
  }
  function close() {
    document.removeEventListener('keydown', onKey)
    backdrop.classList.add('leaving')
    backdrop.style.opacity = '0'
    modal.style.transform = 'scale(.97) translateY(10px)'
    setTimeout(() => backdrop.remove(), 180)
    if (onClose) onClose()
  }

  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close()
  })
  document.addEventListener('keydown', onKey)
  document.body.appendChild(backdrop)
  return { close, el: modal, bodyEl, foot }
}

// ============================================================ تأیید

export function confirmDialog({ title = 'تأیید عملیات', message = 'آیا مطمئن هستید؟', confirmText = 'حذف', danger = true }) {
  return new Promise((resolve) => {
    const m = openModal({
      title,
      size: 'modal-sm',
      body: el('p', { style: 'font-size:14px;color:var(--text-2);line-height:1.9' }, message),
      footer: (foot) => {
        foot.append(
          el('button', { class: 'btn btn-ghost', onclick: () => { resolve(false); m.close() } }, 'انصراف'),
          el(
            'button',
            {
              class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
              onclick: () => { resolve(true); m.close() },
            },
            confirmText
          )
        )
      },
      onClose: () => resolve(false),
    })
  })
}

// ============================================================ صفحه‌بندی

export function renderPagination(container, { page, total, pageSize, onChange }) {
  container.innerHTML = ''
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  container.append(
    el('span', { class: 'pg-info' }, `نمایش ${from} تا ${to} از ${new Intl.NumberFormat('fa-IR').format(total)} مورد`)
  )

  const mkBtn = (label, p, opts = {}) =>
    el(
      'button',
      {
        onclick: () => onChange(p),
        disabled: opts.disabled,
        ...(p === page ? { class: 'current' } : {}),
      },
      label
    )

  container.append(mkBtn('قبلی', page - 1, { disabled: page <= 1 }))

  const start = Math.max(1, page - 2)
  const end = Math.min(pages, page + 2)
  if (start > 1) {
    container.append(mkBtn('۱', 1))
    if (start > 2) container.append(el('span', { class: 'pg-info' }, '…'))
  }
  for (let p = start; p <= end; p++) container.append(mkBtn(new Intl.NumberFormat('fa-IR').format(p), p))
  if (end < pages) {
    if (end < pages - 1) container.append(el('span', { class: 'pg-info' }, '…'))
    container.append(mkBtn(new Intl.NumberFormat('fa-IR').format(pages), pages))
  }

  container.append(mkBtn('بعدی', page + 1, { disabled: page >= pages }))
}

// ============================================================ وضعیت‌ها

export function emptyState({ icon: ic = 'doc', title = 'موردی یافت نشد', sub = '', action } = {}) {
  const box = el('div', { class: 'empty-state' }, [
    el('span', { html: icon(ic, 54) }),
    el('h3', {}, title),
    sub ? el('p', {}, sub) : null,
  ])
  if (action) {
    box.append(el('div', { style: 'margin-top:16px' }, action))
  }
  return box
}

export function skeletonRows(n = 6) {
  return Array.from({ length: n }, (_, i) =>
    el('div', { class: 'skeleton-row', style: `animation-delay:${i * 60}ms` }, [
      el('div', { class: 'skeleton', style: 'height:18px;width:80%;margin:14px 16px' }),
    ])
  )
}

/** بسته‌بندی فیلد فرم با برچسب */
export function fieldWrap(label, inputEl, { required = false, hint = '', className = '' } = {}) {
  const wrap = el('div', { class: `field ${className}`.trim() }, [
    el('label', {}, [label, required ? el('span', { class: 'req' }, '*') : null]),
    inputEl,
    hint ? el('span', { class: 'hint' }, hint) : null,
  ])
  return wrap
}

export function buttonLoading(btn, busy, busyText = 'در حال ذخیره…') {
  if (busy) {
    btn.dataset.original = btn.innerHTML
    btn.disabled = true
    btn.innerHTML = busyText
  } else if (btn.dataset.original != null) {
    btn.disabled = false
    btn.innerHTML = btn.dataset.original
    delete btn.dataset.original
  }
}
