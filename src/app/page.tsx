import Link from "next/link";
import { CheckCircle2, ShieldCheck, Database, Layers, ArrowRight, Activity } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col bg-ink text-paper">
      {/* Top Header / Brand Bar */}
      <header className="border-b border-gray-800 bg-ink-raised py-4 px-6 sm:px-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-brand bg-ember flex items-center justify-center font-black text-xl text-paper tracking-wider shadow-md">
              HS
            </div>
            <div>
              <span className="font-extrabold text-lg sm:text-xl tracking-tight text-paper block">
                HS SPARE PARTS
              </span>
              <span className="text-xs text-ember font-medium uppercase tracking-widest block">
                Right Part. Right Price.
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Link
              href="/api/health"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-gray-300 hover:text-ember transition-colors py-1.5 px-3 rounded-brand bg-ink border border-gray-700 hover:border-ember"
            >
              <Activity className="w-4 h-4 text-ember animate-pulse" />
              <span>System Health</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-12 sm:px-10 sm:py-16">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-ember/10 border border-ember/30 text-ember text-xs font-semibold uppercase tracking-wider mb-6">
            <ShieldCheck className="w-4 h-4" />
            <span>Phase 1 — Master Foundation Initialized</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-paper mb-4 leading-tight">
            High-Performance Automotive E-Commerce Platform
          </h1>
          <p className="text-base sm:text-lg text-gray-300 mb-8 leading-relaxed">
            Architected for security, scale, and precision fitment. Built with Next.js App Router, TypeScript in Strict Mode, Drizzle ORM, Neon PostgreSQL, and Tailwind CSS.
          </p>
        </div>

        {/* Foundation Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-10">
          <div className="surface-card p-6 bg-paper text-charcoal shadow-lg">
            <div className="w-10 h-10 rounded-brand bg-ink text-ember flex items-center justify-center mb-4">
              <Layers className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-charcoal mb-2">Next.js App Router</h2>
            <p className="text-sm text-muted leading-relaxed mb-4">
              Server-first architecture with strict React Server Components, server actions, route handlers, and type-safe routing.
            </p>
            <div className="flex items-center gap-2 text-xs font-semibold text-success">
              <CheckCircle2 className="w-4 h-4" />
              <span>Configured & Ready</span>
            </div>
          </div>

          <div className="surface-card p-6 bg-paper text-charcoal shadow-lg">
            <div className="w-10 h-10 rounded-brand bg-ink text-ember flex items-center justify-center mb-4">
              <Database className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-charcoal mb-2">Neon PostgreSQL & Drizzle</h2>
            <p className="text-sm text-muted leading-relaxed mb-4">
              Drizzle ORM schema foundation, Neon serverless pooled connection architecture, and migration tooling prepared.
            </p>
            <div className="flex items-center gap-2 text-xs font-semibold text-success">
              <CheckCircle2 className="w-4 h-4" />
              <span>Schema Foundation Ready</span>
            </div>
          </div>

          <div className="surface-card p-6 bg-paper text-charcoal shadow-lg">
            <div className="w-10 h-10 rounded-brand bg-ink text-ember flex items-center justify-center mb-4">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-charcoal mb-2">Security & Git Isolation</h2>
            <p className="text-sm text-muted leading-relaxed mb-4">
              Documentation completely isolated from Git, strict environment validation via Zod, and production security headers.
            </p>
            <div className="flex items-center gap-2 text-xs font-semibold text-success">
              <CheckCircle2 className="w-4 h-4" />
              <span>Zero-Leakage Enforcement</span>
            </div>
          </div>
        </div>

        {/* Health Check CTA & Direct Actions */}
        <div className="rounded-card bg-ink-raised border border-gray-800 p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <h3 className="text-lg font-bold text-paper mb-1">Verify Phase 1 Health Endpoint</h3>
            <p className="text-sm text-gray-400">
              Query the JSON health status check for server uptime, environment parameters, and database connectivity.
            </p>
          </div>
          <Link
            href="/api/health"
            className="btn-primary whitespace-nowrap gap-2 text-sm font-semibold shadow-md"
          >
            <span>Run Health Check</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-ink-raised py-6 px-6 sm:px-10 text-center text-xs text-gray-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} HS Spare Parts. All rights reserved.</p>
          <p className="text-gray-400">Internal Development Build — Phase 1 Foundation</p>
        </div>
      </footer>
    </main>
  );
}
