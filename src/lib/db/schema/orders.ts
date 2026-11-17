import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./auth";
import { products } from "./catalogue";

// ----------------------------------------------------------------------
// 1. Orders
// ----------------------------------------------------------------------
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderNumber: varchar("order_number", { length: 50 }).notNull().unique(), // e.g. "HS-2026-00001"
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    guestEmail: varchar("guest_email", { length: 255 }),
    guestPhone: varchar("guest_phone", { length: 50 }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    idempotencyFingerprint: varchar("idempotency_fingerprint", { length: 64 }),
    currency: varchar("currency", { length: 10 }).notNull().default("INR"),
    subtotalMinor: integer("subtotal_minor").notNull(),
    discountMinor: integer("discount_minor").notNull().default(0),
    shippingMinor: integer("shipping_minor").notNull().default(0),
    taxMinor: integer("tax_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull(),
    paymentStatus: varchar("payment_status", { length: 32 }).notNull().default("pending"), // created, pending, succeeded, failed, refunded
    fulfillmentStatus: varchar("fulfillment_status", { length: 32 }).notNull().default("pending"), // pending, confirmed, processing, packed, shipped, delivered, cancelled
    shippingAddressSnapshot: jsonb("shipping_address_snapshot").notNull(),
    billingAddressSnapshot: jsonb("billing_address_snapshot").notNull(),
    placedAt: timestamp("placed_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("order_number_idx").on(table.orderNumber),
    index("order_user_idx").on(table.userId),
    index("order_payment_status_idx").on(table.paymentStatus),
    index("order_fulfillment_status_idx").on(table.fulfillmentStatus),
    index("order_placed_at_idx").on(table.placedAt),
    uniqueIndex("order_user_idempotency_idx").on(table.userId, table.idempotencyKey),
    index("order_idempotency_idx").on(table.idempotencyKey),
  ]
);

// ----------------------------------------------------------------------
// 2. Order Items (Immutable purchase snapshots)
// ----------------------------------------------------------------------
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    variantId: uuid("variant_id"),
    skuSnapshot: varchar("sku_snapshot", { length: 100 }).notNull(),
    variantSkuSnapshot: varchar("variant_sku_snapshot", { length: 100 }),
    productNameSnapshot: varchar("product_name_snapshot", { length: 255 }).notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    quantity: integer("quantity").notNull(),
    discountMinor: integer("discount_minor").notNull().default(0),
    taxMinor: integer("tax_minor").notNull().default(0),
    lineTotalMinor: integer("line_total_minor").notNull(),
    fitmentSnapshot: jsonb("fitment_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("order_item_order_idx").on(table.orderId),
    index("order_item_prod_idx").on(table.productId),
    index("order_item_variant_idx").on(table.variantId),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
  ]
);

// ----------------------------------------------------------------------
// 3. Order Status History (Audit trail of state transitions)
// ----------------------------------------------------------------------
export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    oldStatus: varchar("old_status", { length: 32 }).notNull(),
    newStatus: varchar("new_status", { length: 32 }).notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("order_history_order_idx").on(table.orderId),
    index("order_history_created_idx").on(table.createdAt),
  ]
);

// ----------------------------------------------------------------------
// 3b. Stock Reservations (Order-bound atomic inventory locks with expiry)
// ----------------------------------------------------------------------
export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    variantId: uuid("variant_id"),
    quantity: integer("quantity").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"), // active, committed, released, expired
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("reservation_order_idx").on(table.orderId),
    index("reservation_prod_idx").on(table.productId),
    index("reservation_status_expires_idx").on(table.status, table.expiresAt),
    check("stock_reservations_quantity_positive", sql`${table.quantity} > 0`),
    check("stock_reservations_status_valid", sql`${table.status} IN ('active', 'committed', 'released', 'expired')`),
  ]
);

