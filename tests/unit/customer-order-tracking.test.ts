import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  trackOrderPublicly,
  getOrderTracking,
  verifyContactMatches,
  resolveTrustedClientIp,
  GENERIC_TRACKING_NOT_FOUND_MESSAGE,
  FulfillmentError,
  UnauthorizedTrackingAccessError,
  DatabaseQueryError,
  type FulfillmentStorageAdapter,
  type OrderFulfillmentRecord,
  type ShipmentRecord,
} from "@/features/fulfillment/service";
import {
  publicTrackingLookupSchema,
  manualDispatchInputSchema,
  normalizeTrackingEmail,
  normalizeTrackingPhone,
  isEmailContact,
  isSafeHttpsUrl,
} from "@/features/fulfillment/schemas";
import { resetRateLimit } from "@/lib/auth/rate-limit";
import { ROLES, PERMISSIONS } from "@/lib/auth/rbac";

// ----------------------------------------------------------------------
// Test In-Memory Storage Adapter
// ----------------------------------------------------------------------

interface TestUserContact {
  emailNormalized: string;
  phone: string | null;
}

class MockCustomerTrackingStorage implements FulfillmentStorageAdapter {
  public orders = new Map<string, OrderFulfillmentRecord>();
  public shipments = new Map<string, ShipmentRecord[]>();
  public userContacts = new Map<string, TestUserContact>();
  public isDatabaseAvailable = true;
  public queryThrows = false;

  isConfigured(): boolean {
    return this.isDatabaseAvailable;
  }

  async findOrderById(orderId: string): Promise<OrderFulfillmentRecord | null> {
    if (this.queryThrows) {
      throw new DatabaseQueryError("Database query failed.");
    }
    return this.orders.get(orderId) || null;
  }

  async findOrderByReference(orderReference: string): Promise<OrderFulfillmentRecord | null> {
    if (this.queryThrows) {
      throw new DatabaseQueryError("Database query failed.");
    }
    const normalized = orderReference.trim().toUpperCase();
    for (const order of this.orders.values()) {
      if (order.orderNumber.toUpperCase() === normalized) {
        return order;
      }
    }
    return null;
  }

  async findOrderOwnerContact(
    _orderId: string,
    userId: string | null
  ): Promise<{ emailNormalized?: string | null; phone?: string | null } | null> {
    if (this.queryThrows) {
      throw new DatabaseQueryError("Database query failed.");
    }
    if (!userId) return null;
    const contact = this.userContacts.get(userId);
    if (!contact) return null;
    return {
      emailNormalized: contact.emailNormalized,
      phone: contact.phone,
    };
  }

  async findShipmentsByOrderId(orderId: string): Promise<ShipmentRecord[]> {
    if (this.queryThrows) {
      throw new DatabaseQueryError("Database query failed.");
    }
    return this.shipments.get(orderId) || [];
  }

  async findShipmentByTrackingNumber(trackingNumber: string): Promise<ShipmentRecord | null> {
    for (const list of this.shipments.values()) {
      const match = list.find((s) => s.trackingNumber === trackingNumber);
      if (match) return match;
    }
    return null;
  }

  async findShipmentById(shipmentId: string): Promise<ShipmentRecord | null> {
    for (const list of this.shipments.values()) {
      const match = list.find((s) => s.id === shipmentId);
      if (match) return match;
    }
    return null;
  }

  async createShipmentRecord(): Promise<ShipmentRecord> {
    throw new Error("createShipmentRecord not needed for tracking tests");
  }

  async updateShipmentStatus(): Promise<void> {
    throw new Error("updateShipmentStatus not needed for tracking tests");
  }

  async updateOrderFulfillmentStatus(): Promise<void> {
    throw new Error("updateOrderFulfillmentStatus not needed for tracking tests");
  }

  async getOrdersAwaitingFulfillment(): Promise<OrderFulfillmentRecord[]> {
    return [];
  }
}

// ----------------------------------------------------------------------
// Test Suite: Phase 7A.2 Secure Customer Order Tracking
// ----------------------------------------------------------------------

