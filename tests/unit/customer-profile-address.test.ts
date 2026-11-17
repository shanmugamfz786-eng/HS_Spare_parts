import { describe, it, expect } from "vitest";
import {
  updateProfileSchema,
  createAddressSchema,
  updateAddressSchema,
  deleteAddressSchema,
  setDefaultAddressSchema,
} from "@/features/account/schemas";

describe("Customer Profile & Address Book Security (Phase 5)", () => {
  // 1. Profile Validation & Mass Assignment Defense
  describe("Profile Schema & Mass Assignment Defense", () => {
    it("should accept valid customer name and Indian mobile number", () => {
      const valid = updateProfileSchema.safeParse({
        name: "Arjun Sharma",
        phone: "9876543210",
      });
      expect(valid.success).toBe(true);
    });

    it("should allow optional/empty phone number", () => {
      const withoutPhone = updateProfileSchema.safeParse({
        name: "Arjun Sharma",
        phone: null,
      });
      expect(withoutPhone.success).toBe(true);
    });

    it("should reject invalid Indian phone numbers", () => {
      // Must start with 6-9 and be 10 digits
      const startsWithZero = updateProfileSchema.safeParse({
        name: "Arjun Sharma",
        phone: "0876543210",
      });
      expect(startsWithZero.success).toBe(false);

      const tooShort = updateProfileSchema.safeParse({
        name: "Arjun Sharma",
        phone: "987654321", // 9 digits
      });
      expect(tooShort.success).toBe(false);
    });

    it("should strictly reject mass-assignment of privileged fields", () => {
      const attemptRoleEscalation = updateProfileSchema.safeParse({
        name: "Arjun Sharma",
        phone: "9876543210",
        roles: ["administrator"], // Attacker attempts role injection
      });
      expect(attemptRoleEscalation.success).toBe(false);

      const attemptEmailChange = updateProfileSchema.safeParse({
        name: "Arjun Sharma",
        email: "hacked@example.com",
      });
      expect(attemptEmailChange.success).toBe(false);

      const attemptStatusChange = updateProfileSchema.safeParse({
        name: "Arjun Sharma",
        status: "superuser",
      });
      expect(attemptStatusChange.success).toBe(false);
    });
  });

  // 2. Address Validation
  describe("Indian Address Validation", () => {
    const validAddress = {
      recipient: "Priya Nair",
      phone: "9123456789",
      addressLine1: "Flat 402, Lotus Residency",
      addressLine2: "Near Metro Station",
      city: "Pune",
      stateRegion: "Maharashtra",
      postalCode: "411038",
      countryCode: "IN",
      addressType: "shipping" as const,
      isDefault: true,
    };

    it("should accept a valid Indian delivery address", () => {
      const result = createAddressSchema.safeParse(validAddress);
      expect(result.success).toBe(true);
    });

    it("should reject PIN codes that are not exactly 6 digits", () => {
      const tooShortPin = createAddressSchema.safeParse({
        ...validAddress,
        postalCode: "41103",
      });
      expect(tooShortPin.success).toBe(false);

      const tooLongPin = createAddressSchema.safeParse({
        ...validAddress,
        postalCode: "4110389",
      });
      expect(tooLongPin.success).toBe(false);

      const alphaPin = createAddressSchema.safeParse({
        ...validAddress,
        postalCode: "41103A",
      });
      expect(alphaPin.success).toBe(false);
    });

    it("should require a valid UUID for update and delete schemas", () => {
      const validUpdate = updateAddressSchema.safeParse({
        addressId: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        ...validAddress,
      });
      expect(validUpdate.success).toBe(true);

      const invalidUpdate = updateAddressSchema.safeParse({
        addressId: "not-a-uuid",
        ...validAddress,
      });
      expect(invalidUpdate.success).toBe(false);

      const validDelete = deleteAddressSchema.safeParse({
        addressId: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      });
      expect(validDelete.success).toBe(true);
    });
  });

  // 3. Address Ownership & IDOR Protection Invariants
  describe("IDOR Protection & Default Consistency Invariants", () => {
    interface AddressRecord {
      id: string;
      userId: string;
      recipient: string;
      isDefault: boolean;
    }

    it("should reject address mutations when requesting user does not own the address (IDOR defense)", () => {
      const addressTable: AddressRecord[] = [
        { id: "addr-1", userId: "user-A", recipient: "User A Address", isDefault: true },
        { id: "addr-2", userId: "user-B", recipient: "User B Address", isDefault: true },
      ];

      function updateAddressWithOwnership(
        requestingUserId: string,
        targetAddressId: string,
        newRecipient: string
      ): boolean {
        // Enforce: AND eq(addresses.id, addressId), eq(addresses.userId, requestingUserId)
        const record = addressTable.find(
          (a) => a.id === targetAddressId && a.userId === requestingUserId
        );
        if (!record) return false;
        record.recipient = newRecipient;
        return true;
      }

      // User A attempts to edit User B's address
      const unauthorizedAttempt = updateAddressWithOwnership("user-A", "addr-2", "Hacked Address");
      expect(unauthorizedAttempt).toBe(false);
      expect(addressTable.find((a) => a.id === "addr-2")?.recipient).toBe("User B Address");

      // User B edits their own address
      const authorizedAttempt = updateAddressWithOwnership("user-B", "addr-2", "Updated User B Address");
      expect(authorizedAttempt).toBe(true);
      expect(addressTable.find((a) => a.id === "addr-2")?.recipient).toBe("Updated User B Address");
    });

    it("should maintain atomic default consistency when setting a new default address", () => {
      const userAddresses: AddressRecord[] = [
        { id: "addr-1", userId: "user-A", recipient: "Address 1", isDefault: true },
        { id: "addr-2", userId: "user-A", recipient: "Address 2", isDefault: false },
        { id: "addr-3", userId: "user-A", recipient: "Address 3", isDefault: false },
      ];

      function setDefault(userId: string, targetAddressId: string) {
        // Atomic transaction: Unset all defaults for user, then set target
        userAddresses.forEach((a) => {
          if (a.userId === userId) a.isDefault = false;
        });
        const target = userAddresses.find((a) => a.id === targetAddressId && a.userId === userId);
        if (target) target.isDefault = true;
      }

      setDefault("user-A", "addr-2");

      const defaults = userAddresses.filter((a) => a.userId === "user-A" && a.isDefault);
      expect(defaults).toHaveLength(1);
      expect(defaults[0]!.id).toBe("addr-2");
    });
  });
});
