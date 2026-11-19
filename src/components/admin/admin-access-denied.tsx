import React from "react";
import Link from "next/link";
import { Lock, ShieldAlert, ArrowLeft } from "lucide-react";

export function AdminAccessDenied({
  title = "403 — Administrator Access Required",
  message = "This area is restricted to authorized store administrators and catalogue managers. Regular customer accounts and unauthenticated visitors cannot access catalogue management tools or actions.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="min-h-screen bg-[#090D18] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#121826] border border-gray-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center mx-auto">
          <Lock className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full">
            Restricted Area
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-white pt-1">
            {title}
          </h1>
          <p className="text-xs text-gray-400 leading-relaxed">
            {message}
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-gray-900/60 border border-gray-800 text-left flex items-start gap-2.5 text-[11px] text-gray-400">
          <ShieldAlert className="w-4 h-4 text-ember flex-shrink-0 mt-0.5" />
          <p>
            <strong>Storefront Policy:</strong> HS Spare Parts is an admin-managed store. Only authorized personnel can manage catalogue listings. Customer product submissions and seller portals are disabled.
          </p>
        </div>

        <div className="pt-2 flex flex-col gap-2">
          <Link
            href="/"
            className="btn-primary py-2.5 px-4 text-xs font-bold rounded-xl flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Storefront</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
