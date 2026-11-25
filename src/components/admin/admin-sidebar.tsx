"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Boxes,
  FolderTree,
  Tag,
  ShoppingBag,
  Users,
  Megaphone,
  Settings,
  ShieldCheck,
  ClipboardList,
  LogOut,
  ExternalLink,
  X,
} from "lucide-react";
import type { SafeUser } from "@/features/auth/service";
import { logoutAction } from "@/features/auth/actions";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Brands & Categories", href: "/admin/brands", icon: Tag },
  { label: "Orders", href: "/admin/orders", icon: ShoppingBag },
  { label: "Customers", href: "/admin/customers", icon: Users },
  { label: "Banners", href: "/admin/banners", icon: Megaphone },
  { label: "Store Settings", href: "/admin/settings", icon: Settings },
  { label: "Profile & Security", href: "/admin/profile", icon: ShieldCheck },
  { label: "Activity Logs", href: "/admin/logs", icon: ClipboardList },
];

interface AdminSidebarProps {
  user: SafeUser | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (href: string) => void;
  navigatingHref?: string | null;
}

export function AdminSidebar({
  user,
  isOpen,
  onClose,
  onNavigate,
  navigatingHref: externalNavigatingHref,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [internalNavigatingHref, setInternalNavigatingHref] = useState<string | null>(null);

  const navigatingHref = externalNavigatingHref !== undefined ? externalNavigatingHref : internalNavigatingHref;

  useEffect(() => {
    setInternalNavigatingHref(null);
  }, [pathname]);

  useEffect(() => {
    // Proactively prefetch all admin routes into the Next.js client router cache
    const timer = setTimeout(() => {
      NAV_ITEMS.forEach((item) => {
        router.prefetch(item.href);
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [router]);

  const handleLogout = async () => {
    await logoutAction();
    router.push("/admin/login");
    router.refresh();
  };

  const isActive = (href: string) => {
    if (navigatingHref) {
      return navigatingHref === href;
    }
    if (href === "/admin") {
      return pathname === "/admin";
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#090D18] text-white flex flex-col transition-transform duration-300 ease-in-out border-r border-gray-800 ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-6 flex items-center justify-between border-b border-gray-800/80">
          <Link href="/admin" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-ember flex items-center justify-center font-black text-white text-base shadow-sm group-hover:scale-105 transition-transform">
              HS
            </div>
            <div>
              <div className="text-sm font-black tracking-tight text-white leading-none">
                HS SPARE PARTS
              </div>
              <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mt-0.5">
                Admin Portal
              </div>
            </div>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 focus:outline-none"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Navigation
          </div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const isPendingNav = navigatingHref === item.href && !pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                onMouseEnter={() => router.prefetch(item.href)}
                onClick={() => {
                  if (item.href !== pathname) {
                    setInternalNavigatingHref(item.href);
                    onNavigate?.(item.href);
                  }
                  onClose();
                }}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  active
                    ? "bg-ember text-white shadow-sm font-bold"
                    : "text-gray-300 hover:text-white hover:bg-gray-800/80"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-white" : "text-gray-400"}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {isPendingNav && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-ping" />
                  )}
                  {item.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 font-bold">
                      {item.badge}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}

          <div className="pt-4 px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Storefront
          </div>
          <Link
            href="/"
            target="_blank"
            className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-gray-300 hover:text-white hover:bg-gray-800/80 transition-colors"
          >
            <div className="flex items-center gap-3">
              <ExternalLink className="w-4 h-4 text-gray-400" />
              <span>View Customer Store</span>
            </div>
          </Link>
        </div>

        {/* User Footer & Sign Out */}
        <div className="p-3 border-t border-gray-800/80 bg-gray-900/40">
          <div className="p-2.5 rounded-xl bg-gray-800/50 flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                {user?.name ? user.name.charAt(0).toUpperCase() : "A"}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  {user?.name || "Administrator"}
                </div>
                <div className="text-[10px] text-gray-400 truncate">
                  {user?.email || "admin@hsspareparts.com"}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors focus:outline-none"
              title="Sign Out"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
