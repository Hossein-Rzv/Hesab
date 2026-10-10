import { api } from './api.js'
import { el, faNum, enNum, fullName, initials, esc, debounce, emptyVal, icon } from './utils.js'
import { openModal, toast, emptyState } from './ui.js'
import { quickPersonForm } from './person-form.js'

// ============================================================ انتخاب‌گر شخص (مودال جستجو)

/**
 * انتخاب‌گر جستجوی شخص
 * onSelect(person)
 */
export function openPersonPicker({ onSelect, title = 'انتخاب شخص' } = {}) {
  const searchInput = el('input', {
    class: 'input',
    placeholder: 'جستجو با نام، کد ملی، موبایل…',
    autofocus: '',
  })
  const listEl = el('div', { class: 'picker-list' })
  listEl.append(el('div', { class: 'page-loading', style: 'padding:30px' }, 'در حال بارگذاری…'))

  const m = openModal({
    title,
    size: 'modal-sm',
    body: el('div', {}, [
      el('div', { class: 'picker-search' }, [el('span', { html: icon('search', 18) }), searchInput]),
      listEl,
      el(
        'button',
        {
          class: 'picker-add',
          onclick: () => {
            quickPersonForm({
              onSaved: (p) => {
                m.close()
                onSelect?.(p)
              },
            })
          },
        },
        [el('span', { html: icon('plus', 18) }), 'افزودن شخص جدید']
      ),
    ]),
  })

  const runSearch = debounce(async () => {
    const q = searchInput.value.trim()
    listEl.innerHTML = ''
    listEl.append(el('div', { class: 'page-loading', style: 'padding:30px' }, 'در حال جستجو…'))
    try {
      const rows = await api.get(`/api/people/search?q=${encodeURIComponent(q)}`)
      listEl.innerHTML = ''
      if (!rows.length) {
        listEl.append(
          emptyState({
            icon: 'users',
            title: 'شخصی یافت نشد',
            sub: q ? `جستجویی برای «${q}» نتیجه‌ای نداشت` : 'هنوز شخصی ثبت نشده است',
          })
        )
        return
      }
      for (const p of rows) {
        const sub = [p.national_code ? `کد ملی: ${faNum(p.national_code)}` : '', p.mobile ? faNum(p.mobile) : '']
          .filter(Boolean)
          .join(' — ')
        listEl.append(
          el(
            'div',
            {
              class: 'picker-row',
              onclick: () => {
                m.close()
                onSelect?.(p)
              },
            },
            [
              el('div', { class: 'avatar' }, initials(p)),
              el('div', { class: 'pr-main' }, [
                el('div', { class: 'pr-name' }, fullName(p)),
                sub ? el('div', { class: 'pr-sub' }, sub) : null,
              ]),
              el('div', { class: 'pr-id' }, `شناسه ${faNum(p.id)}`),
            ]
          )
        )
      }
    } catch (err) {
      listEl.innerHTML = ''
      listEl.append(emptyState({ icon: 'alert', title: 'خطا در بارگذاری', sub: err.message }))
    }
  }, 300)

  searchInput.addEventListener('input', runSearch)
  runSearch()
  return m
}

// ============================================================ فیلد شخص داخل فرم

/**
 * فیلد «شناسه و نام شخص» — با وارد کردن شناسه، اطلاعات بارگیری می‌شود
 * و دکمه‌ی «انتخاب» انتخاب‌گر جستجو را باز می‌کند.
 *
 * onChange({ id, person })  — هر بار که شخص انتخاب/تغییر کرد
 * returns { el, getPerson, setValue }
 */
