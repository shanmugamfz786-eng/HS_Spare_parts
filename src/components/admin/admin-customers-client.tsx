"use client";

import React, { useState } from "react";
import {
  Users,
  Search,
  Mail,
  Phone,
  Shield,
  CheckCircle2,
  X,
  ShoppingBag,
  Calendar,
  UserCheck,
} from "lucide-react";

export interface CustomerListItemDTO {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  rolesList: string[];
  ordersCount: number;
  createdAt: Date | string;
}

interface AdminCustomersClientProps {
  initialCustomers: CustomerListItemDTO[];
}

export function AdminCustomersClient({ initialCustomers }: AdminCustomersClientProps) {
  const [customers] = useState<CustomerListItemDTO[]>(initialCustomers);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "active" | "staff" | "with_orders">("all");

  const totalUsers = customers.length;
  const activeCount = customers.filter((c) => c.status === "active").length;
  const staffCount = customers.filter((c) =>
    c.rolesList.some((r) => r.includes("admin") || r.includes("manager"))
  ).length;
  const withOrdersCount = customers.filter((c) => c.ordersCount > 0).length;

  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.phone && c.phone.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (filterTab === "active") return c.status === "active";
    if (filterTab === "staff")
      return c.rolesList.some((r) => r.includes("admin") || r.includes("manager"));
    if (filterTab === "with_orders") return c.ordersCount > 0;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <button
          onClick={() => setFilterTab("all")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            filterTab === "all"
              ? "bg-white border-ember shadow-sm ring-1 ring-ember/20"
              : "bg-white border-gray-200 hover:border-gray-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">All Accounts</span>
            <Users className="w-4 h-4 text-ember" />
          </div>
          <div className="text-2xl font-black text-gray-900 mt-2">{totalUsers}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Total registered users</div>
        </button>

        <button
          onClick={() => setFilterTab("active")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            filterTab === "active"
              ? "bg-white border-emerald-500 shadow-sm ring-1 ring-emerald-500/20"
              : "bg-white border-gray-200 hover:border-gray-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Active</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-gray-900 mt-2">{activeCount}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Checkout authorized</div>
        </button>

        <button
          onClick={() => setFilterTab("staff")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            filterTab === "staff"
              ? "bg-white border-purple-500 shadow-sm ring-1 ring-purple-500/20"
              : "bg-white border-gray-200 hover:border-gray-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wider">Staff Operators</span>
            <Shield className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-gray-900 mt-2">{staffCount}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Admins & Managers</div>
        </button>

        <button
          onClick={() => setFilterTab("with_orders")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            filterTab === "with_orders"
              ? "bg-white border-blue-500 shadow-sm ring-1 ring-blue-500/20"
              : "bg-white border-gray-200 hover:border-gray-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Buyers</span>
            <ShoppingBag className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-gray-900 mt-2">{withOrdersCount}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Placed ≥ 1 order</div>
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
            placeholder="Search by customer name, email, or phone..."
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
          {(["all", "active", "staff", "with_orders"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-colors whitespace-nowrap ${
                filterTab === tab
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab === "with_orders" ? "With Orders" : tab.replace("_", " ")}
            </button>
          ))}
          <span className="text-xs text-gray-400 font-medium pl-2 whitespace-nowrap">
            {filteredCustomers.length} accounts found
          </span>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        {filteredCustomers.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <Users className="w-12 h-12 mx-auto text-gray-300 stroke-1 mb-2" />
            <p className="text-sm font-bold text-gray-700">No customer accounts found</p>
            <p className="text-xs text-gray-400 mt-1">
              Try adjusting your search criteria or switching the filter tab above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8F9FA] text-gray-500 font-semibold uppercase tracking-wider text-[10px] border-b border-gray-200">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Customer Profile</th>
                  <th className="py-3.5 px-4">Contact Phone</th>
                  <th className="py-3.5 px-4">Assigned Roles</th>
                  <th className="py-3.5 px-4 text-center">Orders</th>
                  <th className="py-3.5 px-4 text-center">Account Status</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCustomers.map((customer) => {
                  const initials = (customer.name || "User")
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .substring(0, 2)
                    .toUpperCase();

                  const isStaff = customer.rolesList.some(
                    (r) => r.includes("admin") || r.includes("manager")
                  );

                  return (
                    <tr key={customer.id} className="hover:bg-gray-50/70 transition-colors">
                      {/* Customer Profile */}
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                              isStaff
                                ? "bg-purple-100 text-purple-700 border border-purple-200"
                                : "bg-orange-100 text-ember border border-orange-200"
                            }`}
                          >
                            {initials}
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 flex items-center gap-1.5">
                              <span>{customer.name}</span>
                              {isStaff && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-purple-50 text-purple-700 border border-purple-200">
                                  Staff
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3 text-gray-400" />
                              <span className="font-mono">{customer.email}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contact Phone */}
                      <td className="py-3.5 px-4 text-gray-600">
                        {customer.phone ? (
                          <div className="flex items-center gap-1 font-mono text-[11px] text-gray-700">
                            <Phone className="w-3 h-3 text-gray-400" />
                            <span>{customer.phone}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-[11px]">None provided</span>
                        )}
                      </td>

                      {/* Assigned Roles */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {customer.rolesList.map((r) => (
                            <span
                              key={r}
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${
                                r.includes("admin")
                                  ? "bg-purple-50 text-purple-700 border border-purple-200 font-bold"
                                  : r.includes("manager")
                                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                                  : "bg-gray-100 text-gray-700 border border-gray-200"
                              }`}
                            >
                              {r.replace("_", " ")}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Orders */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-gray-900">{customer.ordersCount}</span>
                        <span className="text-[10px] text-gray-400 block font-medium">orders</span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            customer.status === "active"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-red-50 text-red-700 border border-red-200"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              customer.status === "active" ? "bg-emerald-600" : "bg-red-600"
                            }`}
                          />
                          <span>{customer.status}</span>
                        </span>
                      </td>

                      {/* Joined Date */}
                      <td className="py-3.5 px-4 sm:px-6 text-right font-mono text-[11px] text-gray-500 whitespace-nowrap">
                        {new Date(customer.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
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
