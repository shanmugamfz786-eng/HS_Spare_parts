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
    <section className="py-14 bg-gradient-to-b from-ink-raised to-ink border-b border-gray-800" aria-labelledby="newsletter-heading">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="w-12 h-12 rounded-brand bg-ember/10 border border-ember/30 text-ember flex items-center justify-center mx-auto mb-4">
          <Mail className="w-6 h-6" />
        </div>

        <h2 id="newsletter-heading" className="text-2xl sm:text-3xl font-black text-paper tracking-tight mb-2">
          Automotive Spares Newsletter (UI Preview)
        </h2>

        <p className="text-xs sm:text-sm text-gray-400 max-w-xl mx-auto leading-relaxed mb-6">
          Subscribe to receive vehicle maintenance guides, new model fitment updates, and seasonal spare parts promotions.
        </p>

        {previewSubmitted ? (
          <div className="max-w-md mx-auto p-4 rounded-brand bg-ink-raised border border-ember/40 text-paper text-xs font-semibold flex items-center justify-center gap-2">
            <Info className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              <strong>Layout Preview:</strong> Validated entry &ldquo;{email}&rdquo;. Real email dispatch service will connect in Phase 8.
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
              className="flex-1 px-4 py-2.5 bg-ink border border-gray-700 rounded-brand text-xs sm:text-sm text-paper placeholder-gray-400 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
            />
            <button
              type="submit"
              className="btn-primary py-2.5 px-5 font-bold text-xs uppercase tracking-wider shadow-md whitespace-nowrap"
            >
              Preview Subscribe
            </button>
          </form>
        )}

        <div className="flex items-center justify-center gap-2 text-[11px] text-gray-400 mt-4">
          <ShieldCheck className="w-3.5 h-3.5 text-gray-400" />
          <span>Interactive UI preview. Subscriber management and email verification will be wired in Phase 8.</span>
        </div>
      </div>
    </section>
  );
}
