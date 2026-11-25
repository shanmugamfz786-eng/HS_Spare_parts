import http from "node:http";
import crypto from "node:crypto";
import { URL } from "node:url";
import {
  verifyCloudflareAccessJwt,
  CloudflareAccessJwtConfig,
} from "./jwt-validator";

export interface BackendServerConfig {
  port: number;
  host: string;
  proxySecret: string;
  cfAccess: CloudflareAccessJwtConfig;
}

export interface BackendServerInstance {
  server: http.Server;
  start: () => Promise<{ port: number; host: string }>;
  stop: () => Promise<void>;
  getConfig: () => BackendServerConfig;
}

/**
 * Constant-time comparison using SHA-256 digests.
 * Completely immune to length timing leakage or exceptions from length differences.
 */
export function timingSafeCompare(
  a: string | undefined | null,
  b: string | undefined | null
): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Core HTTP request handler for the standalone hybrid backend.
 * Exported for direct in-memory invocation and unit testing without network sockets.
 */
export async function handleBackendRequest(
  req: { method?: string; url?: string; headers: http.IncomingHttpHeaders },
  res: {
    statusCode?: number;
    setHeader: (name: string, value: string) => void;
    end: (chunk?: string) => void;
  },
  config: BackendServerConfig
): Promise<void> {
  // Baseline HTTP response security headers
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");

  const hostHeader = req.headers.host || "127.0.0.1";
  const parsedUrl = new URL(req.url ?? "/", `http://${hostHeader}`);

  // Path routing
  if (parsedUrl.pathname !== "/api/health") {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Not Found" }));
    return;
  }

  // HTTP method restriction: strictly GET only
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    res.end(JSON.stringify({ error: "Method Not Allowed" }));
    return;
  }

  // Fail-closed configuration check: all security parameters must be configured
  if (!config.proxySecret || !config.cfAccess.teamDomain || !config.cfAccess.aud) {
    res.statusCode = 500;
    res.end(
      JSON.stringify({
        error: "Service configuration error: backend perimeter security is not properly configured.",
      })
    );
    return;
  }

  // 1. Authenticate Cloudflare Access JWT Assertion
  const cfJwtHeader = req.headers["cf-access-jwt-assertion"];
  const cfJwtToken = Array.isArray(cfJwtHeader) ? cfJwtHeader[0] : cfJwtHeader;

  if (!cfJwtToken) {
    res.statusCode = 401;
    res.end(
      JSON.stringify({
        error: "Unauthorized: missing Cloudflare Access assertion header (Cf-Access-Jwt-Assertion).",
      })
    );
    return;
  }

  const jwtResult = await verifyCloudflareAccessJwt(cfJwtToken, config.cfAccess);
  if (!jwtResult.valid) {
    res.statusCode = 401;
    res.end(
      JSON.stringify({
        error: "Unauthorized: invalid Cloudflare Access assertion.",
        reason: jwtResult.error,
      })
    );
    return;
  }

  // 2. Authenticate Backend Proxy Secret (x-hs-proxy-secret)
  const clientSecretHeader = req.headers["x-hs-proxy-secret"];
  const clientSecret = Array.isArray(clientSecretHeader) ? clientSecretHeader[0] : clientSecretHeader;

  if (!clientSecret || !timingSafeCompare(clientSecret, config.proxySecret)) {
    res.statusCode = 403;
    res.end(
      JSON.stringify({
        error: "Forbidden: invalid or missing backend proxy secret (x-hs-proxy-secret).",
      })
    );
    return;
  }

  // 3. Return verified health status
  // Zero database queries, single source of truth remains Neon
  res.statusCode = 200;

  const payload = {
    status: "healthy",
    service: "hs-backend-local",
    database: "not_checked",
    timestamp: new Date().toISOString(),
  };

  res.end(JSON.stringify(payload));
}

/**
 * Creates the standalone Node.js HTTP server for the hybrid backend.
 * Dedicated to Port 3001 (or configured port).
 */
export function createBackendServer(
  customConfig?: Partial<BackendServerConfig>
): BackendServerInstance {
  const config: BackendServerConfig = {
    port: customConfig?.port ?? (process.env.BACKEND_PORT ? parseInt(process.env.BACKEND_PORT, 10) : 3001),
    host: customConfig?.host ?? process.env.BACKEND_HOST ?? "127.0.0.1",
    proxySecret: customConfig?.proxySecret ?? process.env.HS_BACKEND_PROXY_SECRET ?? "",
    cfAccess: {
      teamDomain: customConfig?.cfAccess?.teamDomain ?? process.env.CF_ACCESS_TEAM_DOMAIN ?? "",
      aud: customConfig?.cfAccess?.aud ?? process.env.CF_ACCESS_AUD ?? "",
      jwksUrl: customConfig?.cfAccess?.jwksUrl ?? process.env.CF_ACCESS_JWKS_URL,
      customKeyResolver: customConfig?.cfAccess?.customKeyResolver,
      clockSkewSeconds: customConfig?.cfAccess?.clockSkewSeconds ?? 30,
    },
  };

  const server = http.createServer((req, res) => {
    void handleBackendRequest(req, res, config);
  });

  return {
    server,
    getConfig: () => ({ ...config }),
    start: () =>
      new Promise((resolve, reject) => {
        server.listen(config.port, config.host, () => {
          resolve({ port: config.port, host: config.host });
        });
        server.once("error", reject);
      }),
    stop: () =>
      new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}

// Auto-run if executed as main CLI script
if (
  process.argv[1] &&
  (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js"))
) {
  const instance = createBackendServer();
  instance
    .start()
    .then(({ port, host }) => {
      console.log(`[HS Hybrid Backend] Prototype listening on http://${host}:${port}`);
    })
    .catch((err) => {
      console.error("[HS Hybrid Backend] Failed to start:", err);
      process.exit(1);
    });

  const handleShutdown = async (signal: string) => {
    console.log(`[HS Hybrid Backend] Received ${signal}, shutting down...`);
    await instance.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void handleShutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void handleShutdown("SIGTERM");
  });
}
