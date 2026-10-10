'use strict'
// ============================================================
// Hesab Desktop — Electron main process
// سرور HTTP را در همین پروسه اجرا می‌کند و برنامه را در یک
// پنجره‌ی مستقل (بدون مرورگر) باز می‌کند.
// داده‌ها و پشتیبان‌ها در پوشه‌ی %APPDATA%/hesab ذخیره می‌شوند.
// ============================================================
const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const net = require('node:net')
const http = require('node:http')

// ---------- مسیر داده ----------
const dataDir = process.env.HESAB_DATA_DIR || path.join(app.getPath('appData'), 'Hesab')
app.setPath('userData', dataDir)
fs.mkdirSync(dataDir, { recursive: true })
process.env.HESAB_DATA_DIR = dataDir
process.env.HOST = '127.0.0.1'

// فایل‌های کلاینت کنار همین فایل در پکیج قرار دارند
process.env.HESAB_CLIENT_DIR = path.join(__dirname, 'client')

// ---------- لاگ ----------
const logStream = fs.createWriteStream(path.join(dataDir, 'server.log'), { flags: 'a' })
const _log = console.log, _err = console.error
console.log = (...a) => { try { _log(...a); logStream.write('[' + new Date().toISOString() + '] ' + a.map(String).join(' ') + '\n') } catch {} }
console.error = (...a) => { try { _err(...a); logStream.write('[' + new Date().toISOString() + '] ERR ' + a.map(String).join(' ') + '\n') } catch {} }

// ---------- پیدا کردن پورت آزاد ----------
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

// ---------- IPC: انتخاب پوشه ----------
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'انتخاب پوشه',
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// ---------- IPC: انتخاب فایل (پیوست) ----------
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'treatPackageAsDirectory'],
    title: 'انتخاب فایل پیوست',
    filters: [
      { name: 'همه فایل‌ها', extensions: ['*'] },
    ],
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})

// ---------- IPC: باز کردن فایل/پوشه با برنامه پیش‌فرض ----------
const { shell } = require('electron')
ipcMain.handle('open-path', async (_e, p) => {
  if (!p || typeof p !== 'string') return false
  const result = await shell.openPath(p)
  return result === '' // خطا به‌صورت رشته برمی‌گردد
})

// ---------- IPC: restart server ----------
ipcMain.on('restart-server', () => {
  // ساده: فقط app را ری‌استارت کن
  app.relaunch()
  app.exit(0)
})

// ---------- اجرای سرور ----------
let mainWindow = null
let serverInstance = null

async function startServer() {
  const PORT = await findFreePort()
  process.env.PORT = String(PORT)

  // اجرای باندل سرور (server-bundle.cjs خودش db-bundle.cjs را require می‌کند)
  require('./server-bundle.cjs')

  // صبر برای بالا آمدن سرور
  await new Promise((resolve) => setTimeout(resolve, 500))

  return PORT
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'حساب — مدیریت اشخاص، فاکتورها و پرداخت‌ها',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    show: false,
  })

  mainWindow.loadURL(`http://127.0.0.1:${port}`)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  try {
    const port = await startServer()
    createWindow(port)
    console.log('🚀 Hesab Desktop روی http://127.0.0.1:' + port + ' اجرا شد')
  } catch (err) {
    console.error('خطا در شروع برنامه:', err)
    dialog.showErrorBox('خطا', 'خطا در شروع برنامه:\n' + err.message)
    app.exit(1)
  }
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    // مجدداً پنجره باز کن (macOS)
  }
})
