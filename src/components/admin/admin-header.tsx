"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, LogOut } from "lucide-react";
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

      {/* Right Section: Sign Out */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleLogout}
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors focus:outline-none"
          title="Sign Out"
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
