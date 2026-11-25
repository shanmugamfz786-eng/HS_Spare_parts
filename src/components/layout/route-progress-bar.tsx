"use client";

import React, { useEffect, useState, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function RouteProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // When pathname or searchParams change, the route transition completed
  useEffect(() => {
    if (!loading) return;
    setProgress(100);
    const finishTimer = setTimeout(() => {
      setLoading(false);
      setProgress(0);
    }, 200);
    return () => clearTimeout(finishTimer);
  }, [pathname, searchParams, loading]);

  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      // Find closest anchor tag
      const target = (e.target as HTMLElement)?.closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("javascript:") ||
        target.target === "_blank" ||
        target.hasAttribute("download") ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }

      // Check if it's an internal link
      const isInternal =
        href.startsWith("/") ||
        href.startsWith(window.location.origin);

      if (!isInternal) return;

      // If clicking the current page with same search params, ignore
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      const targetPath = href.replace(window.location.origin, "");
      if (currentUrl === targetPath) return;

      // Start instant loading progress
      setLoading(true);
      setProgress(25);

      if (timerRef.current) clearInterval(timerRef.current);

      timerRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 85) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 85;
          }
          return prev + Math.floor(Math.random() * 15 + 5);
        });
      }, 150);
    };

    const handlePopState = () => {
      setLoading(true);
      setProgress(40);
    };

    document.addEventListener("click", handleDocumentClick, { capture: true });
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleDocumentClick, { capture: true });
      window.removeEventListener("popstate", handlePopState);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (!loading && progress === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none h-[3px] bg-transparent"
      aria-hidden="true"
    >
      <div
        className="h-full bg-gradient-to-r from-ember via-amber-500 to-ember transition-all duration-200 ease-out shadow-[0_0_8px_rgba(255,77,0,0.8)]"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
          transition: progress === 100 ? "width 150ms ease-out, opacity 250ms 100ms ease-out" : "width 200ms ease-out",
        }}
      />
    </div>
  );
}
