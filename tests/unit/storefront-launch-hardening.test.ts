import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isOnlineOrderingEnabled,
  createOrder,
  ONLINE_ORDERING_DISABLED_MESSAGE,
  type OrderStorageAdapter,
} from "@/features/orders/service";
import { validateCheckoutAddressServiceability } from "@/features/checkout/service";
import fs from "fs";
import path from "path";

describe("Storefront-Only Production Launch Hardening", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("1. Server-Side Production Order Placement Gate", () => {
    it("strictly blocks order placement in production environment", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("PAYMENT_PROVIDER", "mock");

      expect(isOnlineOrderingEnabled()).toBe(false);
    });

    it("blocks order placement in production even if ALLOW_FREE_SHIPPING_PROMO=true", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("ALLOW_FREE_SHIPPING_PROMO", "true");
      vi.stubEnv("PAYMENT_PROVIDER", "mock");

      expect(isOnlineOrderingEnabled()).toBe(false);
    });

    it("blocks mock payment provider from creating production orders", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("PAYMENT_PROVIDER", "mock");
      vi.stubEnv("PAYMENT_SECRET_KEY", "mock_secret_key");

      expect(isOnlineOrderingEnabled()).toBe(false);
    });

    it("ensures createOrder throws fail-closed error immediately before touching database or stock", async () => {
      vi.stubEnv("NODE_ENV", "production");

      const mockStore: OrderStorageAdapter = {
        isConfigured: vi.fn().mockReturnValue(true),
        findExistingOrder: vi.fn(),
        findConflictingOrder: vi.fn(),
        checkRateLimit: vi.fn(),
        validateAddress: vi.fn(),
        getOrderById: vi.fn(),
        runInTransaction: vi.fn(),
      };

      await expect(
        createOrder(
          "user-123",
          {
            addressId: "123e4567-e89b-12d3-a456-426614174000",
            idempotencyKey: "test-idem-key-prod-12345",
            quoteToken: "dummy-quote-token",
          },
          mockStore
        )
      ).rejects.toThrow(`ORDERING_DISABLED: ${ONLINE_ORDERING_DISABLED_MESSAGE}`);

      // Crucial: Verify that zero database or stock reservation operations occurred
      expect(mockStore.findExistingOrder).not.toHaveBeenCalled();
      expect(mockStore.runInTransaction).not.toHaveBeenCalled();
      expect(mockStore.validateAddress).not.toHaveBeenCalled();
    });

    it("allows ordering in development and test environments for testing workflows", () => {
      vi.stubEnv("NODE_ENV", "test");
      expect(isOnlineOrderingEnabled()).toBe(true);

      vi.stubEnv("NODE_ENV", "development");
      expect(isOnlineOrderingEnabled()).toBe(true);
    });
  });

  describe("2. Checkout Address Serviceability in Production", () => {
    it("disallows free shipping promotion in production even if ALLOW_FREE_SHIPPING_PROMO=true", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("ALLOW_FREE_SHIPPING_PROMO", "true");

      const mockAddress = {
        id: "addr-1",
        userId: "user-1",
        postalCode: "110001",
      };

      const mockDb = {
        query: {
          addresses: {
            findFirst: vi.fn().mockResolvedValue(mockAddress),
          },
        },
      };

      const result = await validateCheckoutAddressServiceability(
        mockDb,
        "user-1",
        "addr-1"
      );

      expect(result.serviceability.isServiceable).toBe(false);
      expect(result.serviceability.isConfigured).toBe(false);
      expect(result.serviceability.shippingFeeMinor).toBe(0);
      expect(result.serviceability.message).toBe(ONLINE_ORDERING_DISABLED_MESSAGE);
    });

    it("validates PIN code format before evaluating serviceability", async () => {
      vi.stubEnv("NODE_ENV", "production");

      const mockInvalidAddress = {
        id: "addr-2",
        userId: "user-1",
        postalCode: "012345", // Invalid Indian PIN code (starts with 0)
      };

      const mockDb = {
        query: {
          addresses: {
            findFirst: vi.fn().mockResolvedValue(mockInvalidAddress),
          },
        },
      };

      await expect(
        validateCheckoutAddressServiceability(mockDb, "user-1", "addr-2")
      ).rejects.toThrow("INVALID_POSTAL_CODE");
    });
  });

  describe("3. UI & Messaging Hygiene (No Phase 6/7 internal jargon or misleading promises)", () => {
    it("ensures public unavailable message is polite, customer-facing, and makes no false date claims", () => {
      expect(ONLINE_ORDERING_DISABLED_MESSAGE).toBe(
        "Online ordering is currently being prepared. You can continue browsing products and adding items to your cart."
      );
      expect(ONLINE_ORDERING_DISABLED_MESSAGE).not.toMatch(/phase/i);
      expect(ONLINE_ORDERING_DISABLED_MESSAGE).not.toMatch(/razorpay/i);
      expect(ONLINE_ORDERING_DISABLED_MESSAGE).not.toMatch(/mock/i);
    });

    it("ensures src/app/checkout/page.tsx contains no internal engineering milestone references", () => {
      const checkoutPagePath = path.resolve(process.cwd(), "src/app/checkout/page.tsx");
      const content = fs.readFileSync(checkoutPagePath, "utf-8");

      expect(content).not.toMatch(/Phase\s+[0-9]/i);
      expect(content).not.toMatch(/Razorpay/i);
      // Ensure "Free Standard Shipping" is not hardcoded unconditionally
      expect(content).not.toContain('<span className="font-bold text-emerald-700 uppercase text-[11px]">Free Standard Shipping</span>');
      // Ensure estimated delivery renders "—" when unserviceable
      expect(content).toContain('"—"');
      // Ensure disabled CTA button displays clear polite notice
      expect(content).toContain("Online Ordering Being Prepared");
    });
  });
});
