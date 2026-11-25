import "server-only";
import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { mediaUploadSessions, type MediaUploadSession } from "@/lib/db/schema/media";
import { eq, and, inArray, asc } from "drizzle-orm";
import { checkSharedRateLimit } from "@/lib/auth/rate-limit";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { assertAdminCatalogueAccess } from "@/features/admin/service";
import type { SafeUser } from "@/features/auth/service";
import {
  getInMemoryUploadSessionById,
  setInMemoryUploadSession,
  updateInMemoryUploadSession,
} from "@/server/catalogue/demo-state";
import {
  CLOUDINARY_CONFIG,
  CLOUDINARY_FOLDERS,
  type CloudinaryFolder,
  type CloudinarySignedUploadParams,
  type CloudinaryAssetMetadata,
  validateCloudinaryAssetMetadata,
  isValidAssetPublicId,
  isValidProductAssetPublicId,
  isValidCategoryAssetPublicId,
  isValidBrandAssetPublicId,
  isValidBannerAssetPublicId,
  extractCloudinaryStorageKey,
  type CloudinaryTransformOptions,
  type CloudinaryImagePreset,
  type CloudinaryTransformInput,
  CLOUDINARY_IMAGE_PRESETS,
  buildCloudinaryTransformString,
  getOptimizedCloudinaryUrl,
  buildCloudinarySrcSet,
  cloudinaryImageLoader,
} from "./cloudinary-shared";

export {
  CLOUDINARY_CONFIG,
  CLOUDINARY_FOLDERS,
  type CloudinaryFolder,
  type CloudinaryAssetMetadata,
  type CloudinarySignedUploadParams,
  validateCloudinaryAssetMetadata,
  isValidAssetPublicId,
  isValidProductAssetPublicId,
  isValidCategoryAssetPublicId,
  isValidBrandAssetPublicId,
  isValidBannerAssetPublicId,
  extractCloudinaryStorageKey,
  type CloudinaryTransformOptions,
  type CloudinaryImagePreset,
  type CloudinaryTransformInput,
  CLOUDINARY_IMAGE_PRESETS,
  buildCloudinaryTransformString,
  getOptimizedCloudinaryUrl,
  buildCloudinarySrcSet,
  cloudinaryImageLoader,
};

// ==============================================================================
// 1. Upload Receipt Payloads & Signing Infrastructure (v1 and v2)
// ==============================================================================

export interface UploadReceiptPayload {
  pid: string;
  uid: string;
  exp: number;
}

export interface UploadReceiptV2Payload {
  v: 2;
  sid: string;
  pid: string;
  uid: string;
  fld: string;
  res: string;
  iat: number;
  exp: number;
}

function getReceiptSigningKey(version: 1 | 2 = 2): string {
  const secret = process.env.CLOUDINARY_RECEIPT_SECRET || process.env.CLOUDINARY_API_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CONFIGURATION_ERROR: Server secret required to sign upload receipts.");
    }
    return "ephemeral_dev_receipt_secret_123456789";
  }
  const domainTag = version === 1 ? "hs_spare_parts_upload_receipt_v1" : "hs_spare_parts_upload_receipt_v2";
  return crypto.createHmac("sha256", secret).update(domainTag).digest("hex");
}

/**
 * Creates a legacy Receipt v1 (for backward compatibility).
 */
