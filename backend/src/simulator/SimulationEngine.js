const { PrismaClient } = require('@prisma/client');
const RouteService = require('./RouteService');
const prisma = new PrismaClient({});

// Stage lifecycle:
// Pending → [tick] → Arrived (package at hub, waiting for agent scan)
//         → [tick] → Waiting  (agent notified, scanning in progress)
//         → [tick] → Active   (agent accepted, package in their hands)
//         → [tick] → Completed (moved to next hub)

class SimulationEngine {
  constructor(io) {
    this.io = io;
    this.interval = null;
  }

  start() {
    console.log('Simulation Engine Started (with handover states)...');
    this.interval = setInterval(() => this.tick(), 8000); // 8s per tick
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
  }

  async preCalculateChain(shipmentId, source, destination) {
    let routeData = await RouteService.planRoute(source, destination, 3);
    let stages = [];
    let polylineStr = null;

    if (routeData) {
      stages = routeData.stages;
      polylineStr = routeData.routeGeoJSON;
    } else {
      stages = [
        { name: 'Manufacturer', hub: null, lat: null, lng: null },
        { name: 'Transit Hub 1', hub: 'Hub_1', lat: null, lng: null },
        { name: 'Transit Hub 2', hub: 'Hub_2', lat: null, lng: null },
        { name: 'Transit Hub 3', hub: 'Hub_3', lat: null, lng: null },
        { name: 'Customer', hub: null, lat: null, lng: null },
      ];
    }

    if (polylineStr) {
      await prisma.shipment.update({
        where: { id: shipmentId },
        data: { route_data: polylineStr }
      });
    }

    const allAgents = await prisma.user.findMany({ where: { role: 'DELIVERY' } });

    for (let i = 0; i < stages.length; i++) {
      let agentId = null;
      if (stages[i].hub) {
        const hubAgents = allAgents.filter(a => a.hub === stages[i].hub);
        if (hubAgents.length > 0) {
          agentId = hubAgents[Math.floor(Math.random() * hubAgents.length)].id;
        } else if (allAgents.length > 0) {
          agentId = allAgents[Math.floor(Math.random() * allAgents.length)].id;
        }
      } else if (stages[i].name.startsWith('Customer')) {
        // Last mile: same agent as previous stage
        const prev = await prisma.shipmentChain.findFirst({
          where: { shipment_id: shipmentId },
          orderBy: { id: 'desc' }
        });
        if (prev) agentId = prev.handler_id;
      }

      await prisma.shipmentChain.create({
        data: {
          shipment_id: shipmentId,
          stage: stages[i].name,
          hub: stages[i].hub,
          lat: stages[i].lat ?? null,
          lng: stages[i].lng ?? null,
          handler_id: agentId,
          status: 'Pending'
        }
      });
    }

    // Activate first stage immediately
    const first = await prisma.shipmentChain.findFirst({
      where: { shipment_id: shipmentId },
      orderBy: { id: 'asc' }
    });
    if (first) {
      await prisma.shipmentChain.update({
        where: { id: first.id },
        data: { status: 'Active', accepted_at: new Date(), arrived_at: new Date(), timestamp: new Date() }
      });
      await prisma.shipment.update({
        where: { id: shipmentId },
        data: { current_agent_id: first.handler_id, status: 'In Transit' }
      });
    }
  }

  async tick() {
    try {
      const activeShipments = await prisma.shipment.findMany({
        where: { simulation_state: 'ACTIVE' },
        include: { chain: { orderBy: { id: 'asc' } }, incidents: true }
      });
      for (const shipment of activeShipments) {
        await this.processShipment(shipment);
      }
    } catch (err) {
      console.error('Tick Error:', err.message);
    }
  }

