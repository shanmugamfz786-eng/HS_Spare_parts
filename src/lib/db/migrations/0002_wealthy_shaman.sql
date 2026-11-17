DROP INDEX "cart_user_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "cart_item_no_variant_unique_idx" ON "cart_items" USING btree ("cart_id","product_id") WHERE "cart_items"."variant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cart_item_variant_unique_idx" ON "cart_items" USING btree ("cart_id","product_id","variant_id") WHERE "cart_items"."variant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cart_user_unique_idx" ON "carts" USING btree ("user_id");