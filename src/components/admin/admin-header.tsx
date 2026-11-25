"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, ShieldCheck, LogOut, ExternalLink, Plus } from "lucide-react";
import type { SafeUser } from "@/features/auth/service";
import { logoutAction } from "@/features/auth/actions";

interface AdminHeaderProps {
  user: SafeUser | null;
  onOpenSidebar: () => void;
}

export function AdminHeader({ user, onOpenSidebar }: AdminHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await logoutAction();
    router.push("/admin/login");
    router.refresh();
  };

  const getPageTitle = (path: string) => {
    if (path === "/admin") return "Dashboard";
    if (path.startsWith("/admin/products/new")) return "Add New Product";
    if (path.includes("/edit")) return "Edit Product";
    if (path.startsWith("/admin/products")) return "Product Catalogue";
    if (path.startsWith("/admin/inventory")) return "Product Catalogue";
    if (path.startsWith("/admin/categories")) return "Brands & Categories";
    if (path.startsWith("/admin/brands")) return "Brands & Categories";
    if (path.startsWith("/admin/orders/")) return "Order Details";
    if (path.startsWith("/admin/orders")) return "Orders & Fulfillment";
    if (path.startsWith("/admin/customers")) return "Customers";
    if (path.startsWith("/admin/banners")) return "Promotional Banners";
    if (path.startsWith("/admin/settings")) return "Store Settings";
    if (path.startsWith("/admin/profile")) return "Admin Profile & Security";
    if (path.startsWith("/admin/logs")) return "Activity Logs";
    return "Admin Portal";
  };

  const title = getPageTitle(pathname);

  return (
    <header className="h-16 bg-white border-b border-gray-200 sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8">
      {/* Left Section: Mobile Menu + Title */}
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="lg:hidden p-2 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="text-base sm:text-lg font-black text-gray-900 tracking-tight leading-tight">
            {title}
          </h1>
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400">
            <Link href="/admin" className="hover:text-ember transition-colors">
              Admin
            </Link>
            <span>/</span>
            <span className="text-gray-600 font-medium">{title}</span>
          </div>
        </div>
      </div>

      {/* Right Section: Badges & Profile Shortcut */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        <Link
          href="/admin/products/new"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-ember hover:bg-ember-deep px-3 py-1.5 rounded-xl transition-colors shadow-sm"
          title="Add New Product"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Add Product</span>
        </Link>

        <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-bold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span>System Online</span>
        </span>

        <Link
          href="/"
          target="_blank"
          className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-ember bg-gray-50 hover:bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-xl transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
          <span>Live Store</span>
        </Link>

        {/* Profile Link */}
        <Link
          href="/admin/profile"
          className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-gray-100 text-gray-700 transition-colors"
          title="Admin Profile"
        >
          <div className="w-8 h-8 rounded-lg bg-[#090D18] text-white flex items-center justify-center text-xs font-bold shadow-sm">
            <ShieldCheck className="w-4 h-4 text-ember" />
          </div>
          <span className="hidden lg:inline text-xs font-bold text-gray-800">
            {user?.name || "Admin"}
          </span>
        </Link>

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors focus:outline-none"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