  async processShipment(shipment) {
    // Freeze on active incidents
    const blockers = shipment.incidents.filter(i => i.status === 'Active');
    if (blockers.length > 0) return;
    if (shipment.status === 'Delivered') return;

    const chain = shipment.chain;

    // Handle Arrived → Waiting transition
    const arrivedStage = chain.find(c => c.status === 'Arrived');
    if (arrivedStage) {
      await prisma.shipmentChain.update({
        where: { id: arrivedStage.id },
        data: { status: 'Waiting' }
      });
      await prisma.shipment.update({
        where: { id: shipment.id },
        data: { status: 'Awaiting Handover' }
      });
      console.log(`[HANDOVER] ${shipment.id} → Waiting at ${arrivedStage.stage}`);
      this.broadcast(shipment.id);
      return;
    }

    // Handle Waiting → Active transition (agent "scans and accepts")
    const waitingStage = chain.find(c => c.status === 'Waiting');
    if (waitingStage) {
      const now = new Date();
      await prisma.shipmentChain.update({
        where: { id: waitingStage.id },
        data: { status: 'Active', accepted_at: now, timestamp: now }
      });
      await prisma.shipment.update({
        where: { id: shipment.id },
        data: { current_agent_id: waitingStage.handler_id, status: 'In Transit' }
      });
      console.log(`[ACCEPTED] ${shipment.id} → Agent scanned at ${waitingStage.stage}`);
      this.broadcast(shipment.id);
      return;
    }

    // Handle Active → Completed + next stage → Arrived
    const activeStage = chain.find(c => c.status === 'Active');
    if (!activeStage) return;

    const activeIdx = chain.findIndex(c => c.id === activeStage.id);
    const nextStage = chain[activeIdx + 1];

    // Complete current stage
    await prisma.shipmentChain.update({
      where: { id: activeStage.id },
      data: { status: 'Completed' }
    });

    if (!nextStage) {
      // All done
      const lastStage = chain[chain.length - 1];
      const agent = lastStage.handler_id ? await prisma.user.findUnique({ where: { id: lastStage.handler_id } }) : null;
      const podData = JSON.stringify({
        verification_method: "QR Handover & Geofence Authenticated",
        signature_token: `POD-SIG-${shipment.id}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        final_coordinates: { lat: lastStage.lat ?? 19.076, lng: lastStage.lng ?? 72.877 },
        timestamp: new Date().toISOString(),
        agent_name: agent?.name || "System Courier",
        agent_email: agent?.email || "courier@tracksync.com",
        status: "SECURED"
      });

      await prisma.shipment.update({
        where: { id: shipment.id },
        data: { status: 'Delivered', simulation_state: 'FINISHED', current_agent_id: null, proof_of_delivery: podData }
      });
      console.log(`[DELIVERED] ${shipment.id}`);
      await this.broadcast(shipment.id);
      return;
    }

    // Is this the customer stage?
    if (nextStage.stage.startsWith('Customer')) {
      const now = new Date();
      const agent = nextStage.handler_id ? await prisma.user.findUnique({ where: { id: nextStage.handler_id } }) : null;
      const podData = JSON.stringify({
        verification_method: "Direct Customer OTP Handover",
        signature_token: `POD-SIG-${shipment.id}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        final_coordinates: { lat: nextStage.lat ?? 19.076, lng: nextStage.lng ?? 72.877 },
        timestamp: now.toISOString(),
        agent_name: agent?.name || "Last-mile Agent",
        agent_email: agent?.email || "lastmile@tracksync.com",
        status: "VERIFIED"
      });

      await prisma.shipmentChain.update({
        where: { id: nextStage.id },
        data: { status: 'Active', arrived_at: now, accepted_at: now, timestamp: now }
      });
      await prisma.shipment.update({
        where: { id: shipment.id },
        data: { current_agent_id: nextStage.handler_id, status: 'Delivered', proof_of_delivery: podData }
      });
      console.log(`[DELIVERED] ${shipment.id} → Customer`);
      await this.broadcast(shipment.id);
      return;
    }

    // Standard hub → mark as Arrived (triggers handover waiting)
    const now = new Date();
    await prisma.shipmentChain.update({
      where: { id: nextStage.id },
      data: { status: 'Arrived', arrived_at: now, timestamp: now }
    });
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { status: 'Awaiting Handover' }
    });
    console.log(`[ARRIVED] ${shipment.id} → Package arrived at ${nextStage.stage}, awaiting handover`);
    await this.broadcast(shipment.id);
  }

  async broadcast(shipmentId) {
    // 1) Dynamic Confidence Score Calculation!
    const incidents = await prisma.incident.findMany({ where: { shipment_id: shipmentId } });
    const conflicts = await prisma.conflict.findMany({ where: { shipment_id: shipmentId } });

    let confidence = 100;
    confidence -= incidents.length * 15;

    for (const c of conflicts) {
      if (c.type === 'WRONG_AGENT') confidence -= 25;
      else if (c.type === 'WRONG_HUB') confidence -= 20;
      else if (c.type === 'STUCK') confidence -= 10;
      else if (c.type === 'ALREADY_DELIVERED') confidence -= 15;
      else if (c.type === 'DOUBLE_SCAN') confidence -= 5;
      else confidence -= 10;
    }

    if (confidence < 0) confidence = 0;
    if (confidence > 100) confidence = 100;

    // Update in database so it is persistently stored
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: { confidence_score: confidence }
    });

    const updated = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        chain: { orderBy: { id: 'asc' } },
        incidents: { orderBy: { createdAt: 'desc' } }
      }
    });

    const handlers = {};
    for (const link of updated.chain) {
      if (link.handler_id && !handlers[link.handler_id]) {
        const user = await prisma.user.findUnique({ where: { id: link.handler_id } });
        if (user) {
          const { password: _, ...safe } = user;
          handlers[link.handler_id] = safe;
        }
      }
    }

    this.io.emit('shipment-update', { shipment: updated, handlers });
    this.io.emit(`shipment-update-${shipmentId}`, { shipment: updated, handlers });
  }
}

module.exports = SimulationEngine;
