import "server-only";

// ----------------------------------------------------------------------
// Fulfillment Domain Types & State Machine
// ----------------------------------------------------------------------

export type ShipmentStatus =
  | "created"
  | "shipped"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "returned";

export type OrderFulfillmentStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned";

/**
 * Valid state transitions for a shipment.
 */
export const ALLOWED_SHIPMENT_TRANSITIONS: Record<
  ShipmentStatus,
  readonly ShipmentStatus[]
> = {
  created: ["shipped", "in_transit", "failed"],
  shipped: ["in_transit", "out_for_delivery", "delivered", "failed", "returned"],
  in_transit: ["out_for_delivery", "delivered", "failed", "returned"],
  out_for_delivery: ["delivered", "failed", "returned"],
  delivered: ["returned"], // Can transition to returned via returns workflow
  failed: ["returned", "shipped"], // Retry shipment or return to origin
  returned: [], // Terminal
} as const;

export function isValidShipmentTransition(
  from: ShipmentStatus,
  to: ShipmentStatus
): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_SHIPMENT_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

// ----------------------------------------------------------------------
// DTOs
// ----------------------------------------------------------------------

export interface ShipmentMilestone {
  status: ShipmentStatus;
  location?: string | null;
  description: string;
  timestamp: Date;
}

export interface ShipmentItemDTO {
  sku: string;
  name: string;
  quantity: number;
}

export interface ShipmentCreationParams {
  orderId: string;
  orderNumber: string;
  carrier: string;
  trackingNumber?: string;
  destinationPincode: string;
  destinationAddress: string;
  customerName: string;
  customerPhone?: string | null;
  packageWeightGrams?: number;
  items: ShipmentItemDTO[];
}

export interface ShipmentResult {
  shipmentId?: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string | null;
  status: ShipmentStatus;
  estimatedDeliveryDate?: Date | null;
}

export interface TrackingMilestoneResult {
  trackingNumber: string;
  carrier: string;
  currentStatus: ShipmentStatus;
  milestones: ShipmentMilestone[];
}

export interface OrderTrackingDTO {
  orderId: string;
  orderNumber: string;
  fulfillmentStatus: OrderFulfillmentStatus;
  hasLiveTracking: boolean;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  milestones: Array<{
    status: ShipmentStatus;
    location?: string | null;
    description: string;
    timestamp: string;
  }>;
}

// ----------------------------------------------------------------------
// Provider-Independent Fulfillment Carrier Adapter Contract
// ----------------------------------------------------------------------

export interface FulfillmentCarrierAdapter {
  readonly carrierName: string;

  /**
   * Generates a waybill / shipping label with the carrier API.
   */
  createShipment?(params: ShipmentCreationParams): Promise<ShipmentResult>;

  /**
   * Fetches real-time milestone tracking events from the carrier API.
   */
  fetchTrackingMilestones?(
    trackingNumber: string,
    carrier: string
  ): Promise<TrackingMilestoneResult>;

  /**
   * Cancels a generated waybill before carrier pickup.
   */
  cancelShipment?(trackingNumber: string): Promise<boolean>;
}

// ----------------------------------------------------------------------
// Admin Fulfillment Management DTOs
// ----------------------------------------------------------------------

export interface AdminOrderItemDTO {
  id: string;
  productId?: string | null;
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
}

export interface AdminShipmentDTO {
  id: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string | null;
  status: ShipmentStatus;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  milestones?: Array<{
    status: ShipmentStatus;
    location?: string | null;
    description: string;
    timestamp: string;
  }>;
}

export interface AdminOrderListItemDTO {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  totalAmount: number;
  currency: string;
  paymentStatus: "pending" | "succeeded" | "failed" | "cancelled";
  fulfillmentStatus: OrderFulfillmentStatus;
  itemsCount: number;
  createdAt: string;
  isDispatchEligible: boolean;
}

export interface AdminOrderDetailDTO {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  shippingAddress: {
    fullName?: string;
    phone?: string;
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    pincode: string;
    country?: string;
  };
  totalAmount: number;
  subtotalAmount: number;
  shippingAmount: number;
  taxAmount: number;
  currency: string;
  paymentStatus: "pending" | "succeeded" | "failed" | "cancelled";
  fulfillmentStatus: OrderFulfillmentStatus;
  createdAt: string;
  updatedAt: string;
  items: AdminOrderItemDTO[];
  shipments: AdminShipmentDTO[];
  isDispatchEligible: boolean;
  statusHistory?: Array<{
    status: string;
    note?: string | null;
    timestamp: string;
  }>;
}

// ----------------------------------------------------------------------
// Secure Public Customer Tracking DTO
// ----------------------------------------------------------------------

export interface PublicTrackingMilestoneDTO {
  status: string;
  description: string;
  timestamp: string;
}

export interface PublicOrderTrackingDTO {
  orderReference: string;
  placedAt: string;
  paymentStatus: string;
  fulfillmentStatus: OrderFulfillmentStatus;
  hasLiveTracking: boolean;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shipmentStatus: ShipmentStatus | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  milestones: PublicTrackingMilestoneDTO[];
}
