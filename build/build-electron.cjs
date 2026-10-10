#!/usr/bin/env node
// build-electron.cjs — ساخت نسخه‌ی دسکتاپ (Electron)
// با پشتیبانی از better-sqlite3 و Electron 22 (سازگار با Windows 7)
// با دانلود prebuilt binaries از GitHub به جای compile از منبع
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const http = require('node:http')
const { spawnSync } = require('node:child_process')
const { buildBundle } = require('./lib-bundle.cjs')

const ROOT = path.join(__dirname, '..')
const BUILD = __dirname
const DIST = path.join(ROOT, 'dist')

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true })
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name)
    const d = path.join(dst, name)
    if (fs.statSync(s).isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

/** دانلود فایل از URL */
function download(url) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? https.get : http.get
    get(url, { headers: { 'User-Agent': 'node' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode + ' for ' + url))
        res.resume()
        return
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

/** استخراج tar.gz با Node.js tar module */
function extractTarGz(archive, dest) {
  fs.mkdirSync(dest, { recursive: true })
  const tar = require('tar')
  tar.x({
    file: archive,
    cwd: dest,
    sync: true,
  })
}

/** دانلود prebuilt binary برای better-sqlite3 از GitHub */
async function downloadPrebuilt(electronVer, arch, bs3DstDir) {
  console.log('  📥 دانلود prebuilt برای Electron ' + electronVer + ' (' + arch + ')...')
  
  // تشخیص NODE_MODULE_VERSION واقعی از باینری Electron
  let electronAbi = 'v107' // پیش‌فرض برای Electron 22
  try {
    const electronPath = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
    if (fs.existsSync(electronPath)) {
      const checkScript = 'process.stdout.write(String(process.versions.modules))'
      const tmpScript = path.join(BUILD, '.check-abi.cjs')
      fs.writeFileSync(tmpScript, checkScript)
      const r = spawnSync(electronPath, [tmpScript], { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] })
      rmrf(tmpScript)
      if (r.stdout && r.stdout.trim()) {
        electronAbi = 'v' + r.stdout.trim()
        console.log('  🔍 NODE_MODULE_VERSION واقعی: ' + electronAbi)
      }
    }
  } catch { /* fallback to v107 */ }
  const fileName = `better-sqlite3-v9.6.0-electron-${electronAbi}-win32-${arch}.tar.gz`
  const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v9.6.0/${fileName}`
  
  console.log('     URL: ' + url)
  
  const buf = await download(url)
  const tmpFile = path.join(BUILD, '.prebuilt.tar.gz')
  fs.writeFileSync(tmpFile, buf)
  
  const tmpDir = path.join(BUILD, '.prebuilt-extract')
  rmrf(tmpDir)
  extractTarGz(tmpFile, tmpDir)
  
  // فایل استخراج شده: build/Release/better_sqlite3.node
  const srcNode = path.join(tmpDir, 'build', 'Release', 'better_sqlite3.node')
  const dstNode = path.join(bs3DstDir, 'build', 'Release', 'better_sqlite3.node')
  if (!fs.existsSync(srcNode)) {
    console.error('  ❌ فایل better_sqlite3.node یافت نشد پس از استخراج')
    console.error('     محتوای tar:', fs.readdirSync(tmpDir))
    process.exit(1)
  }
  fs.mkdirSync(path.dirname(dstNode), { recursive: true })
  fs.copyFileSync(srcNode, dstNode)
  
  rmrf(tmpFile)
  rmrf(tmpDir)
  console.log('  ✅ prebuilt دانلود و نصب شد')
}

async function buildOne(arch) {
  console.log('\n========== ARCH = ' + arch + ' ==========')
  console.log('۱) ساخت باندل سرور (CJS)…')
  const { serverSrc, dbSrc } = buildBundle()
  
  // بررسی syntax
  const tmpServer = path.join(BUILD, '.check-server.cjs')
  const tmpDb = path.join(BUILD, '.check-db.cjs')
  fs.writeFileSync(tmpServer, serverSrc)
  fs.writeFileSync(tmpDb, dbSrc)
  
  let chk = spawnSync(process.execPath, ['--check', tmpServer], { encoding: 'utf8' })
  if (chk.status !== 0) {
    console.error('خطای سینتکس server-bundle:\n', chk.stderr || chk.stdout)
    process.exit(1)
  }
  chk = spawnSync(process.execPath, ['--check', tmpDb], { encoding: 'utf8' })
  if (chk.status !== 0) {
    console.error('خطای سینتکس db-bundle:\n', chk.stderr || chk.stdout)
    process.exit(1)
  }
  console.log('  ✅ syntax OK')

  console.log('۲) آماده‌سازی پوشه‌ی برنامه (staging)…')
  const STAGE = path.join(BUILD, 'electron-app')
  rmrf(STAGE)
  fs.mkdirSync(STAGE, { recursive: true })

  // package.json
  const bs3Ver = require(path.join(ROOT, 'node_modules', 'better-sqlite3', 'package.json')).version
  fs.writeFileSync(
    path.join(STAGE, 'package.json'),
    JSON.stringify({
      name: 'hesab',
      productName: 'حساب',
      version: '1.0.0',
      description: 'برنامه مدیریت اشخاص، فاکتورها و پرداخت‌ها',
      main: 'electron-main.cjs',
      author: 'Hesab',
      license: 'MIT',
      dependencies: { 'better-sqlite3': bs3Ver },
    }, null, 2)
  )

  // کپی فایل‌ها
  fs.copyFileSync(path.join(BUILD, 'electron-main.cjs'), path.join(STAGE, 'electron-main.cjs'))
  fs.copyFileSync(path.join(BUILD, 'preload.cjs'), path.join(STAGE, 'preload.cjs'))
  fs.writeFileSync(path.join(STAGE, 'server-bundle.cjs'), serverSrc)
  fs.writeFileSync(path.join(STAGE, 'db-bundle.cjs'), dbSrc)
  fs.copyFileSync(path.join(BUILD, 'icon.ico'), path.join(STAGE, 'icon.ico'))
  copyDir(path.join(ROOT, 'client'), path.join(STAGE, 'client'))

  // سرویس‌های CJS + Template اکسل (پوشه server/templates کنار باندل)
  fs.copyFileSync(path.join(ROOT, 'server', 'documents.cjs'), path.join(STAGE, 'documents.cjs'))
  fs.copyFileSync(path.join(ROOT, 'server', 'excel-export.cjs'), path.join(STAGE, 'excel-export.cjs'))
  // Template اکسل — هم کنار سرویس‌ها (app/templates، مسیر __dirname در excel-export.cjs)
  // و هم در app/server/templates (سازگاری با ساختار dev)
  copyDir(path.join(ROOT, 'server', 'templates'), path.join(STAGE, 'server', 'templates'))
  copyDir(path.join(ROOT, 'server', 'templates'), path.join(STAGE, 'templates'))
  
  rmrf(tmpServer)
  rmrf(tmpDb)

  // نصب better-sqlite3
  console.log('  📦 نصب better-sqlite3 در staging...')
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const npmInstall = spawnSync(npmCmd, ['install', '--omit=dev', '--ignore-scripts'], {
    cwd: STAGE, stdio: 'pipe', encoding: 'utf8', shell: process.platform === 'win32',
  })
  if (npmInstall.status !== 0) {
    console.error('npm install ناموفق:', npmInstall.stderr || npmInstall.stdout)
    process.exit(1)
  }

  // دانلود prebuilt binaries
  const electronVer = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')
  ).version
  await downloadPrebuilt(electronVer, arch, path.join(STAGE, 'node_modules', 'better-sqlite3'))

  // بسته‌بندی
  console.log('۳) بسته‌بندی با electron-packager (' + arch + ')…')
  const packagerCmd = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-packager.cmd' : 'electron-packager')
  const args = [
    STAGE, 'hesab',
    '--platform=win32', '--arch=' + arch,
    '--out=' + DIST, '--overwrite', '--asar=false', '--prune=false',
    '--icon=' + path.join(BUILD, 'icon.ico'),
    '--electron-version=' + electronVer,
    '--app-version=1.0.0',
  ]
  const r = spawnSync(packagerCmd, args, { stdio: 'pipe', encoding: 'utf8', shell: process.platform === 'win32' })
  process.stdout.write(r.stdout || '')
  if (r.status !== 0) {
    console.error('بسته‌بندی ناموفق:', r.stderr || '')
    if (r.error) console.error(r.error.message)
    process.exit(r.status || 1)
  }

  const outDir = path.join(DIST, 'hesab-win32-' + arch)
  const exe = path.join(outDir, 'hesab.exe')
  if (!fs.existsSync(exe)) {
    console.error('فایل exe ساخته نشد:', exe)
    process.exit(1)
  }
  console.log('✅ ساخت کامل شد: ' + exe)
}

async function main() {
  const archArg = process.env.ARCH || process.argv[2] || 'x64'
  const archs = archArg === 'all' ? ['x64', 'ia32'] : [archArg]
  for (const a of archs) await buildOne(a)
  console.log('\n🎉 همه نسخه‌ها ساخته شدند: ' + archs.join(', '))
}

main().catch((err) => {
  console.error('خطا:', err)
  process.exit(1)
})
