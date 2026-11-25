"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  Boxes,
  Search,
  CheckCircle2,
  Edit2,
  Check,
  X,
  Loader2,
  ExternalLink,
  AlertTriangle,
  AlertCircle,
  Package,
  Plus,
  Minus,
  Sparkles,
} from "lucide-react";
import { formatMoney } from "@/lib/money";
import { updateInventoryStockAction } from "@/features/admin/actions";

export interface InventoryItemDTO {
  id: string;
  name: string;
  sku: string;
  categoryName: string;
  priceMinor: number;
  currency: string;
  quantityOnHand: number;
  reorderLevel: number;
}

interface AdminInventoryClientProps {
  initialItems: InventoryItemDTO[];
}

export function AdminInventoryClient({ initialItems }: AdminInventoryClientProps) {
  const [items, setItems] = useState<InventoryItemDTO[]>(initialItems);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "low_stock" | "out_of_stock" | "in_stock">("all");

  // Editing state for quick stock update
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Counts
  const totalItems = items.length;
  const lowStockCount = items.filter((i) => i.quantityOnHand > 0 && i.quantityOnHand <= 5).length;
  const outOfStockCount = items.filter((i) => i.quantityOnHand === 0).length;
  const inStockCount = items.filter((i) => i.quantityOnHand > 5).length;

  // Filtered items
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.categoryName.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterTab === "low_stock") return item.quantityOnHand > 0 && item.quantityOnHand <= 5;
    if (filterTab === "out_of_stock") return item.quantityOnHand === 0;
    if (filterTab === "in_stock") return item.quantityOnHand > 5;
    return true;
  });

  const handleStartEdit = (item: InventoryItemDTO) => {
    setEditingId(item.id);
    setEditValue(item.quantityOnHand);
    setActionError(null);
    setActionSuccess(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setActionError(null);
  };

  const handleSaveStock = (productId: string) => {
    if (editValue < 0 || !Number.isInteger(editValue)) {
      setActionError("Quantity must be a positive integer or zero.");
      return;
    }

    setActionError(null);
    setActionSuccess(null);

    startTransition(async () => {
      const res = await updateInventoryStockAction({
        productId,
        quantityOnHand: editValue,
      });

      if (!res.success) {
        setActionError(res.error || "Failed to update stock quantity.");
      } else {
        setItems((prev) =>
          prev.map((it) => (it.id === productId ? { ...it, quantityOnHand: editValue } : it))
        );
        setEditingId(null);
        setActionSuccess(`Stock updated to ${editValue} units.`);
        setTimeout(() => setActionSuccess(null), 3000);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Alert / Feedback message */}
      {actionError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs rounded-2xl flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-semibold">{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-red-500 hover:text-red-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl flex items-center gap-2 shadow-2xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{actionSuccess}</span>
        </div>
      )}

      {/* KPI Stats Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <button
          onClick={() => setFilterTab("all")}
          className={`p-4 rounded-2xl border text-left transition-all relative ${
            filterTab === "all"
              ? "bg-white border-ember shadow-sm ring-1 ring-ember/20"
              : "bg-white border-gray-200 hover:border-gray-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">All Inventory</span>
            <Boxes className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl font-black text-gray-900 mt-2">{totalItems}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Total catalogue parts</div>
        </button>

        <button
          onClick={() => setFilterTab("in_stock")}
          className={`p-4 rounded-2xl border text-left transition-all relative ${
            filterTab === "in_stock"
              ? "bg-white border-emerald-500 shadow-sm ring-1 ring-emerald-500/20"
              : "bg-white border-gray-200 hover:border-gray-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">In Stock</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-gray-900 mt-2">{inStockCount}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">&gt; 5 units available</div>
        </button>

        <button
          onClick={() => setFilterTab("low_stock")}
          className={`p-4 rounded-2xl border text-left transition-all relative ${
            filterTab === "low_stock"
              ? "bg-white border-amber-500 shadow-sm ring-1 ring-amber-500/20"
              : "bg-white border-gray-200 hover:border-gray-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Low Stock</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-600 mt-2">{lowStockCount}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">1 to 5 units remaining</div>
        </button>

        <button
          onClick={() => setFilterTab("out_of_stock")}
          className={`p-4 rounded-2xl border text-left transition-all relative ${
            filterTab === "out_of_stock"
              ? "bg-white border-red-500 shadow-sm ring-1 ring-red-500/20"
              : "bg-white border-gray-200 hover:border-gray-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-red-600 uppercase tracking-wider">Out of Stock</span>
            <AlertCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-black text-red-600 mt-2">{outOfStockCount}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">0 units inventory</div>
        </button>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by part name, SKU, or category..."
            className="w-full pl-9 pr-8 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember bg-[#F8F9FA]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {(["all", "in_stock", "low_stock", "out_of_stock"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-colors whitespace-nowrap ${
                filterTab === tab
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab.replace("_", " ")}
            </button>
          ))}
          <span className="text-xs text-gray-400 font-medium pl-2 whitespace-nowrap">
            {filteredItems.length} parts found
          </span>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <Boxes className="w-12 h-12 mx-auto text-gray-300 stroke-1 mb-2" />
            <p className="text-sm font-bold text-gray-700">No inventory parts found</p>
            <p className="text-xs text-gray-400 mt-1">
              Try adjusting your search query or switching the stock filter above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8F9FA] text-gray-500 font-semibold uppercase tracking-wider text-[10px] border-b border-gray-200">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Catalogue Part Details</th>
                  <th className="py-3.5 px-4">SKU Reference</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4 text-right">Selling Price</th>
                  <th className="py-3.5 px-4 text-center">Warehouse Stock</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Quick Stock Adjustment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredItems.map((item) => {
                  const isEditing = editingId === item.id;
                  const isLow = item.quantityOnHand > 0 && item.quantityOnHand <= 5;
                  const isOut = item.quantityOnHand === 0;

                  return (
                    <tr key={item.id} className="hover:bg-gray-50/70 transition-colors">
                      {/* Part Details */}
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="font-bold text-gray-900 max-w-sm truncate">{item.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Link
                            href={`/admin/products/${item.id}/edit`}
                            className="text-[11px] text-ember hover:underline inline-flex items-center gap-0.5 font-medium"
                          >
                            <span>Edit Catalogue Part</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </div>
                      </td>

                      {/* SKU */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-[11px] font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200">
                          {item.sku}
                        </span>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4 text-gray-600 font-medium">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          {item.categoryName || "General"}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="py-3.5 px-4 text-right font-black text-gray-900 font-mono">
                        {formatMoney(item.priceMinor, item.currency || "INR")}
                      </td>

                      {/* Stock Level */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`font-black text-sm ${
                            isOut ? "text-red-600" : isLow ? "text-amber-600" : "text-gray-900"
                          }`}
                        >
                          {item.quantityOnHand}
                        </span>
                        <span className="text-[10px] text-gray-400 block font-medium">units</span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isOut
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : isLow
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isOut ? "bg-red-500" : isLow ? "bg-amber-500" : "bg-emerald-600"
                            }`}
                          />
                          <span>{isOut ? "Out of Stock" : isLow ? "Low Stock" : "In Stock"}</span>
                        </span>
                      </td>

                      {/* Quick Stock Update Action */}
                      <td className="py-3.5 px-4 sm:px-6 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditValue((prev) => Math.max(0, prev - 1))}
                              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-100 text-gray-700 transition-colors"
                              title="Decrease by 1"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={editValue}
                              onChange={(e) => setEditValue(Math.max(0, parseInt(e.target.value) || 0))}
                              className="w-16 px-2 py-1 text-xs border border-ember rounded-lg text-center font-bold focus:outline-none bg-white"
                              disabled={isPending}
                            />
                            <button
                              type="button"
                              onClick={() => setEditValue((prev) => prev + 1)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-100 text-gray-700 transition-colors"
                              title="Increase by 1"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleSaveStock(item.id)}
                              disabled={isPending}
                              className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 font-bold flex items-center gap-1 shadow-2xs"
                              title="Save stock"
                            >
                              {isPending ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              )}
                              <span>Save</span>
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              disabled={isPending}
                              className="p-1 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleStartEdit(item)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 hover:text-gray-900 rounded-xl transition-all shadow-2xs"
                          >
                            <Edit2 className="w-3 h-3 text-gray-500" />
                            <span>Quick Adjust</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
