-- Storefront vehicle reservations take a refundable deposit tied to the lead they create.
ALTER TABLE "PaymentTransaction" ADD COLUMN "lead" TEXT;
CREATE INDEX "PaymentTransaction_lead_idx" ON "PaymentTransaction"("lead");
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_lead_fkey" FOREIGN KEY ("lead") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentTransaction" DROP CONSTRAINT "PaymentTransaction_source_check";
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_source_check" CHECK (
  ("sourceType" = 'deal' AND "deal" IS NOT NULL AND "serviceOrder" IS NULL AND "lead" IS NULL)
  OR ("sourceType" = 'service' AND "serviceOrder" IS NOT NULL AND "deal" IS NULL AND "lead" IS NULL)
  OR ("sourceType" = 'reservation' AND "lead" IS NOT NULL AND "deal" IS NULL AND "serviceOrder" IS NULL)
);