describe("Phase 7A.2: Secure Customer Order Tracking", () => {
  let storage: MockCustomerTrackingStorage;

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    storage = new MockCustomerTrackingStorage();

    // 1. Seed Alice's Dispatched Order (Registered Customer)
    // Note: Registered user phone is +91 98765 11111, while shipping recipient is Third Party (+91 99999 55555)
    storage.orders.set("ord-alice-1", {
      id: "ord-alice-1",
      orderNumber: "HS-2026-ALICE1",
      userId: "usr-alice",
      paymentStatus: "succeeded",
      fulfillmentStatus: "shipped",
      totalMinor: 450000,
      currency: "INR",
      placedAt: new Date("2026-11-17T10:00:00Z"),
      shippingAddressSnapshot: {
        fullName: "Third Party Mechanic",
        phone: "+91 99999 55555",
        line1: "123 Indiranagar",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560038",
      },
    });

    storage.userContacts.set("usr-alice", {
      emailNormalized: "alice@example.com",
      phone: "+91 98765 11111",
    });

    storage.shipments.set("ord-alice-1", [
      {
        id: "ship-alice-1",
        orderId: "ord-alice-1",
        carrier: "Delhivery",
        trackingNumber: "DEL-123456",
        trackingUrl: "https://www.delhivery.com/track/package/DEL-123456",
        status: "shipped",
        shippedAt: new Date("2026-11-17T14:30:00Z"),
        deliveredAt: null,
        createdAt: new Date("2026-11-17T14:00:00Z"),
      },
    ]);

    // 2. Seed Alice's Undispatched Order (No Shipment)
    storage.orders.set("ord-alice-2", {
      id: "ord-alice-2",
      orderNumber: "HS-2026-ALICE2",
      userId: "usr-alice",
      paymentStatus: "succeeded",
      fulfillmentStatus: "confirmed",
      totalMinor: 120000,
      currency: "INR",
      placedAt: new Date("2026-11-18T09:00:00Z"),
      shippingAddressSnapshot: {
        fullName: "Third Party Mechanic",
        phone: "+91 99999 55555",
        line1: "123 Indiranagar",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560038",
      },
    });

    // 3. Seed Bob's Delivered Order (Registered Customer)
    storage.orders.set("ord-bob-1", {
      id: "ord-bob-1",
      orderNumber: "HS-2026-BOB1",
      userId: "usr-bob",
      paymentStatus: "succeeded",
      fulfillmentStatus: "delivered",
      totalMinor: 890000,
      currency: "INR",
      placedAt: new Date("2026-11-16T08:00:00Z"),
      shippingAddressSnapshot: {
        fullName: "Bob Mehta",
        phone: "+91 98765 22222",
        line1: "45 Marine Lines",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400020",
      },
    });

    storage.userContacts.set("usr-bob", {
      emailNormalized: "bob@example.com",
      phone: "+91 98765 22222",
    });

    storage.shipments.set("ord-bob-1", [
      {
        id: "ship-bob-1",
        orderId: "ord-bob-1",
        carrier: "Blue Dart",
        trackingNumber: "BD-999888",
        trackingUrl: "https://www.bluedart.com/track/BD-999888",
        status: "delivered",
        shippedAt: new Date("2026-11-16T12:00:00Z"),
        deliveredAt: new Date("2026-11-17T16:00:00Z"),
        createdAt: new Date("2026-11-16T11:00:00Z"),
      },
    ]);

    // 4. Seed Guest Order (Unregistered / userId: null)
    storage.orders.set("ord-guest-1", {
      id: "ord-guest-1",
      orderNumber: "HS-2026-GUEST1",
      userId: null,
      guestEmail: "guest@example.com",
      guestPhone: "+91 98765 33333",
      paymentStatus: "succeeded",
      fulfillmentStatus: "shipped",
      totalMinor: 340000,
      currency: "INR",
      placedAt: new Date("2026-11-17T11:00:00Z"),
      shippingAddressSnapshot: {
        fullName: "Guest Recipient",
        phone: "+91 98765 33333",
        line1: "78 MG Road",
        city: "Pune",
        state: "Maharashtra",
        pincode: "411001",
      },
    });

    storage.shipments.set("ord-guest-1", [
      {
        id: "ship-guest-1",
        orderId: "ord-guest-1",
        carrier: "DTDC",
        trackingNumber: "DTDC-777666",
        trackingUrl: null,
        status: "in_transit",
        shippedAt: new Date("2026-11-17T15:00:00Z"),
        deliveredAt: null,
        createdAt: new Date("2026-11-17T14:30:00Z"),
      },
    ]);

    // 5. Seed Order with Unsafe Legacy HTTP URL in Database
    storage.orders.set("ord-legacy-http", {
      id: "ord-legacy-http",
      orderNumber: "HS-2026-LEGACY1",
      userId: "usr-alice",
      paymentStatus: "succeeded",
      fulfillmentStatus: "shipped",
      totalMinor: 200000,
      currency: "INR",
      placedAt: new Date("2026-11-17T09:00:00Z"),
      shippingAddressSnapshot: {
        fullName: "Alice Sharma",
        phone: "+91 98765 11111",
        line1: "123 Indiranagar",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560038",
      },
    });

    storage.shipments.set("ord-legacy-http", [
      {
        id: "ship-legacy-http",
        orderId: "ord-legacy-http",
        carrier: "Trackon",
        trackingNumber: "TRK-0001",
        trackingUrl: "http://insecure-tracking.com/track/TRK-0001", // Insecure plaintext HTTP
        status: "shipped",
        shippedAt: new Date("2026-11-17T10:00:00Z"),
        deliveredAt: null,
        createdAt: new Date("2026-11-17T09:30:00Z"),
      },
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ====================================================================
  // 1. Trusted Client IP Resolution (Requirement 1 & Regression Tests)
  // ====================================================================
  describe("1. Trusted Client IP Resolution", () => {
    it("never trusts spoofed leftmost X-Forwarded-For value in dev/test", () => {
      const headers = new Map<string, string>([
        ["x-forwarded-for", "198.51.100.1, 10.0.0.1"],
      ]);
      const res = resolveTrustedClientIp({ get: (h) => headers.get(h) || null });
      // Leftmost 198.51.100.1 is NEVER returned; falls back to deterministic loopback
      expect(res.clientIp).toBe("127.0.0.1");
    });

    it("rejects malformed, empty, or comma-injected IP values", () => {
      const malformedHeaders = [
        "not-an-ip",
        "1.2.3.4, 5.6.7.8",
        "192.168.1.1:8080",
        "",
        "   ",
        "256.1.2.3",
      ];

      for (const badIp of malformedHeaders) {
        const headers = new Map<string, string>([["x-test-client-ip", badIp]]);
        const res = resolveTrustedClientIp({ get: (h) => headers.get(h) || null });
        expect(res.clientIp).toBe("127.0.0.1"); // Ignores malformed IP
      }
    });

    it("accepts valid IPv4 address via established test header", () => {
      const headers = new Map<string, string>([["x-test-client-ip", "203.0.113.195"]]);
      const res = resolveTrustedClientIp({ get: (h) => headers.get(h) || null });
      expect(res.clientIp).toBe("203.0.113.195");
    });

    it("accepts valid IPv6 address via established test header", () => {
      const headers = new Map<string, string>([["x-test-client-ip", "2001:db8::1"]]);
      const res = resolveTrustedClientIp({ get: (h) => headers.get(h) || null });
      expect(res.clientIp).toBe("2001:db8::1");
    });

    it("fails closed in production when no trusted proxy IP can be established", () => {
      vi.stubEnv("NODE_ENV", "production");
      delete process.env.TRUSTED_PROXY_IP_HEADER;

      const headers = new Map<string, string>([
        ["x-forwarded-for", "198.51.100.1"],
        ["x-real-ip", "198.51.100.1"],
      ]);
      const res = resolveTrustedClientIp({ get: (h) => headers.get(h) || null });

      expect(res.clientIp).toBeNull();
      expect(res.error).toContain("Trusted proxy configuration is not established");
    });

    it("in production, uses trusted proxy header only when explicitly configured in environment", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("TRUSTED_PROXY_IP_HEADER", "cf-connecting-ip");

      const headers = new Map<string, string>([
        ["cf-connecting-ip", "198.51.100.50"],
        ["x-forwarded-for", "client-spoofed-ip"],
      ]);
      const res = resolveTrustedClientIp({ get: (h) => headers.get(h) || null });

      expect(res.clientIp).toBe("198.51.100.50");
    });

    it("in production, fails closed if configured proxy header is missing or malformed", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("TRUSTED_PROXY_IP_HEADER", "x-custom-proxy-ip");

      const headers = new Map<string, string>([["x-custom-proxy-ip", "invalid-ip-syntax"]]);
      const res = resolveTrustedClientIp({ get: (h) => headers.get(h) || null });

      expect(res.clientIp).toBeNull();
      expect(res.error).toContain("Trusted proxy identity could not be verified");
    });
  });

  // ====================================================================
  // 2. Failed Lookup Counter & Anti-Reset-Stuffing (Requirement 2)
  // ====================================================================
  describe("2. Failed Lookup Counter & Concurrency Defense", () => {
    it("successful lookup does not reset prior failed lookup count (prevents reset-stuffing)", async () => {
      const testIp = "10.10.10.1";
      resetRateLimit(`track:ip:${testIp}`);
      resetRateLimit(`track:fail:${testIp}`);

      // Perform 3 failed lookups
      for (let i = 0; i < 3; i++) {
        await expect(
          trackOrderPublicly(
            { orderReference: "HS-2026-ALICE1", contact: "wrong@bad.org" },
            { storage, clientIp: testIp }
          )
        ).rejects.toThrow(GENERIC_TRACKING_NOT_FOUND_MESSAGE);
      }

      // Now perform 1 legitimate successful lookup from the SAME IP
      const successResult = await trackOrderPublicly(
        { orderReference: "HS-2026-ALICE1", contact: "alice@example.com" },
        { storage, clientIp: testIp }
      );
      expect(successResult.orderReference).toBe("HS-2026-ALICE1");

      // The 3 previous failures MUST NOT be wiped out!
      // Attempting 2 more failures should hit the 5-failure threshold:
      await expect(
        trackOrderPublicly(
          { orderReference: "HS-2026-ALICE1", contact: "wrong2@bad.org" },
          { storage, clientIp: testIp }
        )
      ).rejects.toThrow(GENERIC_TRACKING_NOT_FOUND_MESSAGE);

      await expect(
        trackOrderPublicly(
          { orderReference: "HS-2026-ALICE1", contact: "wrong3@bad.org" },
          { storage, clientIp: testIp }
        )
      ).rejects.toThrow(GENERIC_TRACKING_NOT_FOUND_MESSAGE);

      // 6th attempt is blocked by RATE_LIMIT_EXCEEDED (proves counter retained failures!)
      await expect(
        trackOrderPublicly(
          { orderReference: "HS-2026-ALICE1", contact: "alice@example.com" },
          { storage, clientIp: testIp }
        )
      ).rejects.toThrow(/Too many failed tracking attempts/);
    });

    it("concurrent failed lookups enforce the configured 5-attempt threshold atomically", async () => {
      const testIp = "10.10.10.2";
      resetRateLimit(`track:ip:${testIp}`);
      resetRateLimit(`track:fail:${testIp}`);

      // Launch 10 simultaneous failed requests
      const promises = Array.from({ length: 10 }).map((_, i) =>
        trackOrderPublicly(
          { orderReference: "HS-2026-ALICE1", contact: `wrong-${i}@test.com` },
          { storage, clientIp: testIp }
        ).catch((err) => err)
      );

      const results = await Promise.all(promises);

      // Exactly 5 requests execute and fail with NOT_FOUND (consuming the 5 slots)
      const notFoundErrors = results.filter(
        (err) => err instanceof FulfillmentError && err.code === "ORDER_NOT_FOUND"
      );
      // The remaining 5 requests are rejected immediately with RATE_LIMIT_EXCEEDED
      const rateLimitErrors = results.filter(
        (err) => err instanceof FulfillmentError && err.code === "RATE_LIMIT_EXCEEDED"
      );

      expect(notFoundErrors.length).toBe(5);
      expect(rateLimitErrors.length).toBe(5);
    });

    it("rejects lookup with malformed clientIp identifier", async () => {
      await expect(
        trackOrderPublicly(
          { orderReference: "HS-2026-ALICE1", contact: "alice@example.com" },
          { storage, clientIp: "invalid-ip-string" }
        )
      ).rejects.toThrow(/Invalid network identifier/);
    });
  });

  // ====================================================================
  // 3. Registered Customer Contact Isolation (Requirement 3)
  // ====================================================================
  describe("3. Registered Customer Contact Isolation", () => {
    it("registered order succeeds when matching registered account email", async () => {
      const result = await trackOrderPublicly(
        { orderReference: "HS-2026-ALICE1", contact: "alice@example.com" },
        { storage, clientIp: "192.168.1.1" }
      );
      expect(result.orderReference).toBe("HS-2026-ALICE1");
      expect(result.carrier).toBe("Delhivery");
    });

    it("registered order succeeds when matching registered account phone", async () => {
      const result = await trackOrderPublicly(
        { orderReference: "HS-2026-ALICE1", contact: "9876511111" },
        { storage, clientIp: "192.168.1.2" }
      );
      expect(result.orderReference).toBe("HS-2026-ALICE1");
    });

    it("registered order strictly CANNOT be tracked using third-party delivery recipient phone", async () => {
      // Alice's order shipping recipient phone is +91 99999 55555
      // This MUST be rejected because it belongs to the delivery address, not Alice's registered account!
      await expect(
        trackOrderPublicly(
          { orderReference: "HS-2026-ALICE1", contact: "9999955555" },
          { storage, clientIp: "192.168.1.3" }
        )
      ).rejects.toThrow(GENERIC_TRACKING_NOT_FOUND_MESSAGE);
    });

    it("guest order can be tracked using guest checkout email", async () => {
      const result = await trackOrderPublicly(
        { orderReference: "HS-2026-GUEST1", contact: "guest@example.com" },
        { storage, clientIp: "192.168.1.4" }
      );
      expect(result.orderReference).toBe("HS-2026-GUEST1");
      expect(result.carrier).toBe("DTDC");
    });

    it("guest order can be tracked using guest checkout phone", async () => {
      const result = await trackOrderPublicly(
        { orderReference: "HS-2026-GUEST1", contact: "9876533333" },
        { storage, clientIp: "192.168.1.5" }
      );
      expect(result.orderReference).toBe("HS-2026-GUEST1");
      expect(result.carrier).toBe("DTDC");
    });
  });

  // ====================================================================
  // 4. HTTPS-Only Tracking URLs (Requirement 4)
  // ====================================================================
  describe("4. HTTPS-Only Tracking URLs", () => {
    it("isSafeHttpsUrl accepts valid HTTPS URLs", () => {
      expect(isSafeHttpsUrl("https://delhivery.com/track/DEL-123456")).toBe(true);
      expect(isSafeHttpsUrl("https://bluedart.com/tracking?awb=999")).toBe(true);
    });

    it("isSafeHttpsUrl rejects plaintext HTTP URLs", () => {
      expect(isSafeHttpsUrl("http://insecure-courier.com/track/123")).toBe(false);
    });

    it("isSafeHttpsUrl rejects javascript:, data:, and protocol-relative URLs", () => {
      expect(isSafeHttpsUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeHttpsUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
      expect(isSafeHttpsUrl("//malicious.com/track")).toBe(false);
      expect(isSafeHttpsUrl("https://")).toBe(false);
      expect(isSafeHttpsUrl("not-a-url")).toBe(false);
      expect(isSafeHttpsUrl(null)).toBe(false);
      expect(isSafeHttpsUrl(undefined)).toBe(false);
    });

    it("manualDispatchInputSchema accepts valid https trackingUrl", () => {
      const valid = manualDispatchInputSchema.safeParse({
        orderId: "ord-1",
        carrier: "Blue Dart",
        trackingNumber: "BD-12345",
        trackingUrl: "https://bluedart.com/track/123",
      });
      expect(valid.success).toBe(true);
    });

    it("manualDispatchInputSchema rejects http trackingUrl", () => {
      const invalid = manualDispatchInputSchema.safeParse({
        orderId: "ord-1",
        carrier: "Blue Dart",
        trackingNumber: "BD-12345",
        trackingUrl: "http://bluedart.com/track/123",
      });
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.errors[0]?.message).toContain("must be a valid HTTPS URL");
      }
    });

    it("manualDispatchInputSchema rejects javascript: and data: trackingUrl", () => {
      const jsUrl = manualDispatchInputSchema.safeParse({
        orderId: "ord-1",
        carrier: "Blue Dart",
        trackingNumber: "BD-12345",
        trackingUrl: "javascript:alert(document.cookie)",
      });
      expect(jsUrl.success).toBe(false);
    });

    it("defensively sanitizes legacy database records with plaintext HTTP URLs to null", async () => {
      const result = await trackOrderPublicly(
        { orderReference: "HS-2026-LEGACY1", contact: "alice@example.com" },
        { storage, clientIp: "192.168.1.10" }
      );
      // Legacy shipment had trackingUrl: "http://insecure-tracking.com/track/TRK-0001"
      // Public tracking DTO defensively sanitizes this to null!
      expect(result.trackingUrl).toBeNull();
      expect(result.carrier).toBe("Trackon");
      expect(result.trackingNumber).toBe("TRK-0001");
    });
  });

  // ====================================================================
  // 5. Fail-Closed Production Behavior
  // ====================================================================
  describe("5. Production Fail-Closed Behavior", () => {
    it("fails closed when rate limiter database is unavailable in production", async () => {
      vi.stubEnv("NODE_ENV", "production");

      // Pass null dbClient in production
      await expect(
        trackOrderPublicly(
          { orderReference: "HS-2026-ALICE1", contact: "alice@example.com" },
          { storage, clientIp: "198.51.100.1", dbClient: null }
        )
      ).rejects.toThrow(/Tracking service is temporarily unavailable/);
    });
  });
});
