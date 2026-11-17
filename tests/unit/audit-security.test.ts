import { describe, it, expect } from "vitest";
import { sanitizeAuditMetadata } from "../../src/lib/audit";

describe("Admin Audit Security & PII Redaction", () => {
  it("should redact sensitive fields from audit metadata", () => {
    const rawPayload = {
      action: "user:update_password",
      actorId: "admin-1",
      targetEmail: "customer@example.com",
      password: "SuperSecretPassword123!",
      passwordHash: "$2a$12$abcdefg",
      apiKey: "live_sec_123456",
      token: "raw_token_value",
      cvv: "123",
      cardNumber: "4111111111111111",
      normalField: "Updated delivery address",
    };

    const sanitized = sanitizeAuditMetadata(rawPayload);

    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.passwordHash).toBe("[REDACTED]");
    expect(sanitized.apiKey).toBe("[REDACTED]");
    expect(sanitized.token).toBe("[REDACTED]");
    expect(sanitized.cvv).toBe("[REDACTED]");
    expect(sanitized.cardNumber).toBe("[REDACTED]");
    expect(sanitized.normalField).toBe("Updated delivery address");
    expect(sanitized.targetEmail).toBe("customer@example.com");
  });

  it("should redact nested sensitive fields recursively", () => {
    const nestedPayload = {
      request: {
        headers: {
          authorization: "Bearer secret-token",
        },
        body: {
          user: {
            name: "John Doe",
            password: "UnsafePassword1!",
          },
        },
      },
    };

    const sanitized = sanitizeAuditMetadata(nestedPayload);
    // @ts-expect-error Nested property access
    expect(sanitized.request.body.user.password).toBe("[REDACTED]");
    // @ts-expect-error Nested property access
    expect(sanitized.request.body.user.name).toBe("John Doe");
  });
});
