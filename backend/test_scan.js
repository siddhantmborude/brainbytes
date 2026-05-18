const http = require('http');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost', port: 5000, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  // 1) Register agent
  const regRes = await post('/api/auth/register', {
    name: 'TestAgent', email: `agent${Date.now()}@test.com`, password: '123', role: 'DELIVERY', hub: 'Mumbai'
  });
  console.log('Agent registered:', regRes.body.id, regRes.body.email);

  // 2) Create shipment
  const shipRes = await post('/api/shipments', { source: 'Mumbai', destination: 'Pune' });
  const pkgId = shipRes.body.id;
  console.log('Shipment created:', pkgId);

  // 3) Wait 2s for chain to be built
  await new Promise(r => setTimeout(r, 2000));

  // 4) Try scan with wrong agent (id=999)
  const wrongScan = await post(`/api/shipments/${pkgId}/scan`, { agent_id: 999 });
  console.log('Wrong agent scan:', wrongScan.status, wrongScan.body.code, wrongScan.body.message);

  // 5) Try scan with correct agent
  const okScan = await post(`/api/shipments/${pkgId}/scan`, { agent_id: regRes.body.id });
  console.log('Correct agent scan:', okScan.status, okScan.body.ok, okScan.body.message);

  // 6) Double scan
  const dblScan = await post(`/api/shipments/${pkgId}/scan`, { agent_id: regRes.body.id });
  console.log('Double scan:', dblScan.status, dblScan.body.code);
}

run().catch(console.error);
