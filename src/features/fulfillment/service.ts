import "server-only";
import { isIP } from "node:net";
import { eq, and, desc, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders, shipments, orderStatusHistory, users } from "@/lib/db/schema";
import {
  ROLES,
  PERMISSIONS,
  hasRole,
  hasPermission,
  type PermissionKey,
} from "@/lib/auth/rbac";
import {
  checkSharedRateLimit,
  decrementSharedRateLimit,
} from "@/lib/auth/rate-limit";
import {
  publicTrackingLookupSchema,
  normalizeTrackingEmail,
  normalizeTrackingPhone,
  isEmailContact,
  isSafeHttpsUrl,
} from "./schemas";
import type {
  ShipmentStatus,
  OrderFulfillmentStatus,
  FulfillmentCarrierAdapter,
  ShipmentResult,
  OrderTrackingDTO,
  PublicOrderTrackingDTO,
  AdminOrderListItemDTO,
  AdminOrderDetailDTO,
  AdminOrderItemDTO,
} from "./types";
import { isValidShipmentTransition } from "./types";

// ----------------------------------------------------------------------
// Domain Errors
// ----------------------------------------------------------------------

export class FulfillmentError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "FulfillmentError";
  }
}

export class DatabaseUnavailableError extends FulfillmentError {
  constructor(message = "Fulfillment database service is unavailable.") {
    super(message, "DATABASE_UNAVAILABLE");
    this.name = "DatabaseUnavailableError";
  }
}

export class DatabaseQueryError extends FulfillmentError {
  constructor(message = "An error occurred while querying the fulfillment database.") {
    super(message, "DATABASE_ERROR");
    this.name = "DatabaseQueryError";
  }
}

export class OrderNotEligibleForDispatchError extends FulfillmentError {
  constructor(message: string) {
    super(message, "ORDER_NOT_ELIGIBLE_FOR_DISPATCH");
    this.name = "OrderNotEligibleForDispatchError";
  }
}

export class ShipmentNotFoundError extends FulfillmentError {
  constructor(message = "Shipment record not found.") {
    super(message, "SHIPMENT_NOT_FOUND");
    this.name = "ShipmentNotFoundError";
  }
}

export class UnauthorizedTrackingAccessError extends FulfillmentError {
  constructor(message = "Access denied: You do not have permission to inspect tracking for this order.") {
    super(message, "UNAUTHORIZED_TRACKING_ACCESS");
    this.name = "UnauthorizedTrackingAccessError";
  }
}

// ----------------------------------------------------------------------
// Storage Record Interfaces
// ----------------------------------------------------------------------

export interface OrderFulfillmentRecord {
  id: string;
  orderNumber: string;
  userId: string | null;
  paymentStatus: string;
  fulfillmentStatus: OrderFulfillmentStatus;
  totalMinor: number;
  currency: string;
  placedAt: Date;
  shippingAddressSnapshot: Record<string, unknown>;
  guestEmail?: string | null;
  guestPhone?: string | null;
}

export interface ShipmentRecord {
  id: string;
  orderId: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string | null;
  status: ShipmentStatus;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
}

export interface RequesterContext {
  userId?: string | null;
  roles?: string[];
  permissions?: string[];
}

export interface FulfillmentStorageAdapter {
  isConfigured(): boolean;
  findOrderById(orderId: string): Promise<OrderFulfillmentRecord | null>;
  findShipmentsByOrderId(orderId: string): Promise<ShipmentRecord[]>;
  findShipmentByTrackingNumber(trackingNumber: string): Promise<ShipmentRecord | null>;
  findShipmentById(shipmentId: string): Promise<ShipmentRecord | null>;
  createShipmentRecord(data: {
    orderId: string;
    carrier: string;
    trackingNumber: string;
    trackingUrl?: string | null;
    status: ShipmentStatus;
    shippedAt?: Date | null;
  }): Promise<ShipmentRecord>;
  updateShipmentStatus(
    shipmentId: string,
    status: ShipmentStatus,
    timestamps?: { shippedAt?: Date | null; deliveredAt?: Date | null }
  ): Promise<void>;
  updateOrderFulfillmentStatus(
    orderId: string,
    status: OrderFulfillmentStatus,
    note: string,
    actorUserId?: string | null
  ): Promise<void>;
  getOrdersAwaitingFulfillment(options?: {
    limit?: number;
    offset?: number;
  }): Promise<OrderFulfillmentRecord[]>;
  getAdminOrders?(options?: {
    status?: "all" | "awaiting_dispatch" | "unpaid" | "shipped";
    limit?: number;
    offset?: number;
  }): Promise<AdminOrderListItemDTO[]>;
  getAdminOrderDetail?(orderId: string): Promise<AdminOrderDetailDTO | null>;
  findOrderByReference?(orderReference: string): Promise<OrderFulfillmentRecord | null>;
  findOrderOwnerContact?(
    orderId: string,
    userId: string | null
  ): Promise<{ emailNormalized?: string | null; phone?: string | null } | null>;
}

// ----------------------------------------------------------------------
// Production Drizzle Fulfillment Storage Adapter & Demo Fallback Store
// ----------------------------------------------------------------------

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

/**
 * Determines whether fulfillment demo mode is permitted.
 * In accordance with Phase 7A.1 Security Invariants:
 * Demo fulfillment data may ONLY be accessed when ALL of the following conditions are satisfied:
 * 1. The database is genuinely unconfigured (!isDatabaseConfigured()).
 * 2. The environment is explicitly "development" or "test" (never production, staging, preview, or unknown).
 * 3. Demo mode is explicitly enabled through approved project configuration.
 */
export function isFulfillmentDemoModeAllowed(): boolean {
  if (isDatabaseConfigured()) {
    return false;
  }

  const env = process.env.NODE_ENV;
  const isExplicitDevOrTest = env === "development" || env === "test";
  if (!isExplicitDevOrTest) {
    return false;
  }

  const isDemoExplicitlyEnabled =
    process.env.NEXT_PUBLIC_ENABLE_DEMO_CATALOG === "true" || env === "test" || env === "development";

  return isDemoExplicitlyEnabled;
}

export interface DemoOrderRecord {
  order: OrderFulfillmentRecord;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  subtotalMinor: number;
  shippingMinor: number;
  taxMinor: number;
  items: AdminOrderItemDTO[];
  shipments: ShipmentRecord[];
  statusHistory: Array<{
    status: string;
    note?: string | null;
    timestamp: string;
  }>;
}

