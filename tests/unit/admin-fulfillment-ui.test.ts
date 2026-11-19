import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ROLES,
  PERMISSIONS,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/auth/rbac";
import type { SafeUser } from "@/features/auth/service";
import {
  assertAdminFulfillmentAccess,
  getAdminOrdersAction,
  getAdminOrderDetailAction,
  recordManualDispatchAction,
  updateShipmentStatusAction,
} from "@/features/fulfillment/admin-actions";
import {
  manualDispatchInputSchema,
  updateShipmentStatusInputSchema,
} from "@/features/fulfillment/schemas";
import {
  defaultDrizzleFulfillmentStore,
  resetDemoOrdersStore,
  dispatchOrder,
  updateShipmentMilestoneStatus,
  OrderNotEligibleForDispatchError,
  FulfillmentError,
  DatabaseUnavailableError,
  DatabaseQueryError,
  ShipmentNotFoundError,
} from "@/features/fulfillment/service";

// Test Users
const unauthenticatedUser = null;

const regularCustomerUser: SafeUser = {
  id: "usr-cust-1",
  name: "Regular Customer",
  email: "customer@example.com",
  phone: "+919876543210",
  status: "active",
  roles: [ROLES.CUSTOMER],
  permissions: [],
  createdAt: new Date(),
};

const orderManagerUser: SafeUser = {
  id: "usr-mgr-1",
  name: "Order Manager",
  email: "ordermanager@hsspareparts.com",
  phone: "+919811122233",
  status: "active",
  roles: [ROLES.ORDER_MANAGER],
  permissions: [PERMISSIONS.ORDERS_MANAGE, PERMISSIONS.ORDERS_FULFILL],
  createdAt: new Date(),
};

const storeAdminUser: SafeUser = {
  id: "usr-admin-1",
  name: "Store Administrator",
  email: "admin@hsspareparts.com",
  phone: "+919988776655",
  status: "active",
  roles: [ROLES.ADMINISTRATOR],
  permissions: [PERMISSIONS.ORDERS_MANAGE, PERMISSIONS.ORDERS_FULFILL],
  createdAt: new Date(),
};