export function createCloudinaryUploadReceipt(
  publicId: string,
  adminId: string,
  expiresInSeconds: number = 7200
): string {
  if (!publicId || !adminId) {
    throw new Error("publicId and adminId are required to create an upload receipt.");
  }
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload: UploadReceiptPayload = { pid: publicId, uid: adminId, exp };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const secret = getReceiptSigningKey(1);
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

/**
 * Creates Receipt v2 binding the permanent session UUID (sid) to the canonical public ID (pid),
 * actor ID (uid), folder (fld), resource type (res), issued-at (iat), and expiry (exp).
 */
export function createCloudinaryUploadReceiptV2(params: {
  sessionId: string;
  publicId: string;
  adminId: string;
  folder: string;
  resourceType?: string;
  expiresInSeconds?: number;
}): string {
  const { sessionId, publicId, adminId, folder, resourceType = "image", expiresInSeconds = 7200 } = params;
  if (!sessionId || !publicId || !adminId || !folder) {
    throw new Error("sessionId, publicId, adminId, and folder are required to create Receipt v2.");
  }
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + expiresInSeconds;
  const payload: UploadReceiptV2Payload = {
    v: 2,
    sid: sessionId,
    pid: publicId,
    uid: adminId,
    fld: folder,
    res: resourceType,
    iat,
    exp,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const secret = getReceiptSigningKey(2);
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

/**
 * Validates a server-signed upload receipt against expected identity coordinates.
 * Supports both Receipt v2 (preferred) and legacy Receipt v1 (backward compatibility).
 * Strictly uses constant-time comparison to prevent timing side-channel attacks.
 */
export function verifyCloudinaryUploadReceipt(
  receipt: unknown,
  expected: {
    publicId: string;
    adminId: string;
    sessionId?: string;
    folder?: string;
    resourceType?: string;
  }
): { valid: boolean; version?: 1 | 2; error?: string } {
  if (typeof receipt !== "string" || !receipt.includes(".")) {
    return { valid: false, error: "Missing or malformed upload receipt token." };
  }

  const [payloadB64, sig] = receipt.split(".");
  if (!payloadB64 || !sig) {
    return { valid: false, error: "Invalid receipt token structure." };
  }

  let payloadObj: Record<string, unknown>;
  try {
    payloadObj = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { valid: false, error: "Failed to deserialize upload receipt payload." };
  }

  const version: 1 | 2 = payloadObj.v === 2 ? 2 : 1;
  const secret = getReceiptSigningKey(version);
  const expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, error: "Cryptographic signature mismatch on upload receipt." };
  }

  const now = Math.floor(Date.now() / 1000);

  if (version === 2) {
    const p = payloadObj as unknown as UploadReceiptV2Payload;
    if (
      typeof p.sid !== "string" ||
      typeof p.pid !== "string" ||
      typeof p.uid !== "string" ||
      typeof p.fld !== "string" ||
      typeof p.res !== "string" ||
      typeof p.iat !== "number" ||
      typeof p.exp !== "number"
    ) {
      return { valid: false, error: "Malformed Receipt v2 payload fields." };
    }

    if (p.pid !== expected.publicId) {
      return {
        valid: false,
        error: `Receipt asset mismatch: token was issued for '${p.pid}', but received '${expected.publicId}'.`,
      };
    }

    if (p.uid !== expected.adminId) {
      return {
        valid: false,
        error: "Receipt admin mismatch: token was issued for a different administrator.",
      };
    }

    if (expected.sessionId && p.sid !== expected.sessionId) {
      return {
        valid: false,
        error: `Receipt session mismatch: token session '${p.sid}' does not match expected '${expected.sessionId}'.`,
      };
    }

    if (expected.folder && p.fld !== expected.folder) {
      return {
        valid: false,
        error: `Receipt folder mismatch: token folder '${p.fld}' does not match expected '${expected.folder}'.`,
      };
    }

    if (expected.resourceType && p.res !== expected.resourceType) {
      return {
        valid: false,
        error: `Receipt resource mismatch: token resource '${p.res}' does not match expected '${expected.resourceType}'.`,
      };
    }

    if (p.exp < now) {
      return { valid: false, error: "Upload receipt token has expired." };
    }

    if (p.iat > now + 60) {
      return { valid: false, error: "Upload receipt issued-at timestamp is in the future." };
    }

    return { valid: true, version: 2 };
  } else {
    // Legacy Receipt v1
    const p = payloadObj as unknown as UploadReceiptPayload;
    if (typeof p.pid !== "string" || typeof p.uid !== "string" || typeof p.exp !== "number") {
      return { valid: false, error: "Malformed Receipt v1 payload fields." };
    }

    if (p.pid !== expected.publicId) {
      return {
        valid: false,
        error: `Receipt asset mismatch: token was issued for '${p.pid}', but received '${expected.publicId}'.`,
      };
    }

    if (p.uid !== expected.adminId) {
      return {
        valid: false,
        error: "Receipt admin mismatch: token was issued for a different administrator.",
      };
    }

    if (p.exp < now) {
      return { valid: false, error: "Upload receipt token has expired." };
    }

    return { valid: true, version: 1 };
  }
}

/**
 * Cryptographically verifies and inspects an upload receipt without requiring adminId.
 * Validates the HMAC signature and extracts the signed payload.
 */
export function inspectCloudinaryUploadReceipt(receipt: unknown): {
  valid: boolean;
  version?: 1 | 2;
  payload?: UploadReceiptV2Payload | UploadReceiptPayload;
  error?: string;
} {
  if (typeof receipt !== "string" || !receipt.includes(".")) {
    return { valid: false, error: "Missing or malformed upload receipt token." };
  }

  const [payloadB64, sig] = receipt.split(".");
  if (!payloadB64 || !sig) {
    return { valid: false, error: "Invalid receipt token structure." };
  }

  let payloadObj: Record<string, unknown>;
  try {
    payloadObj = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { valid: false, error: "Failed to deserialize upload receipt payload." };
  }

  const version: 1 | 2 = payloadObj.v === 2 ? 2 : 1;
  const secret = getReceiptSigningKey(version);
  const expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, error: "Cryptographic signature mismatch on upload receipt." };
  }

  if (version === 2) {
    const p = payloadObj as unknown as UploadReceiptV2Payload;
    if (!p.sid || !p.pid || !p.uid || !p.fld || !p.res || typeof p.exp !== "number") {
      return { valid: false, error: "Malformed Receipt v2 payload fields." };
    }
    return { valid: true, version: 2, payload: p };
  } else {
    const p = payloadObj as unknown as UploadReceiptPayload;
    if (!p.pid || !p.uid || typeof p.exp !== "number") {
      return { valid: false, error: "Malformed Receipt v1 payload fields." };
    }
    return { valid: true, version: 1, payload: p };
  }
}

function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

// ==============================================================================
// 2. Cloudinary Upload Parameter & Response Signatures
// ==============================================================================

/**
 * Generates an official Cloudinary API request signature:
 * 1. Parameters to sign are sorted alphabetically.
 * 2. Formatted as key1=val1&key2=val2.
 * 3. Appends apiSecret directly to the end.
 * 4. Produces hexadecimal digest (SHA-1 default per Cloudinary SDK, or SHA-256).
 */
export function createCloudinarySignature(
  paramsToSign: Record<string, string | number | boolean | undefined | null>,
  apiSecret: string,
  algorithm: "sha1" | "sha256" = "sha1"
): string {
  if (!apiSecret || apiSecret.trim().length === 0) {
    throw new Error("Cloudinary API secret is required to generate upload signature.");
  }

  const serialized = Object.entries(paramsToSign)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  return crypto
    .createHash(algorithm)
    .update(`${serialized}${apiSecret.trim()}`)
    .digest("hex");
}

/**
 * Cryptographically verifies Cloudinary's upload response signature.
 * Formula per Cloudinary documentation:
 * Signature = SHA-1(public_id=<public_id>&version=<version><api_secret>)
 * Uses timingSafeEqual to prevent side-channel leaks.
 */
