"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { SafeUser } from "@/features/auth/service";
import { AdminSidebar } from "./admin-sidebar";
import { AdminHeader } from "./admin-header";

interface AdminPortalShellProps {
  user: SafeUser | null;
  children: React.ReactNode;
}

const ROUTE_LABELS: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/products": "Products Catalogue",
  "/admin/inventory": "Products Catalogue",
  "/admin/categories": "Brands & Categories",
  "/admin/brands": "Brands & Categories Directory",
  "/admin/orders": "Orders & Fulfillment",
  "/admin/customers": "Customer Accounts",
  "/admin/banners": "Promotional Banners",
  "/admin/settings": "Store Settings",
  "/admin/profile": "Profile & Security",
  "/admin/logs": "Activity Logs",
};

export function AdminPortalShell({ user, children }: AdminPortalShellProps) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);

  useEffect(() => {
    setNavigatingTo(null);
  }, [pathname]);

  // When on the dedicated /admin/login page, render clean standalone layout
  if (pathname === "/admin/login") {
    return <div className="min-h-screen bg-[#F4F5F7]">{children}</div>;
  }

  const targetLabel = navigatingTo ? ROUTE_LABELS[navigatingTo] || "Page" : "";

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#171B24] flex">
      {/* Top Animated Progress Bar on Page Navigation */}
      {navigatingTo && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-ember via-amber-400 to-ember z-50 animate-pulse shadow-sm" />
      )}

      {/* Fixed Desktop / Drawer Mobile Sidebar */}
      <AdminSidebar
        user={user}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onNavigate={(href) => setNavigatingTo(href)}
        navigatingHref={navigatingTo}
      />

      {/* Main Content Area (Offset by sidebar width on desktop) */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <AdminHeader
          user={user}
          onOpenSidebar={() => setIsSidebarOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto relative min-h-[500px]">
          {navigatingTo && (
            <div className="absolute inset-0 bg-white/75 backdrop-blur-[1px] z-30 flex items-start justify-center pt-24 transition-opacity duration-150">
              <div className="bg-white/95 px-5 py-3 rounded-2xl shadow-lg border border-gray-100 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-ember animate-spin" />
                <span className="text-xs font-bold text-gray-800">
                  Loading {targetLabel}...
                </span>
              </div>
            </div>
          )}
          {children}
        </main>

        {/* Minimal Admin Footer */}
        <footer className="py-4 px-6 border-t border-gray-200 text-center text-xs text-gray-400 bg-white">
          <span>HS Spare Parts Administration Portal — Version 2.0</span>
        </footer>
      </div>
    </div>
  );
}
