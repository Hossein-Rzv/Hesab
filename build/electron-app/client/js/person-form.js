import { api } from './api.js'
import { el, enNum, esc, faNum, emptyVal } from './utils.js'
import { openModal, toast, buttonLoading, fieldWrap } from './ui.js'

// ============================================================ اعتبارسنجی کد ملی ایران

/**
 * الگوریتم بررسی صحت کد ملی ۱۰ رقمی ایران
 * @param {string} code - کد ملی ۱۰ رقمی
 * @returns {{ valid: boolean, message: string }}
 */
function validateNationalCode(code) {
  if (!code) return { valid: true, message: '' } // اختیاری
  const digits = code.replace(/\D/g, '')
  if (digits.length !== 10) return { valid: false, message: 'کد ملی باید ۱۰ رقم باشد' }
  // بررسی تکراری نبودن ارقام (مثلاً ۱۱۱۱۱۱۱۱۱۱)
  if (/^(\d)\1{9}$/.test(digits)) return { valid: false, message: 'کد ملی نمی‌تواند شامل ارقام تکراری باشد' }
  const weights = [10, 9, 8, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i], 10) * weights[i]
  const remainder = sum % 11
  let checkDigit
  if (remainder < 2) checkDigit = remainder
  else checkDigit = 11 - remainder
  if (checkDigit === 11) checkDigit = 1
  if (parseInt(digits[9], 10) !== checkDigit) return { valid: false, message: 'کد ملی واردشده صحیح نیست' }
  return { valid: true, message: '' }
}

/** ایجاد المان هشدار بصری برای کد ملی نامعتبر */
function createWarningEl() {
  return el('span', { class: 'national-warning', style: 'display:none' })
}

/** نمایش هشدار بصری با انیمیشن */
function showWarning(warningEl, message) {
  warningEl.textContent = message
  warningEl.style.display = 'flex'
  warningEl.classList.remove('shake')
  void warningEl.offsetWidth // reflow برای ریستارت انیمیشن
  warningEl.classList.add('shake')
}

function hideWarning(warningEl) {
  warningEl.style.display = 'none'
  warningEl.classList.remove('shake')
}

const FIELDS = [
  { key: 'first_name', label: 'نام', required: true, ph: 'مثلاً علی' },
  { key: 'last_name', label: 'نام خانوادگی', ph: 'مثلاً محمدی' },
  { key: 'national_code', label: 'کد ملی', ph: '۱۰ رقمی' },
  { key: 'company_name', label: 'نام شرکت (در صورت وجود)', ph: '' },
  { key: 'company_economic_code', label: 'کد اقتصادی شرکت', ph: '' },
  { key: 'company_national_id', label: 'شناسه ملی شرکت', ph: '' },
  { key: 'phone', label: 'تلفن', ph: '' },
  { key: 'mobile', label: 'موبایل', ph: '' },
  { key: 'address', label: 'آدرس', ph: '', textarea: true, span2: true },
  { key: 'postal_code', label: 'کدپستی', ph: '' },
  { key: 'bank_card_number', label: 'شماره کارت بانکی', ph: '' },
  { key: 'bank_account_number', label: 'شماره حساب بانکی', ph: '' },
  { key: 'bank_sheba_number', label: 'شماره شبا بانکی', ph: 'IR…' },
  { key: 'bank_name', label: 'نام بانک', ph: '' },
  { key: 'notes', label: 'توضیحات', ph: '', textarea: true, span2: true },
]

/**
 * فرم افزودن/ویرایش شخص
 * onSaved(newPerson)
 */
export function personFormModal({ person = null, onSaved } = {}) {
  const isEdit = !!person
  const inputs = {}

  const grid = el('div', { class: 'form-grid' })
  const nationalWarning = createWarningEl()
  for (const f of FIELDS) {
    let inputEl
    if (f.textarea) {
      inputEl = el('textarea', { class: 'input', placeholder: f.ph, rows: 3 })
    } else {
      inputEl = el('input', {
        class: 'input',
        placeholder: f.ph,
        ...(f.key === 'national_code' ? { maxlength: 10 } : {}),
      })
      if (['phone', 'mobile', 'postal_code', 'national_code', 'bank_card_number', 'bank_account_number', 'bank_sheba_number'].includes(f.key)) {
        inputEl.inputMode = 'tel'
      }
      inputEl.addEventListener('input', () => {
        inputEl.value = enNum(inputEl.value)
      })
    }
    inputEl.value = person?.[f.key] ?? ''
    inputs[f.key] = inputEl
    const wrap = fieldWrap(f.label, inputEl, { required: f.required, className: f.span2 ? 'span-2' : '' })
    if (f.key === 'national_code') {
      wrap.append(nationalWarning)
      inputEl.addEventListener('blur', () => {
        const result = validateNationalCode(inputEl.value.trim())
        if (!result.valid) {
          inputEl.classList.add('input-error')
          showWarning(nationalWarning, result.message)
        } else {
          inputEl.classList.remove('input-error')
          hideWarning(nationalWarning)
        }
      })
    }
    grid.append(wrap)
  }

  const m = openModal({
    title: isEdit ? 'ویرایش شخص' : 'افزودن شخص جدید',
    size: 'modal-lg',
    body: grid,
    footer: (foot) => {
      foot.append(
        el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'انصراف'),
        el('button', { class: 'btn btn-primary', onclick: save }, isEdit ? 'ذخیره تغییرات' : 'افزودن شخص')
      )
    },
  })

  async function save(ev) {
    const btn = ev.currentTarget
    const payload = {}
    for (const f of FIELDS) payload[f.key] = inputs[f.key].value.trim()

    if (emptyVal(payload.first_name)) {
      inputs.first_name.focus()
      toast('وارد کردن «نام» اجباری است', 'error')
      return
    }
    // اعتبارسنجی کد ملی
    if (payload.national_code) {
      const ncResult = validateNationalCode(payload.national_code)
      if (!ncResult.valid) {
        inputs.national_code.focus()
        inputs.national_code.classList.add('input-error')
        showWarning(nationalWarning, ncResult.message)
        toast(ncResult.message, 'error')
        return
      }
    }

    buttonLoading(btn, true)
    try {
      const saved = isEdit ? await api.put(`/api/people/${person.id}`, payload) : await api.post('/api/people', payload)
      toast(isEdit ? 'اطلاعات شخص به‌روزرسانی شد' : 'شخص جدید با موفقیت افزوده شد')
      m.close()
      onSaved?.(saved)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      buttonLoading(btn, false)
    }
  }
}

