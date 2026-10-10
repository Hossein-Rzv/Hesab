// کمکی چاپ — محتوای HTML را در یک ریشه‌ی چاپی قرار می‌دهد و پنجره‌ی چاپ را باز می‌کند.
// در حالت چاپ، فقط #printRoot نمایش داده می‌شود (بقیه‌ی صفحه پنهان می‌شود).

export function printDocument(html) {
  let root = document.getElementById('printRoot')
  if (!root) {
    root = document.createElement('div')
    root.id = 'printRoot'
    document.body.appendChild(root)
  }
  root.innerHTML = html
  // اجازه‌ی اعمال استایل‌های چاپی قبل از باز شدن دیالوگ چاپ
  requestAnimationFrame(() => {
    window.print()
  })
}

window.addEventListener('afterprint', () => {
  const r = document.getElementById('printRoot')
  if (r) r.innerHTML = ''
})
