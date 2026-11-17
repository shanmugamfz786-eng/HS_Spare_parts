"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { getCustomerProfileAction, updateCustomerProfileAction } from "@/features/account/actions";
import type { CustomerProfileDTO } from "@/features/account/schemas";

export default function ProfilePage() {
  const [profile, setProfile] = useState<CustomerProfileDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [nameInput, setNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const res = await getCustomerProfileAction();
      if (res.success && res.data) {
        setProfile(res.data);
        setNameInput(res.data.name);
        setPhoneInput(res.data.phone || "");
      }
      setIsLoading(false);
    }
    load();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    startTransition(async () => {
      const result = await updateCustomerProfileAction({
        name: nameInput,
        phone: phoneInput || null,
      });

      if (result.success && result.data) {
        setProfile(result.data);
        setStatusMessage({ type: "success", text: "Profile updated successfully." });
      } else {
        setStatusMessage({ type: "error", text: result.error || "Failed to update profile." });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-ember mx-auto mb-3" />
        <p className="text-xs text-gray-400">Loading profile details...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-xs text-gray-400 mb-4">Please sign in to access your profile.</p>
        <Link href="/account" className="btn-primary py-2 px-4 text-xs font-semibold">
          Go to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6">
        <Link
          href="/account"
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-ember transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Account</span>
        </Link>
        <h1 className="text-2xl sm:text-3xl font-black text-paper tracking-tight">
          Personal Profile
        </h1>
      </div>

      <div className="rounded-card bg-ink-raised border border-gray-800 p-6 sm:p-8 shadow-xl">
        {statusMessage && (
          <div
            className={`mb-6 p-3.5 rounded-brand flex items-center gap-2 text-xs ${
              statusMessage.type === "success"
                ? "bg-green-950/30 border border-green-800 text-green-300"
                : "bg-red-950/30 border border-red-800 text-red-300"
            }`}
          >
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email (Read-Only) */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">
              Email Address (Immutable)
            </label>
            <input
              type="email"
              disabled
              value={profile.email}
              className="w-full bg-ink/50 border border-gray-800 rounded px-3 py-2 text-xs text-gray-400 font-mono cursor-not-allowed"
            />
            <span className="text-[10px] text-gray-400 block mt-1">
              Email address is permanently bound to this account.
            </span>
          </div>

          {/* Full Name */}
          <div>
            <label htmlFor="name-input" className="block text-xs font-semibold text-gray-300 mb-1">
              Full Name
            </label>
            <input
              id="name-input"
              type="text"
              required
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="w-full bg-ink border border-gray-700 rounded px-3 py-2 text-xs text-paper focus:outline-none focus:border-ember"
            />
          </div>

          {/* Phone Number */}
          <div>
            <label htmlFor="phone-input" className="block text-xs font-semibold text-gray-300 mb-1">
              Mobile Phone (10 Digits)
            </label>
            <input
              id="phone-input"
              type="tel"
              placeholder="9876543210"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              className="w-full bg-ink border border-gray-700 rounded px-3 py-2 text-xs text-paper focus:outline-none focus:border-ember"
            />
            <span className="text-[10px] text-gray-400 block mt-1">
              Used for courier delivery updates and dispatch notices.
            </span>
          </div>

          <div className="pt-4 border-t border-gray-800 flex items-center justify-between">
            <Link href="/account" className="btn-secondary py-2 px-4 text-xs font-semibold">
              Cancel
            </Link>

            <button
              type="submit"
              disabled={isPending}
              className="btn-primary py-2 px-5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-md"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
