import { describe, it, expect } from "vitest";
import { registerSchema, loginSchema, addressSchema } from "../../src/features/auth/schemas";

describe("Authentication & Input Validation Schemas", () => {
  describe("Registration Schema", () => {
    it("should accept valid customer registration payload", () => {
      const valid = {
        name: "Aarav Sharma",
        email: "Aarav.Sharma@example.com",
        password: "StrongPass#2026",
        phone: "+91 9876543210",
      };

      const result = registerSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("aarav.sharma@example.com"); // normalized lowercase
      }
    });

    it("should reject weak passwords", () => {
      const weakPasswords = [
        "short1!", // less than 8 chars
        "alllowercase123!", // no uppercase
        "ALLUPPERCASE123!", // no lowercase
        "NoDigitsHere!@#", // no digit
        "NoSpecialChars123", // no special char
      ];

      for (const pass of weakPasswords) {
        const result = registerSchema.safeParse({
          name: "Test User",
          email: "test@example.com",
          password: pass,
        });
        expect(result.success).toBe(false);
      }
    });

    it("should reject invalid email formats", () => {
      const invalidEmails = ["notanemail", "test@", "@domain.com", "test@.com"];
      for (const email of invalidEmails) {
        const result = registerSchema.safeParse({
          name: "Test User",
          email,
          password: "ValidPass#123",
        });
        expect(result.success).toBe(false);
      }
    });
  });

  describe("Login Schema", () => {
    it("should accept valid email and password format", () => {
      const result = loginSchema.safeParse({
        email: "customer@domain.com",
        password: "some-password",
      });
      expect(result.success).toBe(true);
    });

    it("should reject empty password or invalid email", () => {
      expect(loginSchema.safeParse({ email: "invalid", password: "123" }).success).toBe(false);
      expect(loginSchema.safeParse({ email: "valid@domain.com", password: "" }).success).toBe(false);
    });
  });

  describe("Address Schema", () => {
    it("should validate and normalize correct shipping address", () => {
      const result = addressSchema.safeParse({
        recipient: "Rajesh Kumar",
        phone: "9876543210",
        addressLine1: "123 Ring Road, Industrial Area",
        city: "Bengaluru",
        stateRegion: "Karnataka",
        postalCode: "560001",
        countryCode: "IN",
        addressType: "shipping",
      });
      expect(result.success).toBe(true);
    });

    it("should reject address with missing line 1 or short phone", () => {
      const result = addressSchema.safeParse({
        recipient: "R",
        phone: "123",
        addressLine1: "abc",
        city: "B",
        stateRegion: "K",
        postalCode: "1",
      });
      expect(result.success).toBe(false);
    });
  });
});
