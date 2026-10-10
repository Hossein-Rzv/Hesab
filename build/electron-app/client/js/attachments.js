// ============================================================
// client/js/attachments.js — الصاق و مشاهده پیوست فاکتور/پرداخت
// در نسخه دسکتاپ (Electron) فایل‌پیکر سیستم استفاده می‌شود و
// مسیر کامل فایل به سرور ارسال می‌گردد؛ در حالت مرورگر (توسعه)
// محتوای فایل به‌صورت base64 ارسال می‌شود.
// ============================================================
import { api } from './api.js'
import { el, icon, esc } from './utils.js'
import { toast, confirmDialog } from './ui.js'

const hasElectron = () => typeof window !== 'undefined' && !!(window.electronAPI || window.hesabAPI)
const electronAPI = () => window.electronAPI || window.hesabAPI

/**
 * ساخت فیلد پیوست برای فرم‌ها — ماشین حالت:
 *  - pending = فایل تازه انتخاب‌شده، هنوز ذخیره‌نشده →
 *      مشاهده از محل اصلی فایل کاربر (Electron: مسیر — مرورگر: blob URL)
 *      حذف → فقط state پاک می‌شود؛ فایل اصلی کاربر دست نمی‌خورد
 *  - existing = پیوست ذخیره‌شده → مشاهده از محل ذخیره‌سازی؛ حذف → رکورد + فایل فیزیکی
 *  - اگر هر دو باشند (پیوست ذخیره‌شده + فایل تازه انتخاب‌شده) pending اولویت دارد؛
 *      هنگام ذخیره، سرور پیوست قبلی را جایگزین می‌کند (فایل قدیمی حذف می‌شود).
 */
