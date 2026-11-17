ALTER TABLE "orders" ADD COLUMN "idempotency_fingerprint" varchar(64);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_quantity_positive" CHECK ("stock_reservations"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_status_valid" CHECK ("stock_reservations"."status" IN ('active', 'committed', 'released', 'expired'));