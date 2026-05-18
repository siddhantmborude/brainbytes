-- CreateTable
CREATE TABLE "Conflict" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shipment_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'Medium',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "agent_id" INTEGER,
    "detected_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" DATETIME,
    "resolved_by" TEXT,
    CONSTRAINT "Conflict_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "Shipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScanLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shipment_id" TEXT NOT NULL,
    "agent_id" INTEGER NOT NULL,
    "agent_name" TEXT NOT NULL,
    "stage_id" INTEGER,
    "result" TEXT NOT NULL,
    "reason" TEXT,
    "scanned_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScanLog_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "Shipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
