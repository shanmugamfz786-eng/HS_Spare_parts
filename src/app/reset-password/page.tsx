"use client";

import React, { useState, useTransition, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Lock, ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { confirmPasswordResetAction } from "@/features/auth/actions";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  // Client-side password policy helper checks
  const hasMinLength = password.length >= 8 && password.length <= 72;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      setFieldErrors({ confirmPassword: ["Passwords do not match."] });
      return;
    }

    const formData = new FormData();
    formData.append("token", token);
    formData.append("newPassword", password);

    startTransition(async () => {
      const result = await confirmPasswordResetAction(null, formData);
      if (result.success) {
        setSubmitted(true);
      } else {
        setFormError(result.error || "Failed to reset password.");
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      }
    });
  };

  if (!token || token.trim().length < 32) {
    return (
      <div className="space-y-4 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>

        <div className="space-y-1">
          <h2 className="text-sm font-bold text-gray-900">
            Invalid or Missing Recovery Link
          </h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            The password reset link is invalid, incomplete, or has expired. Please request a new recovery link.
          </p>
        </div>

        <div className="pt-4 border-t border-gray-100">
          <Link
            href="/forgot-password"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-ember text-white text-xs font-bold hover:bg-ember-deep transition-colors"
          >
            <span>Request New Reset Link</span>
          </Link>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="space-y-4 text-center animate-in fade-in duration-200">
        <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>

        <div className="space-y-1">
          <h2 className="text-sm font-bold text-gray-900">
            Password Reset Successfully
          </h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            Your password has been securely updated. All previous sessions have been signed out.
          </p>
        </div>

        <div className="pt-4 border-t border-gray-100">
          <Link
            href="/account"
            className="inline-flex items-center justify-center gap-1.5 w-full py-2.5 px-4 rounded-lg bg-ember text-white text-xs font-bold uppercase tracking-wider hover:bg-ember-deep shadow-md transition-colors"
          >
            <span>Sign In to Your Account</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
        >
          {formError}
        </div>
      )}

      <div>
        <label
          htmlFor="newPassword"
          className="block text-xs font-semibold text-gray-700 mb-1"
        >
          New Password
        </label>
        <div className="relative">
          <input
            id="newPassword"
            type={showPassword ? "text" : "password"}
            name="newPassword"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full bg-white border border-gray-300 rounded-lg pl-9 pr-10 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
          />
          <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 pointer-events-none" />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
        {fieldErrors.newPassword && (
          <p className="text-[11px] text-red-600 mt-1">{fieldErrors.newPassword[0]}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-xs font-semibold text-gray-700 mb-1"
        >
          Confirm New Password
        </label>
        <div className="relative">
          <input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            name="confirmPassword"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your new password"
            className="w-full bg-white border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
          />
          <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 pointer-events-none" />
        </div>
        {fieldErrors.confirmPassword && (
          <p className="text-[11px] text-red-600 mt-1">{fieldErrors.confirmPassword[0]}</p>
        )}
      </div>

      {/* Password Requirements Guide */}
      <div className="p-3 rounded-lg bg-gray-50 border border-gray-200/80 text-[11px] text-gray-600 space-y-1">
        <p className="font-semibold text-gray-700 text-[11px]">Password requirements:</p>
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          <span className={hasMinLength ? "text-emerald-600 font-medium" : "text-gray-500"}>
            • 8–72 characters
          </span>
          <span className={hasUpper && hasLower ? "text-emerald-600 font-medium" : "text-gray-500"}>
            • Upper & lower case
          </span>
          <span className={hasNumber ? "text-emerald-600 font-medium" : "text-gray-500"}>
            • At least 1 number
          </span>
          <span className={hasSpecial ? "text-emerald-600 font-medium" : "text-gray-500"}>
            • At least 1 symbol
          </span>
        </div>
        {confirmPassword.length > 0 && (
          <p className={`text-[10px] pt-1 ${passwordsMatch ? "text-emerald-600 font-medium" : "text-red-500"}`}>
            {passwordsMatch ? "✓ Passwords match" : "✕ Passwords do not match"}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending || !hasMinLength}
        className="w-full btn-primary py-2.5 px-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
      >
        {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        <span>Set New Password</span>
      </button>

      <div className="mt-6 pt-4 border-t border-gray-100 text-center">
        <Link
          href="/account"
          className="inline-flex items-center justify-center gap-1 text-xs text-gray-600 hover:text-ember font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Sign In</span>
        </Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white border border-gray-200/90 rounded-2xl p-8 shadow-xl">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-ember to-ember-deep text-white font-black text-xl flex items-center justify-center mx-auto mb-3 shadow-md">
            HS
          </div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            Create New Password
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Choose a strong, unique password to secure your account.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="py-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-ember mx-auto" />
            </div>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
