import React from "react";
import type { Metadata } from "next";
import { getCurrentAdminUser } from "@/features/auth/service";
import { AdminPortalShell } from "@/components/admin/admin-portal-shell";

export const metadata: Metadata = {
  title: "Admin Portal — HS Spare Parts",
  description: "Enterprise administration portal for HS Spare Parts automotive catalogue, inventory, and operations.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await getCurrentAdminUser();

  return (
    <AdminPortalShell user={currentUser}>
      {children}
    </AdminPortalShell>
  );
}