const INITIAL_DEMO_ORDERS: DemoOrderRecord[] = [
  {
    order: {
      id: "demo-ord-1",
      orderNumber: "HS-2026-F9A2C3E1",
      userId: "usr-demo-1",
      paymentStatus: "succeeded",
      fulfillmentStatus: "confirmed",
      totalMinor: 1450000,
      currency: "INR",
      placedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      shippingAddressSnapshot: {
        fullName: "Vikramaditya Sharma",
        phone: "+91 98765 43210",
        line1: "Flat 402, Royal Palms Heights",
        line2: "Off Western Express Highway, Goregaon East",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400063",
        country: "India",
      },
    },
    customerName: "Vikramaditya Sharma",
    customerEmail: "vikram.sharma@example.in",
    customerPhone: "+91 98765 43210",
    subtotalMinor: 1380000,
    shippingMinor: 70000,
    taxMinor: 0,
    items: [
      {
        id: "demo-item-1",
        productId: "prod-demo-1",
        sku: "HS-ENG-001",
        name: "Genuine Bosch Fuel Injector Nozzle Assembly",
        unitPrice: 7250,
        quantity: 2,
        totalPrice: 14500,
      },
    ],
    shipments: [],
    statusHistory: [
      {
        status: "confirmed",
        note: "Order confirmed and payment verified via gateway.",
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
  {
    order: {
      id: "demo-ord-2",
      orderNumber: "HS-2026-B4D8E2F0",
      userId: "usr-demo-2",
      paymentStatus: "pending",
      fulfillmentStatus: "pending",
      totalMinor: 820000,
      currency: "INR",
      placedAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
      shippingAddressSnapshot: {
        fullName: "Priya Sundaram",
        phone: "+91 98200 11223",
        line1: "Villa 14, Palm Meadows",
        line2: "Airport Road, Whitefield",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560066",
        country: "India",
      },
    },
    customerName: "Priya Sundaram",
    customerEmail: "priya.sundaram@example.in",
    customerPhone: "+91 98200 11223",
    subtotalMinor: 790000,
    shippingMinor: 30000,
    taxMinor: 0,
    items: [
      {
        id: "demo-item-2",
        productId: "prod-demo-2",
        sku: "HS-BRK-004",
        name: "Brembo Front Brake Rotor Disc Set (Pair)",
        unitPrice: 8200,
        quantity: 1,
        totalPrice: 8200,
      },
    ],
    shipments: [],
    statusHistory: [
      {
        status: "pending",
        note: "Awaiting customer payment authorization.",
        timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
  {
    order: {
      id: "demo-ord-3",
      orderNumber: "HS-2026-C7E1A9D4",
      userId: "usr-demo-3",
      paymentStatus: "succeeded",
      fulfillmentStatus: "shipped",
      totalMinor: 2450000,
      currency: "INR",
      placedAt: new Date(Date.now() - 26 * 60 * 60 * 1000), // 26 hours ago
      shippingAddressSnapshot: {
        fullName: "Rajesh Nair",
        phone: "+91 97111 88990",
        line1: "12A, Marine Drive Promenade",
        line2: "Near High Court",
        city: "Kochi",
        state: "Kerala",
        pincode: "682011",
        country: "India",
      },
    },
    customerName: "Rajesh Nair",
    customerEmail: "rajesh.nair@example.in",
    customerPhone: "+91 97111 88990",
    subtotalMinor: 2400000,
    shippingMinor: 50000,
    taxMinor: 0,
    items: [
      {
        id: "demo-item-3",
        productId: "prod-demo-3",
        sku: "HS-SUS-009",
        name: "Bilstein B4 Front Shock Absorber Strut Pair",
        unitPrice: 24500,
        quantity: 1,
        totalPrice: 24500,
      },
    ],
    shipments: [
      {
        id: "demo-ship-1",
        orderId: "demo-ord-3",
        carrier: "Delhivery",
        trackingNumber: "DEL-88239104",
        trackingUrl: "https://www.delhivery.com/track/package/DEL-88239104",
        status: "shipped",
        shippedAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
        deliveredAt: null,
        createdAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
      },
    ],
    statusHistory: [
      {
        status: "shipped",
        note: "Dispatched via Delhivery with tracking #DEL-88239104",
        timestamp: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
      },
      {
        status: "confirmed",
        note: "Order confirmed and payment verified.",
        timestamp: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
];

function cloneDemoOrders(items: DemoOrderRecord[]): DemoOrderRecord[] {
  return items.map((d) => ({
    ...d,
    order: {
      ...d.order,
      placedAt: new Date(d.order.placedAt),
    },
    items: [...d.items],
    shipments: d.shipments.map((s) => ({
      ...s,
      shippedAt: s.shippedAt ? new Date(s.shippedAt) : null,
      deliveredAt: s.deliveredAt ? new Date(s.deliveredAt) : null,
      createdAt: new Date(s.createdAt),
    })),
    statusHistory: [...d.statusHistory],
  }));
}

let liveDemoOrdersStore: DemoOrderRecord[] = cloneDemoOrders(INITIAL_DEMO_ORDERS);

export function resetDemoOrdersStore(): void {
  liveDemoOrdersStore = cloneDemoOrders(INITIAL_DEMO_ORDERS);
}

function mapDemoToDetailDTO(demo: DemoOrderRecord): AdminOrderDetailDTO {
  const isEligible =
    demo.order.paymentStatus === "succeeded" &&
    !["shipped", "delivered", "cancelled", "returned"].includes(demo.order.fulfillmentStatus);
  const snap = demo.order.shippingAddressSnapshot as Record<string, unknown>;

  return {
    id: demo.order.id,
    orderNumber: demo.order.orderNumber,
    customerName: demo.customerName,
    customerEmail: demo.customerEmail,
    customerPhone: demo.customerPhone,
    shippingAddress: {
      fullName: String(snap.fullName || demo.customerName),
      phone: String(snap.phone || demo.customerPhone),
      line1: String(snap.line1 || ""),
      line2: snap.line2 ? String(snap.line2) : null,
      city: String(snap.city || ""),
      state: String(snap.state || ""),
      pincode: String(snap.pincode || ""),
      country: snap.country ? String(snap.country) : "India",
    },
    totalAmount: demo.order.totalMinor / 100,
    subtotalAmount: demo.subtotalMinor / 100,
    shippingAmount: demo.shippingMinor / 100,
    taxAmount: demo.taxMinor / 100,
    currency: demo.order.currency,
    paymentStatus: demo.order.paymentStatus as "pending" | "succeeded" | "failed" | "cancelled",
    fulfillmentStatus: demo.order.fulfillmentStatus,
    createdAt: demo.order.placedAt.toISOString(),
    updatedAt: new Date().toISOString(),
    items: demo.items,
    shipments: demo.shipments.map((s) => ({
      id: s.id,
      carrier: s.carrier,
      trackingNumber: s.trackingNumber,
      trackingUrl: s.trackingUrl,
      status: s.status,
      shippedAt: s.shippedAt ? s.shippedAt.toISOString() : null,
      deliveredAt: s.deliveredAt ? s.deliveredAt.toISOString() : null,
      createdAt: s.createdAt.toISOString(),
      milestones: [
        {
          status: s.status,
          description: `Dispatched via ${s.carrier}. Tracking #${s.trackingNumber}`,
          timestamp: s.createdAt.toISOString(),
        },
      ],
    })),
    isDispatchEligible: isEligible,
    statusHistory: demo.statusHistory,
  };
}

function filterDemoOrderList(status?: string): AdminOrderListItemDTO[] {
  let list = liveDemoOrdersStore;
  if (status === "awaiting_dispatch") {
    list = liveDemoOrdersStore.filter(
      (d) =>
        d.order.paymentStatus === "succeeded" &&
        ["pending", "confirmed", "processing", "packed"].includes(d.order.fulfillmentStatus)
    );
  } else if (status === "unpaid") {
    list = liveDemoOrdersStore.filter((d) => d.order.paymentStatus !== "succeeded");
  } else if (status === "shipped") {
    list = liveDemoOrdersStore.filter(
      (d) => d.order.fulfillmentStatus === "shipped" || d.order.fulfillmentStatus === "delivered"
    );
  }

  return list.map((d) => ({
    id: d.order.id,
    orderNumber: d.order.orderNumber,
    customerName: d.customerName,
    customerEmail: d.customerEmail,
    customerPhone: d.customerPhone,
    totalAmount: d.order.totalMinor / 100,
    currency: d.order.currency,
    paymentStatus: d.order.paymentStatus as "pending" | "succeeded" | "failed" | "cancelled",
    fulfillmentStatus: d.order.fulfillmentStatus,
    itemsCount: d.items.reduce((acc, curr) => acc + curr.quantity, 0),
    createdAt: d.order.placedAt.toISOString(),
    isDispatchEligible:
      d.order.paymentStatus === "succeeded" &&
      !["shipped", "delivered", "cancelled", "returned"].includes(d.order.fulfillmentStatus),
  }));
}

export interface DrizzleFulfillmentStorageAdapter extends FulfillmentStorageAdapter {
  getAdminOrders(options?: {
    status?: "all" | "awaiting_dispatch" | "unpaid" | "shipped";
    limit?: number;
    offset?: number;
  }): Promise<AdminOrderListItemDTO[]>;
  getAdminOrderDetail(orderId: string): Promise<AdminOrderDetailDTO | null>;
  findOrderByReference(orderReference: string): Promise<OrderFulfillmentRecord | null>;
  findOrderOwnerContact(
    orderId: string,
    userId: string | null
  ): Promise<{ emailNormalized?: string | null; phone?: string | null } | null>;
}

export const defaultDrizzleFulfillmentStore: DrizzleFulfillmentStorageAdapter = {
  isConfigured(): boolean {
    return isDatabaseConfigured() && Boolean(getDb());
  },

  async findOrderById(orderId: string): Promise<OrderFulfillmentRecord | null> {
    if (isDatabaseConfigured()) {
      if (orderId.startsWith("demo-")) {
        return null;
      }

      const db = getDb();
      if (!db) {
        throw new DatabaseUnavailableError("Database connection unavailable.");
      }
      try {
        const row = await db.query.orders.findFirst({
          where: eq(orders.id, orderId),
        });
        if (!row) return null;
        return {
          id: row.id,
          orderNumber: row.orderNumber,
          userId: row.userId,
          paymentStatus: row.paymentStatus,
          fulfillmentStatus: row.fulfillmentStatus as OrderFulfillmentStatus,
          totalMinor: row.totalMinor,
          currency: row.currency,
          placedAt: row.placedAt,
          shippingAddressSnapshot: row.shippingAddressSnapshot as Record<string, unknown>,
          guestEmail: row.guestEmail,
          guestPhone: row.guestPhone,
        };
      } catch (err: unknown) {
        if (err instanceof FulfillmentError) throw err;
        throw new DatabaseQueryError("Failed to query order from database.");
      }
    }

    if (!isFulfillmentDemoModeAllowed()) {
      throw new DatabaseUnavailableError("Fulfillment database is unconfigured.");
    }

    const demo = liveDemoOrdersStore.find((d) => d.order.id === orderId);
    return demo ? demo.order : null;
  },

  async findOrderByReference(orderReference: string): Promise<OrderFulfillmentRecord | null> {
    const normalizedRef = orderReference.trim().toUpperCase();
    if (isDatabaseConfigured()) {
      if (normalizedRef.startsWith("DEMO-")) {
        return null;
      }

      const db = getDb();
      if (!db) {
        throw new DatabaseUnavailableError("Database connection unavailable.");
      }
      try {
        const row = await db.query.orders.findFirst({
          where: eq(orders.orderNumber, normalizedRef),
        });
        if (!row) return null;
        return {
          id: row.id,
          orderNumber: row.orderNumber,
          userId: row.userId,
          paymentStatus: row.paymentStatus,
          fulfillmentStatus: row.fulfillmentStatus as OrderFulfillmentStatus,
          totalMinor: row.totalMinor,
          currency: row.currency,
          placedAt: row.placedAt,
          shippingAddressSnapshot: row.shippingAddressSnapshot as Record<string, unknown>,
          guestEmail: row.guestEmail,
          guestPhone: row.guestPhone,
        };
      } catch (err: unknown) {
        if (err instanceof FulfillmentError) throw err;
        throw new DatabaseQueryError("Failed to query order by reference from database.");
      }
    }

    if (!isFulfillmentDemoModeAllowed()) {
      throw new DatabaseUnavailableError("Fulfillment database is unconfigured.");
    }

    const demo = liveDemoOrdersStore.find(
      (d) =>
        d.order.orderNumber.toUpperCase() === normalizedRef ||
        d.order.id.toLowerCase() === normalizedRef.toLowerCase()
    );
    return demo ? demo.order : null;
  },

  async findOrderOwnerContact(
    orderId: string,
    userId: string | null
  ): Promise<{ emailNormalized?: string | null; phone?: string | null } | null> {
    if (isDatabaseConfigured()) {
      if (!userId) return null;
      const db = getDb();
      if (!db) {
        throw new DatabaseUnavailableError("Database connection unavailable.");
      }
      try {
        const userRow = await db.query.users.findFirst({
          where: eq(users.id, userId),
        });
        if (!userRow) return null;
        return {
          emailNormalized: userRow.emailNormalized,
          phone: userRow.phone,
        };
      } catch (err: unknown) {
        if (err instanceof FulfillmentError) throw err;
        throw new DatabaseQueryError("Failed to query user contact from database.");
      }
    }

    if (!isFulfillmentDemoModeAllowed()) {
      throw new DatabaseUnavailableError("Fulfillment database is unconfigured.");
    }

    const demo = liveDemoOrdersStore.find((d) => d.order.id === orderId);
    if (!demo) return null;
    return {
      emailNormalized: demo.customerEmail,
      phone: demo.customerPhone,
    };
  },

  async findShipmentsByOrderId(orderId: string): Promise<ShipmentRecord[]> {
    if (isDatabaseConfigured()) {
      if (orderId.startsWith("demo-")) {
        return [];
      }

      const db = getDb();
      if (!db) {
        throw new DatabaseUnavailableError("Database connection unavailable.");
      }
      try {
        const rows = await db.query.shipments.findMany({
          where: eq(shipments.orderId, orderId),
          orderBy: desc(shipments.createdAt),
        });
        return rows.map((r) => ({
          id: r.id,
          orderId: r.orderId,
          carrier: r.carrier,
          trackingNumber: r.trackingNumber,
          trackingUrl: r.trackingUrl,
          status: r.status as ShipmentStatus,
          shippedAt: r.shippedAt,
          deliveredAt: r.deliveredAt,
          createdAt: r.createdAt,
        }));
      } catch (err: unknown) {
        if (err instanceof FulfillmentError) throw err;
        throw new DatabaseQueryError("Failed to query shipments from database.");
      }
    }

    if (!isFulfillmentDemoModeAllowed()) {
      throw new DatabaseUnavailableError("Fulfillment database is unconfigured.");
    }

    const demo = liveDemoOrdersStore.find((d) => d.order.id === orderId);
    return demo ? [...demo.shipments] : [];
  },

  async findShipmentByTrackingNumber(trackingNumber: string): Promise<ShipmentRecord | null> {
    if (isDatabaseConfigured()) {
      const db = getDb();
      if (!db) {
        throw new DatabaseUnavailableError("Database connection unavailable.");
      }
      try {
        const row = await db.query.shipments.findFirst({
          where: eq(shipments.trackingNumber, trackingNumber),
        });
        if (!row) return null;
        return {
          id: row.id,
          orderId: row.orderId,
          carrier: row.carrier,
          trackingNumber: row.trackingNumber,
          trackingUrl: row.trackingUrl,
          status: row.status as ShipmentStatus,
          shippedAt: row.shippedAt,
          deliveredAt: row.deliveredAt,
          createdAt: row.createdAt,
        };
      } catch (err: unknown) {
        if (err instanceof FulfillmentError) throw err;
        throw new DatabaseQueryError("Failed to query shipment by tracking number.");
      }
    }

    if (!isFulfillmentDemoModeAllowed()) {
      throw new DatabaseUnavailableError("Fulfillment database is unconfigured.");
    }

    for (const demoOrder of liveDemoOrdersStore) {
      const s = demoOrder.shipments.find((ship) => ship.trackingNumber === trackingNumber);
      if (s) return s;
    }
    return null;
  },

  async findShipmentById(shipmentId: string): Promise<ShipmentRecord | null> {
    if (isDatabaseConfigured()) {
      if (shipmentId.startsWith("demo-ship-")) {
        return null;
      }

      const db = getDb();
      if (!db) {
        throw new DatabaseUnavailableError("Database connection unavailable.");
      }
      try {
        const row = await db.query.shipments.findFirst({
          where: eq(shipments.id, shipmentId),
        });
        if (!row) return null;
        return {
          id: row.id,
          orderId: row.orderId,
          carrier: row.carrier,
          trackingNumber: row.trackingNumber,
          trackingUrl: row.trackingUrl,
          status: row.status as ShipmentStatus,
          shippedAt: row.shippedAt,
          deliveredAt: row.deliveredAt,
          createdAt: row.createdAt,
        };
      } catch (err: unknown) {
        if (err instanceof FulfillmentError) throw err;
        throw new DatabaseQueryError("Failed to query shipment from database.");
      }
    }

    if (!isFulfillmentDemoModeAllowed()) {
      throw new DatabaseUnavailableError("Fulfillment database is unconfigured.");
    }

    for (const demoOrder of liveDemoOrdersStore) {
      const s = demoOrder.shipments.find((ship) => ship.id === shipmentId);
      if (s) return s;
    }
    return null;
  },

  async createShipmentRecord(data: {
    orderId: string;
    carrier: string;
    trackingNumber: string;
    trackingUrl?: string | null;
    status: ShipmentStatus;
    shippedAt?: Date | null;
  }): Promise<ShipmentRecord> {
    if (isDatabaseConfigured()) {
      if (data.orderId.startsWith("demo-")) {
        throw new FulfillmentError(
          "Invalid order reference: demo orders cannot be fulfilled against configured database.",
          "ORDER_NOT_FOUND"
        );
      }

      const db = getDb();
      if (!db) {
        throw new DatabaseUnavailableError("Database connection unavailable.");
      }
      try {
        const [row] = await db
          .insert(shipments)
          .values({
            orderId: data.orderId,
            carrier: data.carrier,
            trackingNumber: data.trackingNumber,
            trackingUrl: data.trackingUrl || null,
            status: data.status,
            shippedAt: data.shippedAt || new Date(),
          })
          .returning();

        if (!row) {
          throw new DatabaseQueryError("Failed to insert shipment record into database.");
        }

        return {
          id: row.id,
          orderId: row.orderId,
          carrier: row.carrier,
          trackingNumber: row.trackingNumber,
          trackingUrl: row.trackingUrl,
          status: row.status as ShipmentStatus,
          shippedAt: row.shippedAt,
          deliveredAt: row.deliveredAt,
          createdAt: row.createdAt,
        };
      } catch (err: unknown) {
        if (err instanceof FulfillmentError) throw err;
        throw new DatabaseQueryError("Failed to insert shipment record into database.");
      }
    }

    if (!isFulfillmentDemoModeAllowed()) {
      throw new DatabaseUnavailableError("Fulfillment database is unconfigured.");
    }

    const demoOrder = liveDemoOrdersStore.find((d) => d.order.id === data.orderId);
    if (!demoOrder) {
      throw new FulfillmentError(`Order with ID ${data.orderId} not found.`, "ORDER_NOT_FOUND");
    }

    const newShipment: ShipmentRecord = {
      id: `demo-ship-${Date.now()}`,
      orderId: data.orderId,
      carrier: data.carrier,
      trackingNumber: data.trackingNumber,
      trackingUrl: data.trackingUrl || null,
      status: data.status,
      shippedAt: data.shippedAt || new Date(),
      deliveredAt: null,
      createdAt: new Date(),
    };

    demoOrder.shipments.unshift(newShipment);
    demoOrder.order.fulfillmentStatus = "shipped";
    demoOrder.statusHistory.unshift({
      status: "shipped",
      note: `Dispatched via ${data.carrier} with tracking #${data.trackingNumber}`,
      timestamp: new Date().toISOString(),
    });

    return newShipment;
  },

  async updateShipmentStatus(
    shipmentId: string,
    status: ShipmentStatus,
    timestamps?: { shippedAt?: Date | null; deliveredAt?: Date | null }
  ): Promise<void> {
    if (isDatabaseConfigured()) {
      if (shipmentId.startsWith("demo-ship-")) {
        throw new ShipmentNotFoundError("Shipment record not found.");
      }

      const db = getDb();
      if (!db) {
        throw new DatabaseUnavailableError("Database connection unavailable.");
      }
      try {
        const updateData: Record<string, unknown> = { status };
        if (timestamps?.shippedAt !== undefined) updateData.shippedAt = timestamps.shippedAt;
        if (timestamps?.deliveredAt !== undefined) updateData.deliveredAt = timestamps.deliveredAt;

        await db.update(shipments).set(updateData).where(eq(shipments.id, shipmentId));
        return;
      } catch (err: unknown) {
        if (err instanceof FulfillmentError) throw err;
        throw new DatabaseQueryError("Failed to update shipment status in database.");
      }
    }

    if (!isFulfillmentDemoModeAllowed()) {
      throw new DatabaseUnavailableError("Fulfillment database is unconfigured.");
    }

    let found = false;
    for (const demoOrder of liveDemoOrdersStore) {
      const s = demoOrder.shipments.find((ship) => ship.id === shipmentId);
      if (s) {
        s.status = status;
        if (timestamps?.shippedAt !== undefined) s.shippedAt = timestamps.shippedAt;
        if (timestamps?.deliveredAt !== undefined) s.deliveredAt = timestamps.deliveredAt;
        demoOrder.statusHistory.unshift({
          status,
          note: `Shipment status updated to ${status}.`,
          timestamp: new Date().toISOString(),
        });
        found = true;
        break;
      }
    }
    if (!found) {
      throw new ShipmentNotFoundError(`Shipment ${shipmentId} does not exist.`);
    }
  },

  async updateOrderFulfillmentStatus(
    orderId: string,
    status: OrderFulfillmentStatus,
    note: string,
    actorUserId?: string | null
  ): Promise<void> {
    if (isDatabaseConfigured()) {
      if (orderId.startsWith("demo-")) {
        throw new FulfillmentError("Order not found.", "ORDER_NOT_FOUND");
      }

      const db = getDb();
      if (!db) {
        throw new DatabaseUnavailableError("Database connection unavailable.");
      }
      try {
        await db.transaction(async (tx) => {
          const existing = await tx.query.orders.findFirst({
            where: eq(orders.id, orderId),
          });

          const oldStatus = existing ? existing.fulfillmentStatus : "unknown";

          await tx
            .update(orders)
            .set({
              fulfillmentStatus: status,
              updatedAt: new Date(),
            })
            .where(eq(orders.id, orderId));

          await tx.insert(orderStatusHistory).values({
            orderId,
            oldStatus,
            newStatus: status,
            actorUserId: actorUserId || null,
            note,
          });
        });
        return;
      } catch (err: unknown) {
        if (err instanceof FulfillmentError) throw err;
        throw new DatabaseQueryError("Failed to update order fulfillment status in database.");
      }
    }

    if (!isFulfillmentDemoModeAllowed()) {
      throw new DatabaseUnavailableError("Fulfillment database is unconfigured.");
    }

    const demo = liveDemoOrdersStore.find((d) => d.order.id === orderId);
    if (!demo) {
      throw new FulfillmentError(`Order ${orderId} not found.`, "ORDER_NOT_FOUND");
    }
    demo.order.fulfillmentStatus = status;
    demo.statusHistory.unshift({
      status,
      note,
      timestamp: new Date().toISOString(),
    });
  },

  async getOrdersAwaitingFulfillment(options?: {
    limit?: number;
    offset?: number;
  }): Promise<OrderFulfillmentRecord[]> {
    if (isDatabaseConfigured()) {
      const db = getDb();
      if (!db) {
        throw new DatabaseUnavailableError("Database connection unavailable.");
      }
      try {
        const limit = options?.limit ?? 50;
        const offset = options?.offset ?? 0;

        const rows = await db.query.orders.findMany({
          where: and(
            eq(orders.paymentStatus, "succeeded"),
            inArray(orders.fulfillmentStatus, ["pending", "confirmed", "processing", "packed"])
          ),
          orderBy: desc(orders.placedAt),
          limit,
          offset,
        });

        return rows.map((r) => ({
          id: r.id,
          orderNumber: r.orderNumber,
          userId: r.userId,
          paymentStatus: r.paymentStatus,
          fulfillmentStatus: r.fulfillmentStatus as OrderFulfillmentStatus,
          totalMinor: r.totalMinor,
          currency: r.currency,
          placedAt: r.placedAt,
          shippingAddressSnapshot: r.shippingAddressSnapshot as Record<string, unknown>,
        }));
      } catch (err: unknown) {
        if (err instanceof FulfillmentError) throw err;
        throw new DatabaseQueryError("Failed to query orders awaiting fulfillment from database.");
      }
    }

    if (!isFulfillmentDemoModeAllowed()) {
      throw new DatabaseUnavailableError("Fulfillment database is unconfigured.");
    }

    return liveDemoOrdersStore
      .filter(
        (d) =>
          d.order.paymentStatus === "succeeded" &&
          ["pending", "confirmed", "processing", "packed"].includes(d.order.fulfillmentStatus)
      )
      .map((d) => d.order);
  },

  async getAdminOrders(options?: {
    status?: "all" | "awaiting_dispatch" | "unpaid" | "shipped";
    limit?: number;
    offset?: number;
  }): Promise<AdminOrderListItemDTO[]> {
    if (isDatabaseConfigured()) {
      const db = getDb();
      if (!db) {
        throw new DatabaseUnavailableError("Database connection unavailable.");
      }

      try {
        const rows = await db.query.orders.findMany({
          orderBy: desc(orders.placedAt),
          limit: options?.limit ?? 50,
          offset: options?.offset ?? 0,
          with: {
            items: true,
          },
        });

        let filtered = rows;
        if (options?.status === "awaiting_dispatch") {
          filtered = rows.filter(
            (r) =>
              r.paymentStatus === "succeeded" &&
              ["pending", "confirmed", "processing", "packed"].includes(r.fulfillmentStatus)
          );
        } else if (options?.status === "unpaid") {
          filtered = rows.filter((r) => r.paymentStatus !== "succeeded");
        } else if (options?.status === "shipped") {
          filtered = rows.filter(
            (r) => r.fulfillmentStatus === "shipped" || r.fulfillmentStatus === "delivered"
          );
        }

        return filtered.map((r) => {
          const snap = (r.shippingAddressSnapshot || {}) as Record<string, unknown>;
          const customerName = String(snap.fullName || r.guestEmail || "Guest Customer");
          const isEligible =
            r.paymentStatus === "succeeded" &&
            !["shipped", "delivered", "cancelled", "returned"].includes(r.fulfillmentStatus);

          return {
            id: r.id,
            orderNumber: r.orderNumber,
            customerName,
            customerEmail: r.guestEmail,
            customerPhone: r.guestPhone,
            totalAmount: r.totalMinor / 100,
            currency: r.currency,
            paymentStatus: r.paymentStatus as "pending" | "succeeded" | "failed" | "cancelled",
            fulfillmentStatus: r.fulfillmentStatus as OrderFulfillmentStatus,
            itemsCount: r.items?.length || 1,
            createdAt: r.placedAt.toISOString(),
            isDispatchEligible: isEligible,
          };
        });
      } catch (err: unknown) {
        if (err instanceof FulfillmentError) throw err;
        throw new DatabaseQueryError("Failed to query orders from database.");
      }
    }

    if (!isFulfillmentDemoModeAllowed()) {
      throw new DatabaseUnavailableError("Fulfillment database is unconfigured.");
    }

    return filterDemoOrderList(options?.status);
  },

  async getAdminOrderDetail(orderId: string): Promise<AdminOrderDetailDTO | null> {
    if (isDatabaseConfigured()) {
      if (orderId.startsWith("demo-")) {
        return null;
      }

      const db = getDb();
      if (!db) {
        throw new DatabaseUnavailableError("Database connection unavailable.");
      }

      try {
        const row = await db.query.orders.findFirst({
          where: eq(orders.id, orderId),
          with: {
            items: true,
            shipments: {
              orderBy: desc(shipments.createdAt),
            },
            statusHistory: {
              orderBy: desc(orderStatusHistory.createdAt),
            },
          },
        });

        if (!row) return null;

        const snap = (row.shippingAddressSnapshot || {}) as Record<string, unknown>;
        const isEligible =
          row.paymentStatus === "succeeded" &&
          !["shipped", "delivered", "cancelled", "returned"].includes(row.fulfillmentStatus);

        return {
          id: row.id,
          orderNumber: row.orderNumber,
          customerName: String(snap.fullName || row.guestEmail || "Guest Customer"),
          customerEmail: row.guestEmail,
          customerPhone: row.guestPhone,
          shippingAddress: {
            fullName: snap.fullName ? String(snap.fullName) : undefined,
            phone: snap.phone ? String(snap.phone) : undefined,
            line1: String(snap.line1 || ""),
            line2: snap.line2 ? String(snap.line2) : null,
            city: String(snap.city || ""),
            state: String(snap.state || ""),
            pincode: String(snap.pincode || ""),
            country: snap.country ? String(snap.country) : "India",
          },
          totalAmount: row.totalMinor / 100,
          subtotalAmount: row.subtotalMinor / 100,
          shippingAmount: row.shippingMinor / 100,
          taxAmount: row.taxMinor / 100,
          currency: row.currency,
          paymentStatus: row.paymentStatus as "pending" | "succeeded" | "failed" | "cancelled",
          fulfillmentStatus: row.fulfillmentStatus as OrderFulfillmentStatus,
          createdAt: row.placedAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          items: row.items.map((i) => ({
            id: i.id,
            productId: i.productId,
            sku: i.skuSnapshot,
            name: i.productNameSnapshot,
            unitPrice: i.unitPriceMinor / 100,
            quantity: i.quantity,
            totalPrice: i.lineTotalMinor / 100,
          })),
          shipments: row.shipments.map((s) => ({
            id: s.id,
            carrier: s.carrier,
            trackingNumber: s.trackingNumber,
            trackingUrl: s.trackingUrl,
            status: s.status as ShipmentStatus,
            shippedAt: s.shippedAt ? s.shippedAt.toISOString() : null,
            deliveredAt: s.deliveredAt ? s.deliveredAt.toISOString() : null,
            createdAt: s.createdAt.toISOString(),
          })),
          isDispatchEligible: isEligible,
          statusHistory: row.statusHistory.map((h) => ({
            status: h.newStatus,
            note: h.note,
            timestamp: h.createdAt.toISOString(),
          })),
        };
      } catch (err: unknown) {
        if (err instanceof FulfillmentError) throw err;
        throw new DatabaseQueryError("Failed to query order detail from database.");
      }
    }

    if (!isFulfillmentDemoModeAllowed()) {
      throw new DatabaseUnavailableError("Fulfillment database is unconfigured.");
    }

    const demo = liveDemoOrdersStore.find((d) => d.order.id === orderId);
    if (!demo) return null;
    return mapDemoToDetailDTO(demo);
  },
};

// ----------------------------------------------------------------------
// Orchestration Functions
// ----------------------------------------------------------------------

export interface DispatchOrderInput {
  orderId: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string | null;
  actorUserId?: string | null;
}

/**
 * Validates eligibility of an order before dispatch.
 * Invariant: Order must be fully paid and not already shipped, cancelled or returned.
 */
export function assertDispatchEligibility(order: OrderFulfillmentRecord): void {
  if (order.paymentStatus !== "succeeded") {
    throw new OrderNotEligibleForDispatchError(
      `Cannot dispatch order ${order.orderNumber}: payment is '${order.paymentStatus}' (must be 'succeeded').`
    );
  }

  const disallowedStatuses: OrderFulfillmentStatus[] = [
    "shipped",
    "delivered",
    "cancelled",
    "returned",
  ];

  if (disallowedStatuses.includes(order.fulfillmentStatus)) {
    throw new OrderNotEligibleForDispatchError(
      `Cannot dispatch order ${order.orderNumber}: order is already in '${order.fulfillmentStatus}' state.`
    );
  }
}

/**
 * Dispatches an order with tracking information.
 */
export async function dispatchOrder(
  input: DispatchOrderInput,
  carrierAdapter?: FulfillmentCarrierAdapter,
  storage: FulfillmentStorageAdapter = defaultDrizzleFulfillmentStore
): Promise<ShipmentRecord> {
  const order = await storage.findOrderById(input.orderId);
  if (!order) {
    throw new FulfillmentError(`Order with ID ${input.orderId} not found.`, "ORDER_NOT_FOUND");
  }

  // Enforce dispatch eligibility invariants
  assertDispatchEligibility(order);

  let finalTrackingNumber = input.trackingNumber.trim();
  let finalTrackingUrl = input.trackingUrl?.trim() || null;
  let finalCarrier = input.carrier.trim();

  // If carrier adapter is provided, call its createShipment hook
  if (carrierAdapter && carrierAdapter.createShipment) {
    const address = order.shippingAddressSnapshot as Record<string, unknown>;
    const adapterResult: ShipmentResult = await carrierAdapter.createShipment({
      orderId: order.id,
      orderNumber: order.orderNumber,
      carrier: finalCarrier,
      trackingNumber: finalTrackingNumber,
      destinationPincode: String(address?.pincode || ""),
      destinationAddress: String(address?.line1 || ""),
      customerName: String(address?.fullName || "Valued Customer"),
      customerPhone: typeof address?.phone === "string" ? address.phone : null,
      items: [],
    });

    finalTrackingNumber = adapterResult.trackingNumber || finalTrackingNumber;
    finalTrackingUrl = adapterResult.trackingUrl || finalTrackingUrl;
    finalCarrier = adapterResult.carrier || finalCarrier;
  }

  if (!finalTrackingNumber) {
    throw new FulfillmentError("Tracking number is required to dispatch an order.", "INVALID_TRACKING_NUMBER");
  }

  const now = new Date();

  // 1. Persist shipment row
  const shipment = await storage.createShipmentRecord({
    orderId: order.id,
    carrier: finalCarrier,
    trackingNumber: finalTrackingNumber,
    trackingUrl: finalTrackingUrl,
    status: "shipped",
    shippedAt: now,
  });

  // 2. Transition order status
  await storage.updateOrderFulfillmentStatus(
    order.id,
    "shipped",
    `Order dispatched via ${finalCarrier} with tracking reference #${finalTrackingNumber}.`,
    input.actorUserId
  );

  return shipment;
}

export interface UpdateShipmentStatusInput {
  shipmentId: string;
  status: ShipmentStatus;
  actorUserId?: string | null;
  note?: string;
}

/**
 * Updates a shipment's milestone status and synchronizes the order's fulfillment status.
 */
export async function updateShipmentMilestoneStatus(
  input: UpdateShipmentStatusInput,
  storage: FulfillmentStorageAdapter = defaultDrizzleFulfillmentStore
): Promise<void> {
  const shipment = await storage.findShipmentById(input.shipmentId);
  if (!shipment) {
    throw new ShipmentNotFoundError(`Shipment ${input.shipmentId} does not exist.`);
  }

  if (!isValidShipmentTransition(shipment.status, input.status)) {
    throw new FulfillmentError(
      `Illegal shipment status transition from '${shipment.status}' to '${input.status}'.`,
      "INVALID_SHIPMENT_TRANSITION"
    );
  }

  const now = new Date();
  const timestamps: { shippedAt?: Date; deliveredAt?: Date } = {};

  if (input.status === "shipped" && !shipment.shippedAt) {
    timestamps.shippedAt = now;
  }
  if (input.status === "delivered" && !shipment.deliveredAt) {
    timestamps.deliveredAt = now;
  }

  await storage.updateShipmentStatus(shipment.id, input.status, timestamps);

  // Sync to parent order
  if (input.status === "delivered") {
    await storage.updateOrderFulfillmentStatus(
      shipment.orderId,
      "delivered",
      input.note || `Shipment #${shipment.trackingNumber} successfully delivered to customer.`,
      input.actorUserId
    );
  } else if (input.status === "returned") {
    await storage.updateOrderFulfillmentStatus(
      shipment.orderId,
      "returned",
      input.note || `Shipment #${shipment.trackingNumber} returned to sender.`,
      input.actorUserId
    );
  }
}

/**
 * Retrieves tracking details for an order, enforcing customer IDOR protection.
 */
export async function getOrderTracking(
  orderId: string,
  requester: RequesterContext,
  storage: FulfillmentStorageAdapter = defaultDrizzleFulfillmentStore
): Promise<OrderTrackingDTO> {
  const order = await storage.findOrderById(orderId);
  if (!order) {
    throw new FulfillmentError(`Order with ID ${orderId} not found.`, "ORDER_NOT_FOUND");
  }

  // IDOR Protection:
  // Must either be the owner (order.userId === requester.userId)
  // OR have admin / order management privileges.
  const isOwner = Boolean(requester.userId && order.userId === requester.userId);
  const userRoles = requester.roles || [];
  const userPerms = (requester.permissions || []) as PermissionKey[];

  const hasAdminAccess =
    hasRole(userRoles, [ROLES.ADMINISTRATOR, ROLES.SUPER_ADMINISTRATOR, ROLES.ORDER_MANAGER]) ||
    hasPermission(userPerms, PERMISSIONS.ORDERS_MANAGE) ||
    hasPermission(userPerms, PERMISSIONS.ORDERS_FULFILL);

  if (!isOwner && !hasAdminAccess) {
    throw new UnauthorizedTrackingAccessError(
      "Access denied: You do not have permission to view tracking for this order."
    );
  }

  const shipmentList = await storage.findShipmentsByOrderId(order.id);
  const latestShipment = shipmentList[0] || null;

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    fulfillmentStatus: order.fulfillmentStatus,
    hasLiveTracking: Boolean(latestShipment),
    carrier: latestShipment?.carrier || null,
    trackingNumber: latestShipment?.trackingNumber || null,
    trackingUrl: latestShipment?.trackingUrl || null,
    shippedAt: latestShipment?.shippedAt ? latestShipment.shippedAt.toISOString() : null,
    deliveredAt: latestShipment?.deliveredAt ? latestShipment.deliveredAt.toISOString() : null,
    milestones: shipmentList.map((s) => ({
      status: s.status,
      description: `Shipment marked as ${s.status} via ${s.carrier}.`,
      timestamp: (s.deliveredAt || s.shippedAt || s.createdAt).toISOString(),
    })),
  };
}

// ----------------------------------------------------------------------
// Public Customer Order Tracking
// ----------------------------------------------------------------------

export const GENERIC_TRACKING_NOT_FOUND_MESSAGE =
  "No order was found matching the provided reference and contact details. Please verify your information and try again.";

export function verifyContactMatches(
  inputContact: string,
  candidateContacts: {
    userEmail?: string | null;
    userPhone?: string | null;
    guestEmail?: string | null;
    guestPhone?: string | null;
    shippingPhone?: string | null;
    shippingEmail?: string | null;
  }
): boolean {
  if (isEmailContact(inputContact)) {
    const normalizedInput = normalizeTrackingEmail(inputContact);
    if (candidateContacts.userEmail && normalizeTrackingEmail(candidateContacts.userEmail) === normalizedInput) {
      return true;
    }
    if (candidateContacts.guestEmail && normalizeTrackingEmail(candidateContacts.guestEmail) === normalizedInput) {
      return true;
    }
    if (candidateContacts.shippingEmail && normalizeTrackingEmail(candidateContacts.shippingEmail) === normalizedInput) {
      return true;
    }
    return false;
  }

  // Phone number evaluation
  const normalizedInputPhone = normalizeTrackingPhone(inputContact);
  if (!normalizedInputPhone || normalizedInputPhone.length < 5) {
    return false;
  }

  const phoneCandidates = [
    candidateContacts.userPhone,
    candidateContacts.guestPhone,
    candidateContacts.shippingPhone,
  ].filter(Boolean) as string[];

  for (const candidate of phoneCandidates) {
    const normalizedCandidate = normalizeTrackingPhone(candidate);
    if (!normalizedCandidate) continue;

    if (normalizedCandidate === normalizedInputPhone) {
      return true;
    }
    // Match canonical 10-digit suffix if both numbers have at least 10 digits
    if (
      normalizedInputPhone.length >= 10 &&
      normalizedCandidate.length >= 10 &&
      normalizedInputPhone.slice(-10) === normalizedCandidate.slice(-10)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Resolves the trusted client IP for public order tracking.
 * - In production: strictly requires an established trusted proxy configuration (process.env.TRUSTED_PROXY_IP_HEADER).
 *   If absent or if the header contains an invalid IP, fails closed without guessing or trusting client headers.
 * - In development / test: accepts a valid test header (x-test-client-ip or x-real-ip) passing isIP(),
 *   otherwise uses the deterministic loopback "127.0.0.1".
 * - Leftmost X-Forwarded-For is NEVER trusted.
 */
export function resolveTrustedClientIp(headerList: { get(name: string): string | null }): {
  clientIp: string | null;
  error?: string;
} {
  const isDevOrTest = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

  // 1. Check if an explicit trusted proxy IP header is configured
  const configuredHeader = process.env.TRUSTED_PROXY_IP_HEADER?.trim();
  if (configuredHeader) {
    const rawVal = headerList.get(configuredHeader)?.trim();
    if (rawVal) {
      const version = isIP(rawVal);
      if (version === 4 || version === 6) {
        return { clientIp: rawVal };
      }
    }
    // Configured header present but missing or invalid
    if (!isDevOrTest) {
      return {
        clientIp: null,
        error: "Tracking service is temporarily unavailable. Trusted proxy identity could not be verified.",
      };
    }
  }

  // 2. Production fail-closed rule:
  // If production cannot establish a trustworthy client IP through an explicit proxy configuration,
  // fail closed with a safe service-unavailable response. Do not accept client-controlled headers.
  if (!isDevOrTest) {
    return {
      clientIp: null,
      error: "Tracking service is temporarily unavailable. Trusted proxy configuration is not established.",
    };
  }

  // 3. Development / Test behavior:
  const testHeaderCandidate =
    headerList.get("x-test-client-ip")?.trim() ||
    headerList.get("x-real-ip")?.trim();

  if (testHeaderCandidate) {
    const version = isIP(testHeaderCandidate);
    if (version === 4 || version === 6) {
      return { clientIp: testHeaderCandidate };
    }
  }

  return { clientIp: "127.0.0.1" };
}

export interface TrackOrderPubliclyOptions {
  clientIp?: string;
  storage?: FulfillmentStorageAdapter;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient?: any;
}

/**
 * Public customer tracking lookup with:
 * - Server-side Zod input validation
 * - Distributed PostgreSQL-backed IP rate limiting (fail closed in production)
 * - Atomic reservation of failed attempt slots to defeat concurrent burst bypass
 * - Non-enumerating generic response on reference or contact failure
 * - Registered customer ownership strictly isolated from third-party shipping recipient contacts
 * - Safe DTO containing only minimal tracking information and strictly validated HTTPS URLs
 */
export async function trackOrderPublicly(
  rawInput: unknown,
  options?: TrackOrderPubliclyOptions
): Promise<PublicOrderTrackingDTO> {
  const parsed = publicTrackingLookupSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new FulfillmentError(
      parsed.error.errors[0]?.message || "Invalid tracking lookup inputs.",
      "VALIDATION_ERROR"
    );
  }

  const { orderReference, contact } = parsed.data;
  const clientIp = options?.clientIp?.trim() || "127.0.0.1";

  // Strict IP syntax validation
  const ipVersion = isIP(clientIp);
  if (ipVersion !== 4 && ipVersion !== 6) {
    throw new FulfillmentError("Invalid network identifier.", "VALIDATION_ERROR");
  }

  const storage = options?.storage || defaultDrizzleFulfillmentStore;
  const db = options?.dbClient || (isDatabaseConfigured() ? getDb() : null);

  // 1. IP General Rate Limit Check (max 30 requests per 15 minutes)
  const generalRateLimit = await checkSharedRateLimit(db, `track:ip:${clientIp}`, {
    maxAttempts: 30,
    windowSeconds: 15 * 60,
  });

  if (generalRateLimit.isServiceUnavailable) {
    throw new FulfillmentError(
      "Tracking service is temporarily unavailable. Please try again later.",
      "SERVICE_UNAVAILABLE"
    );
  }

  if (!generalRateLimit.success) {
    throw new FulfillmentError(
      "Too many tracking requests from this network. Please try again later.",
      "RATE_LIMIT_EXCEEDED"
    );
  }

  // 2. Atomic Reservation of Failed Lookup Slot (max 5 failed attempts per 15 min)
  // By atomically incrementing the counter at the start of the lookup via PostgreSQL's
  // conditional ON CONFLICT DO UPDATE, concurrent bursts cannot bypass the 5-failure threshold.
  const failSlot = await checkSharedRateLimit(db, `track:fail:${clientIp}`, {
    maxAttempts: 5,
    windowSeconds: 15 * 60,
  });

  if (failSlot.isServiceUnavailable) {
    throw new FulfillmentError(
      "Tracking service is temporarily unavailable. Please try again later.",
      "SERVICE_UNAVAILABLE"
    );
  }

  if (!failSlot.success) {
    throw new FulfillmentError(
      "Too many failed tracking attempts. For security, please wait 15 minutes before retrying.",
      "RATE_LIMIT_EXCEEDED"
    );
  }

  // 3. Find order by reference
  let order: OrderFulfillmentRecord | null = null;
  if (storage.findOrderByReference) {
    order = await storage.findOrderByReference(orderReference);
  } else {
    order = await storage.findOrderById(orderReference);
  }

  if (!order) {
    // Failure stays counted (slot was reserved above). Do NOT decrement.
    console.warn(
      `[Tracking] Failed order lookup verification for reference: ${orderReference.slice(0, 8)}...`
    );
    throw new FulfillmentError(GENERIC_TRACKING_NOT_FOUND_MESSAGE, "ORDER_NOT_FOUND");
  }

  // 4. Retrieve order owner contact information
  let ownerContact: { emailNormalized?: string | null; phone?: string | null } | null = null;
  if (storage.findOrderOwnerContact) {
    ownerContact = await storage.findOrderOwnerContact(order.id, order.userId);
  }

  const shippingSnap = (order.shippingAddressSnapshot || {}) as Record<string, unknown>;

  // Strict Contact Isolation:
  // - Registered customer orders (order.userId !== null) must match the registered user account
  //   (userEmail or userPhone). Third-party delivery recipient contacts from shippingAddressSnapshot
  //   are strictly forbidden from authorizing access to registered customer orders.
  // - Guest orders (order.userId === null) verify against guestEmail, guestPhone, or delivery shippingPhone.
  const isRegisteredOrder = Boolean(order.userId);
  const candidateContacts = isRegisteredOrder
    ? {
        userEmail: ownerContact?.emailNormalized || null,
        userPhone: ownerContact?.phone || null,
        guestEmail: null,
        guestPhone: null,
        shippingPhone: null,
        shippingEmail: null,
      }
    : {
        userEmail: null,
        userPhone: null,
        guestEmail: order.guestEmail || null,
        guestPhone: order.guestPhone || null,
        shippingPhone: typeof shippingSnap.phone === "string" ? shippingSnap.phone : null,
        shippingEmail: typeof shippingSnap.email === "string" ? shippingSnap.email : null,
      };

  const isVerified = verifyContactMatches(contact, candidateContacts);
  if (!isVerified) {
    // Failure stays counted (slot was reserved above). Do NOT decrement.
    console.warn(
      `[Tracking] Failed order lookup verification for reference: ${orderReference.slice(0, 8)}...`
    );
    throw new FulfillmentError(GENERIC_TRACKING_NOT_FOUND_MESSAGE, "ORDER_NOT_FOUND");
  }

  // 5. Successful Verification:
  // Decrement the failure counter by 1 to release THIS request's reserved slot.
  // Crucially, this does NOT clear or erase prior failed attempts (prevents reset-stuffing).
  await decrementSharedRateLimit(db, `track:fail:${clientIp}`);

  // 6. Query authoritative shipment details
  const shipmentList = await storage.findShipmentsByOrderId(order.id);
  const latestShipment = shipmentList[0] || null;

  // Defensive sanitization: ensure tracking URL is strictly HTTPS
  const rawTrackingUrl = latestShipment?.trackingUrl || null;
  const safeTrackingUrl = isSafeHttpsUrl(rawTrackingUrl) ? rawTrackingUrl : null;

  return {
    orderReference: order.orderNumber,
    placedAt: order.placedAt.toISOString(),
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    hasLiveTracking: Boolean(latestShipment),
    carrier: latestShipment?.carrier || null,
    trackingNumber: latestShipment?.trackingNumber || null,
    trackingUrl: safeTrackingUrl,
    shipmentStatus: latestShipment?.status || null,
    shippedAt: latestShipment?.shippedAt ? latestShipment.shippedAt.toISOString() : null,
    deliveredAt: latestShipment?.deliveredAt ? latestShipment.deliveredAt.toISOString() : null,
    milestones: shipmentList.map((s) => ({
      status: s.status,
      description: `Shipment marked as ${s.status} via ${s.carrier}.`,
      timestamp: (s.deliveredAt || s.shippedAt || s.createdAt).toISOString(),
    })),
  };
}
