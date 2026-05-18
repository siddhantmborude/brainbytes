require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const SimulationEngine = require('./simulator/SimulationEngine');
const ConflictEngine = require('./simulator/ConflictEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const prisma = new PrismaClient({});

app.use(cors());
app.use(express.json());

const simEngine = new SimulationEngine(io);
simEngine.start();

// Run stuck detection every 60 seconds
setInterval(() => ConflictEngine.detectStuckShipments(), 60000);

// =============================================================
// AUTH
// =============================================================
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role, hub } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'All fields required' });
  try {
    const user = await prisma.user.create({
      data: { name, email, password, role: role.toUpperCase(), hub: hub || null }
    });
    const { password: _, ...safe } = user;
    res.json(safe);
  } catch (err) {
    res.status(400).json({ error: 'Email already registered' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.password !== password) return res.status(401).json({ error: 'Invalid email or password' });
  const { password: _, ...safe } = user;
  res.json(safe);
});

// =============================================================
// SHIPMENTS
// =============================================================
app.get('/api/shipments', async (req, res) => {
  const { owner_email } = req.query;
  const where = owner_email ? { owner_email } : {};
  const shipments = await prisma.shipment.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(shipments);
});

app.get('/api/shipments/:id', async (req, res) => {
  const shipment = await prisma.shipment.findUnique({
    where: { id: req.params.id },
    include: {
      chain: { orderBy: { id: 'asc' } },
      incidents: { orderBy: { createdAt: 'desc' } }
    }
  });
  if (!shipment) return res.status(404).json({ error: 'Not found' });

  const handlers = {};
  for (const link of shipment.chain) {
    if (link.handler_id && !handlers[link.handler_id]) {
      const user = await prisma.user.findUnique({ where: { id: link.handler_id } });
      if (user) { const { password: _, ...s } = user; handlers[link.handler_id] = s; }
    }
  }
  res.json({ shipment, handlers });
});

app.post('/api/shipments', async (req, res) => {
  const { id, source, destination, owner_email } = req.body;
  if (!source || !destination) return res.status(400).json({ error: 'Source and destination required' });
  try {
    const shipmentId = id || `PKG${Date.now().toString().slice(-6)}`;
    const shipment = await prisma.shipment.create({
      data: { id: shipmentId, source, destination, status: 'Created', simulation_state: 'ACTIVE', owner_email: owner_email || null }
    });
    simEngine.preCalculateChain(shipmentId, source, destination)
      .then(() => simEngine.broadcast(shipmentId))
      .catch(e => console.error('Chain calc error:', e));
    res.json({ ...shipment, message: 'Shipment created. Route being calculated...' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/shipments/:id/control', async (req, res) => {
  const { action } = req.body;
  const state = action === 'PAUSE' ? 'PAUSED' : 'ACTIVE';
  const shipment = await prisma.shipment.update({ where: { id: req.params.id }, data: { simulation_state: state } });
  simEngine.broadcast(req.params.id);
  res.json(shipment);
});

// =============================================================
// QR SCAN — Agent scans a package, triggers acceptance
// =============================================================
app.post('/api/shipments/:id/scan', async (req, res) => {
  const { agent_id } = req.body;
  const shipmentId = req.params.id;

  if (!agent_id) return res.status(400).json({ error: 'agent_id required' });

  try {
    const validation = await ConflictEngine.validateScan(shipmentId, parseInt(agent_id));

    if (!validation.ok) {
      // Broadcast conflict alert to admin
      io.emit('conflict-detected', {
        shipment_id: shipmentId,
        code: validation.code,
        message: validation.message
      });
      return res.status(409).json({
        ok: false,
        code: validation.code,
        message: validation.message,
        expectedAgent: validation.expectedAgent
      });
    }

    // Valid scan — accept the package (transition Arrived/Waiting → Active)
    const stage = validation.stage;
    const now = new Date();

    await prisma.shipmentChain.update({
      where: { id: stage.id },
      data: { status: 'Active', accepted_at: now, handler_id: parseInt(agent_id), timestamp: now }
    });

    await prisma.shipment.update({
      where: { id: shipmentId },
      data: { current_agent_id: parseInt(agent_id), status: 'In Transit' }
    });

    console.log(`[QR SCAN] ${shipmentId} accepted by agent ${agent_id} at stage ${stage.stage}`);
    await simEngine.broadcast(shipmentId);

    res.json({
      ok: true,
      message: `✅ Package ${shipmentId} accepted at "${stage.stage}". You are now responsible for this package.`,
      stage: stage.stage
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// INCIDENTS
// =============================================================
app.post('/api/incidents', async (req, res) => {
  const { shipment_id, issue, severity } = req.body;
  try {
    const incident = await prisma.incident.create({ data: { shipment_id, issue, severity: severity || 'High', status: 'Active' } });
    await prisma.shipment.update({ where: { id: shipment_id }, data: { status: 'Issue' } });
    simEngine.broadcast(shipment_id);
    res.json(incident);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/incidents/:id/resolve', async (req, res) => {
  try {
    const incident = await prisma.incident.update({ where: { id: parseInt(req.params.id) }, data: { status: 'Resolved' } });
    const active = await prisma.incident.count({ where: { shipment_id: incident.shipment_id, status: 'Active' } });
    if (active === 0) await prisma.shipment.update({ where: { id: incident.shipment_id }, data: { status: 'In Transit' } });
    simEngine.broadcast(incident.shipment_id);
    res.json(incident);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// =============================================================
// CONFLICTS
// =============================================================
app.get('/api/conflicts', async (req, res) => {
  const conflicts = await prisma.conflict.findMany({
    orderBy: { detected_at: 'desc' },
    include: { shipment: { select: { id: true, source: true, destination: true, status: true } } }
  });
  res.json(conflicts);
});

app.post('/api/conflicts/:id/resolve', async (req, res) => {
  const { resolved_by, action } = req.body; // action: RESOLVE | DISMISS | REASSIGN
  try {
    const conflict = await prisma.conflict.update({
      where: { id: parseInt(req.params.id) },
      data: {
        status: action === 'DISMISS' ? 'Dismissed' : 'Resolved',
        resolved_at: new Date(),
        resolved_by: resolved_by || 'Admin'
      }
    });

    // If reassign, re-enable the simulation
    if (action === 'RESOLVE') {
      await prisma.shipment.update({
        where: { id: conflict.shipment_id },
        data: { status: 'In Transit' }
      });
    }

    simEngine.broadcast(conflict.shipment_id);
    res.json(conflict);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// =============================================================
// SCAN LOGS
// =============================================================
app.get('/api/scanlogs/:shipmentId', async (req, res) => {
  const logs = await prisma.scanLog.findMany({
    where: { shipment_id: req.params.shipmentId },
    orderBy: { scanned_at: 'desc' }
  });
  res.json(logs);
});

// =============================================================
// USERS
// =============================================================
app.get('/api/users', async (req, res) => {
  const users = await prisma.user.findMany({ orderBy: { role: 'asc' } });
  res.json(users.map(({ password: _, ...u }) => u));
});

app.delete('/api/users/:id', async (req, res) => {
  await prisma.user.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

// Geocode proxy
app.get('/api/geocode', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q param required' });
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=in`, {
      headers: { 'User-Agent': 'TrackSyncApp/1.0' }
    });
    res.json(await r.json());
  } catch { res.status(500).json({ error: 'Geocode failed' }); }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
