import { api } from '../api.js'
import { el, faNum, esc, money, fullName, icon, monthName, formatDate } from '../utils.js'
import { txBadge } from './payments.js'
import { invoiceTypeBadge } from './invoices.js'
import { openPaymentForm } from '../payment-form.js'
import { openReportModal } from './reports.js'

export async function renderDashboardPage(root) {
  root.innerHTML = ''
  const loading = el('div', { class: 'page-loading' }, 'در حال بارگذاری داشبورد…')
  root.append(loading)

  let s
  try {
    s = await api.get('/api/stats')
  } catch (err) {
    loading.textContent = err.message
    return
  }
  loading.remove()

  const statsGrid = el('div', { class: 'stats-grid' }, [
    statCard('users', 'i1', 'تعداد اشخاص', money(s.peopleCount), ''),
    statCard('doc', 'i2', 'تعداد فاکتورها', money(s.invoiceCount), ''),
    statCard('trendingUp', 'i3', 'مجموع فروش', money(s.sell), ''),
    statCard('trendingDown', 'i4', 'مجموع خرید', money(s.buy), ''),
    statCard('wallet', 'i1', 'مجموع دریافتی‌ها', money(s.received), ''),
    statCard('send', 'i4', 'مجموع پرداختی‌ها', money(s.paid), ''),
  ])

  const chartCard = el('div', { class: 'card chart' }, [
    el('h3', {}, 'روند فاکتورها — ۶ ماه اخیر'),
    el('div', { class: 'chart-legend' }, [
      el('span', {}, [el('i', { style: 'background:#10b981' }), 'فروش']),
      el('span', {}, [el('i', { style: 'background:#6366f1' }), 'خرید']),
    ]),
    buildChart(s.monthly || []),
  ])

  // حساب شرکت
  const ca = s.companyAccount || {}
  const companyCard = el('div', { class: 'card' }, [
    el('h3', {}, 'حساب شرکت'),
    el('div', { class: 'ca-grid' }, [
      caItem('دریافتی از اشخاص', money(ca.received), 'var(--success)'),
      caItem('پرداختی به اشخاص', money(ca.paid), 'var(--danger)'),
      caItem('موجودی حساب', money(ca.balance), Number(ca.balance) >= 0 ? 'var(--primary)' : 'var(--danger)'),
    ]),
  ])

  // بستانکارها — پیشنهاد تسویه
  const creditorsCard = el('div', { class: 'card list-card' }, [
    el('div', { class: 'lc-head' }, [
      el('h3', {}, 'بستانکارها — پیشنهاد تسویه'),
      el(
        'button',
        {
          class: 'link-btn',
          onclick: () => openReportModal({ kind: 'persons', title: 'گزارش بدهکاری و بستانکاری اشخاص' }),
        },
        'همه بدهکاری / بستانکاری‌ها'
      ),
    ]),
  ])
  const creditors = s.creditors || []
  if (!creditors.length) {
    creditorsCard.append(el('div', { class: 'lc-item', style: 'color:var(--muted);font-size:13px' }, 'بستانکاری برای تسویه وجود ندارد.'))
  } else {
    for (const c of creditors) {
      const person = { id: c.person_id, first_name: c.first_name, last_name: c.last_name, company_name: c.company_name }
      creditorsCard.append(
        el('div', { class: 'lc-item' }, [
          el('div', { class: 'lc-main' }, [
            el('div', { class: 'lc-name' }, esc(fullName(person))),
            el('div', { class: 'lc-sub' }, 'بستانکار'),
          ]),
          el('div', { class: 'lc-amount', style: 'color:var(--success)' }, money(c.amount)),
          el(
            'button',
            {
              class: 'btn btn-ghost btn-sm',
              onclick: () =>
                openPaymentForm({
                  prefill: { person, transaction_type: 'pay', amount: c.amount, notes: 'تسویه‌ی بستانکاری' },
                }),
            },
            [el('span', { html: icon('check', 14) }), 'تسویه']
          ),
        ])
      )
    }
  }

  const recentInvoices = el('div', { class: 'card list-card' }, [
    el('div', { class: 'lc-head' }, [
      el('h3', {}, 'آخرین فاکتورها'),
      el('a', { href: '#/invoices' }, 'همه فاکتورها'),
    ]),
    ...(s.recentInvoices || []).map((inv) =>
      el('div', { class: 'lc-item' }, [
        el('div', { class: 'lc-main' }, [
          el('div', { class: 'lc-name' }, `${inv.invoice_number ? esc(inv.invoice_number) : `فاکتور ${faNum(inv.id)}`} — ${esc(fullName(inv))}`),
          el('div', { class: 'lc-sub' }, formatDate(inv.invoice_date)),
        ]),
        el('div', { class: 'lc-amount' }, money(inv.total_amount)),
        invoiceTypeBadge(inv.invoice_type),
      ])
    ),
  ])

  const recentPayments = el('div', { class: 'card list-card' }, [
    el('div', { class: 'lc-head' }, [
      el('h3', {}, 'آخرین تراکنش‌ها'),
      el('a', { href: '#/payments' }, 'همه تراکنش‌ها'),
    ]),
    ...(s.recentPayments || []).map((pay) =>
      el('div', { class: 'lc-item' }, [
        el('div', { class: 'lc-main' }, [
          el('div', { class: 'lc-name' }, esc(fullName(pay))),
          el('div', { class: 'lc-sub' }, `${formatDate(pay.payment_date)}${pay.transfer_type ? ` — ${esc(pay.transfer_type)}` : ''}${pay.invoice_number ? ` — فاکتور ${esc(pay.invoice_number)}` : ''}`),
        ]),
        el('div', { class: 'lc-amount', style: `color:${pay.transaction_type === 'receive' ? 'var(--success)' : 'var(--danger)'}` }, money(pay.amount)),
        txBadge(pay.transaction_type),
      ])
    ),
  ])

  if (!(s.recentInvoices || []).length) {
    recentInvoices.append(
      el('div', { class: 'lc-item', style: 'color:var(--muted);font-size:13px' }, 'هنوز فاکتوری ثبت نشده است.')
    )
  }
  if (!(s.recentPayments || []).length) {
    recentPayments.append(
      el('div', { class: 'lc-item', style: 'color:var(--muted);font-size:13px' }, 'هنوز تراکنشی ثبت نشده است.')
    )
  }

  root.append(
    statsGrid,
    companyCard,
    el('div', { class: 'dash-grid' }, [
      el('div', { class: 'dash-col' }, [chartCard, recentInvoices]),
      el('div', { class: 'dash-col' }, [recentPayments, creditorsCard]),
    ])
  )
}

