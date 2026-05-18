/*
  Warnings:

  - Added the required column `password` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN "owner_email" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShipmentChain" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shipment_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "handler_id" INTEGER,
    "hub" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShipmentChain_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "Shipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ShipmentChain" ("handler_id", "hub", "id", "shipment_id", "stage", "timestamp") SELECT "handler_id", "hub", "id", "shipment_id", "stage", "timestamp" FROM "ShipmentChain";
DROP TABLE "ShipmentChain";
ALTER TABLE "new_ShipmentChain" RENAME TO "ShipmentChain";
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "hub" TEXT
);
INSERT INTO "new_User" ("email", "hub", "id", "name", "role") SELECT "email", "hub", "id", "name", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
