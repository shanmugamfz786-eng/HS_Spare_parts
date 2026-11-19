"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Truck,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Loader2,
  ShieldCheck,
  PackageCheck,
  RotateCcw,
} from "lucide-react";
import { trackOrderPubliclyAction } from "@/features/fulfillment/public-actions";
import type { PublicOrderTrackingDTO } from "@/features/fulfillment/types";
import { isSafeHttpsUrl } from "@/features/fulfillment/schemas";
import { STORE_CONTACT_CONFIG } from "@/lib/constants/store-config";

export default function TrackOrderPage() {
  const [orderReference, setOrderReference] = useState("");
  const [contact, setContact] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [trackingResult, setTrackingResult] = useState<PublicOrderTrackingDTO | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedRef = orderReference.trim();
    const trimmedContact = contact.trim();

    if (!trimmedRef) {
      setErrorMessage("Please enter your order reference number.");
      return;
    }

    if (!trimmedContact) {
      setErrorMessage("Please enter your registered email address or phone number.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await trackOrderPubliclyAction({
        orderReference: trimmedRef,
        contact: trimmedContact,
      });

      if (!res.success || !res.data) {
        setTrackingResult(null);
        setErrorMessage(
          res.error ||
            "No order was found matching the provided reference and contact details. Please verify your information and try again."
        );
      } else {
        setTrackingResult(res.data);
      }
    } catch {
      setTrackingResult(null);
      setErrorMessage(
        "Unable to retrieve tracking details at this time. Please verify your network connection and try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setTrackingResult(null);
    setErrorMessage(null);
    setOrderReference("");
    setContact("");
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Page Header */}
      <div className="text-center max-w-xl mx-auto mb-10">
        <div className="w-12 h-12 rounded-xl bg-ember/10 border border-ember/20 text-ember flex items-center justify-center mx-auto mb-4">
          <Truck className="w-6 h-6" />
        </div>
        <h1 className="text-2xl sm:text-4xl font-black text-gray-900 tracking-tight mb-2">
          Track Your Order
        </h1>
        <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
          Enter your order reference number along with the email address or phone number used during checkout to inspect real-time courier shipment status.
        </p>
      </div>

      {/* Main Container */}
      <div className="rounded-2xl bg-white border border-gray-200/90 p-6 sm:p-8 shadow-sm max-w-xl mx-auto mb-8">
        {!trackingResult ? (
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label
                htmlFor="order-reference-input"
                className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5"
              >
                Order Reference Number
              </label>
              <input
                id="order-reference-input"
                type="text"
                autoCapitalize="characters"
                value={orderReference}
                onChange={(e) => setOrderReference(e.target.value)}
                placeholder="e.g. HS-2026-F9A2C3E1"
                required
                disabled={isLoading}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-xs sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember disabled:bg-gray-50 disabled:text-gray-400 uppercase font-mono"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Found on your order confirmation screen or email invoice.
              </p>
            </div>

            <div>
              <label
                htmlFor="order-contact-input"
                className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5"
              >
                Registered Email or Phone Number
              </label>
              <input
                id="order-contact-input"
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="e.g. customer@example.com or 9876543210"
                required
                disabled={isLoading}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-xs sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember disabled:bg-gray-50 disabled:text-gray-400"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Must match the billing or shipping contact on file.
              </p>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-start gap-3 animate-in fade-in text-xs"
              >
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-red-950">Lookup Notice</p>
                  <p className="text-red-800 leading-relaxed">{errorMessage}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-2.5 text-xs font-bold uppercase tracking-wider gap-2 shadow-md disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Order Information...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Track Order Shipment</span>
                </>
              )}
            </button>

            <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Protected by rate limiting & authentication check</span>
              </span>
              <Link href="/account/orders" className="text-ember font-semibold hover:underline">
                View Account Orders
              </Link>
            </div>
          </form>
        ) : (
          /* Tracking Result View */
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Order Reference & Status Header */}
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-500 block">Order Reference</span>
                  <span className="text-base font-black font-mono text-gray-900">
                    {trackingResult.orderReference}
                  </span>
                </div>
                <div>
                  {trackingResult.hasLiveTracking ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                      <span>{trackingResult.shipmentStatus ? trackingResult.shipmentStatus.replace(/_/g, " ") : "Dispatched"}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                      <Clock className="w-3.5 h-3.5 text-amber-700" />
                      <span>Awaiting Dispatch</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-gray-200/80">
                <div>
                  <span className="text-[10px] uppercase text-gray-500 block font-semibold">Order Placed</span>
                  <span className="text-gray-800 font-medium">
                    {new Date(trackingResult.placedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-gray-500 block font-semibold">Payment Status</span>
                  <span className="text-gray-800 font-medium capitalize">
                    {trackingResult.paymentStatus}
                  </span>
                </div>
              </div>
            </div>

            {/* Carrier Shipment Details */}
            {trackingResult.hasLiveTracking ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-white border border-gray-200 shadow-xs space-y-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-ember" />
                    <span>Courier Tracking Details</span>
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                      <span className="text-[10px] uppercase text-gray-500 block font-semibold">Courier Partner</span>
                      <span className="font-bold text-gray-900 text-sm">{trackingResult.carrier}</span>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                      <span className="text-[10px] uppercase text-gray-500 block font-semibold">Waybill / AWB Number</span>
                      <span className="font-mono font-bold text-gray-900 text-sm">
                        {trackingResult.trackingNumber}
                      </span>
                    </div>
                  </div>

                  {trackingResult.shippedAt && (
                    <p className="text-[11px] text-gray-500">
                      Dispatched on {new Date(trackingResult.shippedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  )}

                  {trackingResult.trackingUrl && (
                    <div className="pt-2">
                      {isSafeHttpsUrl(trackingResult.trackingUrl) ? (
                        <a
                          href={trackingResult.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-ember/10 text-ember hover:bg-ember/20 text-xs font-bold transition-colors"
                        >
                          <span>Open Live Tracking Page on {trackingResult.carrier}</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="text-[11px] text-gray-500 italic block">
                          Direct online tracking link is unavailable. Please visit the {trackingResult.carrier} website and enter your AWB number.
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Milestone History */}
                {trackingResult.milestones && trackingResult.milestones.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900">
                      Shipment Status Milestones
                    </h3>
                    <div className="space-y-2 text-xs">
                      {trackingResult.milestones.map((milestone, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200/80"
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <p className="font-semibold text-gray-900 text-xs">
                              {milestone.description}
                            </p>
                            <p className="text-[10px] text-gray-500">
                              {new Date(milestone.timestamp).toLocaleString("en-IN")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Awaiting Dispatch Neutral State */
              <div className="p-6 rounded-xl bg-amber-50/70 border border-amber-200 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 border border-amber-200 text-amber-800 flex items-center justify-center mx-auto">
                  <PackageCheck className="w-5 h-5 text-amber-700" />
                </div>
                <h2 className="text-sm font-bold text-amber-950">
                  Order Confirmed • Preparing Warehouse Dispatch
                </h2>
                <p className="text-xs text-amber-900/80 max-w-md mx-auto leading-relaxed">
                  Your order has been verified and our warehouse team is inspecting and packing your parts. Carrier tracking information will appear automatically on this page as soon as the consignment is dispatched.
                </p>
              </div>
            )}

            {/* Reset / Track Another Order */}
            <div className="pt-4 border-t border-gray-100 flex justify-center">
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Track Another Order</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Support Callout */}
      <div className="text-center text-xs text-gray-500">
        <span>Need urgent help with an existing order? </span>
        <span className="text-gray-700 font-medium">
          Contact WhatsApp Customer Support: {STORE_CONTACT_CONFIG.whatsappDisplay}
        </span>
      </div>
    </div>
  );
}
