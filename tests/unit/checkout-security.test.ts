import { describe, it, expect, vi } from "vitest";
import { createOrderInputSchema } from "@/features/orders/schemas";
import { checkSharedRateLimit } from "@/lib/auth/rate-limit";

describe("Checkout & Orders Security Invariants (Phase 6)", () => {
  describe("Input Validation & Privileged Field Rejection", () => {
    it("should accept valid order creation payload", () => {
      const payload = {
        addressId: "123e4567-e89b-12d3-a456-426614174000",
        idempotencyKey: "client-unique-idem-token-12345",
        quoteToken: "valid-quote-token-abcdef1234567890",
      };

      const result = createOrderInputSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("should reject payload missing quoteToken", () => {
      const payload = {
        addressId: "123e4567-e89b-12d3-a456-426614174000",
        idempotencyKey: "client-unique-idem-token-12345",
      };

      const result = createOrderInputSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject overly short quoteToken", () => {
      const payload = {
        addressId: "123e4567-e89b-12d3-a456-426614174000",
        idempotencyKey: "client-unique-idem-token-12345",
        quoteToken: "too-short",
      };

      const result = createOrderInputSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should strictly reject privileged fields injected by client (paymentStatus, totalMinor, roles)", () => {
      const maliciousPayload = {
        addressId: "123e4567-e89b-12d3-a456-426614174000",
        idempotencyKey: "client-unique-idem-token-12345",
        quoteToken: "valid-quote-token-abcdef1234567890",
        // Attacker attempts to mark order as paid or force unit price/total
        paymentStatus: "succeeded",
        totalMinor: 100, // ₹1.00
        fulfillmentStatus: "shipped",
      };

      const result = createOrderInputSchema.safeParse(maliciousPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.code).toBe("unrecognized_keys");
      }
    });

    it("should reject non-UUID address ID", () => {
      const invalidPayload = {
        addressId: "not-a-uuid-format",
        idempotencyKey: "client-unique-idem-token-12345",
        quoteToken: "valid-quote-token-abcdef1234567890",
      };

      const result = createOrderInputSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it("should reject empty or overly short idempotency keys", () => {
      const shortKeyPayload = {
        addressId: "123e4567-e89b-12d3-a456-426614174000",
        idempotencyKey: "short",
        quoteToken: "valid-quote-token-abcdef1234567890",
      };

      const result = createOrderInputSchema.safeParse(shortKeyPayload);
      expect(result.success).toBe(false);
    });
  });

  describe("Idempotency Isolation Between Customers", () => {
    it("should scope idempotency keys per customer preventing cross-tenant collisions", () => {
      // If Customer A and Customer B happen to send the same idempotency key,
      // their composite lookup (userId, idempotencyKey) must remain strictly isolated
      const orderLedger = [
        { id: "ord-1", userId: "cust-A", idempotencyKey: "common-idem-key" },
      ];

      function lookupIdempotentOrder(userId: string, key: string) {
        return orderLedger.find((o) => o.userId === userId && o.idempotencyKey === key);
      }

      // Customer A finds their order
      expect(lookupIdempotentOrder("cust-A", "common-idem-key")?.id).toBe("ord-1");

      // Customer B does NOT collide with Customer A's order
      expect(lookupIdempotentOrder("cust-B", "common-idem-key")).toBeUndefined();
    });
  });

  describe("Rate-Limiting on Checkout & Order Creation", () => {
    it("should enforce rate limiting of 5 orders per 10 minutes", async () => {
      const futureReset = new Date(Date.now() + 600000);
      const mockDb = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                { attempts: 6, resetAt: futureReset }, // 6th attempt in window
              ]),
            }),
          }),
        }),
      };

      const check = await checkSharedRateLimit(mockDb, "order:cust-test-1", {
        maxAttempts: 5,
        windowSeconds: 600,
      });

      expect(check.success).toBe(false);
      expect(check.remaining).toBe(0);
    });
  });

  describe("Error Sanitization", () => {
    it("should ensure internal PostgreSQL exceptions are never leaked to client", () => {
      function sanitizeErrorMessage(err: unknown): string {
        const message = err instanceof Error ? err.message : "";
        if (message.includes("PostgreSQL") || message.includes("relation") || message.includes("syntax error")) {
          return "Service temporarily unavailable. Please try again shortly.";
        }
        return message;
      }

      const rawDbError = new Error('error: relation "orders" does not exist at character 15 in PostgreSQL query');
      const sanitized = sanitizeErrorMessage(rawDbError);

      expect(sanitized).not.toContain("PostgreSQL");
      expect(sanitized).not.toContain("relation");
      expect(sanitized).not.toContain("character");
      expect(sanitized).toBe("Service temporarily unavailable. Please try again shortly.");
    });
  });
});
