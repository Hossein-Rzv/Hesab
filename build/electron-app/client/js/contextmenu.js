import { el, icon } from './utils.js'

// ============================================================ منوی راست‌کلیک سفارشی

let current = null

export function closeContextMenu() {
  if (current) {
    current.remove()
    current = null
  }
}

/**
 * نمایش منوی راست‌کلیک در مختصات مشخص
 * items: [{ label, icon, danger?, action }]
 */
export function showContextMenu(x, y, items) {
  closeContextMenu()

  const menu = el('div', { class: 'ctx-menu', role: 'menu' })
  for (const it of items) {
    if (it.sep) {
      menu.append(el('div', { class: 'ctx-sep' }))
      continue
    }
    menu.append(
      el(
        'button',
        {
          class: it.danger ? 'danger' : '',
          onclick: () => {
            closeContextMenu()
            it.action?.()
          },
        },
        [el('span', { html: icon(it.icon || 'chevronLeft', 16) }), el('span', {}, it.label)]
      )
    )
  }

  document.body.appendChild(menu)

  // جای‌گذاری با رعایت لبه‌ی پنجره
  const rect = menu.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = x
  let top = y
  if (left + rect.width > vw - 8) left = Math.max(8, vw - rect.width - 8)
  if (top + rect.height > vh - 8) top = Math.max(8, vh - rect.height - 8)
  menu.style.left = `${left}px`
  menu.style.top = `${top}px`
  menu.classList.add('visible')
  current = menu
}

document.addEventListener('mousedown', (e) => {
  if (current && !current.contains(e.target)) closeContextMenu()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeContextMenu()
})
document.addEventListener('scroll', closeContextMenu, true)
window.addEventListener('resize', closeContextMenu)
window.addEventListener('blur', closeContextMenu)
