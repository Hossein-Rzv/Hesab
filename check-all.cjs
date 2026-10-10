'use strict';

const fs = require('fs');
const path = require('path');

const filesToCheck = [
  'server.js',
  'server/db.js',
  'server/documents.cjs',
  'server/excel-export.cjs'
];

// Add client js files
function addJsFiles(dir, list) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      addJsFiles(full, list);
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.cjs')) {
      list.push(full);
    }
  }
}

addJsFiles('client/js', filesToCheck);

let allOk = true;
for (const f of filesToCheck) {
  try {
    require('fs').accessSync(f, fs.constants.R_OK);
    require('child_process').execSync(`node --check "${f}"`, { stdio: 'ignore' });
    console.log(`OK: ${f}`);
  } catch (e) {
    console.error(`FAIL: ${f} — ${e.message}`);
    allOk = false;
  }
}

if (!allOk) {
  process.exit(1);
}
console.log('All files passed syntax check.');
