#!/usr/bin/env node
// Quick test: start server, add data, check ledger, exit
process.env.HESAB_DATA_DIR = '/tmp/hesab-test-data'
process.env.PORT = '3000'

const fs = require('fs')
const path = require('path')

// Clean test data
const dataDir = process.env.HESAB_DATA_DIR
if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true })

// Dynamic import for ESM server
async function main() {
  // Start server
  await import('../../server.js')
  
  const http = require('http')
  
  function api(method, url, body) {
    return new Promise((resolve, reject) => {
      const u = new URL(url, 'http://localhost:3000')
      const req = http.request(u, { method, headers: { 'Content-Type': 'application/json' } }, (res) => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve(data) } })
      })
      req.on('error', reject)
      if (body) req.write(JSON.stringify(body))
      req.end()
    })
  }
  
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
  
  await sleep(2000) // Wait for server to start
  
  console.log('=== Adding people ===')
  const ali = await api('POST', 'http://localhost:3000/api/people', { first_name: 'علی', last_name: 'محمدی', national_code: '1111111111' })
  console.log('Ali:', JSON.stringify(ali))
  const reza = await api('POST', 'http://localhost:3000/api/people', { first_name: 'رضا', last_name: 'کریمی', national_code: '2222222222' })
  console.log('Reza:', JSON.stringify(reza))
  
  console.log('\n=== Adding buy invoice from Ali (5000000 rials, #111) ===')
  const inv = await api('POST', 'http://localhost:3000/api/invoices', {
    seller_id: ali.id, invoice_number: '111', invoice_type: 'buy',
    invoice_date: '1403/03/01', total_amount: 5000000, paid_amount: 0,
    discount: 0, tax: 0,
    items: [{ item_name: 'کالای تست', quantity: 1, unit: 'عدد', unit_price: 5000000, total_price: 5000000 }]
  })
  console.log('Invoice:', JSON.stringify(inv))
  
  console.log('\n=== Reza pays 2000000 for Ali\'s invoice ===')
  const pay = await api('POST', 'http://localhost:3000/api/payments', {
    person_id: reza.id, transaction_type: 'receive', transfer_type: 'نقدی',
    amount: 2000000, payment_date: '1403/03/05', invoice_id: inv.id
  })
  console.log('Payment:', JSON.stringify(pay))
  
  console.log('\n=== Ledger for Ali (person_id=' + ali.id + ') ===')
  const aliLedger = await api('GET', 'http://localhost:3000/api/ledger?kind=all&person_id=' + ali.id)
  console.log('Opening:', aliLedger.openingBalance, 'Final:', aliLedger.finalBalance)
  for (const r of aliLedger.data) {
    console.log(`  ${r.kind} ${r.label || r.type} amt=${r.amount} flow=${r.flow} run_balance=${r.run_balance}`)
  }
  
  console.log('\n=== Ledger for Reza (person_id=' + reza.id + ') ===')
  const rezaLedger = await api('GET', 'http://localhost:3000/api/ledger?kind=all&person_id=' + reza.id)
  console.log('Opening:', rezaLedger.openingBalance, 'Final:', rezaLedger.finalBalance)
  for (const r of rezaLedger.data) {
    console.log(`  ${r.kind} ${r.label || r.type} amt=${r.amount} flow=${r.flow} run_balance=${r.run_balance}`)
  }
  
  console.log('\n=== General Report (persons) ===')
  const genReport = await api('GET', 'http://localhost:3000/api/ledger?kind=persons')
  for (const r of genReport.data) {
    console.log(`  ${r.first_name} ${r.last_name} debit=${r.debit} credit=${r.credit} balance=${r.balance}`)
  }
  
  console.log('\n✅ Test complete')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
