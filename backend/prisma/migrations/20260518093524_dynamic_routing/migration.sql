-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN "route_data" TEXT;

-- AlterTable
ALTER TABLE "ShipmentChain" ADD COLUMN "lat" REAL;
ALTER TABLE "ShipmentChain" ADD COLUMN "lng" REAL;
