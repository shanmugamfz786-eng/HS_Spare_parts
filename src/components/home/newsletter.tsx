"use client";

import React, { useState } from "react";
import { Mail, Info, ShieldCheck } from "lucide-react";

export function Newsletter() {
  const [email, setEmail] = useState("");
  const [previewSubmitted, setPreviewSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && email.includes("@")) {
      setPreviewSubmitted(true);
    }
  };

  return (
    <section className="py-14 bg-[#F8F9FA] border-b border-gray-200/80" aria-labelledby="newsletter-heading">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-ember/10 border border-ember/20 text-ember flex items-center justify-center mx-auto mb-4">
          <Mail className="w-6 h-6" />
        </div>

        <h2 id="newsletter-heading" className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight mb-2">
          Automotive Spares Newsletter
        </h2>

        <p className="text-xs sm:text-sm text-gray-500 max-w-xl mx-auto leading-relaxed mb-6">
          Subscribe to receive vehicle maintenance guides, new model fitment updates, and seasonal spare parts promotions.
        </p>

        {previewSubmitted ? (
          <div className="max-w-md mx-auto p-4 rounded-xl bg-white border border-ember/40 text-gray-900 text-xs font-semibold flex items-center justify-center gap-2 shadow-sm">
            <Info className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span>
              <strong>Layout Preview:</strong> Validated entry &ldquo;{email}&rdquo;.
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="max-w-md mx-auto flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address..."
              required
              className="flex-1 px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-xs sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember shadow-xs"
            />
            <button
              type="submit"
              className="btn-primary py-2.5 px-5 font-bold text-xs uppercase tracking-wider shadow-md whitespace-nowrap rounded-xl"
            >
              Subscribe
            </button>
          </form>
        )}

        <div className="flex items-center justify-center gap-2 text-[11px] text-gray-400 mt-4">
          <ShieldCheck className="w-3.5 h-3.5 text-gray-400" />
          <span>No spam guaranteed. Unsubscribe at any time.</span>
        </div>
      </div>
    </section>
  );
}
