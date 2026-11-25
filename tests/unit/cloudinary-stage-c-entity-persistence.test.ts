import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import {
  verifyAndCommitMediaUploadSessions,
  createCloudinaryUploadReceipt,
  createCloudinaryUploadReceiptV2,
  CLOUDINARY_FOLDERS,
} from "@/lib/cloudinary";
import {
  createAdminProduct,
  updateAdminProduct,
  updateAdminCategoryImage,
  updateAdminBrandLogo,
  updateAdminBanners,
} from "@/features/admin/service";
import {
  resetInMemoryDemoState,
  setInMemoryUploadSession,
  getInMemoryUploadSessionById,
} from "@/server/catalogue/demo-state";
import { ROLES, PERMISSIONS } from "@/lib/auth/rbac";
import type { SafeUser } from "@/features/auth/service";

describe("Cloudinary Phase C5.4.3: Stage C Secure Entity Persistence", () => {
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

  const API_SECRET = "test_cloudinary_api_secret_998877";
  const RECEIPT_SECRET = "test_receipt_secret_abcdef123456";

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", ""); // in-memory demo mode by default
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "hs-spare-parts-demo");
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_API_KEY", "123456789012345");
    vi.stubEnv("CLOUDINARY_API_SECRET", API_SECRET);
    vi.stubEnv("CLOUDINARY_RECEIPT_SECRET", RECEIPT_SECRET);
    resetInMemoryDemoState();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function seedVerifiedSession(overrides?: Partial<Parameters<typeof setInMemoryUploadSession>[1]>) {
    const sessionId = overrides?.id || crypto.randomUUID();
    const storageKey = overrides?.canonicalPublicId || `hs-spare-parts/products/prod_${Date.now()}`;
    const folder = overrides?.folder || CLOUDINARY_FOLDERS.products;
    const actorId = overrides?.createdByActorId || mockAdminUser.id;

    const sessionData = {
      id: sessionId,
      cloudName: "hs-spare-parts-demo",
      canonicalPublicId: storageKey,
      resourceType: "image" as const,
      deliveryType: "upload" as const,
      folder,
      createdByActorId: actorId,
      status: "upload_verified" as const,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600 * 1000),
      lastUpdatedAt: new Date(),
      uploadVerifiedAt: new Date(),
      cloudinaryVersion: "1732000000",
      uploadedBytes: 10240,
      uploadProof: { version: "1732000000" },
      committedAt: null,
      committedEntityType: null,
      committedEntityId: null,
      cleanupIntentAt: null,
      deletedAt: null,
      leaseVersion: 0,
      lockedAt: null,
      leaseExpiresAt: null,
      lockedByWorker: null,
      ...overrides,
    };

    setInMemoryUploadSession(sessionId, sessionData);

    const receipt = createCloudinaryUploadReceiptV2({
      sessionId,
      publicId: storageKey,
      adminId: actorId,
      folder,
      resourceType: "image",
    });

    return { sessionId, storageKey, folder, actorId, receipt, sessionData };
  }

  // ============================================================================
  // 1. Receipt v2 Exclusivity & Signature Integrity
  // ============================================================================
  describe("1. Receipt v2 Exclusivity & Integrity", () => {
    it("strictly rejects Receipt v1 tokens for entity attachment", async () => {
      const storageKey = "hs-spare-parts/products/prod_v1_test";
      const v1Receipt = createCloudinaryUploadReceipt(storageKey, mockAdminUser.id);

      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null,
          attachments: [
            {
              storageKey,
              uploadReceipt: v1Receipt,
              fieldName: "images[0]",
            },
          ],
          entityType: "product",
          entityId: "prod-test-01",
          actorId: mockAdminUser.id,
          expectedFolder: CLOUDINARY_FOLDERS.products,
        })
      ).rejects.toThrow("RECEIPT_VERSION_FORBIDDEN");
    });

    it("strictly rejects malformed or unparseable receipt strings", async () => {
      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null,
          attachments: [
            {
              storageKey: "hs-spare-parts/products/prod_bad",
              uploadReceipt: "not.a.valid.jwt.token",
              fieldName: "images[0]",
            },
          ],
          entityType: "product",
          entityId: "prod-test-01",
          actorId: mockAdminUser.id,
          expectedFolder: CLOUDINARY_FOLDERS.products,
        })
      ).rejects.toThrow("Invalid upload receipt");
    });

    it("strictly rejects receipts with forged or mismatched HMAC signatures", async () => {
      const { storageKey, receipt } = seedVerifiedSession();
      const [payloadB64] = receipt.split(".");
      const forgedReceipt = `${payloadB64}.forged_signature_xyz`;

      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null,
          attachments: [
            {
              storageKey,
              uploadReceipt: forgedReceipt,
              fieldName: "images[0]",
            },
          ],
          entityType: "product",
          entityId: "prod-test-01",
          actorId: mockAdminUser.id,
          expectedFolder: CLOUDINARY_FOLDERS.products,
        })
      ).rejects.toThrow("Cryptographic signature mismatch");
    });

    it("strictly rejects expired upload receipts", async () => {
      const { sessionId, storageKey, folder, actorId } = seedVerifiedSession();

      const expiredReceipt = createCloudinaryUploadReceiptV2({
        sessionId,
        publicId: storageKey,
        adminId: actorId,
        folder,
        resourceType: "image",
        expiresInSeconds: -3600, // expired 1 hr ago
      });

      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null,
          attachments: [
            {
              storageKey,
              uploadReceipt: expiredReceipt,
              fieldName: "images[0]",
            },
          ],
          entityType: "product",
          entityId: "prod-test-01",
          actorId,
          expectedFolder: folder,
        })
      ).rejects.toThrow("Upload receipt token has expired");
    });
  });

  // ============================================================================
  // 2. Identity Tuple Verification (Actor, Folder, Public ID, Entity)
  // ============================================================================
  describe("2. Identity Tuple Verification", () => {
    it("strictly rejects attachment when receipt actor (sub) does not match the active authenticated admin", async () => {
      const { storageKey, receipt } = seedVerifiedSession({
        createdByActorId: mockAdminUser2.id,
      });

      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null,
          attachments: [{ storageKey, uploadReceipt: receipt }],
          entityType: "product",
          entityId: "prod-test-01",
          actorId: mockAdminUser.id, // DIFFERENT ACTOR
          expectedFolder: CLOUDINARY_FOLDERS.products,
        })
      ).rejects.toThrow("Receipt admin mismatch");
    });

    it("strictly rejects attachment when receipt folder does not match expected folder", async () => {
      const { storageKey, receipt } = seedVerifiedSession({
        folder: CLOUDINARY_FOLDERS.categories,
      });

      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null,
          attachments: [{ storageKey, uploadReceipt: receipt }],
          entityType: "product",
          entityId: "prod-test-01",
          actorId: mockAdminUser.id,
          expectedFolder: CLOUDINARY_FOLDERS.products, // MISMATCH
        })
      ).rejects.toThrow("Receipt folder mismatch");
    });

    it("strictly rejects attachment when storageKey does not match receipt public ID (pid)", async () => {
      const { receipt } = seedVerifiedSession();

      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null,
          attachments: [
            {
              storageKey: "hs-spare-parts/products/different_storage_key",
              uploadReceipt: receipt,
            },
          ],
          entityType: "product",
          entityId: "prod-test-01",
          actorId: mockAdminUser.id,
          expectedFolder: CLOUDINARY_FOLDERS.products,
        })
      ).rejects.toThrow("Receipt asset mismatch");
    });

    it("strictly rejects attachment when session is not found in registry", async () => {
      const missingSessionId = crypto.randomUUID();
      const storageKey = "hs-spare-parts/products/prod_missing_session";
      const receipt = createCloudinaryUploadReceiptV2({
        sessionId: missingSessionId,
        publicId: storageKey,
        adminId: mockAdminUser.id,
        folder: CLOUDINARY_FOLDERS.products,
        resourceType: "image",
      });

      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null,
          attachments: [{ storageKey, uploadReceipt: receipt }],
          entityType: "product",
          entityId: "prod-test-01",
          actorId: mockAdminUser.id,
          expectedFolder: CLOUDINARY_FOLDERS.products,
        })
      ).rejects.toThrow(`UNKNOWN_SESSION: Media upload session '${missingSessionId}' does not exist in demo registry`);
    });

    it("strictly rejects attachment when session canonical public ID does not match attachment storage key", async () => {
      const { storageKey, receipt, sessionId } = seedVerifiedSession();
      // Alter canonicalPublicId in session to cause mismatch
      const sess = getInMemoryUploadSessionById(sessionId)!;
      sess.canonicalPublicId = "hs-spare-parts/products/tampered_canonical_pid";

      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null,
          attachments: [{ storageKey, uploadReceipt: receipt }],
          entityType: "product",
          entityId: "prod-test-01",
          actorId: mockAdminUser.id,
          expectedFolder: CLOUDINARY_FOLDERS.products,
        })
      ).rejects.toThrow("IDENTITY_MISMATCH: Session public ID");
    });

    it("strictly rejects attachment when session was authorized by a different actor", async () => {
      const { storageKey, receipt, sessionId } = seedVerifiedSession();
      // Alter createdByActorId in session to cause mismatch
      const sess = getInMemoryUploadSessionById(sessionId)!;
      sess.createdByActorId = mockAdminUser2.id;

      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null,
          attachments: [{ storageKey, uploadReceipt: receipt }],
          entityType: "product",
          entityId: "prod-test-01",
          actorId: mockAdminUser.id,
          expectedFolder: CLOUDINARY_FOLDERS.products,
        })
      ).rejects.toThrow("UNAUTHORIZED_ACTOR: Session actor");
    });
  });

  // ============================================================================
  // 3. Session Lifecycle State Machine Invariants
  // ============================================================================
  describe("3. Session State Machine Invariants", () => {
    it("strictly rejects sessions in authorization_created state (unverified proof)", async () => {
      const { storageKey, receipt } = seedVerifiedSession({
        status: "authorization_created",
      });

      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null,
          attachments: [{ storageKey, uploadReceipt: receipt }],
          entityType: "product",
          entityId: "prod-test-01",
          actorId: mockAdminUser.id,
          expectedFolder: CLOUDINARY_FOLDERS.products,
        })
      ).rejects.toThrow("UNVERIFIED_SESSION: Session");
    });

    it("strictly rejects sessions in expired_uncompleted state", async () => {
      const { storageKey, receipt } = seedVerifiedSession({
        status: "expired_uncompleted",
      });

      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null,
          attachments: [{ storageKey, uploadReceipt: receipt }],
          entityType: "product",
          entityId: "prod-test-01",
          actorId: mockAdminUser.id,
          expectedFolder: CLOUDINARY_FOLDERS.products,
        })
      ).rejects.toThrow("EXPIRED_SESSION: Cannot attach an expired uncompleted media session");
    });

    it("strictly rejects tombstoned sessions in cleanup_pending state", async () => {
      const { storageKey, receipt } = seedVerifiedSession({
        status: "cleanup_pending",
      });

      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null,
          attachments: [{ storageKey, uploadReceipt: receipt }],
          entityType: "product",
          entityId: "prod-test-01",
          actorId: mockAdminUser.id,
          expectedFolder: CLOUDINARY_FOLDERS.products,
        })
      ).rejects.toThrow("TOMBSTONED_SESSION: Cannot attach a condemned or deleted media session");
    });

    it("strictly rejects tombstoned sessions in deletion_in_progress state", async () => {
      const { storageKey, receipt } = seedVerifiedSession({
        status: "deletion_in_progress",
      });

      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null,
          attachments: [{ storageKey, uploadReceipt: receipt }],
          entityType: "product",
          entityId: "prod-test-01",
          actorId: mockAdminUser.id,
          expectedFolder: CLOUDINARY_FOLDERS.products,
        })
      ).rejects.toThrow("TOMBSTONED_SESSION: Cannot attach a condemned or deleted media session");
    });

    it("strictly rejects tombstoned sessions in deleted state", async () => {
      const { storageKey, receipt } = seedVerifiedSession({
        status: "deleted",
      });

      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null,
          attachments: [{ storageKey, uploadReceipt: receipt }],
          entityType: "product",
          entityId: "prod-test-01",
          actorId: mockAdminUser.id,
          expectedFolder: CLOUDINARY_FOLDERS.products,
        })
      ).rejects.toThrow("TOMBSTONED_SESSION: Cannot attach a condemned or deleted media session");
    });
  });

  // ============================================================================
  // 4. Cross-Entity Attachment & Idempotency
  // ============================================================================
  describe("4. Cross-Entity Attachment & Idempotency", () => {
    it("strictly rejects attaching a session committed to a different entity type", async () => {
      const { storageKey, receipt } = seedVerifiedSession({
        status: "committed",
        committedEntityType: "category",
        committedEntityId: "cat-123",
        committedAt: new Date(),
      });

      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null,
          attachments: [{ storageKey, uploadReceipt: receipt }],
          entityType: "product", // Mismatch with "category"
          entityId: "prod-123",
          actorId: mockAdminUser.id,
          expectedFolder: CLOUDINARY_FOLDERS.products,
        })
      ).rejects.toThrow("CROSS_ENTITY_ATTACHMENT: Session");
    });

    it("strictly rejects attaching a session committed to a different entity ID of same type", async () => {
      const { storageKey, receipt } = seedVerifiedSession({
        status: "committed",
        committedEntityType: "product",
        committedEntityId: "prod-original",
        committedAt: new Date(),
      });

      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null,
          attachments: [{ storageKey, uploadReceipt: receipt }],
          entityType: "product",
          entityId: "prod-attacker", // Different product ID!
          actorId: mockAdminUser.id,
          expectedFolder: CLOUDINARY_FOLDERS.products,
        })
      ).rejects.toThrow("CROSS_ENTITY_ATTACHMENT: Session");
    });

    it("permits idempotent retry when session is already committed to the EXACT SAME entity", async () => {
      const { storageKey, receipt, sessionId } = seedVerifiedSession({
        status: "committed",
        committedEntityType: "product",
        committedEntityId: "prod-exact-same",
        committedAt: new Date("2026-11-20T10:00:00Z"),
      });

      // Should succeed cleanly without error
      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null,
          attachments: [{ storageKey, uploadReceipt: receipt }],
          entityType: "product",
          entityId: "prod-exact-same",
          actorId: mockAdminUser.id,
          expectedFolder: CLOUDINARY_FOLDERS.products,
        })
      ).resolves.not.toThrow();

      const session = getInMemoryUploadSessionById(sessionId)!;
      expect(session.status).toBe("committed");
      expect(session.committedEntityType).toBe("product");
      expect(session.committedEntityId).toBe("prod-exact-same");
    });
  });

  // ============================================================================
  // 5. Multi-Asset Ordering, Locking & Duplicate Prevention
  // ============================================================================
  describe("5. Multi-Asset Ordering & Deadlock Prevention", () => {
    it("strictly rejects duplicate session IDs within the same attachment list", async () => {
      const { storageKey, receipt } = seedVerifiedSession();

      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null,
          attachments: [
            { storageKey, uploadReceipt: receipt, fieldName: "images[0]" },
            { storageKey, uploadReceipt: receipt, fieldName: "images[1]" }, // Duplicate session
          ],
          entityType: "product",
          entityId: "prod-multi-test",
          actorId: mockAdminUser.id,
          expectedFolder: CLOUDINARY_FOLDERS.products,
        })
      ).rejects.toThrow("DUPLICATE_SESSION: Session");
    });

    it("successfully commits multiple upload sessions atomically", async () => {
      const sessionA = seedVerifiedSession({
        canonicalPublicId: "hs-spare-parts/products/prod_asset_zebra",
      });
      const sessionB = seedVerifiedSession({
        canonicalPublicId: "hs-spare-parts/products/prod_asset_alpha",
      });

      await verifyAndCommitMediaUploadSessions({
        tx: null,
        attachments: [
          { storageKey: sessionA.storageKey, uploadReceipt: sessionA.receipt, fieldName: "images[0]" },
          { storageKey: sessionB.storageKey, uploadReceipt: sessionB.receipt, fieldName: "images[1]" },
        ],
        entityType: "product",
        entityId: "prod-multi-test",
        actorId: mockAdminUser.id,
        expectedFolder: CLOUDINARY_FOLDERS.products,
      });

      const updatedA = getInMemoryUploadSessionById(sessionA.sessionId)!;
      const updatedB = getInMemoryUploadSessionById(sessionB.sessionId)!;

      expect(updatedA.status).toBe("committed");
      expect(updatedA.committedEntityType).toBe("product");
      expect(updatedA.committedEntityId).toBe("prod-multi-test");
      expect(updatedA.committedAt).toBeInstanceOf(Date);

      expect(updatedB.status).toBe("committed");
      expect(updatedB.committedEntityType).toBe("product");
      expect(updatedB.committedEntityId).toBe("prod-multi-test");
      expect(updatedB.committedAt).toBeInstanceOf(Date);
    });
  });

  // ============================================================================
  // 6. Database Transaction & Mock Locking Invariants
  // ============================================================================
  describe("6. Database Transaction & Mock Locking", () => {
    it("executes SELECT ... FOR UPDATE ordered by canonicalPublicId in database mode", async () => {
      const sessionIdA = crypto.randomUUID();
      const sessionIdB = crypto.randomUUID();
      const keyA = "hs-spare-parts/products/asset_zebra";
      const keyB = "hs-spare-parts/products/asset_alpha";

      const receiptA = createCloudinaryUploadReceiptV2({
        sessionId: sessionIdA,
        publicId: keyA,
        adminId: mockAdminUser.id,
        folder: CLOUDINARY_FOLDERS.products,
        resourceType: "image",
      });

      const receiptB = createCloudinaryUploadReceiptV2({
        sessionId: sessionIdB,
        publicId: keyB,
        adminId: mockAdminUser.id,
        folder: CLOUDINARY_FOLDERS.products,
        resourceType: "image",
      });

      const mockRows = [
        {
          id: sessionIdB,
          canonicalPublicId: keyB,
          cloudName: "hs-spare-parts-demo",
          resourceType: "image",
          deliveryType: "upload",
          createdByActorId: mockAdminUser.id,
          folder: CLOUDINARY_FOLDERS.products,
          status: "upload_verified",
          committedEntityType: null,
          committedEntityId: null,
        },
        {
          id: sessionIdA,
          canonicalPublicId: keyA,
          cloudName: "hs-spare-parts-demo",
          resourceType: "image",
          deliveryType: "upload",
          createdByActorId: mockAdminUser.id,
          folder: CLOUDINARY_FOLDERS.products,
          status: "upload_verified",
          committedEntityType: null,
          committedEntityId: null,
        },
      ];

      const forUpdateFn = vi.fn(() => Promise.resolve(mockRows));
      const orderByFn = vi.fn(() => ({ for: forUpdateFn }));
      const whereFn = vi.fn(() => ({ orderBy: orderByFn }));
      const fromFn = vi.fn(() => ({ where: whereFn }));
      const selectFn = vi.fn(() => ({ from: fromFn }));

      const updateSetFn = vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      }));
      const updateFn = vi.fn(() => ({ set: updateSetFn }));

      const mockTx = {
        select: selectFn,
        update: updateFn,
      };

      await verifyAndCommitMediaUploadSessions({
        tx: mockTx,
        attachments: [
          { storageKey: keyA, uploadReceipt: receiptA },
          { storageKey: keyB, uploadReceipt: receiptB },
        ],
        entityType: "product",
        entityId: "prod-tx-test",
        actorId: mockAdminUser.id,
        expectedFolder: CLOUDINARY_FOLDERS.products,
      });

      expect(selectFn).toHaveBeenCalled();
      expect(orderByFn).toHaveBeenCalled();
      expect(forUpdateFn).toHaveBeenCalledWith("update");
      expect(updateFn).toHaveBeenCalledTimes(2);
      expect(updateSetFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "committed",
          committedEntityType: "product",
          committedEntityId: "prod-tx-test",
        })
      );
    });

    it("strictly throws CONFIGURATION_ERROR in production if tx is null", async () => {
      vi.stubEnv("NODE_ENV", "production");

      await expect(
        verifyAndCommitMediaUploadSessions({
          tx: null, // Prohibited in production
          attachments: [
            {
              storageKey: "hs-spare-parts/products/prod_prod_guard",
              uploadReceipt: createCloudinaryUploadReceiptV2({
                sessionId: crypto.randomUUID(),
                publicId: "hs-spare-parts/products/prod_prod_guard",
                adminId: mockAdminUser.id,
                folder: CLOUDINARY_FOLDERS.products,
                resourceType: "image",
              }),
            },
          ],
          entityType: "product",
          entityId: "prod-prod-test",
          actorId: mockAdminUser.id,
          expectedFolder: CLOUDINARY_FOLDERS.products,
        })
      ).rejects.toThrow("CONFIGURATION_ERROR: Database transaction is required in production");
    });
  });

  // ============================================================================
  // 7. Full Entity Flows (Product, Category, Brand, Banner)
  // ============================================================================
  describe("7. Full Entity Flows with Stage C Integration", () => {
    it("createAdminProduct: commits media upload sessions and rejects Receipt v1", async () => {
      // 1. Rejects Receipt v1
      const v1Key = "hs-spare-parts/products/prod_v1_fail";
      const v1Receipt = createCloudinaryUploadReceipt(v1Key, mockAdminUser.id);

      await expect(
        createAdminProduct(
          {
            name: "Test Brake Pad",
            sku: "BRK-PAD-001",
            brandId: "brand-1",
            categoryId: "cat-2",
            priceMinor: 150000,
            condition: "new",
            images: [
              {
                url: `https://res.cloudinary.com/hs-spare-parts-demo/image/upload/${v1Key}.webp`,
                storageKey: v1Key,
                uploadReceipt: v1Receipt,
                isPrimary: true,
                sortOrder: 1,
              },
            ],
          },
          mockAdminUser
        )
      ).rejects.toThrow("RECEIPT_VERSION_FORBIDDEN: Only Receipt v2 is permitted");

      // 2. Succeeds with verified Receipt v2
      const session = seedVerifiedSession();
      const createRes = await createAdminProduct(
        {
          name: "Test Brake Pad V2",
          sku: "BRK-PAD-002",
          brandId: "brand-1",
          categoryId: "cat-2",
          priceMinor: 180000,
          condition: "new",
          images: [
            {
              url: `https://res.cloudinary.com/hs-spare-parts-demo/image/upload/${session.storageKey}.webp`,
              storageKey: session.storageKey,
              uploadReceipt: session.receipt,
              isPrimary: true,
              sortOrder: 1,
            },
          ],
        },
        mockAdminUser
      );

      expect(createRes.success).toBe(true);
      expect(createRes.productId).toBeDefined();

      const committedSession = getInMemoryUploadSessionById(session.sessionId)!;
      expect(committedSession.status).toBe("committed");
      expect(committedSession.committedEntityType).toBe("product");
      expect(committedSession.committedEntityId).toBe(createRes.productId);
    });

    it("updateAdminProduct: commits new media upload sessions atomically", async () => {
      const initialSession = seedVerifiedSession();
      const product = await createAdminProduct(
        {
          name: "Clutch Plate",
          sku: "CLT-001",
          brandId: "brand-1",
          categoryId: "cat-4",
          priceMinor: 250000,
          condition: "new",
          images: [
            {
              url: `https://res.cloudinary.com/hs-spare-parts-demo/image/upload/${initialSession.storageKey}.webp`,
              storageKey: initialSession.storageKey,
              uploadReceipt: initialSession.receipt,
              isPrimary: true,
              sortOrder: 1,
            },
          ],
        },
        mockAdminUser
      );

      const newSession = seedVerifiedSession();
      const updateRes = await updateAdminProduct(
        {
          id: product.productId,
          name: "Clutch Plate Pro",
          images: [
            {
              url: `https://res.cloudinary.com/hs-spare-parts-demo/image/upload/${newSession.storageKey}.webp`,
              storageKey: newSession.storageKey,
              uploadReceipt: newSession.receipt,
              isPrimary: true,
              sortOrder: 1,
            },
          ],
        },
        mockAdminUser
      );

      expect(updateRes.success).toBe(true);
      const committedNew = getInMemoryUploadSessionById(newSession.sessionId)!;
      expect(committedNew.status).toBe("committed");
      expect(committedNew.committedEntityType).toBe("product");
      expect(committedNew.committedEntityId).toBe(product.productId);
    });

    it("updateAdminCategoryImage: commits category image session and rejects Receipt v1", async () => {
      const v1Key = "hs-spare-parts/categories/cat_v1_fail";
      const v1Receipt = createCloudinaryUploadReceipt(v1Key, mockAdminUser.id);

      await expect(
        updateAdminCategoryImage(
          {
            id: "cat-2",
            imageUrl: `https://res.cloudinary.com/hs-spare-parts-demo/image/upload/${v1Key}.webp`,
            storageKey: v1Key,
            uploadReceipt: v1Receipt,
          },
          mockAdminUser
        )
      ).rejects.toThrow("RECEIPT_VERSION_FORBIDDEN");

      const session = seedVerifiedSession({
        folder: CLOUDINARY_FOLDERS.categories,
        canonicalPublicId: "hs-spare-parts/categories/cat_brakes_img",
      });

      const res = await updateAdminCategoryImage(
        {
          id: "cat-2",
          imageUrl: `https://res.cloudinary.com/hs-spare-parts-demo/image/upload/${session.storageKey}.webp`,
          storageKey: session.storageKey,
          uploadReceipt: session.receipt,
        },
        mockAdminUser
      );

      expect(res.success).toBe(true);
      const committedSession = getInMemoryUploadSessionById(session.sessionId)!;
      expect(committedSession.status).toBe("committed");
      expect(committedSession.committedEntityType).toBe("category");
      expect(committedSession.committedEntityId).toBe("cat-2");
    });

    it("updateAdminBrandLogo: commits brand logo session and rejects Receipt v1", async () => {
      const v1Key = "hs-spare-parts/brands/brand_v1_fail";
      const v1Receipt = createCloudinaryUploadReceipt(v1Key, mockAdminUser.id);

      await expect(
        updateAdminBrandLogo(
          {
            id: "brand-1",
            logoUrl: `https://res.cloudinary.com/hs-spare-parts-demo/image/upload/${v1Key}.webp`,
            storageKey: v1Key,
            uploadReceipt: v1Receipt,
          },
          mockAdminUser
        )
      ).rejects.toThrow("RECEIPT_VERSION_FORBIDDEN");

      const session = seedVerifiedSession({
        folder: CLOUDINARY_FOLDERS.brands,
        canonicalPublicId: "hs-spare-parts/brands/brand_bosch_logo",
      });

      const res = await updateAdminBrandLogo(
        {
          id: "brand-1",
          logoUrl: `https://res.cloudinary.com/hs-spare-parts-demo/image/upload/${session.storageKey}.webp`,
          storageKey: session.storageKey,
          uploadReceipt: session.receipt,
        },
        mockAdminUser
      );

      expect(res.success).toBe(true);
      const committedSession = getInMemoryUploadSessionById(session.sessionId)!;
      expect(committedSession.status).toBe("committed");
      expect(committedSession.committedEntityType).toBe("brand");
      expect(committedSession.committedEntityId).toBe("brand-1");
    });

    it("updateAdminBanners: commits desktop and mobile banner sessions and rejects Receipt v1", async () => {
      const v1Key = "hs-spare-parts/banners/banner_v1_fail";
      const v1Receipt = createCloudinaryUploadReceipt(v1Key, mockAdminUser.id);

      await expect(
        updateAdminBanners(
          {
            banners: [
              {
                id: "banner-1",
                title: "Sale",
                altText: "Sale banner",
                desktopImageUrl: `https://res.cloudinary.com/hs-spare-parts-demo/image/upload/${v1Key}.webp`,
                desktopStorageKey: v1Key,
                desktopUploadReceipt: v1Receipt,
              },
            ],
          },
          mockAdminUser
        )
      ).rejects.toThrow("RECEIPT_VERSION_FORBIDDEN: Only Receipt v2 is permitted");

      const desktopSession = seedVerifiedSession({
        folder: CLOUDINARY_FOLDERS.banners,
        canonicalPublicId: "hs-spare-parts/banners/promo_desktop_img",
      });
      const mobileSession = seedVerifiedSession({
        folder: CLOUDINARY_FOLDERS.banners,
        canonicalPublicId: "hs-spare-parts/banners/promo_mobile_img",
      });

      const res = await updateAdminBanners(
        {
          banners: [
            {
              id: "banner-1",
              title: "Summer Monsoon Special",
              altText: "Summer monsoon discount banner",
              desktopImageUrl: `https://res.cloudinary.com/hs-spare-parts-demo/image/upload/${desktopSession.storageKey}.webp`,
              desktopStorageKey: desktopSession.storageKey,
              desktopUploadReceipt: desktopSession.receipt,
              mobileImageUrl: `https://res.cloudinary.com/hs-spare-parts-demo/image/upload/${mobileSession.storageKey}.webp`,
              mobileStorageKey: mobileSession.storageKey,
              mobileUploadReceipt: mobileSession.receipt,
            },
          ],
        },
        mockAdminUser
      );

      expect(res.success).toBe(true);
      const committedDesktop = getInMemoryUploadSessionById(desktopSession.sessionId)!;
      const committedMobile = getInMemoryUploadSessionById(mobileSession.sessionId)!;

      expect(committedDesktop.status).toBe("committed");
      expect(committedDesktop.committedEntityType).toBe("banner");
      expect(committedDesktop.committedEntityId).toBe("homepage_banners");

      expect(committedMobile.status).toBe("committed");
      expect(committedMobile.committedEntityType).toBe("banner");
      expect(committedMobile.committedEntityId).toBe("homepage_banners");
    });
  });
});
