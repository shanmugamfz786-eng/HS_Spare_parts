"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Truck,
  ShieldAlert,
  CheckCircle2,
  ExternalLink,
  Clock,
  ArrowRight,
  AlertCircle,
  PackageCheck,
  Send,
} from "lucide-react";
import {
  recordManualDispatchAction,
  updateShipmentStatusAction,
} from "@/features/fulfillment/admin-actions";

export interface AdminDispatchShipmentItem {
  id: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string | null;
  status: string;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
}

interface AdminDispatchConsoleProps {
  orderId: string;
  orderNumber: string;
  paymentStatus: "pending" | "succeeded" | "failed" | "cancelled";
  fulfillmentStatus: string;
  isDispatchEligible: boolean;
  shipments: AdminDispatchShipmentItem[];
}

const COMMON_CARRIERS = [
  "Delhivery",
  "Blue Dart",
  "DTDC",
  "India Post Speed Post",
  "Trackon",
  "Professional Couriers",
  "Xpressbees",
  "Shadowfax",
  "Other Carrier",
];

export function AdminDispatchConsole({
  orderId,
  orderNumber,
  paymentStatus,
  fulfillmentStatus,
  isDispatchEligible,
  shipments,
}: AdminDispatchConsoleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Form State
  const [carrier, setCarrier] = useState("Delhivery");
  const [customCarrier, setCustomCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");

  // Feedback State
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Milestone Update State
  const [selectedMilestone, setSelectedMilestone] = useState<Record<string, string>>({});
  const [milestoneNotes, setMilestoneNotes] = useState<Record<string, string>>({});

  const isPaid = paymentStatus === "succeeded";
  const finalCarrier = carrier === "Other Carrier" ? customCarrier.trim() : carrier;

  async function handleDispatch(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!finalCarrier) {
      setErrorMessage("Please enter or select a valid carrier name.");
      return;
    }

    if (!trackingNumber.trim()) {
      setErrorMessage("Please enter a tracking / waybill number.");
      return;
    }

    startTransition(async () => {
      const res = await recordManualDispatchAction({
        orderId,
        carrier: finalCarrier,
        trackingNumber: trackingNumber.trim(),
        trackingUrl: trackingUrl.trim() || undefined,
      });

      if (!res.success) {
        setErrorMessage(res.error || "Failed to record dispatch.");
      } else {
        setSuccessMessage(`Order ${orderNumber} successfully marked as dispatched via ${finalCarrier}.`);
        setTrackingNumber("");
        setTrackingUrl("");
        router.refresh();
      }
    });
  }

  async function handleMilestoneUpdate(shipmentId: string) {
    const nextStatus = selectedMilestone[shipmentId];
    if (!nextStatus) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const res = await updateShipmentStatusAction({
        shipmentId,
        status: nextStatus as
          | "created"
          | "shipped"
          | "in_transit"
          | "out_for_delivery"
          | "delivered"
          | "failed"
          | "returned",
        note: milestoneNotes[shipmentId]?.trim() || undefined,
      });

      if (!res.success) {
        setErrorMessage(res.error || "Failed to update milestone.");
      } else {
        setSuccessMessage(`Shipment status advanced to '${nextStatus}'.`);
        router.refresh();
      }
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-ember/10 border border-ember/20 text-ember flex items-center justify-center">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">
              Carrier Dispatch & Fulfillment Console
            </h2>
            <p className="text-xs text-gray-500">
              Manual dispatch recording & tracking status synchronization
            </p>
          </div>
        </div>

        {/* Status Badge */}
        {isPaid ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Payment Verified</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5" />
            <span>Payment {paymentStatus.toUpperCase()}</span>
          </span>
        )}
      </div>

      {/* Alerts */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-start gap-3 text-xs leading-relaxed">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="font-bold">Dispatch Error: </strong>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-3 text-xs leading-relaxed">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="font-bold">Success: </strong>
            <span>{successMessage}</span>
          </div>
        </div>
      )}

      {/* Unpaid / Pending Payment Warning */}
      {!isPaid && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2 text-xs">
          <div className="flex items-center gap-2 font-bold text-amber-800">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <span>Dispatch Blocked: Payment Incomplete</span>
          </div>
          <p className="leading-relaxed text-amber-700">
            This order cannot be dispatched because payment status is <strong>&quot;{paymentStatus}&quot;</strong>.
            HS Spare Parts strictly requires verified payment capture before goods can be released for carrier dispatch.
          </p>
        </div>
      )}

      {/* Dispatch Form (Enabled only if paid and eligible) */}
      {isPaid && isDispatchEligible && (
        <form onSubmit={handleDispatch} className="space-y-4 pt-2">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
            <div className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              Record New Carrier Dispatch
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Shipping Carrier *
                </label>
                <select
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className="w-full text-xs font-medium rounded-lg border-gray-300 shadow-sm focus:border-ember focus:ring-ember bg-white p-2.5 border"
                  disabled={isPending}
                >
                  {COMMON_CARRIERS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                {carrier === "Other Carrier" && (
                  <input
                    type="text"
                    placeholder="Enter carrier name (e.g. DTDC Express)"
                    value={customCarrier}
                    onChange={(e) => setCustomCarrier(e.target.value)}
                    className="mt-2 w-full text-xs rounded-lg border-gray-300 shadow-sm focus:border-ember focus:ring-ember p-2 border"
                    disabled={isPending}
                    required
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Tracking / AWB Number *
                </label>
                <input
                  type="text"
                  placeholder="e.g. DEL-88239104"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="w-full text-xs font-mono rounded-lg border-gray-300 shadow-sm focus:border-ember focus:ring-ember p-2.5 border"
                  disabled={isPending}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Public Tracking URL <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <input
                type="url"
                placeholder="https://www.delhivery.com/track/package/..."
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
                className="w-full text-xs rounded-lg border-gray-300 shadow-sm focus:border-ember focus:ring-ember p-2.5 border"
                disabled={isPending}
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isPending}
                className="w-full sm:w-auto px-5 py-2.5 bg-ember hover:bg-ember/90 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isPending ? (
                  <span>Recording Dispatch...</span>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Confirm & Record Dispatch</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Dispatched Notification if already dispatched */}
      {isPaid && !isDispatchEligible && fulfillmentStatus !== "pending" && (
        <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-gray-700 flex items-center gap-3 text-xs">
          <PackageCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <div>
            <strong className="text-gray-900">Current Fulfillment State: </strong>
            <span className="font-semibold uppercase text-ember">{fulfillmentStatus}</span>.
            {shipments.length > 0 && " Carrier shipment recorded below."}
          </div>
        </div>
      )}

      {/* Existing Shipments List & Milestone Progression */}
      {shipments.length > 0 && (
        <div className="space-y-4 pt-2">
          <div className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            Shipment Records ({shipments.length})
          </div>

          <div className="space-y-3">
            {shipments.map((s) => (
              <div
                key={s.id}
                className="p-4 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-colors space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-gray-900">{s.carrier}</span>
                      <span className="px-2 py-0.5 text-[11px] font-bold uppercase rounded-md bg-gray-100 text-gray-800">
                        {s.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 font-mono mt-0.5">
                      <span>Waybill: {s.trackingNumber}</span>
                      {s.trackingUrl && (
                        <a
                          href={s.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ember hover:underline flex items-center gap-0.5 font-sans"
                        >
                          <span>Track Online</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-gray-400">
                    Dispatched: {new Date(s.shippedAt || s.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </div>

                {/* Milestone Progression Console */}
                {s.status !== "delivered" && s.status !== "returned" && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                    <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
                      Update Milestone:
                    </span>
                    <select
                      value={selectedMilestone[s.id] || ""}
                      onChange={(e) =>
                        setSelectedMilestone((prev) => ({ ...prev, [s.id]: e.target.value }))
                      }
                      className="text-xs rounded-lg border-gray-300 shadow-sm focus:border-ember focus:ring-ember bg-white p-2 border"
                      disabled={isPending}
                    >
                      <option value="">Select Next Status...</option>
                      {s.status === "shipped" && <option value="in_transit">In Transit</option>}
                      {(s.status === "shipped" || s.status === "in_transit") && (
                        <option value="out_for_delivery">Out for Delivery</option>
                      )}
                      {(s.status === "shipped" ||
                        s.status === "in_transit" ||
                        s.status === "out_for_delivery") && (
                        <option value="delivered">Delivered to Customer</option>
                      )}
                      <option value="failed">Failed Delivery Attempt</option>
                      <option value="returned">Returned to Sender</option>
                    </select>

                    <input
                      type="text"
                      placeholder="Audit note (optional)"
                      value={milestoneNotes[s.id] || ""}
                      onChange={(e) =>
                        setMilestoneNotes((prev) => ({ ...prev, [s.id]: e.target.value }))
                      }
                      className="text-xs rounded-lg border-gray-300 shadow-sm focus:border-ember focus:ring-ember p-2 border flex-1"
                      disabled={isPending}
                    />

                    <button
                      type="button"
                      onClick={() => handleMilestoneUpdate(s.id)}
                      disabled={isPending || !selectedMilestone[s.id]}
                      className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      <ArrowRight className="w-3 h-3" />
                      <span>Update</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
