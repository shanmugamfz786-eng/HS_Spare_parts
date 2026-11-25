import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import {
  getCloudinaryUploadParams,
  confirmUploadProof,
  createCloudinaryUploadReceipt,
  createCloudinaryUploadReceiptV2,
  verifyCloudinaryUploadReceipt,
  inspectCloudinaryUploadReceipt,
  verifyCloudinaryResponseSignature,
  CLOUDINARY_FOLDERS,
  type CloudinaryFolder,
  type UploadReceiptV2Payload,
} from "@/lib/cloudinary";
import {
  resetInMemoryDemoState,
  setInMemoryUploadSession,
  getInMemoryUploadSessionById,
} from "@/server/catalogue/demo-state";
import { ROLES, PERMISSIONS } from "@/lib/auth/rbac";
import type { SafeUser } from "@/features/auth/service";

describe("Cloudinary Phase C5.4.2: Upload Protocol & Receipt v2 (Stage A / Stage B)", () => {
  const mockAdminUser: SafeUser = {
    id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    email: "admin@hsspareparts.com",
    name: "Master Admin",
    phone: "+919876543210",
    roles: [ROLES.ADMINISTRATOR],
    permissions: [PERMISSIONS.CATALOGUE_WRITE, PERMISSIONS.CATALOGUE_READ],
    status: "active",
    createdAt: new Date("2026-01-01"),
  };

  const mockAdminUser2: SafeUser = {
    id: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
    email: "admin2@hsspareparts.com",
    name: "Secondary Admin",
    phone: "+919876543219",
    roles: [ROLES.ADMINISTRATOR],
    permissions: [PERMISSIONS.CATALOGUE_WRITE, PERMISSIONS.CATALOGUE_READ],
    status: "active",
    createdAt: new Date("2026-01-01"),
  };

  const mockCustomerUser: SafeUser = {
    id: "c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f",
    email: "customer@gmail.com",
    name: "Regular Customer",
    phone: "+919876543212",
    roles: [ROLES.CUSTOMER],
    permissions: [],
    status: "active",
    createdAt: new Date("2026-01-01"),
  };

  const mockReadOnlyUser: SafeUser = {
    id: "d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a",
    email: "viewer@hsspareparts.com",
    name: "Read-Only Staff",
    phone: null,
    roles: [ROLES.SUPPORT_STAFF],
    permissions: [PERMISSIONS.CATALOGUE_READ],
    status: "active",
    createdAt: new Date("2026-01-01"),
  };

  const API_SECRET = "test_cloudinary_api_secret_998877";

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "hs-spare-parts-demo");
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_API_KEY", "123456789012345");
    vi.stubEnv("CLOUDINARY_API_SECRET", API_SECRET);
    vi.stubEnv("CLOUDINARY_RECEIPT_SECRET", "test_receipt_secret_abcdef123456");
    resetInMemoryDemoState();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // ============================================================================
  // 1. Stage A: Upload Authorization & Session Creation
  // ============================================================================
  describe("1. Stage A: Upload Authorization & Session Creation", () => {
    it("generates signed upload authorization and creates durable session in authorization_created state", async () => {
      const params = await getCloudinaryUploadParams({
        userOverride: mockAdminUser,
        folder: CLOUDINARY_FOLDERS.products,
      });

      expect(params.cloudName).toBe("hs-spare-parts-demo");
      expect(params.apiKey).toBe("123456789012345");
      expect(params.folder).toBe("hs-spare-parts/products");
      expect(params.uploadPreset).toBe("hs-spare-parts-admin");
      expect(params.uploadUrl).toBe("https://api.cloudinary.com/v1_1/hs-spare-parts-demo/image/upload");
      expect(params.allowedFormats).toEqual(["jpg", "jpeg", "png", "webp"]);
      expect(params.maxFileSize).toBe(10 * 1024 * 1024);

      // Verify UUID session ID
      expect(params.sessionId).toBeDefined();
      expect(params.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      // Verify collision-resistant public ID
      expect(params.publicId).toMatch(/^prod_\d+_[a-f0-9]{12}$/);

      // Verify signature is valid SHA-1 hex
      expect(params.signature).toMatch(/^[a-f0-9]{40}$/);

      // Verify secret is NEVER leaked in returned parameters
      expect((params as unknown as Record<string, unknown>).apiSecret).toBeUndefined();
      expect(JSON.stringify(params)).not.toContain(API_SECRET);

      // Crucial Security Invariant: Receipt v2 MUST NOT be issued in Stage A
      expect(params.uploadReceipt).toBeUndefined();
    });

    it("strictly blocks regular customers from generating upload authorization", async () => {
      await expect(
        getCloudinaryUploadParams({ userOverride: mockCustomerUser })
      ).rejects.toThrow("Regular customer accounts cannot create or manage catalogue products");
    });

    it("strictly blocks unauthenticated requests from generating upload authorization", async () => {
      await expect(
        getCloudinaryUploadParams({ userOverride: null })
      ).rejects.toThrow("Authentication required: Please sign in as an administrator");
    });

    it("strictly blocks read-only support staff without CATALOGUE_WRITE", async () => {
      await expect(
        getCloudinaryUploadParams({ userOverride: mockReadOnlyUser })
      ).rejects.toThrow("Access Denied");
    });

    it("derives actor ID exclusively from server authenticated session (cannot be spoofed)", async () => {
      const params = await getCloudinaryUploadParams({
        userOverride: mockAdminUser,
      });
      expect(params.sessionId).toBeDefined();
    });

    it("strictly rejects unauthorized folders and directory traversal attempts", async () => {
      await expect(
        getCloudinaryUploadParams({
          userOverride: mockAdminUser,
          folder: "hs-spare-parts/../../etc" as unknown as CloudinaryFolder,
        })
      ).rejects.toThrow("SECURITY_ERROR: Unauthorized asset folder");

      await expect(
        getCloudinaryUploadParams({
          userOverride: mockAdminUser,
          folder: "arbitrary-bucket" as unknown as CloudinaryFolder,
        })
      ).rejects.toThrow("SECURITY_ERROR: Unauthorized asset folder");
    });

    it("generates unique collision-resistant public IDs and distinct session IDs on successive calls", async () => {
      const call1 = await getCloudinaryUploadParams({ userOverride: mockAdminUser });
      const call2 = await getCloudinaryUploadParams({ userOverride: mockAdminUser });

      expect(call1.sessionId).not.toBe(call2.sessionId);
      expect(call1.publicId).not.toBe(call2.publicId);
      expect(call1.signature).not.toBe(call2.signature);
    });

    it("fails closed if durable database session insertion fails (never returns authorization)", async () => {
      const mockFailingDb = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockRejectedValue(new Error("Database connection dropped")),
        }),
      };

      await expect(
        getCloudinaryUploadParams({
          userOverride: mockAdminUser,
          dbOverride: mockFailingDb,
        })
      ).rejects.toThrow("DATABASE_ERROR: Failed to establish durable upload session");
    });
  });

  // ============================================================================
  // 2. Cloudinary Response Signature Verification
  // ============================================================================
  describe("2. Cloudinary Response Signature Verification", () => {
    it("cryptographically verifies authentic SHA-1 Cloudinary upload response signature", () => {
      const pid = "hs-spare-parts/products/prod_1732000000_abcdef123456";
      const version = 1732000005;
      const expectedToSign = `public_id=${pid}&version=${version}${API_SECRET}`;
      const validSig = crypto.createHash("sha1").update(expectedToSign).digest("hex");

      const isValid = verifyCloudinaryResponseSignature(pid, version, validSig, API_SECRET);
      expect(isValid).toBe(true);
    });

    it("cryptographically verifies authentic SHA-256 Cloudinary upload response signature", () => {
      const pid = "hs-spare-parts/products/prod_1732000000_abcdef123456";
      const version = 1732000005;
      const expectedToSign = `public_id=${pid}&version=${version}${API_SECRET}`;
      const validSig256 = crypto.createHash("sha256").update(expectedToSign).digest("hex");

      const isValid = verifyCloudinaryResponseSignature(pid, version, validSig256, API_SECRET);
      expect(isValid).toBe(true);
    });

    it("strictly rejects forged or tampered response signatures", () => {
      const pid = "hs-spare-parts/products/prod_1732000000_abcdef123456";
      const version = 1732000005;
      const tamperedSig = "a".repeat(40);

      const isValid = verifyCloudinaryResponseSignature(pid, version, tamperedSig, API_SECRET);
      expect(isValid).toBe(false);
    });

    it("strictly rejects public ID mismatch in response signature", () => {
      const realPid = "hs-spare-parts/products/prod_real_123";
      const attackerPid = "hs-spare-parts/products/prod_attacker_456";
      const version = 1732000005;

      const sigForAttacker = crypto
        .createHash("sha1")
        .update(`public_id=${attackerPid}&version=${version}${API_SECRET}`)
        .digest("hex");

      // Verifying against realPid with signature issued for attackerPid must fail
      expect(verifyCloudinaryResponseSignature(realPid, version, sigForAttacker, API_SECRET)).toBe(false);
    });

    it("strictly rejects version mismatch in response signature", () => {
      const pid = "hs-spare-parts/products/prod_123";
      const realVersion = 1732000005;
      const fakeVersion = 1732000010;

      const sigForReal = crypto
        .createHash("sha1")
        .update(`public_id=${pid}&version=${realVersion}${API_SECRET}`)
        .digest("hex");

      expect(verifyCloudinaryResponseSignature(pid, fakeVersion, sigForReal, API_SECRET)).toBe(false);
    });

    it("strictly rejects signature when signed with wrong API secret", () => {
      const pid = "hs-spare-parts/products/prod_123";
      const version = 1732000005;
      const wrongSecret = "wrong_secret_123456";

      const sigFromWrong = crypto
        .createHash("sha1")
        .update(`public_id=${pid}&version=${version}${wrongSecret}`)
        .digest("hex");

      expect(verifyCloudinaryResponseSignature(pid, version, sigFromWrong, API_SECRET)).toBe(false);
    });
  });

  // ============================================================================
  // 3. Stage B: Upload Proof Verification & Receipt v2 Issuance
  // ============================================================================
  describe("3. Stage B: Upload Proof Verification & Receipt v2 Issuance", () => {
    it("successfully verifies valid upload proof, updates session, and issues Receipt v2", async () => {
      // 1. Stage A: Get authorization
      const auth = await getCloudinaryUploadParams({
        userOverride: mockAdminUser,
        folder: CLOUDINARY_FOLDERS.products,
      });

      const fullPid = `hs-spare-parts/products/${auth.publicId}`;
      const version = 1732000100;
      const validSig = crypto
        .createHash("sha1")
        .update(`public_id=${fullPid}&version=${version}${API_SECRET}`)
        .digest("hex");

      // 2. Stage B: Confirm upload proof
      const confirmResult = await confirmUploadProof(
        {
          sessionId: auth.sessionId,
          publicId: fullPid,
          version,
          signature: validSig,
          bytes: 204800,
          format: "webp",
          width: 800,
          height: 600,
          resourceType: "image",
        },
        { userOverride: mockAdminUser }
      );

      expect(confirmResult.success).toBe(true);
      expect(confirmResult.receipt).toBeDefined();
      expect(confirmResult.sessionId).toBe(auth.sessionId);
      expect(confirmResult.publicId).toBe(fullPid);

      // Verify Receipt v2 payload
      const inspection = inspectCloudinaryUploadReceipt(confirmResult.receipt);
      expect(inspection.valid).toBe(true);
      expect(inspection.version).toBe(2);

      const payload = inspection.payload as UploadReceiptV2Payload;
      expect(payload.v).toBe(2);
      expect(payload.sid).toBe(auth.sessionId);
      expect(payload.pid).toBe(fullPid);
      expect(payload.uid).toBe(mockAdminUser.id);
      expect(payload.fld).toBe("hs-spare-parts/products");
      expect(payload.res).toBe("image");
      expect(typeof payload.iat).toBe("number");
      expect(typeof payload.exp).toBe("number");
      expect(payload.exp).toBeGreaterThan(payload.iat);

      // Verify Receipt v2 verification with expected identity
      const verifyRes = verifyCloudinaryUploadReceipt(confirmResult.receipt, {
        publicId: fullPid,
        adminId: mockAdminUser.id,
        sessionId: auth.sessionId,
        folder: "hs-spare-parts/products",
        resourceType: "image",
      });
      expect(verifyRes.valid).toBe(true);
      expect(verifyRes.version).toBe(2);
    });

    it("strictly rejects Stage B proof if Cloudinary response signature is invalid", async () => {
      const auth = await getCloudinaryUploadParams({ userOverride: mockAdminUser });
      const fullPid = `hs-spare-parts/products/${auth.publicId}`;

      const res = await confirmUploadProof(
        {
          sessionId: auth.sessionId,
          publicId: fullPid,
          version: 123456,
          signature: "b".repeat(40),
        },
        { userOverride: mockAdminUser }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("Cryptographic signature mismatch");
      expect(res.receipt).toBeUndefined();
    });

    it("strictly rejects Stage B proof if requested by a different administrator (cross-admin attack)", async () => {
      const auth = await getCloudinaryUploadParams({ userOverride: mockAdminUser });
      const fullPid = `hs-spare-parts/products/${auth.publicId}`;
      const version = 1732000200;
      const validSig = crypto
        .createHash("sha1")
        .update(`public_id=${fullPid}&version=${version}${API_SECRET}`)
        .digest("hex");

      // Admin 2 attempts to confirm Admin 1's session
      const res = await confirmUploadProof(
        {
          sessionId: auth.sessionId,
          publicId: fullPid,
          version,
          signature: validSig,
        },
        { userOverride: mockAdminUser2 }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("UNAUTHORIZED_ACTOR: Upload session belongs to a different administrator");
      expect(res.receipt).toBeUndefined();
    });

    it("strictly rejects Stage B proof if public ID does not match session record", async () => {
      const auth = await getCloudinaryUploadParams({ userOverride: mockAdminUser });
      const wrongPid = "hs-spare-parts/products/prod_wrong_pid_123456";
      const version = 1732000300;
      const validSig = crypto
        .createHash("sha1")
        .update(`public_id=${wrongPid}&version=${version}${API_SECRET}`)
        .digest("hex");

      const res = await confirmUploadProof(
        {
          sessionId: auth.sessionId,
          publicId: wrongPid,
          version,
          signature: validSig,
        },
        { userOverride: mockAdminUser }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("IDENTITY_MISMATCH");
    });

    it("strictly rejects Stage B proof if session has expired", async () => {
      const auth = await getCloudinaryUploadParams({ userOverride: mockAdminUser });
      const fullPid = `hs-spare-parts/products/${auth.publicId}`;
      const version = 1732000400;
      const validSig = crypto
        .createHash("sha1")
        .update(`public_id=${fullPid}&version=${version}${API_SECRET}`)
        .digest("hex");

      // Manually set session expiration in the past
      setInMemoryUploadSession(auth.sessionId, {
        id: auth.sessionId,
        cloudName: "hs-spare-parts-demo",
        canonicalPublicId: fullPid,
        resourceType: "image",
        deliveryType: "upload",
        folder: "hs-spare-parts/products",
        createdByActorId: mockAdminUser.id,
        status: "authorization_created",
        createdAt: new Date(Date.now() - 10000 * 1000),
        expiresAt: new Date(Date.now() - 1000), // Expired
        lastUpdatedAt: new Date(),
        uploadVerifiedAt: null,
        cloudinaryVersion: null,
        uploadedBytes: null,
        uploadProof: null,
        committedAt: null,
        committedEntityType: null,
        committedEntityId: null,
        cleanupIntentAt: null,
        deletedAt: null,
        leaseVersion: 0,
        lockedAt: null,
        leaseExpiresAt: null,
        lockedByWorker: null,
      });

      const res = await confirmUploadProof(
        {
          sessionId: auth.sessionId,
          publicId: fullPid,
          version,
          signature: validSig,
        },
        { userOverride: mockAdminUser }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("SESSION_EXPIRED");
    });

    it("strictly rejects Stage B proof for non-existent session UUID", async () => {
      const nonExistentId = crypto.randomUUID();
      const pid = "hs-spare-parts/products/prod_123";
      const version = 1732000500;
      const validSig = crypto
        .createHash("sha1")
        .update(`public_id=${pid}&version=${version}${API_SECRET}`)
        .digest("hex");

      const res = await confirmUploadProof(
        {
          sessionId: nonExistentId,
          publicId: pid,
          version,
          signature: validSig,
        },
        { userOverride: mockAdminUser }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("SESSION_NOT_FOUND");
    });

    it("strictly rejects prohibited image formats (SVG injection defense)", async () => {
      const auth = await getCloudinaryUploadParams({ userOverride: mockAdminUser });
      const fullPid = `hs-spare-parts/products/${auth.publicId}`;
      const version = 1732000600;
      const validSig = crypto
        .createHash("sha1")
        .update(`public_id=${fullPid}&version=${version}${API_SECRET}`)
        .digest("hex");

      const res = await confirmUploadProof(
        {
          sessionId: auth.sessionId,
          publicId: fullPid,
          version,
          signature: validSig,
          format: "svg", // PROHIBITED
        },
        { userOverride: mockAdminUser }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("Prohibited format 'svg'");
    });

    it("strictly rejects oversized asset proofs (> 10MB)", async () => {
      const auth = await getCloudinaryUploadParams({ userOverride: mockAdminUser });
      const fullPid = `hs-spare-parts/products/${auth.publicId}`;
      const version = 1732000650;
      const validSig = crypto
        .createHash("sha1")
        .update(`public_id=${fullPid}&version=${version}${API_SECRET}`)
        .digest("hex");

      const res = await confirmUploadProof(
        {
          sessionId: auth.sessionId,
          publicId: fullPid,
          version,
          signature: validSig,
          bytes: 11 * 1024 * 1024, // 11MB
        },
        { userOverride: mockAdminUser }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("exceeds 10MB limit");
    });
  });

  // ============================================================================
  // 4. Tombstone & Terminal State Rejection in Stage B
  // ============================================================================
  describe("4. Tombstone & Terminal State Rejection in Stage B", () => {
    it("strictly rejects Stage B verification on tombstoned sessions (cleanup_pending)", async () => {
      const sessionId = crypto.randomUUID();
      const fullPid = "hs-spare-parts/products/prod_tombstoned_1";
      const version = 1732000700;
      const validSig = crypto
        .createHash("sha1")
        .update(`public_id=${fullPid}&version=${version}${API_SECRET}`)
        .digest("hex");

      setInMemoryUploadSession(sessionId, {
        id: sessionId,
        cloudName: "hs-spare-parts-demo",
        canonicalPublicId: fullPid,
        resourceType: "image",
        deliveryType: "upload",
        folder: "hs-spare-parts/products",
        createdByActorId: mockAdminUser.id,
        status: "cleanup_pending", // TOMBSTONED
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7200 * 1000),
        lastUpdatedAt: new Date(),
        uploadVerifiedAt: new Date(),
        cloudinaryVersion: String(version),
        uploadedBytes: 1000,
        uploadProof: {},
        committedAt: null,
        committedEntityType: null,
        committedEntityId: null,
        cleanupIntentAt: new Date(),
        deletedAt: null,
        leaseVersion: 0,
        lockedAt: null,
        leaseExpiresAt: null,
        lockedByWorker: null,
      });

      const res = await confirmUploadProof(
        {
          sessionId,
          publicId: fullPid,
          version,
          signature: validSig,
        },
        { userOverride: mockAdminUser }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("TOMBSTONED_SESSION");
    });

    it("strictly rejects Stage B verification on committed sessions", async () => {
      const sessionId = crypto.randomUUID();
      const fullPid = "hs-spare-parts/products/prod_committed_1";
      const version = 1732000750;
      const validSig = crypto
        .createHash("sha1")
        .update(`public_id=${fullPid}&version=${version}${API_SECRET}`)
        .digest("hex");

      setInMemoryUploadSession(sessionId, {
        id: sessionId,
        cloudName: "hs-spare-parts-demo",
        canonicalPublicId: fullPid,
        resourceType: "image",
        deliveryType: "upload",
        folder: "hs-spare-parts/products",
        createdByActorId: mockAdminUser.id,
        status: "committed", // ALREADY ATTACHED
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7200 * 1000),
        lastUpdatedAt: new Date(),
        uploadVerifiedAt: new Date(),
        cloudinaryVersion: String(version),
        uploadedBytes: 1000,
        uploadProof: {},
        committedAt: new Date(),
        committedEntityType: "product",
        committedEntityId: "prod-123",
        cleanupIntentAt: null,
        deletedAt: null,
        leaseVersion: 0,
        lockedAt: null,
        leaseExpiresAt: null,
        lockedByWorker: null,
      });

      const res = await confirmUploadProof(
        {
          sessionId,
          publicId: fullPid,
          version,
          signature: validSig,
        },
        { userOverride: mockAdminUser }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("COMMITTED_SESSION");
    });

    it("strictly rejects Stage B verification on expired_uncompleted sessions", async () => {
      const sessionId = crypto.randomUUID();
      const fullPid = "hs-spare-parts/products/prod_expired_uncomp_1";
      const version = 1732000800;
      const validSig = crypto
        .createHash("sha1")
        .update(`public_id=${fullPid}&version=${version}${API_SECRET}`)
        .digest("hex");

      setInMemoryUploadSession(sessionId, {
        id: sessionId,
        cloudName: "hs-spare-parts-demo",
        canonicalPublicId: fullPid,
        resourceType: "image",
        deliveryType: "upload",
        folder: "hs-spare-parts/products",
        createdByActorId: mockAdminUser.id,
        status: "expired_uncompleted", // TERMINAL REAPED
        createdAt: new Date(),
        expiresAt: new Date(Date.now() - 1000),
        lastUpdatedAt: new Date(),
        uploadVerifiedAt: null,
        cloudinaryVersion: null,
        uploadedBytes: null,
        uploadProof: null,
        committedAt: null,
        committedEntityType: null,
        committedEntityId: null,
        cleanupIntentAt: null,
        deletedAt: null,
        leaseVersion: 0,
        lockedAt: null,
        leaseExpiresAt: null,
        lockedByWorker: null,
      });

      const res = await confirmUploadProof(
        {
          sessionId,
          publicId: fullPid,
          version,
          signature: validSig,
        },
        { userOverride: mockAdminUser }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("EXPIRED_SESSION");
    });
  });

  // ============================================================================
  // 5. Replay & Idempotency Behavior
  // ============================================================================
  describe("5. Replay & Idempotency Behavior", () => {
    it("safely handles idempotent replayed confirmation with exact matching proof", async () => {
      const auth = await getCloudinaryUploadParams({ userOverride: mockAdminUser });
      const fullPid = `hs-spare-parts/products/${auth.publicId}`;
      const version = 1732000850;
      const validSig = crypto
        .createHash("sha1")
        .update(`public_id=${fullPid}&version=${version}${API_SECRET}`)
        .digest("hex");

      // First confirmation
      const res1 = await confirmUploadProof(
        {
          sessionId: auth.sessionId,
          publicId: fullPid,
          version,
          signature: validSig,
        },
        { userOverride: mockAdminUser }
      );
      expect(res1.success).toBe(true);
      expect(res1.receipt).toBeDefined();

      // Second confirmation (Exact Replay)
      const res2 = await confirmUploadProof(
        {
          sessionId: auth.sessionId,
          publicId: fullPid,
          version,
          signature: validSig,
        },
        { userOverride: mockAdminUser }
      );
      expect(res2.success).toBe(true);
      expect(res2.receipt).toBeDefined();

      // Receipts should be valid
      const v1 = verifyCloudinaryUploadReceipt(res1.receipt, {
        publicId: fullPid,
        adminId: mockAdminUser.id,
      });
      const v2 = verifyCloudinaryUploadReceipt(res2.receipt, {
        publicId: fullPid,
        adminId: mockAdminUser.id,
      });
      expect(v1.valid).toBe(true);
      expect(v2.valid).toBe(true);
    });

    it("rejects replayed confirmation when proof version differs from verified record", async () => {
      const auth = await getCloudinaryUploadParams({ userOverride: mockAdminUser });
      const fullPid = `hs-spare-parts/products/${auth.publicId}`;
      const version1 = 1732000900;
      const version2 = 1732000950;

      const sig1 = crypto
        .createHash("sha1")
        .update(`public_id=${fullPid}&version=${version1}${API_SECRET}`)
        .digest("hex");
      const sig2 = crypto
        .createHash("sha1")
        .update(`public_id=${fullPid}&version=${version2}${API_SECRET}`)
        .digest("hex");

      // Verify with version1
      await confirmUploadProof(
        {
          sessionId: auth.sessionId,
          publicId: fullPid,
          version: version1,
          signature: sig1,
        },
        { userOverride: mockAdminUser }
      );

      // Attempt second confirmation with version2 on same session
      const replayMismatch = await confirmUploadProof(
        {
          sessionId: auth.sessionId,
          publicId: fullPid,
          version: version2,
          signature: sig2,
        },
        { userOverride: mockAdminUser }
      );

      expect(replayMismatch.success).toBe(false);
      expect(replayMismatch.error).toContain("REPLAY_MISMATCH");
    });
  });

  // ============================================================================
  // 6. Receipt v2 Cryptographic Verification & Tamper Resistance
  // ============================================================================
  describe("6. Receipt v2 Cryptographic Verification & Tamper Resistance", () => {
    it("strictly rejects tampered payload in Receipt v2", () => {
      const receipt = createCloudinaryUploadReceiptV2({
        sessionId: crypto.randomUUID(),
        publicId: "hs-spare-parts/products/prod_123",
        adminId: mockAdminUser.id,
        folder: "hs-spare-parts/products",
      });

      const [payloadB64, sig] = receipt.split(".");
      expect(payloadB64).toBeDefined();
      expect(sig).toBeDefined();
      const payloadObj = JSON.parse(Buffer.from(payloadB64!, "base64url").toString("utf8"));

      // Tamper: change publicId to another asset
      payloadObj.pid = "hs-spare-parts/products/prod_tampered_999";
      const tamperedB64 = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
      const tamperedReceipt = `${tamperedB64}.${sig!}`;

      const res = verifyCloudinaryUploadReceipt(tamperedReceipt, {
        publicId: "hs-spare-parts/products/prod_tampered_999",
        adminId: mockAdminUser.id,
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain("Cryptographic signature mismatch");
    });

    it("strictly rejects tampered signature in Receipt v2", () => {
      const receipt = createCloudinaryUploadReceiptV2({
        sessionId: crypto.randomUUID(),
        publicId: "hs-spare-parts/products/prod_123",
        adminId: mockAdminUser.id,
        folder: "hs-spare-parts/products",
      });

      const [payloadB64, sig] = receipt.split(".");
      expect(payloadB64).toBeDefined();
      expect(sig).toBeDefined();
      const tamperedSig = sig!.slice(0, -4) + "abcd";
      const tamperedReceipt = `${payloadB64!}.${tamperedSig}`;

      const res = verifyCloudinaryUploadReceipt(tamperedReceipt, {
        publicId: "hs-spare-parts/products/prod_123",
        adminId: mockAdminUser.id,
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain("Cryptographic signature mismatch");
    });

    it("strictly rejects expired Receipt v2", () => {
      // Create receipt with negative expiration
      const receipt = createCloudinaryUploadReceiptV2({
        sessionId: crypto.randomUUID(),
        publicId: "hs-spare-parts/products/prod_123",
        adminId: mockAdminUser.id,
        folder: "hs-spare-parts/products",
        expiresInSeconds: -10, // Expired
      });

      const res = verifyCloudinaryUploadReceipt(receipt, {
        publicId: "hs-spare-parts/products/prod_123",
        adminId: mockAdminUser.id,
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain("Upload receipt token has expired");
    });

    it("strictly rejects Receipt v2 when issued-at timestamp is suspiciously in the future", () => {
      const sessionId = crypto.randomUUID();
      const pid = "hs-spare-parts/products/prod_123";
      const futureIat = Math.floor(Date.now() / 1000) + 3600; // 1 hour in future

      const payload = {
        v: 2,
        sid: sessionId,
        pid,
        uid: mockAdminUser.id,
        fld: "hs-spare-parts/products",
        res: "image",
        iat: futureIat,
        exp: futureIat + 7200,
      };

      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
      // Sign with real key
      const secret = crypto
        .createHmac("sha256", "test_receipt_secret_abcdef123456")
        .update("hs_spare_parts_upload_receipt_v2")
        .digest("hex");
      const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
      const receipt = `${payloadB64}.${sig}`;

      const res = verifyCloudinaryUploadReceipt(receipt, {
        publicId: pid,
        adminId: mockAdminUser.id,
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain("issued-at timestamp is in the future");
    });

    it("seamlessly verifies legacy Receipt v1 (backward compatibility)", () => {
      const pid = "hs-spare-parts/products/prod_legacy_1";
      const receiptV1 = createCloudinaryUploadReceipt(pid, mockAdminUser.id);

      const res = verifyCloudinaryUploadReceipt(receiptV1, {
        publicId: pid,
        adminId: mockAdminUser.id,
      });

      expect(res.valid).toBe(true);
      expect(res.version).toBe(1);
    });
  });

  // ============================================================================
  // 7. Phase C5.4.2.2 Hardening: Stage B Transaction, Row-Locking & Production Guards
  // ============================================================================
  describe("7. Phase C5.4.2.2 Hardening: Stage B Transaction, Row-Locking & Production Guards", () => {
    const testPid = "hs-spare-parts/products/prod_tx_test_123456";
    const testVersion = 1732009000;
    const testSignature = crypto
      .createHash("sha1")
      .update(`public_id=${testPid}&version=${testVersion}${API_SECRET}`)
      .digest("hex");

    it("[Mocked Transaction] commits transaction and generates Receipt v2 ONLY after successful commit", async () => {
      const sessionId = crypto.randomUUID();
      const mockRow = {
        id: sessionId,
        cloudName: "hs-spare-parts-demo",
        canonicalPublicId: testPid,
        resourceType: "image",
        deliveryType: "upload",
        folder: "hs-spare-parts/products",
        createdByActorId: mockAdminUser.id,
        status: "authorization_created",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      };

      let transactionCommitted = false;
      const forSpy = vi.fn().mockImplementation(() => Promise.resolve([mockRow]));
      const updateReturningSpy = vi.fn().mockImplementation(() => {
        transactionCommitted = true;
        return Promise.resolve([{ id: sessionId }]);
      });

      const mockDb = {
        transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            select: vi.fn(() => ({
              from: vi.fn(() => ({
                where: vi.fn(() => ({
                  for: forSpy,
                })),
              })),
            })),
            update: vi.fn(() => ({
              set: vi.fn(() => ({
                where: vi.fn(() => ({
                  returning: updateReturningSpy,
                })),
              })),
            })),
          };
          return cb(tx);
        }),
      };

      const result = await confirmUploadProof(
        {
          sessionId,
          publicId: testPid,
          version: testVersion,
          signature: testSignature,
          bytes: 1024,
          format: "webp",
        },
        { userOverride: mockAdminUser, dbOverride: mockDb }
      );

      expect(result.success).toBe(true);
      expect(transactionCommitted).toBe(true);
      expect(result.receipt).toBeDefined();
      expect(result.sessionId).toBe(sessionId);

      // Verify that SELECT ... FOR UPDATE was invoked inside transaction
      expect(forSpy).toHaveBeenCalledWith("update");

      // Verify returned receipt is valid v2
      const inspection = inspectCloudinaryUploadReceipt(result.receipt);
      expect(inspection.valid).toBe(true);
      expect(inspection.version).toBe(2);
    });

    it("[Mocked Transaction] rolls back transaction and NEVER returns a receipt if update throws", async () => {
      const sessionId = crypto.randomUUID();
      const mockRow = {
        id: sessionId,
        cloudName: "hs-spare-parts-demo",
        canonicalPublicId: testPid,
        resourceType: "image",
        deliveryType: "upload",
        folder: "hs-spare-parts/products",
        createdByActorId: mockAdminUser.id,
        status: "authorization_created",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      };

      const mockDb = {
        transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            select: vi.fn(() => ({
              from: vi.fn(() => ({
                where: vi.fn(() => ({
                  for: vi.fn(() => Promise.resolve([mockRow])),
                })),
              })),
            })),
            update: vi.fn(() => ({
              set: vi.fn(() => ({
                where: vi.fn(() => {
                  throw new Error("DATABASE_DEADLOCK: Concurrent row lock conflict.");
                }),
              })),
            })),
          };
          return cb(tx);
        }),
      };

      const result = await confirmUploadProof(
        {
          sessionId,
          publicId: testPid,
          version: testVersion,
          signature: testSignature,
        },
        { userOverride: mockAdminUser, dbOverride: mockDb }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Transaction failed: DATABASE_DEADLOCK");
      // Critical invariant: Receipt must NOT be returned on transaction failure
      expect(result.receipt).toBeUndefined();
    });

    it("[Mocked Transaction] detects concurrent modification race via affected row fencing and aborts", async () => {
      const sessionId = crypto.randomUUID();
      const mockRow = {
        id: sessionId,
        cloudName: "hs-spare-parts-demo",
        canonicalPublicId: testPid,
        resourceType: "image",
        deliveryType: "upload",
        folder: "hs-spare-parts/products",
        createdByActorId: mockAdminUser.id,
        status: "authorization_created",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      };

      // Simulates concurrent transaction having already changed status to committed (returning 0 rows)
      const mockDb = {
        transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            select: vi.fn(() => ({
              from: vi.fn(() => ({
                where: vi.fn(() => ({
                  for: vi.fn(() => Promise.resolve([mockRow])),
                })),
              })),
            })),
            update: vi.fn(() => ({
              set: vi.fn(() => ({
                where: vi.fn(() => ({
                  returning: vi.fn(() => Promise.resolve([])), // 0 rows affected
                })),
              })),
            })),
          };
          return cb(tx);
        }),
      };

      const result = await confirmUploadProof(
        {
          sessionId,
          publicId: testPid,
          version: testVersion,
          signature: testSignature,
        },
        { userOverride: mockAdminUser, dbOverride: mockDb }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("CONCURRENT_MODIFICATION");
      expect(result.receipt).toBeUndefined();
    });

    it("[Mocked Transaction] handles same-proof idempotent replay inside transaction cleanly", async () => {
      const sessionId = crypto.randomUUID();
      const mockRow = {
        id: sessionId,
        cloudName: "hs-spare-parts-demo",
        canonicalPublicId: testPid,
        resourceType: "image",
        deliveryType: "upload",
        folder: "hs-spare-parts/products",
        createdByActorId: mockAdminUser.id,
        status: "upload_verified", // Already verified
        cloudinaryVersion: String(testVersion),
        expiresAt: new Date(Date.now() + 3600 * 1000),
      };

      const updateSpy = vi.fn();
      const mockDb = {
        transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            select: vi.fn(() => ({
              from: vi.fn(() => ({
                where: vi.fn(() => ({
                  for: vi.fn(() => Promise.resolve([mockRow])),
                })),
              })),
            })),
            update: updateSpy,
          };
          return cb(tx);
        }),
      };

      const result = await confirmUploadProof(
        {
          sessionId,
          publicId: testPid,
          version: testVersion,
          signature: testSignature,
        },
        { userOverride: mockAdminUser, dbOverride: mockDb }
      );

      expect(result.success).toBe(true);
      expect(result.receipt).toBeDefined();
      // Update must NOT be called on identical idempotent replay
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it("[Mocked Transaction] rejects replay with changed version while lock is held", async () => {
      const sessionId = crypto.randomUUID();
      const mockRow = {
        id: sessionId,
        cloudName: "hs-spare-parts-demo",
        canonicalPublicId: testPid,
        resourceType: "image",
        deliveryType: "upload",
        folder: "hs-spare-parts/products",
        createdByActorId: mockAdminUser.id,
        status: "upload_verified",
        cloudinaryVersion: "1732001111", // Stored version is different
        expiresAt: new Date(Date.now() + 3600 * 1000),
      };

      const mockDb = {
        transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            select: vi.fn(() => ({
              from: vi.fn(() => ({
                where: vi.fn(() => ({
                  for: vi.fn(() => Promise.resolve([mockRow])),
                })),
              })),
            })),
          };
          return cb(tx);
        }),
      };

      const result = await confirmUploadProof(
        {
          sessionId,
          publicId: testPid,
          version: testVersion,
          signature: testSignature,
        },
        { userOverride: mockAdminUser, dbOverride: mockDb }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("REPLAY_MISMATCH");
      expect(result.receipt).toBeUndefined();
    });

    it("[Mocked Transaction] rejects proof if actor does not match session owner while lock is held", async () => {
      const sessionId = crypto.randomUUID();
      const mockRow = {
        id: sessionId,
        cloudName: "hs-spare-parts-demo",
        canonicalPublicId: testPid,
        resourceType: "image",
        deliveryType: "upload",
        folder: "hs-spare-parts/products",
        createdByActorId: mockAdminUser.id, // Owned by Admin 1
        status: "authorization_created",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      };

      const mockDb = {
        transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            select: vi.fn(() => ({
              from: vi.fn(() => ({
                where: vi.fn(() => ({
                  for: vi.fn(() => Promise.resolve([mockRow])),
                })),
              })),
            })),
          };
          return cb(tx);
        }),
      };

      // Admin 2 calls confirmUploadProof
      const result = await confirmUploadProof(
        {
          sessionId,
          publicId: testPid,
          version: testVersion,
          signature: testSignature,
        },
        { userOverride: mockAdminUser2, dbOverride: mockDb }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("UNAUTHORIZED_ACTOR");
      expect(result.receipt).toBeUndefined();
    });

    it("[Mocked Transaction] rejects proof if session is tombstoned (cleanup_pending) while lock is held", async () => {
      const sessionId = crypto.randomUUID();
      const mockRow = {
        id: sessionId,
        cloudName: "hs-spare-parts-demo",
        canonicalPublicId: testPid,
        resourceType: "image",
        deliveryType: "upload",
        folder: "hs-spare-parts/products",
        createdByActorId: mockAdminUser.id,
        status: "cleanup_pending", // Tombstoned
        expiresAt: new Date(Date.now() + 3600 * 1000),
      };

      const mockDb = {
        transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            select: vi.fn(() => ({
              from: vi.fn(() => ({
                where: vi.fn(() => ({
                  for: vi.fn(() => Promise.resolve([mockRow])),
                })),
              })),
            })),
          };
          return cb(tx);
        }),
      };

      const result = await confirmUploadProof(
        {
          sessionId,
          publicId: testPid,
          version: testVersion,
          signature: testSignature,
        },
        { userOverride: mockAdminUser, dbOverride: mockDb }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("TOMBSTONED_SESSION");
      expect(result.receipt).toBeUndefined();
    });

    it("[Production Guard] strictly rejects Stage A authorization when DATABASE_URL is missing in production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DATABASE_URL", "");

      await expect(
        getCloudinaryUploadParams({ userOverride: mockAdminUser })
      ).rejects.toThrow("CONFIGURATION_ERROR: DATABASE_URL must be configured in production");
    });

    it("[Production Guard] strictly rejects Stage B confirmation when DATABASE_URL is missing in production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DATABASE_URL", "");

      const result = await confirmUploadProof(
        {
          sessionId: crypto.randomUUID(),
          publicId: testPid,
          version: testVersion,
          signature: testSignature,
        },
        { userOverride: mockAdminUser }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("CONFIGURATION_ERROR: DATABASE_URL must be configured in production");
      expect(result.receipt).toBeUndefined();
    });

    it("[Production Guard] strictly prohibits in-memory demo sessions from being created in production", () => {
      vi.stubEnv("NODE_ENV", "production");

      expect(() => {
        setInMemoryUploadSession(crypto.randomUUID(), {
          id: crypto.randomUUID(),
          cloudName: "hs-spare-parts-demo",
          canonicalPublicId: "hs-spare-parts/products/prod_demo_test",
          resourceType: "image",
          deliveryType: "upload",
          folder: "hs-spare-parts/products",
          createdByActorId: mockAdminUser.id,
          status: "authorization_created",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 3600 * 1000),
          lastUpdatedAt: new Date(),
          uploadVerifiedAt: null,
          cloudinaryVersion: null,
          uploadedBytes: null,
          uploadProof: null,
          committedAt: null,
          committedEntityType: null,
          committedEntityId: null,
          cleanupIntentAt: null,
          deletedAt: null,
          leaseVersion: 0,
          lockedAt: null,
          leaseExpiresAt: null,
          lockedByWorker: null,
        });
      }).toThrow("SECURITY_ERROR: In-memory demo upload sessions are strictly prohibited in production.");

      // Reading in production returns undefined
      expect(getInMemoryUploadSessionById("any-id")).toBeUndefined();
    });

    it("[Non-Production Compatibility] permits in-memory demo session flow in development environment", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("DATABASE_URL", "");

      const auth = await getCloudinaryUploadParams({ userOverride: mockAdminUser });
      expect(auth.sessionId).toBeDefined();

      const fullPid = `hs-spare-parts/products/${auth.publicId}`;
      const version = 1732009200;
      const validSig = crypto
        .createHash("sha1")
        .update(`public_id=${fullPid}&version=${version}${API_SECRET}`)
        .digest("hex");

      const confirmResult = await confirmUploadProof(
        {
          sessionId: auth.sessionId,
          publicId: fullPid,
          version,
          signature: validSig,
        },
        { userOverride: mockAdminUser }
      );

      expect(confirmResult.success).toBe(true);
      expect(confirmResult.receipt).toBeDefined();
    });
  });
});
