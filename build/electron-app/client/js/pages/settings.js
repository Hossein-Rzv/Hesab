import { api } from '../api.js'
import { el, faNum, esc, icon, money } from '../utils.js'
import { toast, confirmDialog, buttonLoading, openModal } from '../ui.js'

export function renderSettingsPage(root) {
  root.innerHTML = ''

  const saveBtn = el('button', { class: 'btn btn-primary' }, [el('span', { html: icon('check', 16) }), 'ذخیره تنظیمات'])

  // ---------- بخش ۱: محاسبات ----------
  const vatInput = el('input', { class: 'input num', inputmode: 'numeric', placeholder: 'مثلاً ۱۰' })
  const currencyInput = el('input', { class: 'input', placeholder: 'مثلاً ریال' })

  const calcCard = el('section', { class: 'settings-card' }, [
    el('h3', {}, [el('span', { html: icon('trendingUp', 18) }), 'محاسبات و واحد پول']),
    el('p', {}, 'درصد مالیات بر ارزش افزوده برای دکمه‌ی «محاسبه‌ی خودکار» در فرم فاکتور استفاده می‌شود.'),
    el('div', { class: 'form-grid' }, [
      el('div', { class: 'field' }, [
        el('label', {}, ['درصد مالیات بر ارزش افزوده (%)']),
        vatInput,
        el('span', { class: 'hint' }, 'بین ۰ تا ۱۰۰ — پیش‌فرض ۱۰٪'),
      ]),
      el('div', { class: 'field' }, [
        el('label', {}, 'واحد پول'),
        currencyInput,
        el('span', { class: 'hint' }, 'در نمایش مبالغ استفاده می‌شود — پیش‌فرض «ریال»'),
      ]),
    ]),
  ])

  // ---------- بخش ۲: اطلاعات شرکت ----------
  const companyInputs = {
    company_name: el('input', { class: 'input', placeholder: 'نام شرکت / فروشگاه' }),
    company_register_no: el('input', { class: 'input', placeholder: 'شماره ثبت' }),
    company_economic_code: el('input', { class: 'input', placeholder: 'کد اقتصادی' }),
    company_phone: el('input', { class: 'input', placeholder: 'تلفن' }),
    company_address: el('input', { class: 'input', placeholder: 'آدرس' }),
  }

  const companyCard = el('section', { class: 'settings-card' }, [
    el('h3', {}, [el('span', { html: icon('users', 18) }), 'اطلاعات شرکت (سربرگ چاپ فاکتور)']),
    el('p', {}, 'این اطلاعات در بالای فاکتور چاپی نمایش داده می‌شود.'),
    el('div', { class: 'form-grid' }, [
      el('div', { class: 'field' }, [el('label', {}, 'نام شرکت'), companyInputs.company_name]),
      el('div', { class: 'field' }, [el('label', {}, 'شماره ثبت'), companyInputs.company_register_no]),
      el('div', { class: 'field' }, [el('label', {}, 'کد اقتصادی'), companyInputs.company_economic_code]),
      el('div', { class: 'field' }, [el('label', {}, 'تلفن'), companyInputs.company_phone]),
      el('div', { class: 'field span-2' }, [el('label', {}, 'آدرس'), companyInputs.company_address]),
    ]),
  ])

  // ---------- بخش ۲.۵: محل ذخیره اسناد اسکن شده ----------
  const documentsPathInput = el('input', { class: 'input', placeholder: 'مثلاً D:\\Documents\\Hesab', style: 'flex:1;min-width:0' })
  const pickDocumentsBtn = el('button', { class: 'btn btn-ghost', type: 'button', style: 'flex-shrink:0' }, [
    el('span', { html: icon('folder', 16) }),
    'انتخاب پوشه',
  ])
  const documentsPathWrap = el('div', { style: 'display:flex;gap:8px;align-items:stretch' }, [documentsPathInput, pickDocumentsBtn])
  const documentsCard = el('section', { class: 'settings-card' }, [
    el('h3', {}, [el('span', { html: icon('folder', 18) }), 'محل ذخیره اسناد اسکن شده']),
    el('p', {}, 'فایل‌های پیوست فاکتورها و پرداخت‌ها در این پوشه ذخیره می‌شوند — برای هر شخص یک زیرپوشه جدا ساخته می‌شود.'),
    el('div', { class: 'form-grid' }, [
      el('div', { class: 'field span-2' }, [
        el('label', {}, 'پوشه اسناد'),
        documentsPathWrap,
        el('span', { class: 'hint', style: 'color:var(--danger)' }, '⚠️ اگر خالی بماند، الصاق پیوست امکان‌پذیر نخواهد بود. مسیر باید روی دیسک محلی یا درایو شبکه‌ی قابل‌دسترس باشد.'),
      ]),
    ]),
  ])
  pickDocumentsBtn.addEventListener('click', async () => {
    try {
      if (window.electronAPI && typeof window.electronAPI.selectFolder === 'function') {
        const picked = await window.electronAPI.selectFolder()
        if (picked) documentsPathInput.value = picked
        return
      }
      if (window.hesabAPI && typeof window.hesabAPI.pickDirectory === 'function') {
        const picked = await window.hesabAPI.pickDirectory()
        if (picked) documentsPathInput.value = picked
        return
      }
      if (window.showDirectoryPicker) {
        const handle = await window.showDirectoryPicker()
        if (handle) {
          documentsPathInput.value = handle.name
          toast('در حالت مرورگر مسیر کامل در دسترس نیست — لطفاً مسیر کامل را در کادر وارد کنید.', 'error')
        }
        return
      }
      toast('انتخاب پوشه در این محیط پشتیبانی نمی‌شود — مسیر را دستی وارد کنید.', 'error')
    } catch (e) {
      if (e && e.name === 'AbortError') return
      toast((e && e.message) || 'خطا در انتخاب پوشه', 'error')
    }
  })

  // ---------- بخش ۳: پشتیبان‌گیری ----------
  const backupToggle = el('input', { type: 'checkbox' })
  const intervalSelect = el('select', { class: 'input' }, [
    el('option', { value: '1' }, 'هر روز'),
    el('option', { value: '2' }, 'هر ۲ روز'),
    el('option', { value: '3' }, 'هر ۳ روز'),
    el('option', { value: '7' }, 'هر هفته'),
  ])
  const backupPathInput = el('input', { class: 'input', placeholder: 'مثلاً D:\\Backups\\Hesab', style: 'flex:1;min-width:0' })
  const pickBackupBtn = el('button', { class: 'btn btn-ghost', type: 'button', style: 'flex-shrink:0' }, [
    el('span', { html: icon('folder', 16) }),
    'انتخاب پوشه…',
  ])
  const backupPathWrap = el('div', { style: 'display:flex;gap:8px;align-items:stretch' }, [backupPathInput, pickBackupBtn])
  const restorePasswordInput = el('input', { class: 'input', placeholder: 'اختیاری — برای امنیت بازیابی', type: 'password', autocomplete: 'new-password' })
  const backupNowBtn = el('button', { class: 'btn btn-ghost' }, [el('span', { html: icon('refresh', 16) }), 'پشتیبان‌گیری همین حالا'])
  const backupList = el('div', { style: 'margin-top:14px' })

  const backupCard = el('section', { class: 'settings-card' }, [
    el('h3', {}, [el('span', { html: icon('card', 18) }), 'پشتیبان‌گیری خودکار']),
    el('p', {}, 'به‌صورت دوره‌ای از دیتابیس نسخه‌ی پشتیبان ساخته می‌شود (۱۰ نسخه‌ی آخر نگه داشته می‌شود).'),
    el('div', { class: 'form-grid' }, [
      el('div', { class: 'field' }, [
        el('label', {}, 'پشتیبان‌گیری خودکار'),
        el('div', { class: 'switch-row' }, [
          el('label', { class: 'switch' }, [backupToggle, el('span', { class: 'slider' })]),
          el('span', { class: 'hint' }, backupToggle.checked ? 'فعال' : 'غیرفعال'),
        ]),
      ]),
      el('div', { class: 'field' }, [
        el('label', {}, 'بازه‌ی پشتیبان‌گیری'),
        intervalSelect,
      ]),
      el('div', { class: 'field span-2' }, [
        el('label', {}, 'مسیر نسخه‌های پشتیبان (اختیاری)'),
        backupPathWrap,
        el(
          'span',
          { class: 'hint', style: 'color:var(--danger)' },
          '⚠️ توصیه می‌شود مسیر را روی درایوی غیر از درایو نصب ویندوز (معمولاً C:) انتخاب کنید. در صورت خالی بودن، مسیر پیش‌فرض برنامه (data/backups) استفاده می‌شود.'
        ),
      ]),
      el('div', { class: 'field span-2' }, [
        el('label', {}, 'رمز بازیابی اطلاعات (اختیاری)'),
        restorePasswordInput,
        el('span', { class: 'hint' }, 'اگر تعیین شود، برای بازگردانی از نسخه‌ی پشتیبان، این رمز پرسیده می‌شود — امنیت بیشتر در برابر بازگردانی ناخواسته.'),
      ]),
      el('div', { class: 'field' }, [
        el('label', {}, 'پشتیبان دستی'),
        backupNowBtn,
      ]),
    ]),
    el('div', { class: 'detail-sec' }, [
      el('h4', {}, 'نسخه‌های پشتیبان'),
      backupList,
    ]),
  ])

  root.append(calcCard, companyCard, documentsCard, backupCard, el('div', { style: 'display:flex;gap:10px' }, [saveBtn]))

  backupToggle.addEventListener('change', () => {
    const hint = backupCard.querySelector('.switch-row .hint')
    if (hint) hint.textContent = backupToggle.checked ? 'فعال' : 'غیرفعال'
  })

  // ---------- انتخاب‌گر پوشه‌ی پشتیبان ----------
  pickBackupBtn.addEventListener('click', async () => {
    try {
      // در نسخه‌ی دسکتاپ (Electron) مسیر کامل از پروسه‌ی اصلی گرفته می‌شود
      if (window.electronAPI && typeof window.electronAPI.selectFolder === 'function') {
        const picked = await window.electronAPI.selectFolder()
        if (picked) backupPathInput.value = picked
        return
      }
      if (window.hesabAPI && typeof window.hesabAPI.pickDirectory === 'function') {
        const picked = await window.hesabAPI.pickDirectory()
        if (picked) backupPathInput.value = picked
        return
      }
      // در حالت مرورگر (فقط توسعه): API مرورگر — فقط نام پوشه در دسترس است
      if (window.showDirectoryPicker) {
        const handle = await window.showDirectoryPicker()
        if (handle) {
          backupPathInput.value = handle.name
          toast('در حالت مرورگر مسیر کامل در دسترس نیست — لطفاً مسیر کامل را در کادر وارد کنید.', 'error')
        }
        return
      }
      toast('انتخاب پوشه در این محیط پشتیبانی نمی‌شود — مسیر را دستی وارد کنید.', 'error')
    } catch (e) {
      if (e && e.name === 'AbortError') return
      toast((e && e.message) || 'خطا در انتخاب پوشه', 'error')
    }
  })

  async function refreshBackups() {
    backupList.innerHTML = ''
    try {
      const res = await api.get('/api/backups')
      if (!res.data.length) {
        backupList.append(el('p', { class: 'hint', style: 'margin:0' }, 'هنوز نسخه‌ای ساخته نشده است.'))
        return
      }
      const dir = res.data[0].dir || ''
      for (const b of res.data) {
        const size = b.size > 1_048_576 ? `${(b.size / 1_048_576).toFixed(1)} مگابایت` : `${Math.max(1, Math.round(b.size / 1024))} کیلوبایت`
        backupList.append(
          el('div', { class: 'backup-item' }, [
            el('div', {}, [
              el('div', { class: 'b-name' }, esc(b.file)),
              el('div', { class: 'b-meta' }, `${faNum(new Date(b.date).toLocaleString('fa-IR'))} — ${size}`),
            ]),
            el('div', { class: 'actions' }, [
              el(
                'button',
                { class: 'icon-btn', title: 'بازیابی', onclick: () => restoreBackup(b.file) },
                el('span', { html: icon('refresh', 16) })
              ),
              el(
                'button',
                { class: 'icon-btn danger', title: 'حذف', onclick: () => deleteBackup(b.file) },
                el('span', { html: icon('trash', 16) })
              ),
            ]),
          ])
        )
      }
      if (dir) {
        backupList.append(el('p', { class: 'hint', style: 'margin-top:10px' }, `مسیر فعلی: ${esc(dir)}`))
      }
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function restoreBackup(file) {
    let password = ''
    if (restorePasswordSet) {
      password = await askPassword()
      if (password === null) return
    }
    const ok = await confirmDialog({
      title: 'بازیابی نسخه‌ی پشتیبان',
      message: `دیتابیس فعلی با نسخه‌ی «${file}» جایگزین می‌شود. همه‌ی تغییرات پس از آن نسخه از بین می‌رود. ادامه می‌دهید؟`,
      confirmText: 'بازیابی',
    })
    if (!ok) return
    try {
      await api.post('/api/backups/restore', { file, password })
      toast('بازیابی انجام شد — صفحه بارگذاری مجدد می‌شود')
      setTimeout(() => location.reload(), 800)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  let restorePasswordSet = false

  function askPassword() {
    return new Promise((resolve) => {
      const input = el('input', { class: 'input', type: 'password', placeholder: 'رمز بازیابی اطلاعات', autocomplete: 'new-password' })
      let m
      m = openModal({
        title: 'رمز بازیابی اطلاعات',
        size: 'modal-sm',
        body: el('div', {}, [
          el('p', { style: 'font-size:13px;color:var(--text-2);margin-bottom:10px' }, 'برای امنیت بیشتر، بازگردانی نیاز به رمز تعیین‌شده در تنظیمات دارد.'),
          input,
        ]),
        footer: (foot) => {
          foot.append(
            el('button', { class: 'btn btn-ghost', onclick: () => { m.close(); resolve(null) } }, 'انصراف'),
            el('button', { class: 'btn btn-primary', onclick: () => { m.close(); resolve(input.value) } }, 'تأیید')
          )
        },
      })
      input.focus()
    })
  }

  async function deleteBackup(file) {
    const ok = await confirmDialog({
      title: 'حذف نسخه‌ی پشتیبان',
      message: `نسخه‌ی «${file}» برای همیشه حذف می‌شود.`,
    })
    if (!ok) return
    try {
      await api.del(`/api/backups/${encodeURIComponent(file)}`)
      toast('نسخه‌ی پشتیبان حذف شد')
      refreshBackups()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  backupNowBtn.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget
    buttonLoading(btn, true, 'در حال ساخت…')
    try {
      const res = await api.post('/api/backups')
      toast(`پشتیبان ساخته شد: ${res.file}`)
      refreshBackups()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      buttonLoading(btn, false)
    }
  })

  saveBtn.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget
    buttonLoading(btn, true, 'در حال ذخیره…')
    try {
      const payload = {
        vat_percent: parseFloat(vatInput.value) || 0,
        currency: currencyInput.value.trim(),
        company_name: companyInputs.company_name.value.trim(),
        company_register_no: companyInputs.company_register_no.value.trim(),
        company_economic_code: companyInputs.company_economic_code.value.trim(),
        company_phone: companyInputs.company_phone.value.trim(),
        company_address: companyInputs.company_address.value.trim(),
        auto_backup: backupToggle.checked,
        backup_interval_days: intervalSelect.value,
        backup_path: backupPathInput.value.trim(),
        restore_password: restorePasswordInput.value.trim(),
        documents_path: documentsPathInput.value.trim(),
      }
      await api.put('/api/settings', payload)
      toast('تنظیمات ذخیره شد')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      buttonLoading(btn, false)
    }
  })

  // ---------- بارگذاری ----------
  api
    .get('/api/settings')
    .then((s) => {
      vatInput.value = s.vat_percent ? String(s.vat_percent) : ''
      currencyInput.value = s.currency || ''
      for (const [k, inp] of Object.entries(companyInputs)) inp.value = s[k] || ''
      backupToggle.checked = !!s.auto_backup
      intervalSelect.value = String(s.backup_interval_days || 1)
      backupPathInput.value = s.backup_path || ''
      documentsPathInput.value = s.documents_path || ''
      restorePasswordInput.value = s.restore_password || ''
      restorePasswordSet = !!(s.restore_password || '').trim()
      const hint = backupCard.querySelector('.switch-row .hint')
      if (hint) hint.textContent = backupToggle.checked ? 'فعال' : 'غیرفعال'
    })
    .catch((err) => toast(err.message, 'error'))
  refreshBackups()
}