export function personField({ label, required = false, hint = '', placeholder = 'وارد کردن شناسه' } = {}) {
  let person = null
  let lastId = ''

  const idInput = el('input', {
    class: 'input',
    placeholder,
    inputmode: 'numeric',
    autocomplete: 'off',
  })
  idInput.addEventListener('input', () => {
    idInput.value = enNum(idInput.value)
    lookup(idInput.value)
  })

  const infoEl = el('div', { class: 'person-field-info' }, 'برای بارگیری اطلاعات، شناسه را وارد کنید یا از دکمه‌ی «انتخاب» استفاده کنید.')

  const field = el('div', { class: 'field' }, [
    el('label', {}, [label, required ? el('span', { class: 'req' }, '*') : null]),
    el('div', { class: 'person-field' }, [
      el('div', { class: 'person-field-row' }, [
        idInput,
        el(
          'button',
          {
            class: 'btn btn-ghost',
            type: 'button',
            onclick: () => {
              openPersonPicker({
                onSelect: (p) => {
                  selectPerson(p)
                },
              })
            },
          },
          [el('span', { html: icon('search', 16) }), 'انتخاب']
        ),
        el(
          'button',
          {
            class: 'icon-btn danger',
            type: 'button',
            title: 'پاک کردن',
            onclick: clear,
          },
          el('span', { html: icon('x', 17) })
        ),
      ]),
      infoEl,
    ]),
    hint ? el('span', { class: 'hint' }, hint) : null,
  ])

  const lookup = debounce(async (rawId) => {
    const id = rawId.trim()
    if (!id) return clear(false)
    if (id === lastId) return
    lastId = id
    infoEl.className = 'person-field-info'
    infoEl.textContent = 'در حال بارگیری…'
    try {
      const p = await api.get(`/api/people/${id}`)
      if (idInput.value.trim() !== String(p.id)) return
      person = p
      renderInfo(true)
      emit()
    } catch (err) {
      if (err.status === 404) {
        person = null
        infoEl.className = 'person-field-info warn'
        infoEl.innerHTML = `شناسه ${faNum(id)} یافت نشد — می‌توانید از دکمه‌ی «انتخاب» برای جستجو یا افزودن شخص استفاده کنید.`
        emit()
      } else {
        infoEl.textContent = err.message
      }
    }
  }, 350)

  function selectPerson(p) {
    person = p
    idInput.value = String(p.id)
    lastId = String(p.id)
    renderInfo(true)
    emit()
  }

  function renderInfo(ok) {
    infoEl.className = `person-field-info ${ok ? 'ok' : ''}`.trim()
    infoEl.innerHTML = ''
    infoEl.append(
      el('span', {}, [
        el('strong', {}, esc(fullName(person))),
        person.national_code ? ` — کد ملی ${faNum(person.national_code)}` : '',
      ]),
      el('span', { class: 'pf-badge' }, `شناسه ${faNum(person.id)}`)
    )
  }

  function clear(emitChange = true) {
    person = null
    lastId = ''
    idInput.value = ''
    infoEl.className = 'person-field-info'
    infoEl.textContent = 'برای بارگیری اطلاعات، شناسه را وارد کنید یا از دکمه‌ی «انتخاب» استفاده کنید.'
    if (emitChange) emit()
  }

  function emit() {
    field.dispatchEvent(
      new CustomEvent('personchange', {
        detail: { id: person ? person.id : null, person },
      })
    )
  }

  function setLocked(v) {
    idInput.disabled = !!v
    // غیرفعال کردن دکمه انتخاب و پاک کردن
    const btns = field.querySelectorAll('.btn, .icon-btn')
    btns.forEach((b) => { b.disabled = !!v; b.style.opacity = v ? '0.5' : '' })
  }

  return {
    el: field,
    getPerson: () => person,
    setValue(id, p) {
      if (p) selectPerson(p)
      else if (id) {
        idInput.value = String(id)
        lookup(String(id))
      } else clear()
    },
    get id() {
      return person ? person.id : null
    },
    setLocked,
    validate() {
      if (required && !person) {
        infoEl.className = 'person-field-info warn'
        infoEl.textContent = 'انتخاب شخص اجباری است — شناسه را وارد کنید یا از دکمه‌ی «انتخاب» استفاده کنید.'
        return false
      }
      return true
    },
  }
}