/** مودال مشاهده‌ی مشخصات شخص — از منوی راست‌کلیک و گزارش‌ها قابل استفاده است */
export function openPersonViewModal(person, { onEdited } = {}) {
  const detail = (label, value, wide = false) =>
    el('div', { class: 'detail-item', style: wide ? 'grid-column: span 2' : '' }, [
      el('div', { class: 'd-label' }, label),
      el('div', { class: 'd-value' }, value),
    ])
  const grid = el('div', { class: 'detail-grid' }, [
    detail('شناسه', faNum(person.id)),
    detail('نام', esc([person.first_name, person.last_name].filter(Boolean).join(' ') || '—')),
    detail('کد ملی', person.national_code ? faNum(person.national_code) : '—'),
    detail('نام شرکت', person.company_name ? esc(person.company_name) : '—'),
    detail('کد اقتصادی شرکت', person.company_economic_code ? faNum(person.company_economic_code) : '—'),
    detail('شناسه ملی شرکت', person.company_national_id ? faNum(person.company_national_id) : '—'),
    detail('تلفن', person.phone ? faNum(person.phone) : '—'),
    detail('موبایل', person.mobile ? faNum(person.mobile) : '—'),
    detail('کدپستی', person.postal_code ? faNum(person.postal_code) : '—'),
    detail('شماره کارت', person.bank_card_number ? faNum(person.bank_card_number) : '—'),
    detail('شماره حساب', person.bank_account_number ? faNum(person.bank_account_number) : '—'),
    detail('شماره شبا', person.bank_sheba_number ? esc(person.bank_sheba_number) : '—'),
    detail('نام بانک', person.bank_name ? esc(person.bank_name) : '—'),
    detail('آدرس', person.address ? esc(person.address) : '—', true),
    detail('توضیحات', person.notes ? esc(person.notes) : '—', true),
  ])
  let m
  m = openModal({
    title: `مشخصات شخص ${faNum(person.id)}`,
    size: 'modal-lg',
    body: grid,
    footer: (foot) =>
      foot.append(
        el('button', { class: 'btn btn-primary', onclick: () => { m.close(); personFormModal({ person, onSaved: onEdited }) } }, 'ویرایش'),
        el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'بستن')
      ),
  })
}

/** فرم خیلی کوتاه برای افزودن سریع داخل انتخاب‌گر */
export function quickPersonForm({ onSaved } = {}) {
  const name = el('input', { class: 'input', placeholder: 'نام (اجباری)' })
  const family = el('input', { class: 'input', placeholder: 'نام خانوادگی' })
  const national = el('input', { class: 'input', placeholder: 'کد ملی', inputmode: 'tel', maxlength: 10 })
  national.addEventListener('input', () => { national.value = enNum(national.value) })
  const mobile = el('input', { class: 'input', placeholder: 'موبایل', inputmode: 'tel' })
  mobile.addEventListener('input', () => { mobile.value = enNum(mobile.value) })

  const m = openModal({
    title: 'افزودن شخص جدید',
    size: 'modal-sm',
    body: el('div', {}, [
      fieldWrap('نام', name, { required: true }),
      fieldWrap('نام خانوادگی', family),
      fieldWrap('کد ملی', national),
      fieldWrap('موبایل', mobile),
    ]),
    footer: (foot) => {
      foot.append(
        el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'انصراف'),
        el('button', { class: 'btn btn-primary', onclick: save }, 'افزودن')
      )
    },
  })

  async function save(ev) {
    const btn = ev.currentTarget
    if (emptyVal(name.value.trim())) {
      name.focus()
      toast('وارد کردن «نام» اجباری است', 'error')
      return
    }
    // اعتبارسنجی کد ملی در فرم سریع
    if (national.value.trim()) {
      const ncResult = validateNationalCode(national.value.trim())
      if (!ncResult.valid) {
        national.focus()
        national.classList.add('input-error')
        toast(ncResult.message, 'error')
        return
      }
    }
    buttonLoading(btn, true)
    try {
      const saved = await api.post('/api/people', {
        first_name: name.value.trim(),
        last_name: family.value.trim(),
        national_code: national.value.trim(),
        mobile: mobile.value.trim(),
      })
      toast('شخص جدید افزوده شد')
      m.close()
      onSaved?.(saved)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      buttonLoading(btn, false)
    }
  }
}