export function verifyCloudinaryResponseSignature(
  publicId: string,
  version: string | number,
  signature: string,
  apiSecret: string
): boolean {
  if (!publicId || !version || !signature || !apiSecret) {
    return false;
  }

  const cleanSig = signature.trim().toLowerCase();
  const toSign = `public_id=${publicId}&version=${version}${apiSecret.trim()}`;

  let expectedSig: string;
  if (cleanSig.length === 64 && /^[a-f0-9]{64}$/.test(cleanSig)) {
    expectedSig = crypto.createHash("sha256").update(toSign).digest("hex");
  } else if (cleanSig.length === 40 && /^[a-f0-9]{40}$/.test(cleanSig)) {
    expectedSig = crypto.createHash("sha1").update(toSign).digest("hex");
  } else {
    return false;
  }

  const sigBuf = Buffer.from(cleanSig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

// ==============================================================================
// 3. Stage A: Authorization Session Creation
// ==============================================================================

/**
 * Stage A: Generates server-constrained, cryptographically signed parameters for direct browser upload
 * AND creates a durable media_upload_sessions row in 'authorization_created' state before returning.
 * Strictly requires admin catalogue write privileges.
 * Cloudinary API secret is NEVER exposed or returned to the client.
 */
export async function getCloudinaryUploadParams(options?: {
  userOverride?: SafeUser | null;
  customPublicIdPrefix?: string;
  folder?: CloudinaryFolder;
  dbOverride?: unknown;
}): Promise<CloudinarySignedUploadParams> {
  // 1. Authorize admin/catalogue permissions (rejects customers and unauthenticated users)
  const user = await assertAdminCatalogueAccess(
    PERMISSIONS.CATALOGUE_WRITE,
    options?.userOverride
  );

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  // Fail-closed in production if credentials are unconfigured
  if (!cloudName || !apiKey || !apiSecret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "CONFIGURATION_ERROR: Cloudinary credentials (cloud name, API key, or API secret) are not configured."
      );
    }
  }

  // In production, DATABASE_URL must be configured and db must be available
  if (process.env.NODE_ENV === "production") {
    if (!process.env.DATABASE_URL?.trim() || !isDatabaseConfigured()) {
      throw new Error(
        "CONFIGURATION_ERROR: DATABASE_URL must be configured in production. In-memory demo upload sessions are strictly prohibited."
      );
    }
  }

  const db = (options?.dbOverride !== undefined ? options.dbOverride : getDb()) as {
    insert: (table: unknown) => { values: (vals: unknown) => Promise<unknown> };
  } | null;

  if (process.env.NODE_ENV === "production" && !db) {
    throw new Error(
      "CONFIGURATION_ERROR: Database client is unavailable in production. In-memory demo upload sessions are strictly prohibited."
    );
  }

  // 2. Shared database rate limiting (max 50 signatures per 10 minutes per administrator)
  if (db && isDatabaseConfigured()) {
    const rateLimitKey = `cloudinary_sig:${user.id}`;
    const rateCheck = await checkSharedRateLimit(db, rateLimitKey, {
      maxAttempts: 50,
      windowSeconds: 600,
    });

    if (!rateCheck.success) {
      throw new Error(
        `RATE_LIMITED: Too many image upload requests. Please wait ${rateCheck.resetInSeconds} seconds before requesting more signatures.`
      );
    }
  }

  const safeCloudName = cloudName || "hs-spare-parts-demo";
  const safeApiKey = apiKey || "demo_api_key_unconfigured";
  const safeApiSecret = apiSecret || "ephemeral_dev_secret_unconfigured_123456789";

  const targetFolder = options?.folder || CLOUDINARY_CONFIG.folder;
  if (!Object.values(CLOUDINARY_FOLDERS).includes(targetFolder as CloudinaryFolder)) {
    throw new Error(`SECURITY_ERROR: Unauthorized asset folder '${targetFolder}'.`);
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const randomSuffix = crypto.randomBytes(6).toString("hex");
  const defaultPrefix = targetFolder.includes("cat")
    ? "cat"
    : targetFolder.includes("brand")
    ? "brand"
    : targetFolder.includes("banner")
    ? "banner"
    : "prod";
  const prefix = options?.customPublicIdPrefix
    ? options.customPublicIdPrefix.replace(/[^a-zA-Z0-9_-]/g, "")
    : defaultPrefix;
  const publicId = `${prefix}_${timestamp}_${randomSuffix}`;
  const fullPublicId = `${targetFolder}/${publicId}`;

  // Generate durable session identity
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7200 * 1000); // 2 hours

  // Stage A: Create durable media_upload_sessions row BEFORE returning authorization
  if (db) {
    try {
      await db.insert(mediaUploadSessions).values({
        id: sessionId,
        cloudName: safeCloudName,
        canonicalPublicId: fullPublicId,
        resourceType: "image",
        deliveryType: "upload",
        folder: targetFolder,
        createdByActorId: user.id,
        status: "authorization_created",
        expiresAt,
      });
    } catch (insertErr) {
      throw new Error(
        `DATABASE_ERROR: Failed to establish durable upload session: ${
          insertErr instanceof Error ? insertErr.message : "Insert failed"
        }`
      );
    }
  } else {
    // Record in-memory demo session for development/demo mode
    setInMemoryUploadSession(sessionId, {
      id: sessionId,
      cloudName: safeCloudName,
      canonicalPublicId: fullPublicId,
      resourceType: "image",
      deliveryType: "upload",
      folder: targetFolder,
      createdByActorId: user.id,
      status: "authorization_created",
      createdAt: new Date(),
      expiresAt,
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
  }

  // Constrained parameters to sign (enforcing overwrite: false)
  const paramsToSign: Record<string, string | number> = {
    folder: targetFolder,
    public_id: publicId,
    timestamp,
    upload_preset: CLOUDINARY_CONFIG.uploadPreset,
  };

  const signature = createCloudinarySignature(paramsToSign, safeApiSecret, "sha1");

  return {
    timestamp,
    signature,
    apiKey: safeApiKey,
    cloudName: safeCloudName,
    folder: targetFolder,
    publicId,
    uploadPreset: CLOUDINARY_CONFIG.uploadPreset,
    uploadUrl: `https://api.cloudinary.com/v1_1/${safeCloudName}/image/upload`,
    allowedFormats: [...CLOUDINARY_CONFIG.allowedFormats],
    maxFileSize: CLOUDINARY_CONFIG.maxFileSizeBytes,
    sessionId,
  };
}

// ==============================================================================
// 4. Stage B: Cloudinary Upload Proof Verification
// ==============================================================================

export interface ConfirmUploadProofInput {
  sessionId: string;
  publicId: string;
  version: string | number;
  signature: string;
  bytes?: number;
  format?: string;
  width?: number;
  height?: number;
  resourceType?: string;
}

export interface ConfirmUploadProofResult {
  success: boolean;
  receipt?: string;
  sessionId?: string;
  publicId?: string;
  error?: string;
}

class SessionVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionVerificationError";
  }
}

