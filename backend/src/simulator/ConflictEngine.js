const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({});

/**
 * ConflictEngine — detects and logs conflicts during QR scans and simulation.
 *
 * Conflict Types:
 *   WRONG_AGENT    — Agent not assigned to this shipment stage
 *   ALREADY_DELIVERED — Package already marked Delivered
 *   DOUBLE_SCAN    — Stage already Completed/Active by same agent
 *   WRONG_HUB     — Agent's hub doesn't match expected checkpoint
 *   STUCK          — Package hasn't moved for too long
 */
class ConflictEngine {
  /**
   * Validate a QR scan by a delivery agent.
   * Returns { ok: bool, conflict: obj|null, stage: obj|null }
   */
  static async validateScan(shipmentId, agentId) {
    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { chain: { orderBy: { id: 'asc' } } }
    });
    const agent = await prisma.user.findUnique({ where: { id: agentId } });

    if (!shipment) {
      return { ok: false, code: 'NOT_FOUND', message: 'Shipment not found in the system.' };
    }

    // ── Conflict: Already Delivered ──────────────────────────────
    if (shipment.status === 'Delivered') {
      await this._log(shipmentId, agentId, 'ALREADY_DELIVERED',
        `Agent ${agent?.name} scanned package ${shipmentId} which is already delivered.`,
        'Medium', shipmentId, agentId, null, 'CONFLICT');
      return {
        ok: false,
        code: 'ALREADY_DELIVERED',
        message: '⚠️ Conflict: This package has already been delivered. Scan logged for audit.'
      };
    }

    // Find the current active/arrived/waiting stage
    const targetStage = shipment.chain.find(c =>
      c.status === 'Arrived' || c.status === 'Waiting' || c.status === 'Active'
    );

    if (!targetStage) {
      return { ok: false, code: 'NO_ACTIVE_STAGE', message: 'No active handover stage found for this package.' };
    }

    // ── Conflict: Double Scan (already accepted) ─────────────────
    if (targetStage.status === 'Active' && targetStage.handler_id === agentId) {
      await this._log(shipmentId, agentId, 'DOUBLE_SCAN',
        `Agent ${agent?.name} scanned package ${shipmentId} at stage "${targetStage.stage}" which they already accepted.`,
        'Low', shipmentId, agentId, targetStage.id, 'CONFLICT');
      return {
        ok: false,
        code: 'DOUBLE_SCAN',
        message: `⚠️ You already accepted this package at "${targetStage.stage}". Double scan detected.`
      };
    }

    // ── Conflict: Wrong Agent ────────────────────────────────────
    if (targetStage.handler_id && targetStage.handler_id !== agentId) {
      const expectedAgent = await prisma.user.findUnique({ where: { id: targetStage.handler_id } });
      await this._log(shipmentId, agentId, 'WRONG_AGENT',
        `Agent ${agent?.name} (ID:${agentId}) attempted scan but package is assigned to ${expectedAgent?.name} (ID:${targetStage.handler_id}) at stage "${targetStage.stage}".`,
        'High', shipmentId, agentId, targetStage.id, 'CONFLICT');
      return {
        ok: false,
        code: 'WRONG_AGENT',
        message: `⚠️ Conflict: This package at "${targetStage.stage}" is assigned to agent ${expectedAgent?.name || 'another agent'}, not you. Conflict logged.`,
        conflict: true,
        expectedAgent: expectedAgent?.name
      };
    }

    // ── Conflict: Wrong Hub ──────────────────────────────────────
    if (targetStage.hub && agent?.hub && agent.hub !== targetStage.hub) {
      await this._log(shipmentId, agentId, 'WRONG_HUB',
        `Agent ${agent?.name} from hub "${agent.hub}" scanned package ${shipmentId} at stage "${targetStage.stage}" which is for hub "${targetStage.hub}".`,
        'High', shipmentId, agentId, targetStage.id, 'CONFLICT');
      return {
        ok: false,
        code: 'WRONG_HUB',
        message: `⚠️ Conflict: You are assigned to hub "${agent.hub}" but this package checkpoint is at hub "${targetStage.hub}". Conflict logged.`
      };
    }

    // ── All clear: Valid scan ─────────────────────────────────────
    await this._log(shipmentId, agentId, null, null, null, shipmentId, agentId, targetStage.id, 'SUCCESS');
    return { ok: true, stage: targetStage, agent, shipment };
  }

  /**
   * Check if any shipments are STUCK (no movement for > 3 ticks = 24 seconds in demo).
   */
  static async detectStuckShipments() {
    const cutoff = new Date(Date.now() - 30000); // 30 seconds for demo
    const stuck = await prisma.shipment.findMany({
      where: {
        simulation_state: 'ACTIVE',
        status: { in: ['Awaiting Handover', 'In Transit'] }
      },
      include: { chain: true, conflicts: { where: { type: 'STUCK', status: 'Active' } } }
    });

    for (const shipment of stuck) {
      const activeStage = shipment.chain.find(c => c.status === 'Active' || c.status === 'Arrived' || c.status === 'Waiting');
      if (!activeStage) continue;

      const stageTime = new Date(activeStage.timestamp);
      if (stageTime < cutoff && shipment.conflicts.length === 0) {
        await prisma.conflict.create({
          data: {
            shipment_id: shipment.id,
            type: 'STUCK',
            description: `Shipment ${shipment.id} has been stuck at "${activeStage.stage}" with status "${activeStage.status}" for over 30 seconds. Manual review recommended.`,
            severity: 'Medium',
            status: 'Active'
          }
        });
        console.log(`[CONFLICT:STUCK] ${shipment.id} at ${activeStage.stage}`);
      }
    }
  }

  static async _log(shipmentId, agentId, type, description, severity, pkgId, agId, stageId, result) {
    const agent = await prisma.user.findUnique({ where: { id: agentId } });

    // Log the scan
    await prisma.scanLog.create({
      data: {
        shipment_id: pkgId,
        agent_id: agId,
        agent_name: agent?.name || 'Unknown',
        stage_id: stageId,
        result,
        reason: description
      }
    });

    // Create conflict record if needed
    if (type && description) {
      await prisma.conflict.create({
        data: {
          shipment_id: shipmentId,
          type,
          description,
          severity: severity || 'Medium',
          agent_id: agentId,
          status: 'Active'
        }
      });
    }
  }
}

module.exports = ConflictEngine;
