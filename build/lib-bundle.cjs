#!/usr/bin/env node
// lib-bundle.cjs — تبدیل server.js + server/db.js به فایل‌های CJS برای Electron
'use strict'
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')

/** تبدیل یک فایل ESM به CJS */
function esmToCjs(src) {
  // import X from 'mod' → const X = require('mod')
  src = src.replace(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?\s*$/gm, (_, name, mod) => {
    return `const ${name} = require('${mod}');`
  })
  // import { a, b } from 'mod' → const { a, b } = require('mod')
  src = src.replace(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm, (_, names, mod) => {
    return `const { ${names.trim()} } = require('${mod}');`
  })
  // export const X = ... → const X = ...
  src = src.replace(/^export\s+const\s+/gm, 'const ')
  // export let X = ... → let X = ...
  src = src.replace(/^export\s+let\s+/gm, 'let ')
  // export function X → function X
  src = src.replace(/^export\s+function\s+/gm, 'function ')
  // import.meta.url → __filename
  src = src.replace(/import\.meta\.url/g, '__filename')
  // حذف تعریف __dirname در CJS (از قبل موجود است)
  src = src.replace(/^const\s+__dirname\s*=.*$/gm, '// __dirname available in CJS')
  return src
}

function buildBundle() {
  // خواندن کد سرور و db
  let serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8')
  let dbSrc = fs.readFileSync(path.join(ROOT, 'server', 'db.js'), 'utf8')

  // تبدیل db.js به CJS
  dbSrc = esmToCjs(dbSrc)

  // جمع‌آوری export-های db.js
  const exportedNames = []
  // let/const/function declarations
  for (const m of dbSrc.matchAll(/^(?:const|let|function)\s+(\w+)/gm)) {
    if (m[1].startsWith('_')) continue
    exportedNames.push(m[1])
  }
  // در انتهای db.js module.exports اضافه کن
  dbSrc += `\nmodule.exports = { ${[...new Set(exportedNames)].join(', ')} }\n`

  // تبدیل server.js به CJS
  serverSrc = esmToCjs(serverSrc)

  // در CJS، require از قبل موجود است — تعریف مجدد با createRequire حذف می‌شود
  // دقت: [ \t] به‌جای \s تا newline خط بعدی حذف نشود (وگرنه خط بعدی به کامنت می‌چسبد و حذف می‌شود)
  serverSrc = serverSrc.replace(
    /const[ \t]+require[ \t]*=[ \t]*createRequire\([^)]*\)[ \t]*;?/g,
    '// require is available in CJS'
  )

  // جایگزینی node:sea با no-op
  serverSrc = serverSrc.replace(
    /const\s+\{\s*isSea\s*,\s*getAsset\s*\}\s*=\s*require\(['"]node:sea['"]\)\s*;?/g,
    "const isSea = () => false; const getAsset = () => Buffer.alloc(0)"
  )

  // حذف __dirname از fileURLToPath (در CJS از قبل موجود است)
  serverSrc = serverSrc.replace(
    /const\s+__dirname\s*=\s*path\.dirname\(fileURLToPath\(__filename\)\)/g,
    '// __dirname already available in CJS'
  )

  // حذف import { fileURLToPath } اگر باقی مانده
  serverSrc = serverSrc.replace(
    /const\s+\{\s*fileURLToPath\s*\}\s*=\s*require\(['"]node:url['"]\)\s*;?\s*\n?/g, ''
  )

  // جایگزینی require('./server/db.js') با require('./db-bundle.cjs')
  // چون در packaged app پوشه server/ وجود ندارد
  serverSrc = serverSrc.replace(
    /require\(['"]\.\/server\/db\.js['"]\)/g,
    "require('./db-bundle.cjs')"
  )

  // سرویس‌های CJS: در packaged app کنار server-bundle.cjs قرار می‌گیرند
  serverSrc = serverSrc.replace(
    /require\(['"]\.\/server\/documents\.cjs['"]\)/g,
    "require('./documents.cjs')"
  )
  serverSrc = serverSrc.replace(
    /require\(['"]\.\/server\/excel-export\.cjs['"]\)/g,
    "require('./excel-export.cjs')"
  )

  return { serverSrc, dbSrc }
}

if (require.main === module) {
  const { serverSrc, dbSrc } = buildBundle()
  fs.writeFileSync(path.join(__dirname, 'test-server-bundle.cjs'), serverSrc)
  fs.writeFileSync(path.join(__dirname, 'test-db-bundle.cjs'), dbSrc)
  console.log('Server bundle:', serverSrc.length, 'bytes')
  console.log('DB bundle:', dbSrc.length, 'bytes')
}

module.exports = { buildBundle }
