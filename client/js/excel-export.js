// ============================================================
// client/js/excel-export.js — ارسال فاکتور به اکسل (Template رسمی)
// ============================================================
import { api } from './api.js'
import { el, icon } from './utils.js'
import { toast } from './ui.js'

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
