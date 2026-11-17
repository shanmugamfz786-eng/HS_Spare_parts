import "server-only";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, addresses } from "@/lib/db/schema";
import { getCurrentUser } from "@/features/auth/service";
import { checkSharedRateLimit } from "@/lib/auth/rate-limit";
import { recordAdminAudit } from "@/lib/audit";
import type {
  UpdateProfileInput,
  CreateAddressInput,
  UpdateAddressInput,
  DeleteAddressInput,
  SetDefaultAddressInput,
  CustomerProfileDTO,
  CustomerAddressDTO,
} from "./schemas";
import {
  updateProfileSchema,
  createAddressSchema,
  updateAddressSchema,
  deleteAddressSchema,
  setDefaultAddressSchema,
} from "./schemas";

function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

/**
 * Retrieves the profile of the currently signed-in customer.
 */
export async function getCustomerProfile(): Promise<CustomerProfileDTO> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("UNAUTHENTICATED: Please sign in to view your profile.");
  }

  return {
    id: currentUser.id,
    email: currentUser.email,
    name: currentUser.name,
    phone: currentUser.phone,
    status: currentUser.status,
    roles: currentUser.roles,
    createdAt: currentUser.createdAt.toISOString(),
  };
}

/**
 * Server-side shared rate limiter for profile updates.
 * 10 updates per 15 minutes per authenticated customer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enforceProfileRateLimit(db: any, userId: string): Promise<void> {
  const rateLimitKey = `profile:${userId}`;
  const rateLimitResult = await checkSharedRateLimit(db, rateLimitKey, {
    maxAttempts: 10,
    windowSeconds: 900, // 10 updates per 15 minutes
  });

  if (!rateLimitResult.success) {
    if (rateLimitResult.isServiceUnavailable) {
      throw new Error("SERVICE_UNAVAILABLE: Profile service is temporarily unavailable. Please try again shortly.");
    }
    throw new Error(
      `RATE_LIMITED: Too many profile update attempts. Please wait ${rateLimitResult.resetInSeconds} seconds before trying again.`
    );
  }
}

/**
 * Server-side shared rate limiter for address mutations (create, update, delete, set default).
 * 15 address mutations per 10 minutes per authenticated customer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enforceAddressRateLimit(db: any, userId: string): Promise<void> {
  const rateLimitKey = `address:${userId}`;
  const rateLimitResult = await checkSharedRateLimit(db, rateLimitKey, {
    maxAttempts: 15,
    windowSeconds: 600, // 15 address actions per 10 minutes
  });

  if (!rateLimitResult.success) {
    if (rateLimitResult.isServiceUnavailable) {
      throw new Error("SERVICE_UNAVAILABLE: Address service is temporarily unavailable. Please try again shortly.");
    }
    throw new Error(
      `RATE_LIMITED: Too many address actions. Please wait ${rateLimitResult.resetInSeconds} seconds before trying again.`
    );
  }
}

/**
 * Updates permitted customer profile fields (name, phone) with mass-assignment defense.
 */
export async function updateCustomerProfile(rawInput: UpdateProfileInput): Promise<CustomerProfileDTO> {
  const input = updateProfileSchema.parse(rawInput);

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("UNAUTHENTICATED: Please sign in to update your profile.");
  }

  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  // Rate limiting before mutation: 10 updates per 15 minutes
  await enforceProfileRateLimit(db, currentUser.id);

  const cleanPhone = input.phone && input.phone.trim().length > 0 ? input.phone.trim() : null;

  // Mass-assignment protection: Update ONLY name and phone
  const [updatedUser] = await db
    .update(users)
    .set({
      name: input.name.trim(),
      phone: cleanPhone,
      updatedAt: sql`NOW()`,
    })
    .where(eq(users.id, currentUser.id))
    .returning();

  if (!updatedUser) {
    throw new Error("USER_NOT_FOUND: User account could not be found.");
  }

  // Audit trail
  await recordAdminAudit({
    action: "CUSTOMER_PROFILE_UPDATE",
    entityType: "user",
    entityId: currentUser.id,
    actorUserId: currentUser.id,
    metadata: {
      nameChanged: input.name !== currentUser.name,
      phoneChanged: cleanPhone !== currentUser.phone,
    },
  });

  return {
    id: updatedUser.id,
    email: updatedUser.emailNormalized,
    name: updatedUser.name,
    phone: updatedUser.phone,
    status: updatedUser.status,
    roles: currentUser.roles,
    createdAt: updatedUser.createdAt.toISOString(),
  };
}

/**
 * Formats database address row into CustomerAddressDTO.
 */
function toAddressDTO(row: typeof addresses.$inferSelect): CustomerAddressDTO {
  return {
    id: row.id,
    userId: row.userId,
    recipient: row.recipient,
    phone: row.phone,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    stateRegion: row.stateRegion,
    postalCode: row.postalCode,
    countryCode: row.countryCode,
    addressType: row.addressType as "shipping" | "billing",
    isDefault: row.isDefault,
    createdAt: row.createdAt ? row.createdAt.toISOString() : new Date().toISOString(),
  };
}

/**
 * Retrieves all addresses owned by the authenticated customer.
 */
export async function getCustomerAddresses(): Promise<CustomerAddressDTO[]> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("UNAUTHENTICATED: Please sign in to view your addresses.");
  }

  if (!isDatabaseConfigured()) {
    return [];
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  const rows = await db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, currentUser.id))
    .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));

  return rows.map(toAddressDTO);
}

/**
 * Creates a new address for the authenticated customer with atomic default consistency.
 */
