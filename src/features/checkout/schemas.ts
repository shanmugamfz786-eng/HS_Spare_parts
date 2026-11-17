import { z } from "zod";

export const getCheckoutQuoteSchema = z.object({
  addressId: z.string().uuid("Invalid address ID format").optional(),
});

export type GetCheckoutQuoteInput = z.infer<typeof getCheckoutQuoteSchema>;

export interface DeliveryServiceabilityDTO {
  isConfigured: boolean;
  isServiceable: boolean;
  carrier: string | null;
  estimatedDays: number | null;
  shippingFeeMinor: number;
  message: string;
}

export interface CheckoutQuoteItemDTO {
  cartItemId: string;
  productId: string;
  variantId: string | null;
  productName: string;
  sku: string;
  variantSku: string | null;
  unitPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
  availableStock: number;
  inStock: boolean;
  hasStockWarning: boolean;
}

export interface CheckoutQuoteDTO {
  quoteId: string;
  quoteToken: string;
  expiresAt: string;
  items: CheckoutQuoteItemDTO[];
  itemCount: number;
  totalQuantity: number;
  subtotalMinor: number;
  shippingMinor: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
  currency: "INR";
  selectedAddressId: string | null;
  serviceability: DeliveryServiceabilityDTO;
  warnings: string[];
}
