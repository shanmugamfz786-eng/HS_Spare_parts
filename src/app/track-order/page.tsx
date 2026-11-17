"use client";

import React, { useState } from "react";
import { Truck, Search, CheckCircle2, Clock, Info } from "lucide-react";
import { STORE_CONTACT_CONFIG } from "@/lib/constants/store-config";

export default function TrackOrderPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [searched, setSearched] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (orderNumber.trim()) {
      setSearched(true);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center max-w-xl mx-auto mb-10">
        <div className="w-12 h-12 rounded-brand bg-ember/10 border border-ember/20 text-ember flex items-center justify-center mx-auto mb-4">
          <Truck className="w-6 h-6" />
        </div>
        <h1 className="text-2xl sm:text-4xl font-black text-paper tracking-tight mb-2">
          Track Your Shipment (UI Preview)
        </h1>
        <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
          Order tracking interface preview. Live tracking will query the orders and shipments ledger established in Phase 2 upon order placement in Phase 7.
        </p>
      </div>

      <div className="rounded-card bg-ink-raised border border-gray-800 p-6 sm:p-8 shadow-xl max-w-xl mx-auto mb-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="order-no" className="block text-xs font-bold uppercase tracking-wider text-gray-300 mb-1.5">
              Order Number / Reference
            </label>
            <input
              id="order-no"
              type="text"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="e.g. HS-2026-0001"
              required
              className="w-full px-4 py-2.5 bg-ink border border-gray-700 rounded-brand text-xs sm:text-sm text-paper placeholder-gray-400 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
            />
          </div>

          <div>
            <label htmlFor="email-phone" className="block text-xs font-bold uppercase tracking-wider text-gray-300 mb-1.5">
              Registered Email or Phone Number
            </label>
            <input
              id="email-phone"
              type="text"
              value={emailOrPhone}
              onChange={(e) => setEmailOrPhone(e.target.value)}
              placeholder="e.g. customer@example.com or phone number"
              required
              className="w-full px-4 py-2.5 bg-ink border border-gray-700 rounded-brand text-xs sm:text-sm text-paper placeholder-gray-400 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
            />
          </div>

          <button
            type="submit"
            className="btn-primary w-full py-2.5 text-xs font-bold uppercase tracking-wider gap-2 shadow-md"
          >
            <Search className="w-4 h-4" />
            <span>Preview Tracking Lookup</span>
          </button>
        </form>

        {searched && (
          <div className="mt-8 pt-6 border-t border-gray-800 animate-in fade-in duration-200">
            <div className="mb-4 p-3 rounded-brand bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Demo Lookup Notice:</strong> Live order queries will connect in Phase 7. Below is a sample visualization of the courier milestone timeline:
              </span>
            </div>

            <div className="p-4 rounded-brand bg-ink border border-gray-800 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-paper">
                  Sample Order Reference: {orderNumber.toUpperCase()}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Sample Status: Dispatched
                </span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Carrier Partner: Standard Courier Integration • Sample Tracking AWB: DEMO-TRACK-001
              </p>
            </div>

            <div className="space-y-3 text-xs text-gray-300">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Sample Stage 1: Order Placed & Payment Verified</span>
              </div>
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Sample Stage 2: Warehouse Inspection & Packing Complete</span>
              </div>
              <div className="flex items-center gap-2 text-ember font-semibold">
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span>Sample Stage 3: In Transit to Destination Hub</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="text-center text-xs text-gray-400">
        <span>Need assistance with an existing order? </span>
        <span className="text-gray-400 font-medium">
          {STORE_CONTACT_CONFIG.whatsappDisplay}
        </span>
      </div>
    </div>
  );
}
