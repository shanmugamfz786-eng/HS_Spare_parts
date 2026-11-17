"use client";

import React, { useState } from "react";
import { Car, Search, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react";
import { POPULAR_VEHICLE_MAKES } from "@/lib/constants/demo-catalog";

export function VehicleSelector() {
  const [activeTab, setActiveTab] = useState<"vehicle" | "partNumber">("vehicle");

  // Vehicle state
  const [selectedMake, setSelectedMake] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedVariant, setSelectedVariant] = useState<string>("");

  // Part number state
  const [partNumber, setPartNumber] = useState<string>("");

  const currentMakeData = POPULAR_VEHICLE_MAKES.find((m) => m.slug === selectedMake);
  const currentModelData = currentMakeData?.models.find((m) => m.slug === selectedModel);

  const handleMakeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedMake(e.target.value);
    setSelectedModel("");
    setSelectedYear("");
    setSelectedVariant("");
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedModel(e.target.value);
    setSelectedYear("");
    setSelectedVariant("");
  };

  const handleVehicleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMake) return;
    const params = new URLSearchParams();
    params.set("make", selectedMake);
    if (selectedModel) params.set("model", selectedModel);
    if (selectedYear) params.set("year", selectedYear);
    if (selectedVariant) params.set("variant", selectedVariant);
    window.location.href = `/search?${params.toString()}`;
  };

  const handlePartSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (partNumber.trim()) {
      window.location.href = `/search?partNumber=${encodeURIComponent(partNumber.trim())}`;
    }
  };

  return (
    <div className="w-full bg-ink-raised border border-gray-800 rounded-card shadow-2xl p-5 sm:p-7 relative z-20">
      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-gray-800 pb-4 mb-5">
        <button
          type="button"
          onClick={() => setActiveTab("vehicle")}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-bold rounded-brand transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember ${
            activeTab === "vehicle"
              ? "bg-ember text-paper shadow-md"
              : "text-gray-400 hover:text-paper hover:bg-gray-800"
          }`}
        >
          <Car className="w-4 h-4" />
          <span>Find Parts by Vehicle</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("partNumber")}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-bold rounded-brand transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember ${
            activeTab === "partNumber"
              ? "bg-ember text-paper shadow-md"
              : "text-gray-400 hover:text-paper hover:bg-gray-800"
          }`}
        >
          <Search className="w-4 h-4" />
          <span>Search by OEM / Part Number</span>
        </button>
      </div>

      {activeTab === "vehicle" ? (
        <form onSubmit={handleVehicleSearch} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* 1. Make */}
            <div>
              <label htmlFor="make-select" className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
                1. Select Make
              </label>
              <select
                id="make-select"
                value={selectedMake}
                onChange={handleMakeChange}
                className="w-full bg-ink border border-gray-700 text-paper text-xs sm:text-sm rounded-brand px-3 py-2.5 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
              >
                <option value="">— All Car Makes —</option>
                {POPULAR_VEHICLE_MAKES.map((make) => (
                  <option key={make.slug} value={make.slug}>
                    {make.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Model */}
            <div>
              <label htmlFor="model-select" className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
                2. Select Model
              </label>
              <select
                id="model-select"
                value={selectedModel}
                onChange={handleModelChange}
                disabled={!selectedMake}
                className="w-full bg-ink border border-gray-700 text-paper text-xs sm:text-sm rounded-brand px-3 py-2.5 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <option value="">
                  {selectedMake ? "— Select Model —" : "Select Make First"}
                </option>
                {currentMakeData?.models.map((model) => (
                  <option key={model.slug} value={model.slug}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Year */}
            <div>
              <label htmlFor="year-select" className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
                3. Manufacturing Year
              </label>
              <select
                id="year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                disabled={!selectedModel}
                className="w-full bg-ink border border-gray-700 text-paper text-xs sm:text-sm rounded-brand px-3 py-2.5 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <option value="">
                  {selectedModel ? "— Select Year —" : "Select Model First"}
                </option>
                {currentModelData?.years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Variant / Engine */}
            <div>
              <label htmlFor="variant-select" className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
                4. Engine / Variant
              </label>
              <select
                id="variant-select"
                value={selectedVariant}
                onChange={(e) => setSelectedVariant(e.target.value)}
                disabled={!selectedYear}
                className="w-full bg-ink border border-gray-700 text-paper text-xs sm:text-sm rounded-brand px-3 py-2.5 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <option value="">
                  {selectedYear ? "— Any Variant / Engine —" : "Select Year First"}
                </option>
                {currentModelData?.variants.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-2 text-xs text-success">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Zero fitment risk: verified compatibility against OEM cross-references</span>
            </div>

            <button
              type="submit"
              disabled={!selectedMake}
              className="btn-primary w-full sm:w-auto px-6 py-2.5 font-bold text-xs sm:text-sm gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Find Matching Parts</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handlePartSearch} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label htmlFor="part-input" className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
                Enter OEM Part Number or Manufacturer SKU
              </label>
              <input
                id="part-input"
                type="text"
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                placeholder="e.g. 55810M68P00, 04152-YZZA1, BP-BRM-8492..."
                className="w-full bg-ink border border-gray-700 text-paper text-xs sm:text-sm rounded-brand px-4 py-2.5 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
              />
            </div>
            <div className="sm:self-end">
              <button
                type="submit"
                disabled={!partNumber.trim()}
                className="btn-primary w-full sm:w-auto px-6 py-2.5 font-bold text-xs sm:text-sm gap-2 disabled:opacity-50"
              >
                <Search className="w-4 h-4" />
                <span>Lookup Part</span>
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-ember" />
            <span>Search direct OEM part numbers across Maruti Suzuki, Hyundai, Tata, Mahindra, Toyota and more.</span>
          </p>
        </form>
      )}
    </div>
  );
}