export function attachmentField({ entityType, entityId = null } = {}) {
  let pending = null // { tempPath, name } (دسکتاپ) یا { data, name, blobUrl } (مرورگر)
  const btn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, [el('span', { html: icon('fileDown', 15) }), 'الصاق پیوست'])
  const viewBtn = el('button', { class: 'btn btn-ghost btn-sm att-view-btn', type: 'button', style: 'display:none' }, [el('span', { html: icon('eye', 15) }), 'مشاهده پیوست'])
  // حذف پیوست انتخاب‌شده فعلی (قبل از ذخیره فرم) — فقط از state پاک می‌کند
  const removePendingBtn = el('button', { class: 'icon-btn danger att-remove-btn', type: 'button', title: 'حذف پیوست انتخاب‌شده', style: 'display:none' }, el('span', { html: icon('trash', 15) }))
  // حذف پیوست ذخیره‌شده — رکورد + فایل فیزیکی (با تأیید)
  const removeSavedBtn = el('button', { class: 'icon-btn danger att-remove-btn', type: 'button', title: 'حذف پیوست', style: 'display:none' }, el('span', { html: icon('trash', 15) }))
  const info = el('span', { class: 'att-info hint' })
  const wrap = el('div', { class: 'field span-2 att-field' }, [
    el('label', {}, 'پیوست'),
    el('div', { class: 'att-row' }, [btn, viewBtn, removePendingBtn, removeSavedBtn, info]),
  ])

  // پیوست‌های موجود (حالت ویرایش)
  let existing = []
  if (entityId) {
    api
      .get(`/api/attachments/${entityType}/${entityId}`)
      .then((res) => {
        existing = res.data || []
        refresh()
      })
      .catch(() => {})
  }

  async function pick() {
    try {
      if (hasElectron()) {
        const picked = await electronAPI().selectFile()
        if (!picked) return
        pending = { tempPath: picked, name: picked.split(/[\\/]/).pop() }
      } else {
        // حالت مرورگر: انتخاب فایل و خواندن محتوا (تا ۲۰MB)
        const input = document.createElement('input')
        input.type = 'file'
        input.onchange = () => {
          const f = input.files && input.files[0]
          if (!f) return
          if (f.size > 20 * 1024 * 1024) {
            toast('حجم فایل پیوست بیش از حد مجاز است (حداکثر ۲۰ مگابایت)', 'error')
            return
          }
          const reader = new FileReader()
          reader.onload = () => {
            const b64 = String(reader.result || '').split(',')[1] || ''
            const blob = new Blob([reader.result], { type: f.type || 'application/octet-stream' })
            if (pending && pending.blobUrl) { try { URL.revokeObjectURL(pending.blobUrl) } catch { /* ignore */ } }
            pending = { data: b64, name: f.name, blobUrl: URL.createObjectURL(blob) }
            refresh()
          }
          reader.readAsDataURL(f)
        }
        input.click()
        return
      }
      refresh()
    } catch (e) {
      toast((e && e.message) || 'خطا در انتخاب فایل', 'error')
    }
  }

  btn.addEventListener('click', pick)

  // حذف پیوستِ هنوز ذخیره‌نشده — فایل اصلی کاربر هرگز حذف نمی‌شود؛ فقط نمایش پنهان می‌شود
  removePendingBtn.addEventListener('click', () => {
    if (pending && pending.blobUrl) { try { URL.revokeObjectURL(pending.blobUrl) } catch { /* ignore */ } }
    pending = null
    refresh()
    toast('پیوست انتخاب‌شده حذف شد (فایل اصلی شما دست نخورده باقی مانده است)')
  })

  // حذف پیوست ذخیره‌شده — با تأیید کاربر: رکورد دیتابیس + فایل فیزیکی
  removeSavedBtn.addEventListener('click', async () => {
    const a = existing[0]
    if (!a) return
    const done = await deleteAttachmentWithConfirm(a)
    if (done) {
      existing = existing.filter((x) => x.id !== a.id)
      refresh()
    }
  })

  function refresh() {
    info.textContent = ''
    removePendingBtn.style.display = 'none'
    removeSavedBtn.style.display = 'none'
    if (pending) {
      // فایل تازه انتخاب‌شده — از محل اصلی (بدون کپی) باز می‌شود
      info.textContent = pending.name
      viewBtn.style.display = ''
      removePendingBtn.style.display = ''
      viewBtn.onclick = async () => {
        if (!pending) return
        try {
          if (hasElectron() && pending.tempPath) {
            if (electronAPI().openPath) {
              const ok = await electronAPI().openPath(pending.tempPath)
              if (!ok) toast('باز کردن فایل ناموفق بود', 'error')
              return
            }
          }
          if (pending.blobUrl) {
            // حالت مرورگر: از blob URL محلی باز می‌شود (بدون کپی به سرور)
            window.open(pending.blobUrl, '_blank')
            return
          }
          toast('امکان باز کردن فایل وجود ندارد', 'error')
        } catch (e) {
          toast((e && e.message) || 'باز کردن فایل ناموفق بود', 'error')
        }
      }
      return
    }
    if (existing.length) {
      viewBtn.style.display = ''
      viewBtn.onclick = () => openExisting(0)
      removeSavedBtn.style.display = ''
      const first = existing[0]
      info.textContent = first.original_file_name || ''
      return
    }
    viewBtn.style.display = 'none'
  }

  async function openExisting(idx) {
    const a = existing[idx]
    if (!a) return
    if (!a.exists) {
      toast('فایل پیوست روی دیسک یافت نشد', 'error')
      return
    }
    try {
      if (hasElectron() && electronAPI().openPath) {
        const ok = await electronAPI().openPath(a.file_path)
        if (!ok) toast('باز کردن فایل ناموفق بود', 'error')
        return
      }
      await api.post(`/api/attachments/open/${a.id}`, {})
      toast('فایل باز شد')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return {
    el: wrap,
    get pending() {
      return pending
    },
    /** payload برای ارسال همراه فرم — Electron: مسیر، مرورگر: base64 */
    payload() {
      if (!pending) return null
      if (pending.tempPath) return { path: pending.tempPath, name: pending.name }
      return { data: pending.data, name: pending.name }
    },
    /** بعد از ذخیره موفق فرم صدا زده می‌شود — state پاک و به حالت ذخیره‌شده برمی‌گردد */
    markSaved() {
      if (pending && pending.blobUrl) { try { URL.revokeObjectURL(pending.blobUrl) } catch { /* ignore */ } }
      pending = null
      existing = []
      // بارگیری مجدد پیوست ذخیره‌شده از سرور (جایگزین جدید اگر بوده، همان نمایش داده می‌شود)
      if (entityId) {
        api
          .get(`/api/attachments/${entityType}/${entityId}`)
          .then((res) => {
            existing = res.data || []
            refresh()
          })
          .catch(() => {})
      } else {
        refresh()
      }
    },
    refresh,
  }
}

/**
 * حذف پیوست ذخیره‌شده با تأیید کاربر — رکورد دیتابیس + فایل فیزیکی
 * خروجی: true اگر حذف انجام شد
 */
export async function deleteAttachmentWithConfirm(attachment) {
  const a = attachment || {}
  const ok = await confirmDialog({
    title: 'حذف پیوست',
    message: `پیوست «${a.original_file_name || a.stored_file_name || ''}» و فایل آن از دیسک برای همیشه حذف می‌شود. ادامه می‌دهید؟`,
    confirmText: 'حذف پیوست',
  })
  if (!ok) return false
  try {
    await api.del(`/api/attachments/${a.id}`)
    toast('پیوست حذف شد')
    return true
  } catch (err) {
    toast(err.message, 'error')
    return false
  }
}

/** حذف پیوست پرداخت از منو/لیست — با تأیید؛ خروجی: انجام شد؟ */
export async function deletePaymentAttachmentFromMenu(paymentId) {
  try {
    const res = await api.get(`/api/attachments/payment/${paymentId}`)
    const list = res.data || []
    if (!list.length) {
      toast('این رکورد پیوست ندارد', 'error')
      return false
    }
    return deleteAttachmentWithConfirm(list[0])
  } catch (err) {
    toast(err.message, 'error')
    return false
  }
}

/** باز کردن مستقیم اولین پیوست یک موجودیت (برای منوی راست‌کلیک و مشابه) */
export async function openEntityAttachment(entityType, entityId) {
  try {
    const res = await api.get(`/api/attachments/${entityType}/${entityId}`)
    const list = res.data || []
    if (!list.length) {
      toast('این رکورد پیوست ندارد', 'error')
      return
    }
    const a = list[0]
    if (!a.exists) {
      toast('فایل پیوست روی دیسک یافت نشد', 'error')
      return
    }
    if (hasElectron() && electronAPI().openPath) {
      const ok = await electronAPI().openPath(a.file_path)
      if (!ok) toast('باز کردن فایل ناموفق بود', 'error')
      return
    }
    await api.post(`/api/attachments/open/${a.id}`, {})
    toast('فایل باز شد')
  } catch (err) {
    toast(err.message, 'error')
  }
}

/** دکمه «مشاهده پیوست» برای جدول‌ها — فقط اگر پیوست وجود دارد */
export function attachmentViewButton(entityType, entityId) {
  const b = el('button', { class: 'icon-btn', title: 'مشاهده پیوست', style: 'display:none' }, el('span', { html: icon('fileDown', 16) }))
  api
    .get(`/api/attachments/${entityType}/${entityId}`)
    .then((res) => {
      const list = res.data || []
      if (!list.length) return
      b.style.display = ''
      b.title = `مشاهده پیوست: ${list[0].original_file_name || ''}`
      b.onclick = () => openEntityAttachment(entityType, entityId)
    })
    .catch(() => {})
  return b
}

/** دکمه «ارسال به اکسل» برای فرم/لیست فاکتور */
export function sendToExcelButton(invoiceId, { onDone } = {}) {
  return el(
    'button',
    {
      class: 'btn btn-ghost btn-sm',
      type: 'button',
      onclick: async () => {
        try {
          toast('در حال تولید فایل اکسل…')
          await api.post(`/api/invoices/${invoiceId}/excel`, {})
          toast('فایل اکسل باز شد')
          onDone?.()
        } catch (err) {
          toast(err.message, 'error')
        }
      },
    },
    [el('span', { html: icon('send', 15) }), 'ارسال به اکسل']
  )
}
