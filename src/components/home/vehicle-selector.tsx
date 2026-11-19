"use client";

import React, { useState } from "react";
import { Car, Search, ArrowRight, CheckCircle2 } from "lucide-react";
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
    <div className="w-full bg-white border border-gray-200/90 rounded-2xl shadow-xl sm:shadow-2xl p-5 sm:p-7 relative z-20">
      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-gray-100 pb-4 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab("vehicle")}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember ${
            activeTab === "vehicle"
              ? "bg-ember text-white shadow-md shadow-ember/20"
              : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          }`}
        >
          <Car className="w-4 h-4" />
          <span>Find Parts by Vehicle</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("partNumber")}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember ${
            activeTab === "partNumber"
              ? "bg-ember text-white shadow-md shadow-ember/20"
              : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
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
              <label htmlFor="make-select" className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
                1. Select Make
              </label>
              <select
                id="make-select"
                value={selectedMake}
                onChange={handleMakeChange}
                className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-xs sm:text-sm rounded-xl px-3.5 py-2.5 focus:bg-white focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember transition-colors"
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
              <label htmlFor="model-select" className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
                2. Select Model
              </label>
              <select
                id="model-select"
                value={selectedModel}
                onChange={handleModelChange}
                disabled={!selectedMake}
                className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-xs sm:text-sm rounded-xl px-3.5 py-2.5 focus:bg-white focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
              <label htmlFor="year-select" className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
                3. Manufacturing Year
              </label>
              <select
                id="year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                disabled={!selectedModel}
                className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-xs sm:text-sm rounded-xl px-3.5 py-2.5 focus:bg-white focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
              <label htmlFor="variant-select" className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
                4. Engine / Variant
              </label>
              <select
                id="variant-select"
                value={selectedVariant}
                onChange={(e) => setSelectedVariant(e.target.value)}
                disabled={!selectedYear}
                className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-xs sm:text-sm rounded-xl px-3.5 py-2.5 focus:bg-white focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <option value="">
                  {selectedYear ? "— All Variants —" : "Select Year First"}
                </option>
                {currentModelData?.variants.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Action Row */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span>Vehicle fitment assistance cross-referenced against catalogued OEM codes.</span>
            </div>

            <button
              type="submit"
              disabled={!selectedMake}
              className="w-full sm:w-auto btn-primary px-8 py-3 text-sm font-bold flex items-center justify-center gap-2 rounded-xl shadow-lg shadow-ember/25 hover:shadow-ember/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Search className="w-4 h-4" />
              <span>Search Parts</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handlePartSearch} className="space-y-4">
          <div className="max-w-2xl">
            <label htmlFor="part-number-input" className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
              Enter OEM / Manufacturer Part Number or SKU
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                id="part-number-input"
                type="text"
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                placeholder="e.g. 55810M68P00, DEMO-BP-8492, 0986AB1234"
                className="flex-1 bg-gray-50 border border-gray-300 text-gray-900 text-xs sm:text-sm rounded-xl px-4 py-2.5 focus:bg-white focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember transition-colors"
              />
              <button
                type="submit"
                disabled={!partNumber.trim()}
                className="btn-primary px-7 py-2.5 text-sm font-bold flex items-center justify-center gap-2 rounded-xl shadow-lg shadow-ember/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Search className="w-4 h-4" />
                <span>Search Code</span>
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              Part matches cross-referenced across catalogued OEM and aftermarket interchange lists.
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
