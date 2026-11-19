import { z } from "zod";

export const createOrderInputSchema = z
  .object({
    addressId: z.string().uuid("Please select a valid delivery address."),
    idempotencyKey: z
      .string()
      .min(10, "Idempotency key is required to prevent duplicate orders.")
      .max(255, "Idempotency key exceeds maximum length."),
    quoteToken: z.string().min(20, "Valid checkout quote token is required."),
  })
  .strict();

export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

export interface OrderItemDTO {
  id: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  sku: string;
  variantSku: string | null;
  unitPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
}

export interface AddressSnapshotDTO {
  recipient: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  stateRegion: string;
  postalCode: string;
  countryCode: string;
}

export interface OrderStatusHistoryItemDTO {
  status: string;
  note: string | null;
  timestamp: string;
}

export interface OrderSummaryDTO {
  id: string;
  orderNumber: string;
  placedAt: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  itemCount: number;
  totalMinor: number;
  currency: "INR";
}

export interface OrderDetailDTO {
  id: string;
  orderNumber: string;
  userId: string | null;
  placedAt: string;
  updatedAt: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  subtotalMinor: number;
  shippingMinor: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
  currency: "INR";
  shippingAddress: AddressSnapshotDTO;
  items: OrderItemDTO[];
  statusHistory: OrderStatusHistoryItemDTO[];
  tracking: {
    hasLiveTracking: boolean;
    carrier: string | null;
    trackingNumber: string | null;
    trackingUrl?: string | null;
    status?: string | null;
    shippedAt?: string | null;
    deliveredAt?: string | null;
    message: string;
    milestones?: Array<{
      status: string;
      description: string;
      timestamp: string;
    }>;
  };
}

export interface PaginatedOrdersDTO {
  orders: OrderSummaryDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