describe("Phase 7A.1: Admin Orders & Fulfillment UI Backend & Actions", () => {
  beforeEach(() => {
    resetDemoOrdersStore();
  });

  // ====================================================================
  // 1. RBAC & IDOR Enforcement
  // ====================================================================
  describe("1. RBAC & IDOR Enforcement", () => {
    it("strictly blocks unauthenticated access to assertAdminFulfillmentAccess", async () => {
      await expect(
        assertAdminFulfillmentAccess(PERMISSIONS.ORDERS_MANAGE, unauthenticatedUser)
      ).rejects.toThrow(AuthenticationError);
    });

    it("strictly blocks regular customer accounts from accessing fulfillment management", async () => {
      await expect(
        assertAdminFulfillmentAccess(PERMISSIONS.ORDERS_MANAGE, regularCustomerUser)
      ).rejects.toThrow(AuthorizationError);

      await expect(
        assertAdminFulfillmentAccess(PERMISSIONS.ORDERS_FULFILL, regularCustomerUser)
      ).rejects.toThrow(AuthorizationError);
    });

    it("permits Order Manager to access orders manage and fulfill actions", async () => {
      const user = await assertAdminFulfillmentAccess(
        PERMISSIONS.ORDERS_MANAGE,
        orderManagerUser
      );
      expect(user.id).toBe(orderManagerUser.id);

      const userFulfill = await assertAdminFulfillmentAccess(
        PERMISSIONS.ORDERS_FULFILL,
        orderManagerUser
      );
      expect(userFulfill.id).toBe(orderManagerUser.id);
    });

    it("permits Administrator to access orders manage and fulfill actions", async () => {
      const user = await assertAdminFulfillmentAccess(
        PERMISSIONS.ORDERS_MANAGE,
        storeAdminUser
      );
      expect(user.id).toBe(storeAdminUser.id);
    });

    it("server actions return isUnauthorized: true for customer accounts", async () => {
      const listRes = await getAdminOrdersAction(undefined, regularCustomerUser);
      expect(listRes.success).toBe(false);
      expect(listRes.isUnauthorized).toBe(true);

      const detailRes = await getAdminOrderDetailAction("demo-ord-1", regularCustomerUser);
      expect(detailRes.success).toBe(false);
      expect(detailRes.isUnauthorized).toBe(true);

      const dispatchRes = await recordManualDispatchAction(
        { orderId: "demo-ord-1", carrier: "Delhivery", trackingNumber: "DEL-12345" },
        regularCustomerUser
      );
      expect(dispatchRes.success).toBe(false);
      expect(dispatchRes.isUnauthorized).toBe(true);

      const milestoneRes = await updateShipmentStatusAction(
        { shipmentId: "demo-ship-1", status: "delivered" },
        regularCustomerUser
      );
      expect(milestoneRes.success).toBe(false);
      expect(milestoneRes.isUnauthorized).toBe(true);
    });
  });

  // ====================================================================
  // 2. Orders List Retrieval & Filtering
  // ====================================================================
  describe("2. Orders List Retrieval & Filtering", () => {
    it("successfully loads orders list for authorized order manager", async () => {
      const res = await getAdminOrdersAction({ status: "all" }, orderManagerUser);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data?.length).toBeGreaterThanOrEqual(3);

      const paidOrder = res.data?.find((o) => o.id === "demo-ord-1");
      expect(paidOrder).toBeDefined();
      expect(paidOrder?.orderNumber).toBe("HS-2026-F9A2C3E1");
      expect(paidOrder?.paymentStatus).toBe("succeeded");
      expect(paidOrder?.isDispatchEligible).toBe(true);
    });

    it("filters orders awaiting dispatch (paid and unfulfilled)", async () => {
      const res = await getAdminOrdersAction({ status: "awaiting_dispatch" }, orderManagerUser);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();

      // All returned orders must be paid and eligible
      for (const ord of res.data!) {
        expect(ord.paymentStatus).toBe("succeeded");
        expect(["pending", "confirmed", "processing", "packed"]).toContain(
          ord.fulfillmentStatus
        );
      }
    });

    it("filters unpaid / blocked orders", async () => {
      const res = await getAdminOrdersAction({ status: "unpaid" }, orderManagerUser);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();

      for (const ord of res.data!) {
        expect(ord.paymentStatus).not.toBe("succeeded");
        expect(ord.isDispatchEligible).toBe(false);
      }
    });

    it("filters dispatched / shipped orders", async () => {
      const res = await getAdminOrdersAction({ status: "shipped" }, orderManagerUser);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();

      for (const ord of res.data!) {
        expect(["shipped", "delivered"]).toContain(ord.fulfillmentStatus);
      }
    });
  });

  // ====================================================================
  // 3. Order Detail Inspection
  // ====================================================================
  describe("3. Order Detail Inspection", () => {
    it("loads complete order details including items, address and status history", async () => {
      const res = await getAdminOrderDetailAction("demo-ord-1", orderManagerUser);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();

      const order = res.data!;
      expect(order.orderNumber).toBe("HS-2026-F9A2C3E1");
      expect(order.customerName).toBe("Vikramaditya Sharma");
      expect(order.shippingAddress.pincode).toBe("400063");
      expect(order.items.length).toBeGreaterThanOrEqual(1);
      expect(order.items[0]?.sku).toBe("HS-ENG-001");
      expect(order.paymentStatus).toBe("succeeded");
      expect(order.isDispatchEligible).toBe(true);
      expect(order.statusHistory?.length).toBeGreaterThanOrEqual(1);
    });

    it("returns error for non-existent order ID", async () => {
      const res = await getAdminOrderDetailAction("non-existent-order-id", orderManagerUser);
      expect(res.success).toBe(false);
      expect(res.error).toContain("not found");
    });
  });

  // ====================================================================
  // 4. Input Validation (Zod Schemas)
  // ====================================================================
  describe("4. Input Validation (Zod Schemas)", () => {
    it("rejects empty or missing carrier name", () => {
      const res1 = manualDispatchInputSchema.safeParse({
        orderId: "demo-ord-1",
        carrier: " ",
        trackingNumber: "DEL-12345",
      });
      expect(res1.success).toBe(false);

      const res2 = manualDispatchInputSchema.safeParse({
        orderId: "demo-ord-1",
        carrier: "A", // min 2
        trackingNumber: "DEL-12345",
      });
      expect(res2.success).toBe(false);
    });

    it("rejects empty or short tracking number", () => {
      const res = manualDispatchInputSchema.safeParse({
        orderId: "demo-ord-1",
        carrier: "Delhivery",
        trackingNumber: "12", // min 3
      });
      expect(res.success).toBe(false);
    });

    it("rejects invalid tracking URL format", () => {
      const res = manualDispatchInputSchema.safeParse({
        orderId: "demo-ord-1",
        carrier: "Delhivery",
        trackingNumber: "DEL-12345",
        trackingUrl: "ftp://invalid-url.com",
      });
      expect(res.success).toBe(false);
    });

    it("accepts valid manual dispatch input", () => {
      const res = manualDispatchInputSchema.safeParse({
        orderId: "demo-ord-1",
        carrier: "Delhivery",
        trackingNumber: "DEL-88239104",
        trackingUrl: "https://www.delhivery.com/track/package/DEL-88239104",
      });
      expect(res.success).toBe(true);
    });

    it("validates shipment milestone status input schema", () => {
      const invalidStatus = updateShipmentStatusInputSchema.safeParse({
        shipmentId: "demo-ship-1",
        status: "invalid_status",
      });
      expect(invalidStatus.success).toBe(false);

      const validStatus = updateShipmentStatusInputSchema.safeParse({
        shipmentId: "demo-ship-1",
        status: "in_transit",
        note: "Package in transit to hub",
      });
      expect(validStatus.success).toBe(true);
    });
  });

  // ====================================================================
  // 5. Dispatch Invariants & Paid Order Requirement
  // ====================================================================
  describe("5. Dispatch Invariants & Paid Order Requirement", () => {
    it("strictly blocks dispatch on unpaid / pending orders", async () => {
      // demo-ord-2 has paymentStatus: 'pending'
      const res = await recordManualDispatchAction(
        {
          orderId: "demo-ord-2",
          carrier: "Delhivery",
          trackingNumber: "DEL-99999",
        },
        orderManagerUser
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("must be 'succeeded'");
    });

    it("strictly blocks dispatch on already shipped orders", async () => {
      // demo-ord-3 has fulfillmentStatus: 'shipped'
      const res = await recordManualDispatchAction(
        {
          orderId: "demo-ord-3",
          carrier: "Delhivery",
          trackingNumber: "DEL-99999",
        },
        orderManagerUser
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("already in 'shipped' state");
    });

    it("successfully records manual dispatch for eligible paid order", async () => {
      // demo-ord-1 is paid and confirmed
      const res = await recordManualDispatchAction(
        {
          orderId: "demo-ord-1",
          carrier: "Blue Dart",
          trackingNumber: "BD-456789123",
          trackingUrl: "https://www.bluedart.com/track/BD-456789123",
        },
        orderManagerUser
      );

      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data?.carrier).toBe("Blue Dart");
      expect(res.data?.trackingNumber).toBe("BD-456789123");
      expect(res.data?.status).toBe("shipped");

      // Verify order detail reflects updated state
      const detail = await getAdminOrderDetailAction("demo-ord-1", orderManagerUser);
      expect(detail.data?.fulfillmentStatus).toBe("shipped");
      expect(detail.data?.isDispatchEligible).toBe(false); // No longer eligible for dispatch
      expect(detail.data?.shipments.length).toBe(1);
    });
  });

  // ====================================================================
  // 6. Shipment Milestone Status Transitions & Cascade
  // ====================================================================
  describe("6. Shipment Milestone Transitions & Cascade", () => {
    it("advances shipment milestone through allowed state transitions", async () => {
      // demo-ord-3 has shipment 'demo-ship-1' with status 'shipped'
      const step1 = await updateShipmentStatusAction(
        {
          shipmentId: "demo-ship-1",
          status: "in_transit",
          note: "Arrived at central distribution hub",
        },
        orderManagerUser
      );
      expect(step1.success).toBe(true);

      const step2 = await updateShipmentStatusAction(
        {
          shipmentId: "demo-ship-1",
          status: "out_for_delivery",
          note: "Out for courier delivery with van",
        },
        orderManagerUser
      );
      expect(step2.success).toBe(true);

      const step3 = await updateShipmentStatusAction(
        {
          shipmentId: "demo-ship-1",
          status: "delivered",
          note: "Handed over to customer with OTP confirmation",
        },
        orderManagerUser
      );
      expect(step3.success).toBe(true);

      // Verify parent order fulfillmentStatus updated to delivered
      const detail = await getAdminOrderDetailAction("demo-ord-3", orderManagerUser);
      expect(detail.data?.fulfillmentStatus).toBe("delivered");
    });

    it("rejects illegal milestone state transitions (e.g. delivered -> shipped)", async () => {
      // Advance to delivered first
      await updateShipmentStatusAction(
        { shipmentId: "demo-ship-1", status: "delivered" },
        orderManagerUser
      );

      // Attempt to regress back to shipped
      const illegalRes = await updateShipmentStatusAction(
        { shipmentId: "demo-ship-1", status: "shipped" },
        orderManagerUser
      );

      expect(illegalRes.success).toBe(false);
      expect(illegalRes.error).toContain("Illegal shipment status transition");
    });
  });

  // ====================================================================
  // 7. Demo Fallback Security & Environment Invariants (Phase 7A.1 Correction)
  // ====================================================================
  describe("7. Demo Fallback Security & Environment Invariants", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      resetDemoOrdersStore();
    });

    it("1. Explicit development demo mode with no database: demo reads work", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("NEXT_PUBLIC_ENABLE_DEMO_CATALOG", "true");
      vi.stubEnv("DATABASE_URL", "");

      const ordersList = await defaultDrizzleFulfillmentStore.getAdminOrders();
      expect(ordersList.length).toBeGreaterThanOrEqual(3);

      const detail = await defaultDrizzleFulfillmentStore.getAdminOrderDetail("demo-ord-1");
      expect(detail).not.toBeNull();
      expect(detail?.orderNumber).toBe("HS-2026-F9A2C3E1");

      const ord = await defaultDrizzleFulfillmentStore.findOrderById("demo-ord-1");
      expect(ord).not.toBeNull();
    });

    it("2. Explicit test demo mode with no database: demo reads work", async () => {
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("DATABASE_URL", "");

      const ordersList = await defaultDrizzleFulfillmentStore.getAdminOrders();
      expect(ordersList.length).toBeGreaterThanOrEqual(3);

      const detail = await defaultDrizzleFulfillmentStore.getAdminOrderDetail("demo-ord-2");
      expect(detail).not.toBeNull();
    });

    it("3. Production with no database: demo reads are rejected", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DATABASE_URL", "");
      vi.stubEnv("NEXT_PUBLIC_ENABLE_DEMO_CATALOG", "");

      await expect(defaultDrizzleFulfillmentStore.getAdminOrders()).rejects.toThrow(
        DatabaseUnavailableError
      );
      await expect(
        defaultDrizzleFulfillmentStore.getAdminOrderDetail("demo-ord-1")
      ).rejects.toThrow(DatabaseUnavailableError);
      await expect(
        defaultDrizzleFulfillmentStore.findOrderById("demo-ord-1")
      ).rejects.toThrow(DatabaseUnavailableError);
      await expect(
        defaultDrizzleFulfillmentStore.findShipmentsByOrderId("demo-ord-1")
      ).rejects.toThrow(DatabaseUnavailableError);
      await expect(
        defaultDrizzleFulfillmentStore.findShipmentById("demo-ship-1")
      ).rejects.toThrow(DatabaseUnavailableError);
      await expect(
        defaultDrizzleFulfillmentStore.getOrdersAwaitingFulfillment()
      ).rejects.toThrow(DatabaseUnavailableError);
    });

    it("4. Staging / preview with no database: demo reads are rejected", async () => {
      vi.stubEnv("NODE_ENV", "staging");
      vi.stubEnv("DATABASE_URL", "");

      await expect(defaultDrizzleFulfillmentStore.getAdminOrders()).rejects.toThrow(
        DatabaseUnavailableError
      );

      vi.stubEnv("NODE_ENV", "preview");
      await expect(defaultDrizzleFulfillmentStore.getAdminOrders()).rejects.toThrow(
        DatabaseUnavailableError
      );
    });

    it("5. Unknown environment with no database: demo reads are rejected", async () => {
      vi.stubEnv("NODE_ENV", "");
      vi.stubEnv("DATABASE_URL", "");

      await expect(defaultDrizzleFulfillmentStore.getAdminOrders()).rejects.toThrow(
        DatabaseUnavailableError
      );
    });

    it("6. Configured database failure in development: database error propagates; no demo fallback", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("NEXT_PUBLIC_ENABLE_DEMO_CATALOG", "true");
      vi.stubEnv("DATABASE_URL", "postgres://mockuser:mockpass@localhost:5432/fail_db");

      await expect(defaultDrizzleFulfillmentStore.getAdminOrders()).rejects.toThrow(
        FulfillmentError
      );
      await expect(
        defaultDrizzleFulfillmentStore.getAdminOrderDetail("some-id")
      ).rejects.toThrow(FulfillmentError);
      await expect(
        defaultDrizzleFulfillmentStore.findOrderById("some-id")
      ).rejects.toThrow(FulfillmentError);
    });

    it("7. Configured database failure in production: database error propagates safely", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DATABASE_URL", "postgres://mockuser:mockpass@localhost:5432/fail_db");

      await expect(defaultDrizzleFulfillmentStore.getAdminOrders()).rejects.toThrow(
        DatabaseQueryError
      );
      await expect(
        defaultDrizzleFulfillmentStore.getAdminOrderDetail("some-id")
      ).rejects.toThrow(DatabaseQueryError);
    });

    it("8. Production request with demo-* order ID: demo storage is never accessed", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DATABASE_URL", "postgres://mockuser:mockpass@localhost:5432/mockdb");

      // In production with DB configured, demo IDs return null and never touch demo store
      const res = await defaultDrizzleFulfillmentStore.findOrderById("demo-ord-1");
      expect(res).toBeNull();

      const detail = await defaultDrizzleFulfillmentStore.getAdminOrderDetail("demo-ord-1");
      expect(detail).toBeNull();
    });

    it("9. Production request with demo-ship-* shipment ID: demo storage is never accessed", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DATABASE_URL", "postgres://mockuser:mockpass@localhost:5432/mockdb");

      const ship = await defaultDrizzleFulfillmentStore.findShipmentById("demo-ship-1");
      expect(ship).toBeNull();

      const shipmentsList = await defaultDrizzleFulfillmentStore.findShipmentsByOrderId(
        "demo-ord-1"
      );
      expect(shipmentsList).toHaveLength(0);
    });

    it("10. Demo mutations remain isolated in explicitly enabled development/test mode", async () => {
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("DATABASE_URL", "");

      const created = await defaultDrizzleFulfillmentStore.createShipmentRecord({
        orderId: "demo-ord-1",
        carrier: "Trackon",
        trackingNumber: "TRK-990011",
        status: "shipped",
      });

      expect(created.id).toContain("demo-ship-");
      expect(created.carrier).toBe("Trackon");

      await defaultDrizzleFulfillmentStore.updateShipmentStatus(created.id, "in_transit");
      const updated = await defaultDrizzleFulfillmentStore.findShipmentById(created.id);
      expect(updated?.status).toBe("in_transit");
    });

    it("11. Production mutation cannot create or update demo shipment records", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DATABASE_URL", "postgres://mockuser:mockpass@localhost:5432/mockdb");

      await expect(
        defaultDrizzleFulfillmentStore.createShipmentRecord({
          orderId: "demo-ord-1",
          carrier: "Delhivery",
          trackingNumber: "DEL-0001",
          status: "shipped",
        })
      ).rejects.toThrow(FulfillmentError);

      await expect(
        defaultDrizzleFulfillmentStore.updateShipmentStatus("demo-ship-1", "delivered")
      ).rejects.toThrow(ShipmentNotFoundError);
    });
  });
});
