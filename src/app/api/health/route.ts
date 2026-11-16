import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const uptimeSeconds = process.uptime();
  const dbHealth = await checkDatabaseHealth();

  const status = dbHealth.connected || !process.env.DATABASE_URL ? "healthy" : "degraded";

  // Log internal diagnostic error on server without leaking to public response
  if (dbHealth.error && process.env.NODE_ENV !== "test") {
    console.error("[Health Check] Database connectivity issue:", dbHealth.error);
  }

  const responseBody = {
    status,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(uptimeSeconds),
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    version: "0.1.0",
    services: {
      application: {
        status: "up",
      },
      database: {
        status: dbHealth.connected ? "connected" : dbHealth.error ? "disconnected" : "unconfigured",
        latencyMs: dbHealth.connected ? dbHealth.latencyMs ?? null : null,
        message: dbHealth.connected
          ? "Database operational"
          : dbHealth.error
          ? "Database connection unavailable"
          : "DATABASE_URL not configured",
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
