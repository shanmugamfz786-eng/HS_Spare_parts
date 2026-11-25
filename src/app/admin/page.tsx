import React from "react";
import Link from "next/link";
import {
  Package,
  ShoppingBag,
  Users,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Plus,
  CheckCircle2,
  Tag,
  ShieldCheck,
  FolderTree,
  Sparkles,
  TrendingUp,
  Activity,
  Layers,
  ExternalLink,
} from "lucide-react";
import { getCurrentAdminUser } from "@/features/auth/service";
import { ROLES, hasRole, hasPermission, PERMISSIONS } from "@/lib/auth/rbac";
import { AdminAccessDenied } from "@/components/admin/admin-access-denied";
import { getDb } from "@/lib/db";
import { products, orders, users, inventory } from "@/lib/db/schema";
import { count, eq, sql as drizzleSql, desc, asc } from "drizzle-orm";
import { formatMoney } from "@/lib/money";
import { DEMO_FEATURED_PRODUCTS } from "@/lib/constants/demo-catalog";
import { getFromAdminCache, setAdminCache } from "@/features/admin/service";

export const metadata = {
  title: "Admin Dashboard — HS Spare Parts",
  description: "Executive operations dashboard, inventory management, and business overview.",
};

interface DashboardDataCache {
  totalProducts: number;
  totalOrders: number;
  totalCustomers: number;
  lowStockCount: number;
  outOfStockCount: number;
  pendingOrdersCount: number;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    fulfillmentStatus: string;
    totalMinor: number;
    currency: string;
    placedAt: Date;
  }>;
  lowStockProducts: Array<{
    id: string;
    name: string;
    sku: string;
    quantityOnHand: number;
    priceMinor: number;
    currency: string;
  }>;
}