function caItem(label, value, color) {
  return el('div', { class: 'ca-item' }, [
    el('div', { class: 'ca-label' }, label),
    el('div', { class: 'ca-value', style: `color:${color}` }, value),
  ])
}

function statCard(ic, colorClass, label, value, sub) {
  return el('div', { class: 'stat-card' }, [
    el('div', { class: `stat-icon ${colorClass}` }, el('span', { html: icon(ic, 22) })),
    el('div', {}, [
      el('div', { class: 'st-label' }, label),
      el('div', { class: 'st-value' }, value),
      sub ? el('div', { class: 'st-sub' }, sub) : null,
    ]),
  ])
}

function buildChart(monthly) {
  const max = Math.max(1, ...monthly.map((m) => Math.max(Number(m.sell) || 0, Number(m.buy) || 0)))
  return el('div', { class: 'chart-bars' }, [
    ...monthly.map((m) => {
      const sellPct = ((Number(m.sell) || 0) / max) * 100
      const buyPct = ((Number(m.buy) || 0) / max) * 100
      const [, jm] = String(m.month).split('/')
      return el('div', { class: 'chart-group' }, [
        el('div', { class: 'bars' }, [
          el('div', { class: 'bar b-sell', style: `height:${sellPct}%`, title: `فروش: ${money(m.sell)}` }),
          el('div', { class: 'bar b-buy', style: `height:${buyPct}%`, title: `خرید: ${money(m.buy)}` }),
        ]),
        el('div', { class: 'month' }, monthName(jm)),
      ])
    }),
  ])
}
