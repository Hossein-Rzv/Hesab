process.env.HESAB_DATA_DIR = '/tmp/hesab-test-filter'
const http = require('http')

function get(path) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3001' + path, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve(JSON.parse(d)))
    }).on('error', reject)
  })
}

async function main() {
  console.log('=== Test 1: All persons (no filter) ===')
  const all = await get('/api/ledger?kind=persons')
  console.log('count:', all.count, 'net:', all.net)
  all.data.forEach(r => console.log(`  ${r.person_id} ${r.first_name}: debit=${r.debit} credit=${r.credit} balance=${r.balance}`))

  console.log('\n=== Test 2: Filter person_id=1 (Ali) ===')
  const ali = await get('/api/ledger?kind=persons&person_id=1')
  console.log('count:', ali.count, 'net:', ali.net)
  ali.data.forEach(r => console.log(`  ${r.person_id} ${r.first_name}: debit=${r.debit} credit=${r.credit} balance=${r.balance}`))

  console.log('\n=== Test 3: Filter person_id=2 (Reza) ===')
  const reza = await get('/api/ledger?kind=persons&person_id=2')
  console.log('count:', reza.count, 'net:', reza.net)
  reza.data.forEach(r => console.log(`  ${r.person_id} ${r.first_name}: debit=${r.debit} credit=${r.credit} balance=${r.balance}`))

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
