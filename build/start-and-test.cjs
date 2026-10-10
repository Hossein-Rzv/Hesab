const { spawn } = require('child_process');
const path = require('path');

// Start server
const server = spawn('node', ['server.js'], {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'ignore',
  detached: true,
});
server.unref();
console.log('Server PID:', server.pid);

// Wait then add test data
setTimeout(async () => {
  const http = require('http');
  function post(url, body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
  try {
    await post('http://localhost:3000/api/people', { first_name: 'علی', last_name: 'رضایی' });
    await post('http://localhost:3000/api/people', { first_name: 'رضا', last_name: 'احمدی' });
    await post('http://localhost:3000/api/invoices', { seller_id: 1, invoice_type: 'buy', invoice_date: '1404/03/01', invoice_number: '111', total_amount: 5000000, paid_amount: 0, items: [{ item_name: 'کالا', quantity: 2, unit: 'عدد', unit_price: 2500000 }] });
    await post('http://localhost:3000/api/payments', { person_id: 2, transaction_type: 'receive', transfer_type: 'نقدی', amount: 2000000, payment_date: '1404/03/05', invoice_id: 1 });
    console.log('Test data added');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}, 3000);
