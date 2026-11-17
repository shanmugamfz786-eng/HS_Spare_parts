"use server";

import { revalidatePath } from "next/cache";
import {
  getCustomerProfile,
  updateCustomerProfile,
  getCustomerAddresses,
  createCustomerAddress,
  updateCustomerAddress,
  deleteCustomerAddress,
  setDefaultCustomerAddress,
} from "./service";
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

export interface AccountActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  isUnauthenticated?: boolean;
}

export async function getCustomerProfileAction(): Promise<AccountActionResult<CustomerProfileDTO>> {
  try {
    const profile = await getCustomerProfile();
    return { success: true, data: profile };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to retrieve profile.";
    const isUnauth = message.startsWith("UNAUTHENTICATED");
    console.error("[AccountAction] getProfile error:", error);
    return { success: false, error: message, isUnauthenticated: isUnauth };
  }
}

export async function updateCustomerProfileAction(rawInput: UpdateProfileInput): Promise<AccountActionResult<CustomerProfileDTO>> {
  try {
    const parsed = updateProfileSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message || "Invalid profile data." };
    }

    const profile = await updateCustomerProfile(parsed.data);
    revalidatePath("/account");
    revalidatePath("/account/profile");
    return { success: true, data: profile };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update profile.";
    console.error("[AccountAction] updateProfile error:", error);
    return { success: false, error: message };
  }
}

export async function getCustomerAddressesAction(): Promise<AccountActionResult<CustomerAddressDTO[]>> {
  try {
    const addresses = await getCustomerAddresses();
    return { success: true, data: addresses };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load addresses.";
    const isUnauth = message.startsWith("UNAUTHENTICATED");
    console.error("[AccountAction] getAddresses error:", error);
    return { success: false, error: message, isUnauthenticated: isUnauth };
  }
}

export async function createCustomerAddressAction(rawInput: CreateAddressInput): Promise<AccountActionResult<CustomerAddressDTO[]>> {
  try {
    const parsed = createAddressSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message || "Invalid address data." };
    }

    const addresses = await createCustomerAddress(parsed.data);
    revalidatePath("/account");
    revalidatePath("/account/addresses");
    return { success: true, data: addresses };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create address.";
    console.error("[AccountAction] createAddress error:", error);
    return { success: false, error: message };
  }
}

export async function updateCustomerAddressAction(rawInput: UpdateAddressInput): Promise<AccountActionResult<CustomerAddressDTO[]>> {
  try {
    const parsed = updateAddressSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message || "Invalid address data." };
    }

    const addresses = await updateCustomerAddress(parsed.data);
    revalidatePath("/account");
    revalidatePath("/account/addresses");
    return { success: true, data: addresses };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update address.";
    console.error("[AccountAction] updateAddress error:", error);
    return { success: false, error: message };
  }
}

export async function deleteCustomerAddressAction(rawInput: DeleteAddressInput): Promise<AccountActionResult<CustomerAddressDTO[]>> {
  try {
    const parsed = deleteAddressSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message || "Invalid address identifier." };
    }

    const addresses = await deleteCustomerAddress(parsed.data);
    revalidatePath("/account");
    revalidatePath("/account/addresses");
    return { success: true, data: addresses };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete address.";
    console.error("[AccountAction] deleteAddress error:", error);
    return { success: false, error: message };
  }
}

export async function setDefaultCustomerAddressAction(rawInput: SetDefaultAddressInput): Promise<AccountActionResult<CustomerAddressDTO[]>> {
  try {
    const parsed = setDefaultAddressSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message || "Invalid address identifier." };
    }

    const addresses = await setDefaultCustomerAddress(parsed.data);
    revalidatePath("/account");
    revalidatePath("/account/addresses");
    return { success: true, data: addresses };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to set default address.";
    console.error("[AccountAction] setDefaultAddress error:", error);
    return { success: false, error: message };
  }
}
