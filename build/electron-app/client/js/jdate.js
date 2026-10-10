import { toJalaali, toGregorian, jalaaliMonthLength, todayJalaali, parseJalaali } from './jalaali.js'
import { el, faNum, monthName, icon } from './utils.js'

const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] // از شنبه

/**
 * ورودی تاریخ شمسی با تقویم بازشو
 * returns { el, setValue, getValue }
 */
export function jdateInput({ value = '', onChange, placeholder = '۱۴۰۴/۰۵/۲۳' } = {}) {
  const today = todayJalaali()
  let current = parseJalaali(value) || parseJalaali(today)
  let selected = value

  const input = el('input', { class: 'input', placeholder, value, inputmode: 'numeric' })
  input.addEventListener('input', () => {
    const v = input.value
    if (parseJalaali(v)) {
      selected = normalize(v)
      onChange?.(selected)
    } else if (v === '') {
      selected = ''
      onChange?.('')
    }
  })

  const container = el('div', { class: 'jdate input-group' }, [
    input,
    el(
      'button',
      { class: 'input-affix', type: 'button', title: 'انتخاب تاریخ', onclick: (e) => { e.stopPropagation(); toggle() } },
      el('span', { html: icon('calendar', 18) })
    ),
  ])

  let pop = null

  function normalize(s) {
    const p = parseJalaali(s)
    if (!p) return s
    return `${p.jy}/${String(p.jm).padStart(2, '0')}/${String(p.jd).padStart(2, '0')}`
  }

  function open() {
    if (pop) return
    current = parseJalaali(selected) || parseJalaali(today)
    pop = el('div', { class: 'jdate-pop' })
    render()
    document.body.appendChild(pop)
    position()
    setTimeout(() => document.addEventListener('mousedown', onDocDown), 0)
  }

  function close() {
    if (!pop) return
    document.removeEventListener('mousedown', onDocDown)
    pop.remove()
    pop = null
  }

  function toggle() {
    pop ? close() : open()
  }

  function onDocDown(e) {
    if (!pop) return
    if (pop.contains(e.target) || container.contains(e.target)) return
    close()
  }

  function position() {
    const r = container.getBoundingClientRect()
    const pw = 300
    let left = r.left + r.width / 2 - pw / 2
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8))
    let top = r.bottom + 6
    if (top + pop.offsetHeight > window.innerHeight - 8) {
      top = Math.max(8, r.top - pop.offsetHeight - 6)
    }
    pop.style.left = `${left}px`
    pop.style.top = `${top}px`
  }

  function render() {
    if (!pop) return
    const { jy, jm } = current
    const first = toGregorian(jy, jm, 1)
    const offset = (new Date(first.gy, first.gm - 1, first.gd).getDay() + 1) % 7
    const dim = jalaaliMonthLength(jy, jm)
    const sel = parseJalaali(selected)

    pop.innerHTML = ''
    pop.append(
      el('div', { class: 'jdate-head' }, [
        el(
          'button',
          { class: 'icon-btn', title: 'ماه قبل', onclick: () => shiftMonth(-1) },
          el('span', { html: icon('chevronRight', 16) })
        ),
        el('span', { class: 'jd-month' }, `${faNum(jy)} ${monthName(jm)}`),
        el(
          'button',
          { class: 'icon-btn', title: 'ماه بعد', onclick: () => shiftMonth(1) },
          el('span', { html: icon('chevronLeft', 16) })
        ),
      ]),
      el('div', { class: 'jdate-weekdays' }, WEEKDAYS.map((w, i) => el('span', { class: i === 6 ? 'friday' : '' }, w))),
      el('div', { class: 'jdate-days' }, buildDays(offset, dim, jy, jm, sel)),
      el('div', { class: 'jdate-foot' }, [
        el('button', { type: 'button', onclick: () => { selected = today; input.value = today; onChange?.(today); close() } }, 'امروز'),
        el('button', { type: 'button', onclick: () => { selected = ''; input.value = ''; onChange?.(''); close() } }, 'پاک کردن'),
      ])
    )
  }

  function buildDays(offset, dim, jy, jm, sel) {
    const cells = []
    for (let i = 0; i < offset; i++) cells.push(el('span', {}))
    for (let d = 1; d <= dim; d++) {
      const isToday = parseJalaali(today) && parseJalaali(today).jy === jy && parseJalaali(today).jm === jm && parseJalaali(today).jd === d
      const isSel = sel && sel.jy === jy && sel.jm === jm && sel.jd === d
      cells.push(
        el(
          'button',
          {
            class: `jdate-day ${isToday ? 'today' : ''} ${isSel ? 'selected' : ''}`,
            type: 'button',
            onclick: () => {
              selected = `${jy}/${String(jm).padStart(2, '0')}/${String(d).padStart(2, '0')}`
              input.value = selected
              onChange?.(selected)
              close()
            },
          },
          faNum(d)
        )
      )
    }
    return cells
  }

  function shiftMonth(delta) {
    let { jy, jm } = current
    jm += delta
    if (jm < 1) { jm = 12; jy-- }
    if (jm > 12) { jm = 1; jy++ }
    if (jy < 1300) jy = 1300
    if (jy > 1500) jy = 1500
    current = { jy, jm }
    render()
  }

  return {
    el: container,
    getValue: () => input.value,
    setValue(v) {
      const n = v ? normalize(v) : ''
      input.value = n
      selected = n
    },
  }
}
