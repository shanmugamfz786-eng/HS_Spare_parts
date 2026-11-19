"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  MapPin,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Plus,
} from "lucide-react";
import { getCheckoutQuoteAction } from "@/features/checkout/actions";
import { createOrderAction } from "@/features/orders/actions";
import type { CheckoutQuoteDTO } from "@/features/checkout/schemas";
import type { CustomerAddressDTO, CreateAddressInput } from "@/features/account/schemas";
import { formatMoney } from "@/lib/money";

export default function CheckoutPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [isLoading, setIsLoading] = useState(true);
  const [quote, setQuote] = useState<CheckoutQuoteDTO | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddressDTO[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [priceChangedNotice, setPriceChangedNotice] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [createdOrderRef, setCreatedOrderRef] = useState<string | null>(null);

  // New Address form modal state
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [newRecipient, setNewRecipient] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newLine1, setNewLine1] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [newPostalCode, setNewPostalCode] = useState("");
  const [addressError, setAddressError] = useState<string | null>(null);

  // Generate stable client idempotency key on mount
  useEffect(() => {
    const key = `idem_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    setIdempotencyKey(key);
  }, []);

  // Fetch initial checkout quote and customer addresses
  const loadCheckoutData = async (addrId?: string) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // Dynamic import of account action
      const { getCustomerAddressesAction } = await import("@/features/account/actions");
      const addrRes = await getCustomerAddressesAction();

      if (addrRes.isUnauthenticated) {
        router.push("/account?returnTo=/checkout");
        return;
      }

      const userAddresses = addrRes.data ?? [];
      setAddresses(userAddresses);

      // Default to default address or first address if not selected
      const initialAddrId = addrId ?? (userAddresses.find((a) => a.isDefault)?.id || userAddresses[0]?.id);
      setSelectedAddressId(initialAddrId || null);

      // Fetch quote with selected address
      const quoteRes = await getCheckoutQuoteAction({ addressId: initialAddrId });
      if (!quoteRes.success) {
        if (quoteRes.isUnauthenticated) {
          router.push("/account?returnTo=/checkout");
          return;
        }
        setErrorMessage(quoteRes.error || "Failed to generate checkout quote.");
      } else if (quoteRes.data) {
        setQuote(quoteRes.data);
      }
    } catch (err: unknown) {
      console.error("[CheckoutPage] load error:", err);
      setErrorMessage("An unexpected error occurred while preparing your checkout quote.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCheckoutData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle address change and update quote
  const handleSelectAddress = async (addrId: string) => {
    setSelectedAddressId(addrId);
    try {
      const quoteRes = await getCheckoutQuoteAction({ addressId: addrId });
      if (quoteRes.success && quoteRes.data) {
        setQuote(quoteRes.data);
      }
    } catch (err) {
      console.error("[CheckoutPage] update address quote error:", err);
    }
  };

  // Add new address inline
  const handleCreateAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddressError(null);

    try {
      const { createCustomerAddressAction } = await import("@/features/account/actions");
      const input: CreateAddressInput = {
        recipient: newRecipient,
        phone: newPhone,
        addressLine1: newLine1,
        city: newCity,
        stateRegion: newState,
        postalCode: newPostalCode,
        countryCode: "IN",
        addressType: "shipping",
        isDefault: addresses.length === 0,
      };

      const res = await createCustomerAddressAction(input);
      if (!res.success) {
        setAddressError(res.error || "Failed to create delivery address.");
        return;
      }

      setShowAddressModal(false);
      // Reload addresses and select newly created
      const updatedAddrs = res.data ?? [];
      setAddresses(updatedAddrs);
      const newAddr = updatedAddrs[0];
      if (newAddr) {
        await handleSelectAddress(newAddr.id);
      }
    } catch (err) {
      console.error("[CheckoutPage] create address error:", err);
      setAddressError("Could not save delivery address.");
    }
  };

  // Place order
  const handlePlaceOrder = () => {
    if (!selectedAddressId) {
      setErrorMessage("Please select a delivery address before placing your order.");
      return;
    }

    if (!quote?.quoteToken) {
      setErrorMessage("Checkout quote token is missing. Please refresh your quote.");
      return;
    }

    if (!quote.serviceability.isConfigured || !quote.serviceability.isServiceable) {
      setErrorMessage(
        quote.serviceability.message ||
          "Online ordering is currently being prepared. You can continue browsing products and adding items to your cart."
      );
      return;
    }

    setErrorMessage(null);

    startTransition(async () => {
      try {
        const res = await createOrderAction({
          addressId: selectedAddressId,
          idempotencyKey,
          quoteToken: quote.quoteToken,
        });

        if (!res.success) {
          if (res.error?.includes("QUOTE_STALE") || res.error?.includes("QUOTE_EXPIRED")) {
            await loadCheckoutData(selectedAddressId);
            setPriceChangedNotice(
              res.error.replace(/^QUOTE_[A-Z_]+:\s*/, "") ||
                "Catalogue prices or cart items have changed. Please review the updated order total below and confirm."
            );
            return;
          }
          setErrorMessage(res.error || "Failed to place order.");
          return;
        }

        if (res.data) {
          setIsSuccess(true);
          setCreatedOrderRef(res.data.orderNumber);
        }
      } catch (err: unknown) {
        console.error("[CheckoutPage] place order error:", err);
        setErrorMessage("An unexpected error occurred while placing your order.");
      }
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-ember mx-auto mb-3" />
        <p className="text-xs text-gray-500">Preparing your secure checkout quote...</p>
      </div>
    );
  }

  // Success view
  if (isSuccess && createdOrderRef) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">Order Confirmed!</h1>
        <p className="text-sm text-gray-600 mb-6">
          Thank you for your order. Your items have been securely reserved.
        </p>

        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-6 max-w-md mx-auto mb-8 text-left space-y-3">
          <div className="flex justify-between items-center pb-3 border-b border-gray-100">
            <span className="text-xs text-gray-500">Order Reference</span>
            <span className="text-sm font-bold text-ember font-mono">{createdOrderRef}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">Status</span>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
              Pending Payment
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">Stock Reservation</span>
            <span className="text-xs text-emerald-700 font-semibold">Active (30 mins)</span>
          </div>
          <div className="pt-2 text-[11px] text-gray-500 border-t border-gray-100 leading-relaxed">
            Your order is safely logged and inventory is allocated. You will receive an update once processing begins.
          </div>
        </div>

        <div className="flex items-center justify-center gap-4">
          <Link
            href={`/account/orders/${createdOrderRef}`}
            className="btn-primary py-2.5 px-6 text-xs font-bold uppercase tracking-wider"
          >
            View Order Details
          </Link>
          <Link
            href="/"
            className="btn-secondary py-2.5 px-6 text-xs font-bold uppercase tracking-wider"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Checkout Header */}
      <div className="flex items-center justify-between pb-6 mb-8 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Secure Checkout</h1>
          <p className="text-xs text-gray-500 mt-1">
            Authoritative server-validated checkout quote & inventory reservation
          </p>
        </div>
        <Link
          href="/cart"
          className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-ember transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Cart</span>
        </Link>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-4 mb-6 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block mb-0.5">Checkout Notice:</span>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* Main Checkout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Columns: Delivery Address & Fulfilment */}
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1: Delivery Address */}
          <div className="rounded-2xl bg-white border border-gray-200/90 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-ember/10 text-ember text-xs font-black flex items-center justify-center">
                  1
                </div>
                <h2 className="text-base font-bold text-gray-900">Delivery Address</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAddressModal(true)}
                className="text-xs text-ember hover:underline font-bold inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Address</span>
              </button>
            </div>

            {addresses.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-gray-300 text-center text-xs text-gray-500 bg-gray-50">
                <MapPin className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                <p className="mb-3">No delivery addresses found in your address book.</p>
                <button
                  type="button"
                  onClick={() => setShowAddressModal(true)}
                  className="btn-primary py-1.5 px-3.5 text-xs"
                >
                  Add Shipping Address
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {addresses.map((addr) => {
                  const isSelected = addr.id === selectedAddressId;
                  return (
                    <label
                      key={addr.id}
                      onClick={() => handleSelectAddress(addr.id)}
                      className={`block p-4 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? "bg-orange-50/40 border-ember text-gray-900 shadow-sm ring-1 ring-ember"
                          : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-gray-900">{addr.recipient}</span>
                            {addr.isDefault && (
                              <span className="text-[10px] uppercase font-bold bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                                Default
                              </span>
                            )}
                          </div>
                          <p className="text-xs">{addr.addressLine1}</p>
                          {addr.addressLine2 && <p className="text-xs">{addr.addressLine2}</p>}
                          <p className="text-xs">
                            {addr.city}, {addr.stateRegion} — <span className="font-mono font-semibold">{addr.postalCode}</span>
                          </p>
                          <p className="text-xs text-gray-500">Phone: {addr.phone}</p>
                        </div>
                        <input
                          type="radio"
                          name="selectedAddress"
                          checked={isSelected}
                          onChange={() => handleSelectAddress(addr.id)}
                          className="mt-1 text-ember focus:ring-ember accent-[#F45A1B]"
                        />
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 2: Shipping & Delivery Serviceability */}
          <div className="rounded-2xl bg-white border border-gray-200/90 shadow-sm p-6 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-ember/10 text-ember text-xs font-black flex items-center justify-center">
                2
              </div>
              <h2 className="text-base font-bold text-gray-900">Shipping & Serviceability</h2>
            </div>
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-700 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900">Standard Delivery</span>
                <span className="font-bold text-gray-500 uppercase text-[11px]">
                  {quote?.serviceability.isServiceable
                    ? quote.serviceability.shippingFeeMinor === 0
                      ? "Free Standard Shipping"
                      : formatMoney(quote.serviceability.shippingFeeMinor)
                    : "Unavailable"}
                </span>
              </div>
              <p className="text-gray-500 leading-relaxed text-[11px]">
                {quote?.serviceability.message ||
                  "Online ordering is currently being prepared. You can continue browsing products and adding items to your cart."}
              </p>
            </div>
          </div>

          {/* Step 3: Payment Notice */}
          <div className="rounded-2xl bg-white border border-gray-200/90 shadow-sm p-6 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-ember/10 text-ember text-xs font-black flex items-center justify-center">
                3
              </div>
              <h2 className="text-base font-bold text-gray-900">Payment & Ordering Status</h2>
            </div>
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <span className="font-bold block">Online Ordering Status:</span>
              <p className="text-amber-800 text-[11px] leading-relaxed">
                Online ordering is currently being prepared. You can continue browsing products and adding items to your cart.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Quote Summary */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl bg-white border border-gray-200/90 shadow-sm p-6 space-y-6 sticky top-24">
            <h2 className="text-base font-bold text-gray-900 pb-3 border-b border-gray-200">
              Order Quote Summary
            </h2>

            {/* Items List Preview */}
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {quote?.items.map((item) => (
                <div key={item.cartItemId} className="flex items-start justify-between text-xs pb-2 border-b border-gray-100">
                  <div className="space-y-0.5 max-w-[70%]">
                    <p className="font-semibold text-gray-900 truncate">{item.productName}</p>
                    <p className="text-[11px] text-gray-500">Qty: {item.quantity} × {formatMoney(item.unitPriceMinor)}</p>
                  </div>
                  <span className="font-mono font-bold text-gray-900">{formatMoney(item.lineTotalMinor)}</span>
                </div>
              ))}
            </div>

            {/* Price Breakdown */}
            <div className="space-y-2 text-xs text-gray-600 border-t border-gray-100 pt-4">
              <div className="flex justify-between">
                <span className="text-gray-500">Items Subtotal</span>
                <span className="font-mono font-semibold text-gray-900">{formatMoney(quote?.subtotalMinor ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Delivery Charge</span>
                <span className="font-mono font-semibold text-gray-900">
                  {quote?.serviceability.isConfigured && quote.serviceability.isServiceable
                    ? quote.serviceability.shippingFeeMinor === 0
                      ? "FREE"
                      : formatMoney(quote.serviceability.shippingFeeMinor)
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Taxes (GST)</span>
                <span className="font-mono text-gray-500 italic">Included in retail price</span>
              </div>
              <div className="flex justify-between pt-3 border-t border-gray-100 text-sm font-bold">
                <span className="text-gray-900">Total Payable</span>
                <span className="font-mono text-base font-black text-gray-900">{formatMoney(quote?.totalMinor ?? 0)}</span>
              </div>
            </div>

            {/* Price Changed Stale Quote Reconfirmation Banner (Defect B) */}
            {priceChangedNotice && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-900">Catalogue Price or Cart Updated</p>
                    <p className="mt-1 text-[11px] text-amber-800 leading-relaxed">
                      {priceChangedNotice}
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t border-amber-200 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setPriceChangedNotice(null)}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-semibold transition-colors"
                  >
                    I Confirm the Updated Total
                  </button>
                </div>
              </div>
            )}

            {/* Ordering Preparation Notice Banner */}
            {quote && (!quote.serviceability.isConfigured || !quote.serviceability.isServiceable) && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-900">Online Ordering Being Prepared</p>
                  <p className="mt-1 text-[11px] text-amber-800 leading-relaxed">
                    {quote.serviceability.message ||
                      "Online ordering is currently being prepared. You can continue browsing products and adding items to your cart."}
                  </p>
                </div>
              </div>
            )}

            {/* Place Order CTA */}
            <button
              type="button"
              onClick={handlePlaceOrder}
              disabled={
                isPending ||
                !selectedAddressId ||
                !quote ||
                quote.items.length === 0 ||
                !quote.serviceability.isConfigured ||
                !quote.serviceability.isServiceable ||
                Boolean(priceChangedNotice)
              }
              className="w-full btn-primary py-3.5 px-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Reserving Stock & Creating Order...</span>
                </>
              ) : priceChangedNotice ? (
                <span>Please Confirm Updated Total Above</span>
              ) : !quote?.serviceability.isConfigured || !quote?.serviceability.isServiceable ? (
                <span>Online Ordering Being Prepared</span>
              ) : (
                <>
                  <span>Place Order</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="pt-2 text-center text-[10px] text-gray-500 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-ember" />
              <span>30-minute atomic inventory lock guaranteed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal for adding address */}
      {showAddressModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-gray-900">Add Delivery Address</h3>
            {addressError && (
              <div className="p-3 bg-red-50 border border-red-200 text-xs text-red-700 rounded-lg">
                {addressError}
              </div>
            )}
            <form onSubmit={handleCreateAddress} className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-700 font-medium mb-1">Recipient Name</label>
                <input
                  type="text"
                  required
                  value={newRecipient}
                  onChange={(e) => setNewRecipient(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg p-2 text-gray-900 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
                  placeholder="e.g. Rahul Sharma"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1">Mobile Phone (10-digit Indian)</label>
                <input
                  type="tel"
                  required
                  pattern="^[6-9]\d{9}$"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg p-2 text-gray-900 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
                  placeholder="9876543210"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1">Street Address</label>
                <input
                  type="text"
                  required
                  value={newLine1}
                  onChange={(e) => setNewLine1(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg p-2 text-gray-900 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
                  placeholder="Plot No. 42, Sector 18"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">City</label>
                  <input
                    type="text"
                    required
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg p-2 text-gray-900 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
                    placeholder="New Delhi"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">State</label>
                  <input
                    type="text"
                    required
                    value={newState}
                    onChange={(e) => setNewState(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg p-2 text-gray-900 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
                    placeholder="Delhi"
                  />
                </div>
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1">PIN Code (6-digit)</label>
                <input
                  type="text"
                  required
                  pattern="^[1-9][0-9]{5}$"
                  value={newPostalCode}
                  onChange={(e) => setNewPostalCode(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg p-2 text-gray-900 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
                  placeholder="110001"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddressModal(false)}
                  className="px-3 py-1.5 text-gray-600 hover:text-gray-900 font-medium"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary px-4 py-1.5 font-bold">
                  Save Address
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
