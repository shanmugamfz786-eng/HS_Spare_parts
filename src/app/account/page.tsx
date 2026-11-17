"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { User, MapPin, Heart, ShoppingBag, LogOut, ArrowRight, Loader2 } from "lucide-react";
import { getCustomerProfileAction } from "@/features/account/actions";
import { loginAction, registerAction, logoutAction } from "@/features/auth/actions";
import type { CustomerProfileDTO } from "@/features/account/schemas";

export default function AccountPage() {
  const [profile, setProfile] = useState<CustomerProfileDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  const loadProfile = async () => {
    setIsLoading(true);
    const result = await getCustomerProfileAction();
    if (result.success && result.data) {
      setProfile(result.data);
    } else {
      setProfile(null);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleLoginSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await loginAction(null, formData);
      if (result.success) {
        await loadProfile();
      } else {
        setFormError(result.error || "Login failed.");
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      }
    });
  };

  const handleRegisterSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await registerAction(null, formData);
      if (result.success) {
        await loadProfile();
      } else {
        setFormError(result.error || "Registration failed.");
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      }
    });
  };

  const handleSignOut = () => {
    startTransition(async () => {
      await logoutAction();
      setProfile(null);
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-24 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-ember mx-auto mb-3" />
        <p className="text-xs text-gray-400">Loading customer account...</p>
      </div>
    );
  }

  // 1. Authenticated Customer Dashboard
  if (profile) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-800">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-paper tracking-tight">
              My Account
            </h1>
            <p className="text-xs text-gray-400 mt-1">
              Welcome back, <span className="text-paper font-semibold">{profile.name}</span> ({profile.email})
            </p>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={isPending}
            className="btn-secondary py-2 px-4 text-xs font-semibold inline-flex items-center gap-1.5 self-start sm:self-auto"
          >
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            <span>Sign Out</span>
          </button>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Profile Card */}
          <div className="rounded-card bg-ink-raised border border-gray-800 p-6 flex flex-col justify-between hover:border-gray-700 transition-all">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-ink border border-gray-700 flex items-center justify-center text-ember">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-paper">Personal Profile</h2>
                  <span className="text-xs text-gray-400">Contact & login details</span>
                </div>
              </div>

              <div className="space-y-2 text-xs text-gray-300 mb-6">
                <div>
                  <span className="text-gray-400">Full Name: </span>
                  <span className="font-semibold text-paper">{profile.name}</span>
                </div>
                <div>
                  <span className="text-gray-400">Email: </span>
                  <span className="font-mono text-paper">{profile.email}</span>
                </div>
                <div>
                  <span className="text-gray-400">Phone: </span>
                  <span className="font-mono text-paper">{profile.phone || "Not configured"}</span>
                </div>
              </div>
            </div>

            <Link
              href="/account/profile"
              className="btn-secondary py-2 px-4 text-xs font-semibold inline-flex items-center justify-between"
            >
              <span>Edit Profile</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Address Book Card */}
          <div className="rounded-card bg-ink-raised border border-gray-800 p-6 flex flex-col justify-between hover:border-gray-700 transition-all">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-ink border border-gray-700 flex items-center justify-center text-ember">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-paper">Address Book</h2>
                  <span className="text-xs text-gray-400">Manage delivery addresses</span>
                </div>
              </div>

              <p className="text-xs text-gray-400 mb-6 leading-relaxed">
                Configure your verified delivery locations across India for faster parts fulfillment.
              </p>
            </div>

            <Link
              href="/account/addresses"
              className="btn-secondary py-2 px-4 text-xs font-semibold inline-flex items-center justify-between"
            >
              <span>Manage Addresses</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Saved Wishlist Card */}
          <div className="rounded-card bg-ink-raised border border-gray-800 p-6 flex flex-col justify-between hover:border-gray-700 transition-all">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-ink border border-gray-700 flex items-center justify-center text-ember">
                  <Heart className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-paper">Saved Wishlist</h2>
                  <span className="text-xs text-gray-400">Items saved for later</span>
                </div>
              </div>

              <p className="text-xs text-gray-400 mb-6 leading-relaxed">
                Review your saved parts, monitor live stock levels, and add items directly to your cart.
              </p>
            </div>

            <Link
              href="/wishlist"
              className="btn-secondary py-2 px-4 text-xs font-semibold inline-flex items-center justify-between"
            >
              <span>View Wishlist</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Orders Card */}
          <div className="rounded-card bg-ink-raised border border-gray-800 p-6 flex flex-col justify-between hover:border-gray-700 transition-all">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-ink border border-gray-700 flex items-center justify-center text-ember">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-paper">Order History</h2>
                  <span className="text-xs text-gray-400">Past purchases & reservation status</span>
                </div>
              </div>

              <p className="text-xs text-gray-400 mb-6 leading-relaxed">
                Review your placed orders, inspect immutable item snapshots, and check payment and fulfilment timelines.
              </p>
            </div>

            <Link
              href="/account/orders"
              className="btn-secondary py-2 px-4 text-xs font-semibold inline-flex items-center justify-between"
            >
              <span>View Order History</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated Login / Register Form
  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="rounded-card bg-ink-raised border border-gray-800 p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-brand bg-gradient-to-br from-ember to-ember-deep text-paper font-black text-xl flex items-center justify-center mx-auto mb-3 shadow-md">
            HS
          </div>
          <h1 className="text-xl font-bold text-paper">
            {authMode === "login" ? "Sign In to Your Account" : "Create Customer Account"}
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Access saved addresses, wishlists, and synchronized carts.
          </p>
        </div>

        {formError && (
          <div className="mb-4 p-3 rounded-brand bg-red-950/30 border border-red-800 text-xs text-red-300">
            {formError}
          </div>
        )}

        {authMode === "login" ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Email Address
              </label>
              <input
                type="email"
                name="email"
                required
                placeholder="you@example.com"
                className="w-full bg-ink border border-gray-700 rounded px-3 py-2 text-xs text-paper focus:outline-none focus:border-ember"
              />
              {fieldErrors.email && (
                <p className="text-[11px] text-red-400 mt-1">{fieldErrors.email[0]}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Password
              </label>
              <input
                type="password"
                name="password"
                required
                placeholder="••••••••"
                className="w-full bg-ink border border-gray-700 rounded px-3 py-2 text-xs text-paper focus:outline-none focus:border-ember"
              />
              {fieldErrors.password && (
                <p className="text-[11px] text-red-400 mt-1">{fieldErrors.password[0]}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full btn-primary py-2.5 px-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Sign In</span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Full Name
              </label>
              <input
                type="text"
                name="name"
                required
                placeholder="John Doe"
                className="w-full bg-ink border border-gray-700 rounded px-3 py-2 text-xs text-paper focus:outline-none focus:border-ember"
              />
              {fieldErrors.name && (
                <p className="text-[11px] text-red-400 mt-1">{fieldErrors.name[0]}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Email Address
              </label>
              <input
                type="email"
                name="email"
                required
                placeholder="you@example.com"
                className="w-full bg-ink border border-gray-700 rounded px-3 py-2 text-xs text-paper focus:outline-none focus:border-ember"
              />
              {fieldErrors.email && (
                <p className="text-[11px] text-red-400 mt-1">{fieldErrors.email[0]}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Phone Number (Optional)
              </label>
              <input
                type="tel"
                name="phone"
                placeholder="9876543210"
                className="w-full bg-ink border border-gray-700 rounded px-3 py-2 text-xs text-paper focus:outline-none focus:border-ember"
              />
              {fieldErrors.phone && (
                <p className="text-[11px] text-red-400 mt-1">{fieldErrors.phone[0]}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Password
              </label>
              <input
                type="password"
                name="password"
                required
                placeholder="At least 8 characters"
                className="w-full bg-ink border border-gray-700 rounded px-3 py-2 text-xs text-paper focus:outline-none focus:border-ember"
              />
              {fieldErrors.password && (
                <p className="text-[11px] text-red-400 mt-1">{fieldErrors.password[0]}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full btn-primary py-2.5 px-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Create Account</span>
            </button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-gray-800 text-center">
          <button
            type="button"
            onClick={() => {
              setAuthMode(authMode === "login" ? "register" : "login");
              setFormError(null);
              setFieldErrors({});
            }}
            className="text-xs text-ember hover:underline font-semibold"
          >
            {authMode === "login"
              ? "Don't have an account? Register here"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
