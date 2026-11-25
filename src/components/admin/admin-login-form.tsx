"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { adminLoginAction } from "@/features/auth/actions";

export function AdminLoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);

    const formData = new FormData();
    formData.append("email", email);
    formData.append("password", password);

    startTransition(async () => {
      try {
        const result = await adminLoginAction(null, formData);
        if (result.success) {
          window.location.href = "/admin";
        } else {
          setErrorMsg(result.error || "Invalid administrator credentials.");
        }
      } catch {
        setErrorMsg("Authentication failed. Please verify your connection.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-700 animate-in fade-in">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-xs font-semibold leading-relaxed">{errorMsg}</div>
        </div>
      )}

      {/* Email Field */}
      <div>
        <label
          htmlFor="admin-email"
          className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5"
        >
          Administrator Email
        </label>
        <div className="relative rounded-xl shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
            <Mail className="w-4 h-4" />
          </div>
          <input
            id="admin-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
            placeholder="hsspareparts01@admin.com"
            className="block w-full pl-10 pr-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-ember focus:border-ember transition-colors disabled:opacity-50"
          />
        </div>
      </div>

      {/* Password Field */}
      <div>
        <label
          htmlFor="admin-password"
          className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5"
        >
          Password
        </label>
        <div className="relative rounded-xl shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
            <Lock className="w-4 h-4" />
          </div>
          <input
            id="admin-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isPending}
            placeholder="••••••••••••••••"
            className="block w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-ember focus:border-ember transition-colors disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl text-sm font-bold text-white bg-[#090D18] hover:bg-ember focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ember shadow-sm hover:shadow transition-all disabled:opacity-50 active:scale-[0.99]"
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Verifying Credentials...</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4 text-ember" />
              <span>Sign In to Admin Portal</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
