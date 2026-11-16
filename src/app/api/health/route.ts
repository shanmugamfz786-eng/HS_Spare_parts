import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const uptimeSeconds = process.uptime();
  const dbHealth = await checkDatabaseHealth();

  const status = dbHealth.connected || !process.env.DATABASE_URL ? "healthy" : "degraded";

  const responseBody = {
    status,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(uptimeSeconds),
    environment: process.env.NODE_ENV || "development",
    version: "0.1.0",
    services: {
      application: {
        status: "up",
      },
      database: {
        status: dbHealth.connected ? "connected" : dbHealth.error ? "disconnected" : "unconfigured",
        latencyMs: dbHealth.latencyMs ?? null,
        message: dbHealth.error ?? (dbHealth.connected ? "Neon PostgreSQL operational" : "DATABASE_URL not set in environment"),
      },
    },
  };

  return NextResponse.json(responseBody, {
    status: status === "healthy" ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
