-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "current_agent_id" INTEGER,
    "simulation_state" TEXT NOT NULL,
    "owner_email" TEXT,
    "route_data" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence_score" INTEGER NOT NULL DEFAULT 100,
    "proof_of_delivery" TEXT
);
INSERT INTO "new_Shipment" ("createdAt", "current_agent_id", "destination", "id", "owner_email", "route_data", "simulation_state", "source", "status") SELECT "createdAt", "current_agent_id", "destination", "id", "owner_email", "route_data", "simulation_state", "source", "status" FROM "Shipment";
DROP TABLE "Shipment";
ALTER TABLE "new_Shipment" RENAME TO "Shipment";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
