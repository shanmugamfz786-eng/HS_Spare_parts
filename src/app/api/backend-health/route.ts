import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Vercel BFF Route Handler: Proxies health-check requests to the local hybrid backend
 * via Cloudflare Access and Cloudflare Tunnel.
 *
 * Perimeter security headers are injected server-side.
 * Client cookies and untrusted perimeter headers are strictly stripped.
 */
export async function GET(request: Request) {
  const backendBaseUrl = process.env.BACKEND_API_URL?.trim();

  if (!backendBaseUrl) {
    return NextResponse.json(
      {
        status: "unavailable",
        error: "Backend upstream URL is not configured (BACKEND_API_URL).",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }

  // Construct target URL safely
  let targetUrl: URL;
  try {
    targetUrl = new URL("/api/health", backendBaseUrl);
  } catch {
    return NextResponse.json(
      {
        status: "unavailable",
        error: "Backend upstream URL configuration is invalid.",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }

  // Extract and sanitize client IP from trusted Vercel proxy headers
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const rawIp = forwardedFor ? forwardedFor.split(",")[0]?.trim() : realIp?.trim();
  const clientIp = rawIp || "127.0.0.1";

  // Build clean upstream request headers:
  // - Injects Cloudflare Access Service Token credentials
  // - Injects backend proxy secret
  // - Injects trusted client IP
  // - Excludes client cookies and client-supplied auth headers
  const upstreamHeaders = new Headers();
  upstreamHeaders.set("Accept", "application/json");
  upstreamHeaders.set("User-Agent", "HS-Spare-Parts-BFF/1.0");
  upstreamHeaders.set("x-hs-client-ip", clientIp);

  if (process.env.CF_ACCESS_CLIENT_ID) {
    upstreamHeaders.set("CF-Access-Client-Id", process.env.CF_ACCESS_CLIENT_ID);
  }
  if (process.env.CF_ACCESS_CLIENT_SECRET) {
    upstreamHeaders.set("CF-Access-Client-Secret", process.env.CF_ACCESS_CLIENT_SECRET);
  }
  if (process.env.HS_BACKEND_PROXY_SECRET) {
    upstreamHeaders.set("x-hs-proxy-secret", process.env.HS_BACKEND_PROXY_SECRET);
  }

  try {
    // 15-second abort timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const upstreamResponse = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: upstreamHeaders,
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
    });

    clearTimeout(timeoutId);

    let data: unknown;
    try {
      data = await upstreamResponse.json();
    } catch {
      data = { rawText: "Non-JSON response from backend" };
    }

    return NextResponse.json(data, {
      status: upstreamResponse.status,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err: unknown) {
    const isTimeout =
      err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");

    return NextResponse.json(
      {
        status: "unreachable",
        error: isTimeout ? "Backend request timed out after 15s" : "Backend service is unreachable",
      },
      {
        status: isTimeout ? 504 : 502,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  }
}