// ----------------------------------------------------------------------
// 4. Payments
// ----------------------------------------------------------------------
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "restrict" })
      .notNull(),
    provider: varchar("provider", { length: 50 }).notNull(), // mock, razorpay, stripe, etc.
    providerPaymentId: varchar("provider_payment_id", { length: 255 }),
    amountMinor: integer("amount_minor").notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("INR"),
    status: varchar("status", { length: 32 }).notNull().default("created"), // created, pending, succeeded, failed, refunded
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull().unique(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("payment_order_idx").on(table.orderId),
    index("payment_provider_id_idx").on(table.providerPaymentId),
    index("payment_idempotency_idx").on(table.idempotencyKey),
  ]
);

// ----------------------------------------------------------------------
// 5. Payment Webhook Events (Idempotent webhook ledger)
// ----------------------------------------------------------------------
export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    providerEventId: varchar("provider_event_id", { length: 255 }).notNull().unique(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    payloadDigest: varchar("payload_digest", { length: 128 }).notNull(), // SHA-256 hash of payload
    processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
    processingStatus: varchar("processing_status", { length: 32 }).notNull().default("success"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("webhook_provider_event_idx").on(table.providerEventId)]
);

// ----------------------------------------------------------------------
// 6. Shipments & Fulfilment Tracking
// ----------------------------------------------------------------------
export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "restrict" })
      .notNull(),
    carrier: varchar("carrier", { length: 100 }).notNull(),
    trackingNumber: varchar("tracking_number", { length: 100 }).notNull(),
    trackingUrl: text("tracking_url"),
    status: varchar("status", { length: 32 }).notNull().default("created"), // created, shipped, out_for_delivery, delivered
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("shipment_order_idx").on(table.orderId),
    index("shipment_tracking_idx").on(table.trackingNumber),
  ]
);

// ----------------------------------------------------------------------
// 7. Returns & Refunds
// ----------------------------------------------------------------------
export const returns = pgTable(
  "returns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "restrict" })
      .notNull(),
    customerId: uuid("customer_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    reason: text("reason").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("requested"), // requested, approved, rejected, resolved
    resolution: text("resolution"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("return_order_idx").on(table.orderId),
    index("return_customer_idx").on(table.customerId),
  ]
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paymentId: uuid("payment_id")
      .references(() => payments.id, { onDelete: "restrict" })
      .notNull(),
    providerRefundId: varchar("provider_refund_id", { length: 255 }),
    amountMinor: integer("amount_minor").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"), // pending, succeeded, failed
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("refund_payment_idx").on(table.paymentId)]
);

// ----------------------------------------------------------------------
// Relations
// ----------------------------------------------------------------------
export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  items: many(orderItems),
  statusHistory: many(orderStatusHistory),
  reservations: many(stockReservations),
  payments: many(payments),
  shipments: many(shipments),
  returns: many(returns),
}));

export const stockReservationsRelations = relations(stockReservations, ({ one }) => ({
  order: one(orders, {
    fields: [stockReservations.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [stockReservations.productId],
    references: [products.id],
  }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const orderStatusHistoryRelations = relations(orderStatusHistory, ({ one }) => ({
  order: one(orders, {
    fields: [orderStatusHistory.orderId],
    references: [orders.id],
  }),
  actor: one(users, {
    fields: [orderStatusHistory.actorUserId],
    references: [users.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
  refunds: many(refunds),
}));

export const shipmentsRelations = relations(shipments, ({ one }) => ({
  order: one(orders, {
    fields: [shipments.orderId],
    references: [orders.id],
  }),
}));

export const returnsRelations = relations(returns, ({ one }) => ({
  order: one(orders, {
    fields: [returns.orderId],
    references: [orders.id],
  }),
  customer: one(users, {
    fields: [returns.customerId],
    references: [users.id],
  }),
}));

export const refundsRelations = relations(refunds, ({ one }) => ({
  payment: one(payments, {
    fields: [refunds.paymentId],
    references: [payments.id],
  }),
}));
