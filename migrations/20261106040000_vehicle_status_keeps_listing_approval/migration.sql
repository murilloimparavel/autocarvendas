-- A lot-status change (available -> pending -> available when a deal is submitted, then cancelled or
-- rejected) is not listing content: the approved merchandising snapshot has no status field. Before
-- this, releasing a vehicle from a cancelled deal silently reset its approved listing to draft and took
-- it off the storefront. The storefront still requires status = 'available' to list a unit.
CREATE OR REPLACE FUNCTION invalidate_publication_for_vehicle_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    OLD."rooftop", OLD."vin", OLD."stockNumber", OLD."year", OLD."make", OLD."model", OLD."trim",
    OLD."exteriorColor", OLD."interiorColor", OLD."mileage", OLD."condition", OLD."priceCents",
    OLD."listPriceCents", OLD."description", OLD."features"
  ) IS NOT DISTINCT FROM ROW(
    NEW."rooftop", NEW."vin", NEW."stockNumber", NEW."year", NEW."make", NEW."model", NEW."trim",
    NEW."exteriorColor", NEW."interiorColor", NEW."mileage", NEW."condition", NEW."priceCents",
    NEW."listPriceCents", NEW."description", NEW."features"
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE "InventoryStock"
  SET "approvedRevisionHash" = '',
      "merchandisingStatus" = 'draft',
      "feedStatus" = 'not-published',
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "vehicle" = NEW."id";
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Vehicle_invalidate_publication_after_merchandising_change" ON "Vehicle";
CREATE TRIGGER "Vehicle_invalidate_publication_after_merchandising_change"
AFTER UPDATE OF "rooftop", "vin", "stockNumber", "year", "make", "model", "trim",
  "exteriorColor", "interiorColor", "mileage", "condition", "priceCents", "listPriceCents",
  "description", "features" ON "Vehicle"
FOR EACH ROW EXECUTE FUNCTION invalidate_publication_for_vehicle_change();
