"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from "lucide-react";
import { requestPasswordResetAction } from "@/features/auth/actions";

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await requestPasswordResetAction(null, formData);
      if (result.success) {
        setSubmitted(true);
        const data = result.data as { message?: string } | undefined;
        setMessage(
          data?.message ||
            "If an account matches that email address, password recovery instructions will be available when email delivery is configured."
        );
      } else {
        setFormError(result.error || "Unable to process password reset request.");
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      }
    });
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white border border-gray-200/90 rounded-2xl p-8 shadow-xl">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-ember to-ember-deep text-white font-black text-xl flex items-center justify-center mx-auto mb-3 shadow-md">
            HS
          </div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            Reset Your Password
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Enter your registered email address and we&apos;ll help you recover your account.
          </p>
        </div>

        {formError && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
          >
            {formError}
          </div>
        )}

        {submitted ? (
          <div className="space-y-4 animate-in fade-in duration-200 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-bold text-gray-900">
                Check Your Email
              </h2>
              <p className="text-xs text-gray-600 leading-relaxed">
                {message}
              </p>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <Link
                href="/account"
                className="inline-flex items-center justify-center gap-1.5 text-xs text-ember hover:underline font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Sign In</span>
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-gray-700 mb-1"
              >
                Email Address
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full bg-white border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
                />
                <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 pointer-events-none" />
              </div>
              {fieldErrors.email && (
                <p className="text-[11px] text-red-600 mt-1">{fieldErrors.email[0]}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full btn-primary py-2.5 px-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Send Recovery Link</span>
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
        )}
      </div>
    </div>
  );
}