export default async function AdminDashboardPage() {
  const currentUser = await getCurrentAdminUser();

  const isAuthorized =
    currentUser &&
    !currentUser.roles.includes(ROLES.CUSTOMER) &&
    (hasRole(currentUser.roles, [
      ROLES.ADMINISTRATOR,
      ROLES.SUPER_ADMINISTRATOR,
      ROLES.CATALOGUE_MANAGER,
      ROLES.ORDER_MANAGER,
    ]) || hasPermission(currentUser.permissions, PERMISSIONS.CATALOGUE_READ));

  if (!isAuthorized) {
    return <AdminAccessDenied />;
  }

  const db = getDb();

  let totalProducts = 0;
  let totalOrders = 0;
  let totalCustomers = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let pendingOrdersCount = 0;

  let recentOrders: Array<{
    id: string;
    orderNumber: string;
    fulfillmentStatus: string;
    totalMinor: number;
    currency: string;
    placedAt: Date;
  }> = [];

  let lowStockProducts: Array<{
    id: string;
    name: string;
    sku: string;
    quantityOnHand: number;
    priceMinor: number;
    currency: string;
  }> = [];

  const cachedDashboard = getFromAdminCache<DashboardDataCache>("admin:dashboard_kpis");
  if (cachedDashboard) {
    totalProducts = cachedDashboard.totalProducts;
    totalOrders = cachedDashboard.totalOrders;
    totalCustomers = cachedDashboard.totalCustomers;
    lowStockCount = cachedDashboard.lowStockCount;
    outOfStockCount = cachedDashboard.outOfStockCount;
    pendingOrdersCount = cachedDashboard.pendingOrdersCount;
    recentOrders = cachedDashboard.recentOrders;
    lowStockProducts = cachedDashboard.lowStockProducts;
  } else if (db) {
    try {
      const [
        prodRes,
        orderRes,
        userRes,
        lowStockRes,
        outOfStockRes,
        pendingRes,
        fetchedOrders,
        fetchedLowStock,
      ] = await Promise.all([
        db.select({ val: count() }).from(products),
        db.select({ val: count() }).from(orders),
        db.select({ val: count() }).from(users),
        db
          .select({ val: count() })
          .from(inventory)
          .where(drizzleSql`${inventory.quantityOnHand} > 0 AND ${inventory.quantityOnHand} <= 5`),
        db
          .select({ val: count() })
          .from(inventory)
          .where(eq(inventory.quantityOnHand, 0)),
        db
          .select({ val: count() })
          .from(orders)
          .where(drizzleSql`${orders.fulfillmentStatus} IN ('pending', 'awaiting_dispatch', 'confirmed', 'processing')`),
        db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            fulfillmentStatus: orders.fulfillmentStatus,
            totalMinor: orders.totalMinor,
            currency: orders.currency,
            placedAt: orders.placedAt,
          })
          .from(orders)
          .orderBy(desc(orders.placedAt))
          .limit(6),
        db
          .select({
            id: products.id,
            name: products.name,
            sku: products.sku,
            quantityOnHand: inventory.quantityOnHand,
            priceMinor: products.priceMinor,
            currency: products.currency,
          })
          .from(products)
          .innerJoin(inventory, eq(products.id, inventory.productId))
          .where(drizzleSql`${inventory.quantityOnHand} <= 5`)
          .orderBy(asc(inventory.quantityOnHand))
          .limit(6),
      ]);

      totalProducts = Number(prodRes[0]?.val || 0);
      totalOrders = Number(orderRes[0]?.val || 0);
      totalCustomers = Number(userRes[0]?.val || 0);
      lowStockCount = Number(lowStockRes[0]?.val || 0);
      outOfStockCount = Number(outOfStockRes[0]?.val || 0);
      pendingOrdersCount = Number(pendingRes[0]?.val || 0);
      recentOrders = fetchedOrders;
      lowStockProducts = fetchedLowStock;

      setAdminCache("admin:dashboard_kpis", {
        totalProducts,
        totalOrders,
        totalCustomers,
        lowStockCount,
        outOfStockCount,
        pendingOrdersCount,
        recentOrders,
        lowStockProducts,
      });
    } catch (err) {
      console.error("[Admin Dashboard] Query error:", err);
    }
  }

  if (
    totalProducts === 0 &&
    (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_DEMO_CATALOG === "true")
  ) {
    totalProducts = DEMO_FEATURED_PRODUCTS.length;
    lowStockCount = 2;
    lowStockProducts = DEMO_FEATURED_PRODUCTS.slice(0, 4).map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      quantityOnHand: 2,
      priceMinor: p.priceMinor,
      currency: "INR",
    }));
  }

  return (
    <div className="space-y-6">
      {/* Top Welcome Card */}
      <div className="relative overflow-hidden bg-white p-6 rounded-2xl border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-50 text-ember border border-orange-200/80">
              <span className="w-1.5 h-1.5 rounded-full bg-ember animate-pulse" />
              Executive Operations
            </span>
            <span className="text-gray-300">•</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              Neon DB Live
            </span>
            <span className="text-gray-300">•</span>
            <span className="text-xs text-gray-500 font-medium">HS Spare Parts Commerce Platform</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 mt-2 tracking-tight">
            Welcome back, {currentUser.name || "Administrator"}
          </h1>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl leading-relaxed">
            Real-time warehouse stock control, customer order dispatch, and catalogue taxonomy synchronized directly from PostgreSQL.
          </p>
        </div>

        {/* Action Pill Buttons */}
        <div className="relative z-10 flex flex-wrap items-center gap-2">
          <Link
            href="/admin/products/new"
            className="btn-primary text-xs py-2 px-3.5 rounded-xl flex items-center gap-1.5 shadow-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Product</span>
          </Link>
          <Link
            href="/admin/brands"
            className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs py-2 px-3.5 rounded-xl flex items-center gap-1.5 transition-all font-bold hover:border-gray-300 shadow-2xs"
          >
            <Tag className="w-3.5 h-3.5 text-emerald-600" />
            <span>Brands & Categories</span>
          </Link>
          <Link
            href="/admin/banners"
            className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs py-2 px-3.5 rounded-xl flex items-center gap-1.5 transition-all font-bold hover:border-gray-300 shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>Promotional Banners</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Products KPI */}
        <Link
          href="/admin/products"
          className="group relative bg-white p-5 rounded-2xl border border-gray-200 shadow-xs hover:border-orange-300 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Total Products
            </span>
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-ember group-hover:scale-105 transition-transform shadow-2xs">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-gray-900 tracking-tight">{totalProducts}</div>
            <div className="text-xs text-gray-500 mt-1 flex items-center justify-between">
              <span className="font-medium text-gray-600">Active catalogue items</span>
              <ArrowRight className="w-3.5 h-3.5 text-ember opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </div>
          </div>
        </Link>

        {/* Orders KPI */}
        <Link
          href="/admin/orders"
          className="group relative bg-white p-5 rounded-2xl border border-gray-200 shadow-xs hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Total Orders
            </span>
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-105 transition-transform shadow-2xs">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-gray-900 tracking-tight">{totalOrders}</div>
            <div className="text-xs text-gray-500 mt-1 flex items-center justify-between">
              <span className="font-semibold text-blue-600">{pendingOrdersCount} pending dispatch</span>
              <ArrowRight className="w-3.5 h-3.5 text-blue-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </div>
          </div>
        </Link>

        {/* Stock Alerts KPI */}
        <Link
          href="/admin/products"
          className="group relative bg-white p-5 rounded-2xl border border-gray-200 shadow-xs hover:border-amber-300 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Stock Alerts
            </span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 group-hover:scale-105 transition-transform shadow-2xs">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-gray-900 tracking-tight">
              {lowStockCount + outOfStockCount}
            </div>
            <div className="text-xs text-gray-500 mt-1 flex items-center justify-between">
              <span className="space-x-1">
                <span className="text-amber-600 font-bold">{lowStockCount} low</span>
                <span className="text-gray-300">•</span>
                <span className="text-red-600 font-bold">{outOfStockCount} out</span>
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-amber-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </div>
          </div>
        </Link>

        {/* Customers KPI */}
        <Link
          href="/admin/customers"
          className="group relative bg-white p-5 rounded-2xl border border-gray-200 shadow-xs hover:border-emerald-300 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Registered Accounts
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 group-hover:scale-105 transition-transform shadow-2xs">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-gray-900 tracking-tight">{totalCustomers}</div>
            <div className="text-xs text-gray-500 mt-1 flex items-center justify-between">
              <span className="font-medium text-gray-600">Registered buyers & staff</span>
              <ArrowRight className="w-3.5 h-3.5 text-emerald-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </div>
          </div>
        </Link>
      </div>

      {/* Quick Creation Operations Hub */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-ember" />
            <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
              Quick Management Shortcuts
            </span>
          </div>
          <span className="text-[11px] text-gray-400 font-medium">1-click navigation to core workflows</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/admin/products/new"
            className="p-3.5 rounded-xl border border-gray-200/90 bg-gray-50/50 hover:bg-orange-50/50 hover:border-orange-300 transition-all group flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-orange-100/70 text-ember flex items-center justify-center font-bold shrink-0 group-hover:scale-105 transition-transform">
              <Package className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-gray-900 group-hover:text-ember transition-colors flex items-center gap-1">
                <span className="truncate">Add Product</span>
                <Plus className="w-3 h-3 text-ember shrink-0" />
              </div>
              <div className="text-[10px] text-gray-500 truncate mt-0.5">New SKU & Cloudinary media</div>
            </div>
          </Link>

          <Link
            href="/admin/brands"
            className="p-3.5 rounded-xl border border-gray-200/90 bg-gray-50/50 hover:bg-emerald-50/50 hover:border-emerald-300 transition-all group flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-100/70 text-emerald-600 flex items-center justify-center font-bold shrink-0 group-hover:scale-105 transition-transform">
              <Tag className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-gray-900 group-hover:text-emerald-600 transition-colors flex items-center gap-1">
                <span className="truncate">Brands & Categories</span>
                <ArrowRight className="w-3 h-3 text-emerald-600 shrink-0" />
              </div>
              <div className="text-[10px] text-gray-500 truncate mt-0.5">Brand-specific spare parts matrix</div>
            </div>
          </Link>

          <Link
            href="/admin/customers"
            className="p-3.5 rounded-xl border border-gray-200/90 bg-gray-50/50 hover:bg-blue-50/50 hover:border-blue-300 transition-all group flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-100/70 text-blue-600 flex items-center justify-center font-bold shrink-0 group-hover:scale-105 transition-transform">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-gray-900 group-hover:text-blue-600 transition-colors flex items-center gap-1">
                <span className="truncate">Customer Directory</span>
                <ArrowRight className="w-3 h-3 text-blue-600 shrink-0" />
              </div>
              <div className="text-[10px] text-gray-500 truncate mt-0.5">Account profiles & orders</div>
            </div>
          </Link>

          <Link
            href="/admin/orders"
            className="p-3.5 rounded-xl border border-gray-200/90 bg-gray-50/50 hover:bg-amber-50/50 hover:border-amber-300 transition-all group flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-100/70 text-amber-600 flex items-center justify-center font-bold shrink-0 group-hover:scale-105 transition-transform">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-gray-900 group-hover:text-amber-600 transition-colors flex items-center gap-1">
                <span className="truncate">Orders & Dispatch</span>
                <ArrowRight className="w-3 h-3 text-amber-600 shrink-0" />
              </div>
              <div className="text-[10px] text-gray-500 truncate mt-0.5">Carrier fulfillment & tracking</div>
            </div>
          </Link>

          <Link
            href="/admin/banners"
            className="p-3.5 rounded-xl border border-gray-200/90 bg-gray-50/50 hover:bg-purple-50/50 hover:border-purple-300 transition-all group flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-100/70 text-purple-600 flex items-center justify-center font-bold shrink-0 group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-gray-900 group-hover:text-purple-600 transition-colors flex items-center gap-1">
                <span className="truncate">Promotions</span>
                <Plus className="w-3 h-3 text-purple-600 shrink-0" />
              </div>
              <div className="text-[10px] text-gray-500 truncate mt-0.5">Hero slides & banners</div>
            </div>
          </Link>
        </div>
      </div>

      {/* Main Split Grid: Recent Orders & Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders Panel */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Recent Customer Orders</h2>
                  <p className="text-[11px] text-gray-400">Latest customer purchases across India</p>
                </div>
              </div>
              <Link
                href="/admin/orders"
                className="text-xs font-bold text-ember hover:text-ember/80 flex items-center gap-1 transition-colors px-2.5 py-1 rounded-lg bg-orange-50/60"
              >
                <span>View all</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="mt-4">
              {recentOrders.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <ShoppingBag className="w-9 h-9 mx-auto text-gray-300 stroke-1 mb-2" />
                  <p className="text-xs font-semibold text-gray-700">No customer orders recorded yet</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Orders will appear here once customers complete checkout.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-100 font-semibold uppercase tracking-wider text-[10px]">
                        <th className="pb-2.5">Order Ref</th>
                        <th className="pb-2.5">Fulfillment Status</th>
                        <th className="pb-2.5 text-right">Total</th>
                        <th className="pb-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {recentOrders.map((ord) => (
                        <tr key={ord.id} className="hover:bg-gray-50/70 transition-colors">
                          <td className="py-3 font-mono font-bold text-gray-800">
                            <Link
                              href={`/admin/orders/${ord.id}`}
                              className="hover:text-ember transition-colors"
                            >
                              {ord.orderNumber}
                            </Link>
                          </td>
                          <td className="py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                ord.fulfillmentStatus === "shipped" || ord.fulfillmentStatus === "delivered"
                                  ? "bg-green-50 text-green-700 border border-green-200"
                                  : ord.fulfillmentStatus === "awaiting_dispatch"
                                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                                  : "bg-gray-100 text-gray-700 border border-gray-200"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  ord.fulfillmentStatus === "shipped" || ord.fulfillmentStatus === "delivered"
                                    ? "bg-green-600"
                                    : ord.fulfillmentStatus === "awaiting_dispatch"
                                    ? "bg-amber-500"
                                    : "bg-gray-400"
                                }`}
                              />
                              <span>{ord.fulfillmentStatus.replace("_", " ")}</span>
                            </span>
                          </td>
                          <td className="py-3 text-right font-bold text-gray-900 font-mono">
                            {formatMoney(ord.totalMinor, ord.currency || "INR")}
                          </td>
                          <td className="py-3 text-right">
                            <Link
                              href={`/admin/orders/${ord.id}`}
                              className="text-xs font-bold text-ember hover:underline"
                            >
                              Inspect
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Low Stock Alerts Panel */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Inventory Stock Alerts</h2>
                  <p className="text-[11px] text-gray-400">Items requiring immediate reorder</p>
                </div>
              </div>
              <Link
                href="/admin/products"
                className="text-xs font-bold text-ember hover:text-ember/80 flex items-center gap-1 transition-colors px-2.5 py-1 rounded-lg bg-orange-50/60"
              >
                <span>Catalogue Stock</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="mt-4">
              {lowStockProducts.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <CheckCircle2 className="w-9 h-9 mx-auto text-emerald-500 stroke-1 mb-2" />
                  <p className="text-xs font-bold text-gray-800">All inventory levels are healthy</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Products with stock quantity &le; 5 units will be flagged here automatically.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-100 font-semibold uppercase tracking-wider text-[10px]">
                        <th className="pb-2.5">Catalogue Part</th>
                        <th className="pb-2.5">SKU</th>
                        <th className="pb-2.5 text-center">Remaining</th>
                        <th className="pb-2.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {lowStockProducts.map((prod) => (
                        <tr key={prod.id} className="hover:bg-gray-50/70 transition-colors">
                          <td className="py-3 font-semibold text-gray-900 max-w-[170px] truncate">
                            {prod.name}
                          </td>
                          <td className="py-3 font-mono text-[11px] text-gray-500">{prod.sku}</td>
                          <td className="py-3 text-center font-bold text-gray-900">
                            {prod.quantityOnHand}
                          </td>
                          <td className="py-3 text-right">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                prod.quantityOnHand === 0
                                  ? "bg-red-50 text-red-700 border border-red-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}
                            >
                              {prod.quantityOnHand === 0 ? "Out of Stock" : "Low Stock"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Operational Jump Cards at Bottom */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3.5">
          System Administration & Operations
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/admin/products"
            className="p-3.5 rounded-xl border border-gray-200 hover:border-ember hover:bg-orange-50/20 transition-all text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-ember flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <Package className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-gray-900">Products Catalogue</div>
            <div className="text-[11px] text-gray-400">Manage SKUs & pricing</div>
          </Link>

          <Link
            href="/admin/customers"
            className="p-3.5 rounded-xl border border-gray-200 hover:border-ember hover:bg-orange-50/20 transition-all text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <Users className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-gray-900">Customer Directory</div>
            <div className="text-[11px] text-gray-400">Roles & accounts</div>
          </Link>

          <Link
            href="/admin/logs"
            className="p-3.5 rounded-xl border border-gray-200 hover:border-ember hover:bg-orange-50/20 transition-all text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <Activity className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-gray-900">Activity & Audit Trail</div>
            <div className="text-[11px] text-gray-400">Security event ledger</div>
          </Link>

          <Link
            href="/admin/settings"
            className="p-3.5 rounded-xl border border-gray-200 hover:border-ember hover:bg-orange-50/20 transition-all text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-ember flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-gray-900">System Architecture</div>
            <div className="text-[11px] text-gray-400">Neon DB & Cloudinary</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
