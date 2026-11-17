"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Edit3, Star, Loader2, MapPin } from "lucide-react";
import {
  getCustomerAddressesAction,
  createCustomerAddressAction,
  updateCustomerAddressAction,
  deleteCustomerAddressAction,
  setDefaultCustomerAddressAction,
} from "@/features/account/actions";
import type { CustomerAddressDTO } from "@/features/account/schemas";

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh"
];

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<CustomerAddressDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAddress, setEditingAddress] = useState<CustomerAddressDTO | null>(null);
  const [isPending, startTransition] = useTransition();

  // Form State
  const [recipient, setRecipient] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateRegion, setStateRegion] = useState("Maharashtra");
  const [postalCode, setPostalCode] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadAddresses = async () => {
    setIsLoading(true);
    const res = await getCustomerAddressesAction();
    if (res.success && res.data) {
      setAddresses(res.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadAddresses();
  }, []);

  const openCreateModal = () => {
    setEditingAddress(null);
    setRecipient("");
    setPhone("");
    setAddressLine1("");
    setAddressLine2("");
    setCity("");
    setStateRegion("Maharashtra");
    setPostalCode("");
    setIsDefault(addresses.length === 0);
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (addr: CustomerAddressDTO) => {
    setEditingAddress(addr);
    setRecipient(addr.recipient);
    setPhone(addr.phone);
    setAddressLine1(addr.addressLine1);
    setAddressLine2(addr.addressLine2 || "");
    setCity(addr.city);
    setStateRegion(addr.stateRegion);
    setPostalCode(addr.postalCode);
    setIsDefault(addr.isDefault);
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    startTransition(async () => {
      if (editingAddress) {
        const res = await updateCustomerAddressAction({
          addressId: editingAddress.id,
          recipient,
          phone,
          addressLine1,
          addressLine2: addressLine2 || null,
          city,
          stateRegion,
          postalCode,
          countryCode: "IN",
          addressType: "shipping",
          isDefault,
        });

        if (res.success && res.data) {
          setAddresses(res.data);
          setShowModal(false);
        } else {
          setFormError(res.error || "Failed to update address.");
        }
      } else {
        const res = await createCustomerAddressAction({
          recipient,
          phone,
          addressLine1,
          addressLine2: addressLine2 || null,
          city,
          stateRegion,
          postalCode,
          countryCode: "IN",
          addressType: "shipping",
          isDefault,
        });

        if (res.success && res.data) {
          setAddresses(res.data);
          setShowModal(false);
        } else {
          setFormError(res.error || "Failed to create address.");
        }
      }
    });
  };

  const handleDelete = (addressId: string) => {
    if (confirm("Are you sure you want to delete this address?")) {
      startTransition(async () => {
        const res = await deleteCustomerAddressAction({ addressId });
        if (res.success && res.data) {
          setAddresses(res.data);
        } else if (res.error) {
          alert(res.error);
        }
      });
    }
  };

  const handleSetDefault = (addressId: string) => {
    startTransition(async () => {
      const res = await setDefaultCustomerAddressAction({ addressId });
      if (res.success && res.data) {
        setAddresses(res.data);
      } else if (res.error) {
        alert(res.error);
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/account"
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-ember transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Account</span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-black text-paper tracking-tight">
            Delivery Addresses
          </h1>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="btn-primary py-2 px-4 text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add New Address</span>
        </button>
      </div>

      {isLoading && (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-ember mx-auto mb-3" />
          <p className="text-xs text-gray-400">Loading delivery addresses...</p>
        </div>
      )}

      {!isLoading && addresses.length === 0 && (
        <div className="rounded-card bg-ink-raised border border-gray-800 p-12 text-center max-w-lg mx-auto my-8 shadow-xl">
          <div className="w-16 h-16 rounded-full bg-ink border border-gray-800 flex items-center justify-center text-gray-500 mx-auto mb-4">
            <MapPin className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-bold text-paper mb-1">No Saved Addresses</h2>
          <p className="text-xs text-gray-400 mb-6 leading-relaxed">
            Add your primary workshop or home delivery address to streamline future orders.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="btn-primary inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold uppercase tracking-wider shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Add Delivery Address</span>
          </button>
        </div>
      )}

      {!isLoading && addresses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {addresses.map((addr) => (
            <div
              key={addr.id}
              className={`rounded-card bg-ink-raised border p-6 flex flex-col justify-between transition-all ${
                addr.isDefault ? "border-ember shadow-md shadow-ember/5" : "border-gray-800 hover:border-gray-700"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-paper">{addr.recipient}</span>
                  {addr.isDefault && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-ember/20 text-ember border border-ember/30">
                      <Star className="w-3 h-3 fill-current" />
                      <span>Default</span>
                    </span>
                  )}
                </div>

                <div className="text-xs text-gray-300 space-y-1 mb-4 leading-relaxed">
                  <p>{addr.addressLine1}</p>
                  {addr.addressLine2 && <p>{addr.addressLine2}</p>}
                  <p>
                    {addr.city}, {addr.stateRegion} — <span className="font-mono text-paper font-semibold">{addr.postalCode}</span>
                  </p>
                  <p className="text-gray-400">Phone: <span className="font-mono text-paper">{addr.phone}</span></p>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-800 flex items-center justify-between">
                <div>
                  {!addr.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(addr.id)}
                      disabled={isPending}
                      className="text-xs text-gray-400 hover:text-ember transition-colors"
                    >
                      Set as Default
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(addr)}
                    disabled={isPending}
                    aria-label={`Edit address for ${addr.recipient}`}
                    className="p-1.5 text-gray-400 hover:text-paper hover:bg-gray-800 rounded transition-colors"
                    title="Edit Address"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(addr.id)}
                    disabled={isPending}
                    aria-label={`Delete address for ${addr.recipient}`}
                    className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-950/20 rounded transition-colors"
                    title="Delete Address"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Address Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg rounded-card bg-ink-raised border border-gray-800 p-6 sm:p-8 shadow-2xl">
            <h2 className="text-lg font-bold text-paper mb-1">
              {editingAddress ? "Edit Delivery Address" : "Add Delivery Address"}
            </h2>
            <p className="text-xs text-gray-400 mb-6">
              Enter verified recipient and postal details for parts shipping.
            </p>

            {formError && (
              <div className="mb-4 p-3 rounded-brand bg-red-950/30 border border-red-800 text-xs text-red-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Recipient Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="Recipient name"
                    className="w-full bg-ink border border-gray-700 rounded px-3 py-2 text-xs text-paper focus:outline-none focus:border-ember"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Mobile Phone (10 Digits)
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full bg-ink border border-gray-700 rounded px-3 py-2 text-xs text-paper focus:outline-none focus:border-ember"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Address Line 1
                </label>
                <input
                  type="text"
                  required
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder="Street address, building, workshop"
                  className="w-full bg-ink border border-gray-700 rounded px-3 py-2 text-xs text-paper focus:outline-none focus:border-ember"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Address Line 2 (Optional)
                </label>
                <input
                  type="text"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  placeholder="Landmark, suite, unit"
                  className="w-full bg-ink border border-gray-700 rounded px-3 py-2 text-xs text-paper focus:outline-none focus:border-ember"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                    className="w-full bg-ink border border-gray-700 rounded px-3 py-2 text-xs text-paper focus:outline-none focus:border-ember"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    State / Region
                  </label>
                  <select
                    value={stateRegion}
                    onChange={(e) => setStateRegion(e.target.value)}
                    className="w-full bg-ink border border-gray-700 rounded px-3 py-2 text-xs text-paper focus:outline-none focus:border-ember"
                  >
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    PIN Code (6 Digits)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="400001"
                    className="w-full bg-ink border border-gray-700 rounded px-3 py-2 text-xs text-paper font-mono focus:outline-none focus:border-ember"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-700 bg-ink text-ember focus:ring-ember"
                  />
                  <span>Set as primary default shipping address</span>
                </label>
              </div>

              <div className="pt-4 border-t border-gray-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary py-2 px-4 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="btn-primary py-2 px-5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-md"
                >
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingAddress ? "Update Address" : "Save Address"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
