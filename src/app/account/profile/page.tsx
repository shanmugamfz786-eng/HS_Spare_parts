"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { getCustomerProfileAction, updateCustomerProfileAction } from "@/features/account/actions";
import { adminLoginAction, loginAction } from "@/features/auth/actions";
import type { CustomerProfileDTO } from "@/features/account/schemas";

const ADMIN_ROLES = ["administrator", "super_administrator", "catalogue_manager", "order_manager"];

export default function ProfilePage() {
  const [profile, setProfile] = useState<CustomerProfileDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // User Profile Form State
  const [nameInput, setNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Admin Login Section Form State
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [isAdminSubmitting, setIsAdminSubmitting] = useState(false);

  // Unauthenticated user fallback login state
  const [fallbackEmail, setFallbackEmail] = useState("");
  const [fallbackPassword, setFallbackPassword] = useState("");
  const [fallbackError, setFallbackError] = useState<string | null>(null);

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

  const handleProfileSubmit = (e: React.FormEvent) => {
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

  const handleAdminLoginSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAdminError(null);
    setIsAdminSubmitting(true);

    const formData = new FormData();
    formData.append("email", adminEmail);
    formData.append("password", adminPassword);

    try {
      const result = await adminLoginAction(null, formData);
      if (result.success) {
        window.location.href = "/admin";
      } else {
        setAdminError(result.error || "Invalid administrator credentials. Access denied.");
      }
    } catch {
      setAdminError("Authentication error. Please check your credentials.");
    } finally {
      setIsAdminSubmitting(false);
    }
  };

  const handleFallbackLoginSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFallbackError(null);
    setIsAdminSubmitting(true);

    const formData = new FormData();
    formData.append("email", fallbackEmail);
    formData.append("password", fallbackPassword);

    try {
      // First try admin login if email or password looks like admin
      const adminRes = await adminLoginAction(null, formData);
      if (adminRes.success) {
        window.location.href = "/admin";
        return;
      }

      // Fallback to customer login
      const custRes = await loginAction(null, formData);
      if (custRes.success) {
        const resData = custRes.data as { isAuthorizedAdmin?: boolean } | undefined;
        if (resData?.isAuthorizedAdmin) {
          window.location.href = "/admin";
          return;
        }
        window.location.reload();
      } else {
        setFallbackError(custRes.error || adminRes.error || "Invalid credentials.");
      }
    } catch {
      setFallbackError("Authentication failed. Please verify your connection.");
    } finally {
      setIsAdminSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-ember mx-auto mb-3" />
        <p className="text-xs text-gray-500 font-medium">Loading profile credentials...</p>
      </div>
    );
  }

  // 1. Unauthenticated View (User not signed in yet)
  if (!profile) {
    return (
      <div className="max-w-md mx-auto px-4 sm:px-6 py-12">
        <div className="rounded-2xl bg-white border border-gray-200/90 p-8 shadow-xl space-y-6">
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-ember to-ember-deep text-white font-black text-xl flex items-center justify-center mx-auto mb-3 shadow-md">
              HS
            </div>
            <h1 className="text-xl font-bold text-gray-900">User Profile Sign In</h1>
            <p className="text-xs text-gray-500 mt-1">
              Sign in with your user account or administrator credentials.
            </p>
          </div>

          {fallbackError && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{fallbackError}</span>
            </div>
          )}

          <form onSubmit={handleFallbackLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={fallbackEmail}
                  onChange={(e) => setFallbackEmail(e.target.value)}
                  placeholder="user@example.com or hsspareparts01@admin.com"
                  className="w-full bg-white border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showAdminPassword ? "text" : "password"}
                  required
                  value={fallbackPassword}
                  onChange={(e) => setFallbackPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white border border-gray-300 rounded-xl pl-9 pr-9 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPassword(!showAdminPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showAdminPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isAdminSubmitting}
              className="w-full btn-primary py-2.5 px-4 text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all"
            >
              {isAdminSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <span>Sign In / Enter Admin</span>
              )}
            </button>
          </form>

          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200/80 text-[11px] text-gray-500 text-center">
            <span>Admin credentials (e.g. </span>
            <code className="text-gray-800 font-mono font-bold">hsspareparts01@admin.com</code>
            <span>) automatically redirect into the <strong>Admin Portal</strong>.</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. Authenticated Profile View
  const isAlreadyAdmin = profile.roles?.some((r) => ADMIN_ROLES.includes(r));

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div>
        <Link
          href="/account"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-ember transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Account</span>
        </Link>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
          Personal Profile
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Manage your customer identity and administrative access credentials.
        </p>
      </div>

      {/* Profile Form Card */}
      <div className="rounded-2xl bg-white border border-gray-200/90 shadow-xs p-6 sm:p-8">
        {statusMessage && (
          <div
            className={`mb-6 p-3.5 rounded-xl flex items-center gap-2 text-xs ${
              statusMessage.type === "success"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        <form onSubmit={handleProfileSubmit} className="space-y-5">
          {/* Email (Read-Only) */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Email Address (Immutable)
            </label>
            <input
              type="email"
              disabled
              value={profile.email}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-500 font-mono cursor-not-allowed"
            />
            <span className="text-[10px] text-gray-400 block mt-1">
              Email address is permanently bound to this account.
            </span>
          </div>

          {/* Full Name */}
          <div>
            <label htmlFor="name-input" className="block text-xs font-semibold text-gray-700 mb-1">
              Full Name
            </label>
            <input
              id="name-input"
              type="text"
              required
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
            />
          </div>

          {/* Phone Number */}
          <div>
            <label htmlFor="phone-input" className="block text-xs font-semibold text-gray-700 mb-1">
              Mobile Phone (10 Digits)
            </label>
            <input
              id="phone-input"
              type="tel"
              placeholder="9876543210"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
            />
            <span className="text-[10px] text-gray-400 block mt-1">
              Used for courier delivery updates and dispatch notices.
            </span>
          </div>

          <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
            <Link href="/account" className="btn-secondary py-2 px-4 text-xs font-semibold rounded-xl">
              Back
            </Link>

            <button
              type="submit"
              disabled={isPending}
              className="btn-primary py-2 px-5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-xs"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Profile</span>
            </button>
          </div>
        </form>
      </div>

      {/* Administrator Portal Access Section */}
      <div className="rounded-2xl bg-white border border-gray-200/90 shadow-xs p-6 sm:p-8">
        {isAlreadyAdmin ? (
          <div className="p-5 rounded-2xl bg-[#090D18] border border-gray-800 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-ember/20 border border-ember/30 flex items-center justify-center text-ember shrink-0">
                <ShieldCheck className="w-6 h-6 text-ember" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-white">Administrator Session Active</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-ember text-white px-2 py-0.5 rounded-full">
                    Admin
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  You are authenticated with full administrative clearance.
                </p>
              </div>
            </div>
            <Link
              href="/admin"
              className="btn-primary py-2.5 px-5 text-xs font-bold rounded-xl whitespace-nowrap self-start sm:self-auto flex items-center gap-2 shadow-md hover:scale-[1.02] transition-transform"
            >
              <span>Launch Admin Portal</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-ember shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900">Administrator Portal Authentication</h2>
                <p className="text-xs text-gray-500">
                  Enter authorized administrator credentials to unlock executive operations and the Admin Portal.
                </p>
              </div>
            </div>

            {adminError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="font-semibold">{adminError}</span>
              </div>
            )}

            <form onSubmit={handleAdminLoginSubmit} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Administrator Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="hsspareparts01@admin.com"
                    className="w-full bg-white border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Administrator Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showAdminPassword ? "text" : "password"}
                    required
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-white border border-gray-300 rounded-xl pl-9 pr-9 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword(!showAdminPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showAdminPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isAdminSubmitting}
                  className="w-full py-2.5 px-4 bg-[#090D18] hover:bg-black text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs hover:shadow transition-all disabled:opacity-50"
                >
                  {isAdminSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying Administrative Clearance...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 text-ember" />
                      <span>Sign In & Launch Admin Portal</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
