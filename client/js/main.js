import { todayJalaali, parseJalaali } from './jalaali.js'
import { faNum, monthName } from './utils.js'
import { renderDashboardPage } from './pages/dashboard.js'
import { renderPeoplePage } from './pages/people.js'
import { renderInvoicesPage } from './pages/invoices.js'
import { renderPaymentsPage } from './pages/payments.js'
import { renderReportsPage } from './pages/reports.js'
import { renderSettingsPage } from './pages/settings.js'
import { renderCostCentersPage } from './pages/costcenters.js'

// ============================================================ تم روز/شب

const THEME_KEY = 'hesab-theme'

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  const label = document.getElementById('themeLabel')
  if (label) label.textContent = theme === 'dark' ? 'حالت روز' : 'حالت شب'
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* ignore */
  }
}

function initTheme() {
  let saved = null
  try {
    saved = localStorage.getItem(THEME_KEY)
  } catch {
    /* ignore */
  }
  const preferred =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  applyTheme(saved || preferred)
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')
}

// ============================================================ روتر

const ROUTES = {
  dashboard: { title: 'داشبورد', render: renderDashboardPage },
  people: { title: 'اشخاص', render: renderPeoplePage },
  invoices: { title: 'فاکتورها', render: renderInvoicesPage },
  payments: { title: 'پرداخت‌ها', render: renderPaymentsPage },
  costcenters: { title: 'مراکز هزینه', render: renderCostCentersPage },
  reports: { title: 'گزارش‌ها', render: renderReportsPage },
  settings: { title: 'تنظیمات', render: renderSettingsPage },
}

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '')
  return ROUTES[hash] ? hash : 'dashboard'
}

let rendering = false

async function renderRoute() {
  if (rendering) return
  rendering = true
  const route = currentRoute()
  const pageEl = document.getElementById('page')
  document.getElementById('pageTitle').textContent = ROUTES[route].title

  document.querySelectorAll('.nav-item').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === route)
  })

  // انیمیشن ورود صفحه
  pageEl.style.animation = 'none'
  void pageEl.offsetWidth
  pageEl.style.animation = ''

  try {
    await ROUTES[route].render(pageEl)
  } catch (err) {
    console.error(err)
    pageEl.innerHTML = ''
    pageEl.append(
      Object.assign(document.createElement('div'), {
        className: 'page-loading',
        textContent: 'خطا در بارگذاری صفحه: ' + err.message,
      })
    )
  }
  closeDrawer()
  rendering = false
}

// ============================================================ منوی موبایل

function toggleDrawer(open) {
  const sidebar = document.getElementById('sidebar')
  sidebar.classList.toggle('open', open)
  // برای اطمینان در همه‌ی مرورگرها، transform مستقیماً تنظیم می‌شود (اولویت بالاتر از CSS)
  sidebar.style.transform = open ? 'translateX(0)' : ''
  document.getElementById('sidebarBackdrop').classList.toggle('show', open)
}
function closeDrawer() {
  toggleDrawer(false)
}

// ============================================================ راه‌اندازی

function initTodayChip() {
  const p = parseJalaali(todayJalaali())
  const chip = document.getElementById('todayChip')
  if (chip && p) chip.textContent = `امروز: ${faNum(p.jd)} ${monthName(p.jm)} ${faNum(p.jy)}`
}

// غیرفعال‌کردن منوی راست‌کلیک پیش‌فرض (به‌جز داخل فیلدهای متنی برای کپی/چسباندن)
document.addEventListener('contextmenu', (e) => {
  const t = e.target
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
  e.preventDefault()
})

function init() {
  initTheme()
  initTodayChip()
  document.getElementById('themeToggle').addEventListener('click', toggleTheme)
  document.getElementById('themeToggleTop').addEventListener('click', toggleTheme)
  document.getElementById('menuBtn').addEventListener('click', () => toggleDrawer(true))
  document.getElementById('sidebarBackdrop').addEventListener('click', closeDrawer)
  document.querySelectorAll('.nav-item').forEach((a) => a.addEventListener('click', closeDrawer))
  window.addEventListener('hashchange', renderRoute)
  renderRoute()
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
else init()