export async function createCustomerAddress(rawInput: CreateAddressInput): Promise<CustomerAddressDTO[]> {
  const input = createAddressSchema.parse(rawInput);

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("UNAUTHENTICATED: Please sign in to add an address.");
  }

  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  // Rate limiting before mutation: 15 address mutations per 10 minutes
  await enforceAddressRateLimit(db, currentUser.id);

  await db.transaction(async (tx) => {
    // Check if user has any existing addresses
    const existingCount = await tx
      .select({ count: sql<number>`count(*)` })
      .from(addresses)
      .where(eq(addresses.userId, currentUser.id));

    const totalCount = Number(existingCount[0]?.count ?? 0);
    const shouldBeDefault = input.isDefault || totalCount === 0;

    if (shouldBeDefault) {
      // Unset previous defaults for this user
      await tx
        .update(addresses)
        .set({ isDefault: false, updatedAt: sql`NOW()` })
        .where(eq(addresses.userId, currentUser.id));
    }

    await tx.insert(addresses).values({
      userId: currentUser.id,
      recipient: input.recipient,
      phone: input.phone,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 || null,
      city: input.city,
      stateRegion: input.stateRegion,
      postalCode: input.postalCode,
      countryCode: input.countryCode,
      addressType: input.addressType,
      isDefault: shouldBeDefault,
    });
  });

  return getCustomerAddresses();
}

/**
 * Updates an existing address with strict IDOR customer ownership verification.
 */
export async function updateCustomerAddress(rawInput: UpdateAddressInput): Promise<CustomerAddressDTO[]> {
  const input = updateAddressSchema.parse(rawInput);

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("UNAUTHENTICATED: Please sign in to update an address.");
  }

  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  // Rate limiting before mutation: 15 address mutations per 10 minutes
  await enforceAddressRateLimit(db, currentUser.id);

  await db.transaction(async (tx) => {
    // IDOR check: address MUST belong to currentUser
    const existing = await tx.query.addresses.findFirst({
      where: and(eq(addresses.id, input.addressId), eq(addresses.userId, currentUser.id)),
    });

    if (!existing) {
      throw new Error("NOT_FOUND: Address not found or does not belong to your account.");
    }

    if (input.isDefault && !existing.isDefault) {
      // Unset previous defaults
      await tx
        .update(addresses)
        .set({ isDefault: false, updatedAt: sql`NOW()` })
        .where(eq(addresses.userId, currentUser.id));
    }

    await tx
      .update(addresses)
      .set({
        recipient: input.recipient,
        phone: input.phone,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 || null,
        city: input.city,
        stateRegion: input.stateRegion,
        postalCode: input.postalCode,
        countryCode: input.countryCode,
        addressType: input.addressType,
        isDefault: input.isDefault,
        updatedAt: sql`NOW()`,
      })
      .where(and(eq(addresses.id, input.addressId), eq(addresses.userId, currentUser.id)));
  });

  return getCustomerAddresses();
}

/**
 * Deletes a customer-owned address with IDOR verification and default address promotion.
 */
export async function deleteCustomerAddress(rawInput: DeleteAddressInput): Promise<CustomerAddressDTO[]> {
  const input = deleteAddressSchema.parse(rawInput);

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("UNAUTHENTICATED: Please sign in to delete an address.");
  }

  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  // Rate limiting before mutation: 15 address mutations per 10 minutes
  await enforceAddressRateLimit(db, currentUser.id);

  await db.transaction(async (tx) => {
    // IDOR check
    const existing = await tx.query.addresses.findFirst({
      where: and(eq(addresses.id, input.addressId), eq(addresses.userId, currentUser.id)),
    });

    if (!existing) {
      throw new Error("NOT_FOUND: Address not found or does not belong to your account.");
    }

    const wasDefault = existing.isDefault;

    await tx
      .delete(addresses)
      .where(and(eq(addresses.id, input.addressId), eq(addresses.userId, currentUser.id)));

    // If deleted address was default, promote the remaining most recent address
    if (wasDefault) {
      const remaining = await tx
        .select()
        .from(addresses)
        .where(eq(addresses.userId, currentUser.id))
        .orderBy(desc(addresses.createdAt))
        .limit(1);

      if (remaining[0]) {
        await tx
          .update(addresses)
          .set({ isDefault: true, updatedAt: sql`NOW()` })
          .where(eq(addresses.id, remaining[0].id));
      }
    }
  });

  return getCustomerAddresses();
}

/**
 * Sets an address as default atomically.
 */
export async function setDefaultCustomerAddress(rawInput: SetDefaultAddressInput): Promise<CustomerAddressDTO[]> {
  const input = setDefaultAddressSchema.parse(rawInput);

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("UNAUTHENTICATED: Please sign in.");
  }

  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  // Rate limiting before mutation: 15 address mutations per 10 minutes
  await enforceAddressRateLimit(db, currentUser.id);

  await db.transaction(async (tx) => {
    // IDOR check
    const existing = await tx.query.addresses.findFirst({
      where: and(eq(addresses.id, input.addressId), eq(addresses.userId, currentUser.id)),
    });

    if (!existing) {
      throw new Error("NOT_FOUND: Address not found or does not belong to your account.");
    }

    // Unset all defaults
    await tx
      .update(addresses)
      .set({ isDefault: false, updatedAt: sql`NOW()` })
      .where(eq(addresses.userId, currentUser.id));

    // Set target address as default
    await tx
      .update(addresses)
      .set({ isDefault: true, updatedAt: sql`NOW()` })
      .where(and(eq(addresses.id, input.addressId), eq(addresses.userId, currentUser.id)));
  });

  return getCustomerAddresses();
}
