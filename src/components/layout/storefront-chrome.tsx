"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Header } from "./header";
import { Footer } from "./footer";

export function StorefrontChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin");

  if (isAdminRoute) {
    return <div className="min-h-screen flex flex-col flex-1">{children}</div>;
  }

  return (
    <>
      <Header />
      <main className="flex-1 flex flex-col">{children}</main>
      <Footer />
    </>
  );
}