interface SessionRecordSummary {
  id: string;
  canonicalPublicId: string;
  folder: string;
  resourceType: string;
}

interface TransactionExecutor {
  select: () => {
    from: (table: unknown) => {
      where: (clause: unknown) => {
        for?: (mode: string) => Promise<MediaUploadSession[]>;
      } & Promise<MediaUploadSession[]>;
    };
  };
  update: (table: unknown) => {
    set: (values: unknown) => {
      where: (clause: unknown) => {
        returning?: (cols: unknown) => Promise<unknown[]>;
      } & Promise<unknown>;
    };
  };
}

interface DatabaseClientWithTx {
  transaction: <T>(cb: (tx: TransactionExecutor) => Promise<T>) => Promise<T>;
}

/**
 * Stage B: Cryptographically verifies Cloudinary's upload response signature,
 * loads and locks the durable session with SELECT ... FOR UPDATE in a real database transaction,
 * verifies complete identity coordinates, transitions session to 'upload_verified',
 * and issues Receipt v2 only after the transaction successfully commits.
 */
export async function confirmUploadProof(
  input: ConfirmUploadProofInput,
  options?: {
    userOverride?: SafeUser | null;
    dbOverride?: unknown;
  }
): Promise<ConfirmUploadProofResult> {
  // 1. Authorize admin/catalogue permissions
  const user = await assertAdminCatalogueAccess(
    PERMISSIONS.CATALOGUE_WRITE,
    options?.userOverride
  );

  // 2. Validate input fields
  if (!input.sessionId || typeof input.sessionId !== "string") {
    return { success: false, error: "VALIDATION_ERROR: Session ID (UUID) is required." };
  }
  if (!input.publicId || typeof input.publicId !== "string") {
    return { success: false, error: "VALIDATION_ERROR: Canonical public ID is required." };
  }
  if (input.version === undefined || input.version === null || String(input.version).trim().length === 0) {
    return { success: false, error: "VALIDATION_ERROR: Cloudinary version is required." };
  }
  if (!input.signature || typeof input.signature !== "string") {
    return { success: false, error: "VALIDATION_ERROR: Cloudinary response signature is required." };
  }

  // Reject directory traversal in publicId
  if (!isValidAssetPublicId(input.publicId)) {
    return { success: false, error: "SECURITY_ERROR: Public ID must be in an authorized folder without traversal." };
  }

  // Metadata checks
  if (input.format) {
    const cleanFormat = input.format.toLowerCase();
    const allowed = CLOUDINARY_CONFIG.allowedFormats as readonly string[];
    if (!allowed.includes(cleanFormat)) {
      return { success: false, error: `SECURITY_ERROR: Prohibited format '${cleanFormat}'. SVG is forbidden.` };
    }
  }

  if (input.resourceType && input.resourceType !== "image") {
    return { success: false, error: `SECURITY_ERROR: Invalid resource type '${input.resourceType}'. Must be 'image'.` };
  }

  if (typeof input.bytes === "number" && input.bytes > CLOUDINARY_CONFIG.maxFileSizeBytes) {
    return { success: false, error: "SECURITY_ERROR: Uploaded asset size exceeds 10MB limit." };
  }

  // 3. Cryptographically verify Cloudinary's response signature
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || "ephemeral_dev_secret_unconfigured_123456789";
  const isSigValid = verifyCloudinaryResponseSignature(
    input.publicId,
    input.version,
    input.signature,
    apiSecret
  );

  if (!isSigValid) {
    return { success: false, error: "SECURITY_ERROR: Cryptographic signature mismatch on Cloudinary upload response." };
  }

  // 4. Production database configuration verification
  if (process.env.NODE_ENV === "production") {
    if (!process.env.DATABASE_URL?.trim() || !isDatabaseConfigured()) {
      return {
        success: false,
        error:
          "CONFIGURATION_ERROR: DATABASE_URL must be configured in production. In-memory demo upload sessions are strictly prohibited.",
      };
    }
  }

  // 5. Build verified upload proof metadata
  const uploadProof = {
    version: String(input.version),
    bytes: typeof input.bytes === "number" ? input.bytes : null,
    format: typeof input.format === "string" ? input.format.toLowerCase() : null,
    width: typeof input.width === "number" ? input.width : null,
    height: typeof input.height === "number" ? input.height : null,
    verified_at: new Date().toISOString(),
  };

  const db = (options?.dbOverride !== undefined ? options.dbOverride : getDb()) as DatabaseClientWithTx | null;

  if (process.env.NODE_ENV === "production" && !db) {
    return {
      success: false,
      error:
        "CONFIGURATION_ERROR: Database client is unavailable in production. In-memory demo upload sessions are strictly prohibited.",
    };
  }

  // 6. Database Transaction Execution (Durable path with SELECT ... FOR UPDATE)
  if (db) {
    let verifiedSessionRecord: SessionRecordSummary | null = null;

    try {
      if (typeof db.transaction !== "function") {
        throw new Error("DATABASE_ERROR: Database client does not support transactions.");
      }

      verifiedSessionRecord = await db.transaction(async (tx: TransactionExecutor): Promise<SessionRecordSummary> => {
        // 1. SELECT ... FOR UPDATE on session by exact UUID sid
        let selectQuery = tx
          .select()
          .from(mediaUploadSessions)
          .where(eq(mediaUploadSessions.id, input.sessionId));

        if (typeof selectQuery.for === "function") {
          selectQuery = selectQuery.for("update");
        }

        const rows = (await selectQuery) as MediaUploadSession[];
        const session = rows[0] || null;

        if (!session) {
          throw new SessionVerificationError(
            `SESSION_NOT_FOUND: Upload session '${input.sessionId}' does not exist.`
          );
        }

        // 2. Complete Identity Tuple Verification while row lock is held
        if (session.canonicalPublicId !== input.publicId) {
          throw new SessionVerificationError(
            `IDENTITY_MISMATCH: Session public ID '${session.canonicalPublicId}' does not match uploaded public ID '${input.publicId}'.`
          );
        }

        if (session.createdByActorId !== user.id) {
          throw new SessionVerificationError(
            "UNAUTHORIZED_ACTOR: Upload session belongs to a different administrator."
          );
        }

        const cloudName =
          process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() || "hs-spare-parts-demo";
        if (session.cloudName !== cloudName) {
          throw new SessionVerificationError(
            `CLOUD_NAME_MISMATCH: Session cloud name '${session.cloudName}' does not match '${cloudName}'.`
          );
        }

        if (!input.publicId.startsWith(`${session.folder}/`)) {
          throw new SessionVerificationError(
            `FOLDER_MISMATCH: Public ID '${input.publicId}' does not reside in session folder '${session.folder}'.`
          );
        }

        if (session.resourceType !== (input.resourceType || "image")) {
          throw new SessionVerificationError(
            `RESOURCE_TYPE_MISMATCH: Session resource type '${session.resourceType}' does not match '${input.resourceType || "image"}'.`
          );
        }

        // 3. Tombstoned / Terminal state checks while lock is held
        if (
          session.status === "cleanup_pending" ||
          session.status === "deletion_in_progress" ||
          session.status === "deleted"
        ) {
          throw new SessionVerificationError(
            "TOMBSTONED_SESSION: Cannot confirm upload on a condemned or deleted session."
          );
        }

        if (session.status === "committed") {
          throw new SessionVerificationError(
            "COMMITTED_SESSION: Session is already committed to an entity."
          );
        }

        if (session.status === "expired_uncompleted") {
          throw new SessionVerificationError(
            "EXPIRED_SESSION: Session has been marked expired and uncompleted."
          );
        }

        const now = Date.now();
        if (new Date(session.expiresAt).getTime() < now) {
          throw new SessionVerificationError(
            "SESSION_EXPIRED: Upload session authorization window has expired."
          );
        }

        // 4. Idempotent replay check vs. replay mismatch
        if (session.status === "upload_verified") {
          if (
            session.cloudinaryVersion === String(input.version) &&
            session.canonicalPublicId === input.publicId
          ) {
            // Idempotent replay: exact same verified proof, commit no-op
            return {
              id: session.id,
              canonicalPublicId: session.canonicalPublicId,
              folder: session.folder,
              resourceType: session.resourceType,
            };
          } else {
            throw new SessionVerificationError(
              "REPLAY_MISMATCH: Session is already verified with different proof."
            );
          }
        }

        if (session.status !== "authorization_created") {
          throw new SessionVerificationError(
            `INVALID_STATE_TRANSITION: Cannot transition from '${session.status}' to 'upload_verified'.`
          );
        }

        // 5. Persist verified upload proof atomically inside transaction
        // Retain optimistic fencing (status = 'authorization_created') as defense-in-depth
        const verifiedAt = new Date();
        let updateQuery = tx
          .update(mediaUploadSessions)
          .set({
            status: "upload_verified",
            uploadVerifiedAt: verifiedAt,
            cloudinaryVersion: String(input.version),
            uploadedBytes: typeof input.bytes === "number" ? input.bytes : null,
            uploadProof,
            lastUpdatedAt: verifiedAt,
          })
          .where(
            and(
              eq(mediaUploadSessions.id, input.sessionId),
              eq(mediaUploadSessions.status, "authorization_created")
            )
          );

        if (typeof updateQuery.returning === "function") {
          updateQuery = updateQuery.returning({ id: mediaUploadSessions.id });
        }

        const updateRes = await updateQuery;
        if (Array.isArray(updateRes) && updateRes.length === 0) {
          throw new SessionVerificationError(
            "CONCURRENT_MODIFICATION: Upload session state was modified concurrently."
          );
        }

        return {
          id: session.id,
          canonicalPublicId: session.canonicalPublicId,
          folder: session.folder,
          resourceType: session.resourceType,
        };
      });
    } catch (err: unknown) {
      if (err instanceof SessionVerificationError) {
        return { success: false, error: err.message };
      }
      return {
        success: false,
        error: `DATABASE_ERROR: Transaction failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (!verifiedSessionRecord) {
      return {
        success: false,
        error: "TRANSACTION_FAILED: Upload session was not verified.",
      };
    }

    // 7. Issue Receipt v2 ONLY AFTER durable transaction commits successfully
    const receipt = createCloudinaryUploadReceiptV2({
      sessionId: verifiedSessionRecord.id,
      publicId: verifiedSessionRecord.canonicalPublicId,
      adminId: user.id,
      folder: verifiedSessionRecord.folder,
      resourceType: verifiedSessionRecord.resourceType,
    });

    return {
      success: true,
      receipt,
      sessionId: verifiedSessionRecord.id,
      publicId: verifiedSessionRecord.canonicalPublicId,
    };
  }

  // 8. Fallback to in-memory demo sessions (strictly non-production dev/test mode only)
  const session = getInMemoryUploadSessionById(input.sessionId) || null;
  if (!session) {
    return { success: false, error: `SESSION_NOT_FOUND: Upload session '${input.sessionId}' does not exist.` };
  }

  // Identity checks
  if (session.canonicalPublicId !== input.publicId) {
    return {
      success: false,
      error: `IDENTITY_MISMATCH: Session public ID '${session.canonicalPublicId}' does not match uploaded public ID '${input.publicId}'.`,
    };
  }

  if (session.createdByActorId !== user.id) {
    return {
      success: false,
      error: "UNAUTHORIZED_ACTOR: Upload session belongs to a different administrator.",
    };
  }

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() || "hs-spare-parts-demo";
  if (session.cloudName !== cloudName) {
    return {
      success: false,
      error: `CLOUD_NAME_MISMATCH: Session cloud name '${session.cloudName}' does not match '${cloudName}'.`,
    };
  }

  if (!input.publicId.startsWith(`${session.folder}/`)) {
    return {
      success: false,
      error: `FOLDER_MISMATCH: Public ID '${input.publicId}' does not reside in session folder '${session.folder}'.`,
    };
  }

  if (session.resourceType !== (input.resourceType || "image")) {
    return {
      success: false,
      error: `RESOURCE_TYPE_MISMATCH: Session resource type '${session.resourceType}' does not match '${input.resourceType || "image"}'.`,
    };
  }

  // Tombstone & terminal state checks
  if (
    session.status === "cleanup_pending" ||
    session.status === "deletion_in_progress" ||
    session.status === "deleted"
  ) {
    return {
      success: false,
      error: "TOMBSTONED_SESSION: Cannot confirm upload on a condemned or deleted session.",
    };
  }

  if (session.status === "committed") {
    return {
      success: false,
      error: "COMMITTED_SESSION: Session is already committed to an entity.",
    };
  }

  if (session.status === "expired_uncompleted") {
    return {
      success: false,
      error: "EXPIRED_SESSION: Session has been marked expired and uncompleted.",
    };
  }

  const now = Date.now();
  if (new Date(session.expiresAt).getTime() < now) {
    return {
      success: false,
      error: "SESSION_EXPIRED: Upload session authorization window has expired.",
    };
  }

  // Replay idempotency check
  if (session.status === "upload_verified") {
    if (
      session.cloudinaryVersion === String(input.version) &&
      session.canonicalPublicId === input.publicId
    ) {
      const receipt = createCloudinaryUploadReceiptV2({
        sessionId: session.id,
        publicId: session.canonicalPublicId,
        adminId: user.id,
        folder: session.folder,
        resourceType: session.resourceType,
      });
      return {
        success: true,
        receipt,
        sessionId: session.id,
        publicId: session.canonicalPublicId,
      };
    } else {
      return {
        success: false,
        error: "REPLAY_MISMATCH: Session is already verified with different proof.",
      };
    }
  }

  if (session.status !== "authorization_created") {
    return {
      success: false,
      error: `INVALID_STATE_TRANSITION: Cannot transition from '${session.status}' to 'upload_verified'.`,
    };
  }

  const verifiedAt = new Date();
  updateInMemoryUploadSession(input.sessionId, {
    status: "upload_verified",
    uploadVerifiedAt: verifiedAt,
    cloudinaryVersion: String(input.version),
    uploadedBytes: typeof input.bytes === "number" ? input.bytes : null,
    uploadProof,
    lastUpdatedAt: verifiedAt,
  });

  const receipt = createCloudinaryUploadReceiptV2({
    sessionId: session.id,
    publicId: session.canonicalPublicId,
    adminId: user.id,
    folder: session.folder,
    resourceType: session.resourceType,
  });

  return {
    success: true,
    receipt,
    sessionId: session.id,
    publicId: session.canonicalPublicId,
  };
}

// ==============================================================================
// 5. Stage C: Entity Media Persistence & Session Commit Helper
// ==============================================================================

export interface EntityMediaAttachment {
  storageKey: string;
  uploadReceipt?: string | null;
  fieldName?: string;
}

export interface VerifyAndCommitMediaSessionsParams {
  tx: unknown; // Transaction client (or null in demo mode)
  attachments: EntityMediaAttachment[];
  entityType: "product" | "category" | "brand" | "banner";
  entityId: string;
  actorId: string;
  expectedFolder: string;
  requireReceipt?: boolean;
}

/**
 * Stage C: Shared transaction-safe helper that verifies Receipt v2 tokens,
 * resolves session IDs against durable media_upload_sessions (or in-memory demo sessions in dev/test),
 * locks session rows using SELECT ... FOR UPDATE ordered alphabetically by canonical public ID,
 * enforces complete identity tuples, state invariants, and atomic transition to 'committed'.
 */
export async function verifyAndCommitMediaUploadSessions(
  params: VerifyAndCommitMediaSessionsParams
): Promise<void> {
  const { tx, attachments, entityType, entityId, actorId, expectedFolder, requireReceipt } = params;

  // 1. Filter attachments that require processing
  const candidateAttachments: Array<{
    storageKey: string;
    uploadReceipt: string;
    fieldName?: string;
    payload: UploadReceiptV2Payload;
  }> = [];

  const seenSessionIds = new Set<string>();

  for (const att of attachments) {
    if (!att.storageKey) continue;

    if (!att.uploadReceipt) {
      if (requireReceipt) {
        throw new Error(
          `SECURITY_ERROR: Upload receipt is required for asset '${att.storageKey}'.`
        );
      }
      continue;
    }

    // Inspect token structure
    const inspection = inspectCloudinaryUploadReceipt(att.uploadReceipt);
    if (!inspection.valid) {
      throw new Error(
        `SECURITY_ERROR: Invalid upload receipt for '${att.storageKey}': ${inspection.error}`
      );
    }

    // Mandatory Invariant 1: Accept Receipt v2 exclusively. Reject all Receipt v1 tokens!
    if (inspection.version !== 2 || !inspection.payload || !("sid" in inspection.payload)) {
      throw new Error(
        "SECURITY_ERROR: RECEIPT_VERSION_FORBIDDEN: Only Receipt v2 is permitted for entity media attachment. Receipt v1 is strictly rejected."
      );
    }

    const payload = inspection.payload as UploadReceiptV2Payload;

    if (seenSessionIds.has(payload.sid)) {
      throw new Error(
        `SECURITY_ERROR: DUPLICATE_SESSION: Session '${payload.sid}' appears multiple times in attachment request.`
      );
    }
    seenSessionIds.add(payload.sid);

    // Cryptographic HMAC and boundary verification
    const verification = verifyCloudinaryUploadReceipt(att.uploadReceipt, {
      publicId: att.storageKey,
      adminId: actorId,
      sessionId: payload.sid,
      folder: expectedFolder,
      resourceType: "image",
    });

    if (!verification.valid) {
      throw new Error(
        `SECURITY_ERROR: Upload receipt verification failed for '${att.storageKey}': ${verification.error}`
      );
    }

    // Payload field validations
    if (payload.fld !== expectedFolder) {
      throw new Error(
        `SECURITY_ERROR: FOLDER_MISMATCH: Receipt folder '${payload.fld}' does not match expected folder '${expectedFolder}'.`
      );
    }

    if (payload.res !== "image") {
      throw new Error(
        `SECURITY_ERROR: RESOURCE_TYPE_MISMATCH: Receipt resource type '${payload.res}' must be 'image'.`
      );
    }

    if (payload.uid !== actorId) {
      throw new Error(
        `SECURITY_ERROR: UNAUTHORIZED_ACTOR: Upload receipt was issued to actor '${payload.uid}', not '${actorId}'.`
      );
    }

    if (payload.pid !== att.storageKey) {
      throw new Error(
        `SECURITY_ERROR: IDENTITY_MISMATCH: Receipt public ID '${payload.pid}' does not match storage key '${att.storageKey}'.`
      );
    }

    candidateAttachments.push({
      storageKey: att.storageKey,
      uploadReceipt: att.uploadReceipt,
      fieldName: att.fieldName,
      payload,
    });
  }

  if (candidateAttachments.length === 0) {
    return;
  }

  // 2. Deadlock prevention: Sort attachments alphabetically by storageKey (canonical public ID)
  candidateAttachments.sort((a, b) => a.storageKey.localeCompare(b.storageKey));
  const sortedSessionIds = Array.from(new Set(candidateAttachments.map((a) => a.payload.sid)));

  const isDbMode = Boolean(tx);

  // In production, database transaction is strictly required
  if (process.env.NODE_ENV === "production" && !isDbMode) {
    throw new Error(
      "CONFIGURATION_ERROR: Database transaction is required in production for entity media attachment."
    );
  }

  const now = new Date();

  if (isDbMode) {
    const dbTx = tx as {
      select: () => {
        from: (t: unknown) => {
          where: (c: unknown) => {
            orderBy: (o: unknown) => {
              for?: (m: string) => Promise<MediaUploadSession[]>;
            } & Promise<MediaUploadSession[]>;
          };
        };
      };
      update: (t: unknown) => {
        set: (v: unknown) => {
          where: (c: unknown) => Promise<unknown>;
        };
      };
    };

    // 3. Lock all affected session rows in alphabetical order using SELECT FOR UPDATE
    let query = dbTx
      .select()
      .from(mediaUploadSessions)
      .where(inArray(mediaUploadSessions.id, sortedSessionIds))
      .orderBy(asc(mediaUploadSessions.canonicalPublicId));

    if (typeof query.for === "function") {
      query = query.for("update");
    }

    const lockedSessions = (await query) as MediaUploadSession[];
    const sessionsMap = new Map<string, MediaUploadSession>();
    for (const s of lockedSessions) {
      sessionsMap.set(s.id, s);
    }

    // 4. Validate each locked session
    for (const item of candidateAttachments) {
      const session = sessionsMap.get(item.payload.sid);
      if (!session) {
        throw new Error(
          `SECURITY_ERROR: UNKNOWN_SESSION: Media upload session '${item.payload.sid}' does not exist in registry.`
        );
      }

      // Complete identity tuple verification under lock
      if (session.canonicalPublicId !== item.storageKey) {
        throw new Error(
          `SECURITY_ERROR: IDENTITY_MISMATCH: Session public ID '${session.canonicalPublicId}' does not match storage key '${item.storageKey}'.`
        );
      }

      if (session.createdByActorId !== actorId) {
        throw new Error(
          `SECURITY_ERROR: UNAUTHORIZED_ACTOR: Session actor '${session.createdByActorId}' does not match active administrator '${actorId}'.`
        );
      }

      if (session.folder !== expectedFolder) {
        throw new Error(
          `SECURITY_ERROR: FOLDER_MISMATCH: Session folder '${session.folder}' does not match entity folder '${expectedFolder}'.`
        );
      }

      if (session.resourceType !== "image") {
        throw new Error(
          `SECURITY_ERROR: RESOURCE_TYPE_MISMATCH: Session resource type '${session.resourceType}' must be 'image'.`
        );
      }

      const expectedCloud =
        process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() || "hs-spare-parts-demo";
      if (session.cloudName !== expectedCloud) {
        throw new Error(
          `SECURITY_ERROR: CLOUD_MISMATCH: Session cloud name '${session.cloudName}' does not match configured cloud name '${expectedCloud}'.`
        );
      }

      // Tombstone & terminal state checks
      if (
        session.status === "cleanup_pending" ||
        session.status === "deletion_in_progress" ||
        session.status === "deleted"
      ) {
        throw new Error(
          `SECURITY_ERROR: TOMBSTONED_SESSION: Cannot attach a condemned or deleted media session '${session.id}'.`
        );
      }

      if (session.status === "expired_uncompleted") {
        throw new Error(
          `SECURITY_ERROR: EXPIRED_SESSION: Cannot attach an expired uncompleted media session '${session.id}'.`
        );
      }

      if (session.status === "authorization_created") {
        throw new Error(
          `SECURITY_ERROR: UNVERIFIED_SESSION: Session '${session.id}' is only authorized but not verified. Upload proof must be confirmed before entity attachment.`
        );
      }

      // Committed state check (Idempotent retry vs. Cross-Entity reuse)
      if (session.status === "committed") {
        if (
          session.committedEntityType === entityType &&
          session.committedEntityId === entityId
        ) {
          // Idempotent retry on the exact same entity: permitted!
          continue;
        } else {
          throw new Error(
            `SECURITY_ERROR: CROSS_ENTITY_ATTACHMENT: Session '${session.id}' is already committed to ${session.committedEntityType} '${session.committedEntityId}'. Re-attaching to ${entityType} '${entityId}' is strictly prohibited.`
          );
        }
      }

      if (session.status !== "upload_verified") {
        throw new Error(
          `SECURITY_ERROR: INVALID_SESSION_STATUS: Upload session '${session.id}' is in status '${session.status}'. Only 'upload_verified' sessions may be committed.`
        );
      }

      // 5. Atomic session state transition to 'committed'
      await dbTx
        .update(mediaUploadSessions)
        .set({
          status: "committed",
          committedAt: now,
          committedEntityType: entityType,
          committedEntityId: entityId,
          lastUpdatedAt: now,
        })
        .where(
          and(
            eq(mediaUploadSessions.id, session.id),
            eq(mediaUploadSessions.status, "upload_verified")
          )
        );
    }
  } else {
    // Non-production in-memory demo store fallback
    for (const item of candidateAttachments) {
      const session = getInMemoryUploadSessionById(item.payload.sid);
      if (!session) {
        throw new Error(
          `SECURITY_ERROR: UNKNOWN_SESSION: Media upload session '${item.payload.sid}' does not exist in demo registry.`
        );
      }

      if (session.canonicalPublicId !== item.storageKey) {
        throw new Error(
          `SECURITY_ERROR: IDENTITY_MISMATCH: Session public ID '${session.canonicalPublicId}' does not match storage key '${item.storageKey}'.`
        );
      }

      if (session.createdByActorId !== actorId) {
        throw new Error(
          `SECURITY_ERROR: UNAUTHORIZED_ACTOR: Session actor '${session.createdByActorId}' does not match active administrator '${actorId}'.`
        );
      }

      if (session.folder !== expectedFolder) {
        throw new Error(
          `SECURITY_ERROR: FOLDER_MISMATCH: Session folder '${session.folder}' does not match entity folder '${expectedFolder}'.`
        );
      }

      if (session.resourceType !== "image") {
        throw new Error(
          `SECURITY_ERROR: RESOURCE_TYPE_MISMATCH: Session resource type '${session.resourceType}' must be 'image'.`
        );
      }

      if (
        session.status === "cleanup_pending" ||
        session.status === "deletion_in_progress" ||
        session.status === "deleted"
      ) {
        throw new Error(
          `SECURITY_ERROR: TOMBSTONED_SESSION: Cannot attach a condemned or deleted media session '${session.id}'.`
        );
      }

      if (session.status === "expired_uncompleted") {
        throw new Error(
          `SECURITY_ERROR: EXPIRED_SESSION: Cannot attach an expired uncompleted media session '${session.id}'.`
        );
      }

      if (session.status === "authorization_created") {
        throw new Error(
          `SECURITY_ERROR: UNVERIFIED_SESSION: Session '${session.id}' is only authorized but not verified. Upload proof must be confirmed before entity attachment.`
        );
      }

      if (session.status === "committed") {
        if (
          session.committedEntityType === entityType &&
          session.committedEntityId === entityId
        ) {
          continue;
        } else {
          throw new Error(
            `SECURITY_ERROR: CROSS_ENTITY_ATTACHMENT: Session '${session.id}' is already committed to ${session.committedEntityType} '${session.committedEntityId}'. Re-attaching to ${entityType} '${entityId}' is strictly prohibited.`
          );
        }
      }

      if (session.status !== "upload_verified") {
        throw new Error(
          `SECURITY_ERROR: INVALID_SESSION_STATUS: Upload session '${session.id}' is in status '${session.status}'. Only 'upload_verified' sessions may be committed.`
        );
      }

      updateInMemoryUploadSession(session.id, {
        status: "committed",
        committedAt: now,
        committedEntityType: entityType,
        committedEntityId: entityId,
        lastUpdatedAt: now,
      });
    }
  }
}

// ==============================================================================
// 6. Server Deletion / Orphan Cleanup API Call
// ==============================================================================

/**
 * Server-authenticated Cloudinary asset deletion for orphan cleanup.
 * Strictly verifies admin role and ensures the asset is inside an authorized folder.
 */
export async function deleteCloudinaryAsset(
  publicId: string,
  options?: { userOverride?: SafeUser | null; allowedFolder?: string }
): Promise<{ success: boolean; error?: string }> {
  await assertAdminCatalogueAccess(
    PERMISSIONS.CATALOGUE_WRITE,
    options?.userOverride
  );

  if (!publicId || typeof publicId !== "string") {
    return { success: false, error: "Public ID is required for asset deletion." };
  }

  // Directory isolation and path traversal defense
  if (!isValidAssetPublicId(publicId, options?.allowedFolder)) {
    const folderNotice = options?.allowedFolder
      ? `'${options.allowedFolder}/'`
      : "an authorized folder";
    return {
      success: false,
      error: `Security violation: deletion is restricted to ${folderNotice} without traversal.`,
    };
  }

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  // In unconfigured development or test mode, return safe simulated success
  if (!cloudName || !apiKey || !apiSecret) {
    return { success: true };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createCloudinarySignature(
    { public_id: publicId, timestamp },
    apiSecret,
    "sha1"
  );

  try {
    const formData = new URLSearchParams();
    formData.append("public_id", publicId);
    formData.append("timestamp", timestamp.toString());
    formData.append("api_key", apiKey);
    formData.append("signature", signature);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
      {
        method: "POST",
        body: formData,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(10000),
      }
    );

    const json = (await res.json()) as { result?: string };
    return { success: json.result === "ok" || json.result === "not found" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Deletion failed";
    return { success: false, error: msg };
  }
}
