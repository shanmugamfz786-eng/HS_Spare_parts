import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import type http from "node:http";
import {
  createBackendServer,
  handleBackendRequest,
  timingSafeCompare,
  BackendServerConfig,
} from "@/server/hybrid-backend/server";
import {
  verifyCloudflareAccessJwt,
  clearJwksCache,
  normalizeTeamDomain,
} from "@/server/hybrid-backend/jwt-validator";
import { GET as bffGetHandler } from "@/app/api/backend-health/route";

describe("Phase 1 Hybrid Architecture Health-Check Prototype", () => {
  // Generate a test RSA-2048 keypair natively
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const testKid = "prototype-test-key-id";
  const testJwk = publicKey.export({ format: "jwk" });
  testJwk.kid = testKid;

  // Alternate keypair to test invalid signature
  const { privateKey: wrongPrivateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  const testTeamDomain = "https://hs-spare-parts.cloudflareaccess.com";
  const testAud = "aud-tag-test-123456789";
  const testProxySecret = "super-secret-hs-proxy-key-2026";

  function createSignedJwt(
    payloadOverrides: Record<string, unknown> = {},
    headerOverrides: Record<string, unknown> = {},
    signingKey: crypto.KeyObject = privateKey
  ): string {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = {
      alg: "RS256",
      kid: testKid,
      typ: "JWT",
      ...headerOverrides,
    };
    const payload = {
      iss: testTeamDomain,
      aud: testAud,
      sub: "service-token-id",
      exp: nowSec + 3600, // 1 hour in future
      nbf: nowSec - 10,
      iat: nowSec - 10,
      type: "app",
      identity_nonce: "test-nonce",
      ...payloadOverrides,
    };

    const hB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
    const pB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(`${hB64}.${pB64}`);
    const sigB64 = sign.sign(signingKey).toString("base64url");

    return `${hB64}.${pB64}.${sigB64}`;
  }

  interface BackendResponseBody {
    status?: string;
    service?: string;
    database?: string;
    timestamp?: string;
    error?: string;
    reason?: string;
    [key: string]: unknown;
  }

  // Helper to test handleBackendRequest in-memory without OS socket permissions
  async function invokeBackend(
    config: BackendServerConfig,
    options: {
      method?: string;
      url?: string;
      headers?: http.IncomingHttpHeaders;
    }
  ): Promise<{ status: number; headers: Record<string, string>; body: BackendResponseBody }> {
    const req = {
      method: options.method || "GET",
      url: options.url || "/api/health",
      headers: options.headers || {},
    };

    const responseHeaders: Record<string, string> = {};
    let responseData = "";
    let statusCode = 200;

    const res = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        responseHeaders[name.toLowerCase()] = value;
      },
      end(data?: string) {
        statusCode = this.statusCode ?? 200;
        if (data) responseData += data;
      },
    };

    await handleBackendRequest(req, res, config);

    let parsed = null;
    try {
      parsed = JSON.parse(responseData);
    } catch {
      parsed = responseData;
    }

    return {
      status: statusCode,
      headers: responseHeaders,
      body: parsed,
    };
  }

  beforeEach(() => {
    clearJwksCache();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("1. Pure Native Cryptographic RS256 JWT Validator", () => {
    it("normalizes team domain strings into standard HTTPS origins", () => {
      expect(normalizeTeamDomain("hs-spare-parts")).toBe("https://hs-spare-parts.cloudflareaccess.com");
      expect(normalizeTeamDomain("https://custom.access.domain.com/")).toBe("https://custom.access.domain.com");
    });

    it("verifies a valid RS256 Cloudflare Access JWT assertion", async () => {
      const token = createSignedJwt();
      const result = await verifyCloudflareAccessJwt(token, {
        teamDomain: testTeamDomain,
        aud: testAud,
        customKeyResolver: async (kid) => (kid === testKid ? testJwk : null),
      });

      expect(result.valid).toBe(true);
      expect(result.payload?.sub).toBe("service-token-id");
      expect(result.payload?.aud).toBe(testAud);
    });

    it("rejects JWT when signature is invalid (signed by untrusted key)", async () => {
      const token = createSignedJwt({}, {}, wrongPrivateKey);
      const result = await verifyCloudflareAccessJwt(token, {
        teamDomain: testTeamDomain,
        aud: testAud,
        customKeyResolver: async (kid) => (kid === testKid ? testJwk : null),
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("signature verification failed");
    });

    it("rejects JWT with mismatched issuer (iss)", async () => {
      const token = createSignedJwt({ iss: "https://attacker.cloudflareaccess.com" });
      const result = await verifyCloudflareAccessJwt(token, {
        teamDomain: testTeamDomain,
        aud: testAud,
        customKeyResolver: async (kid) => (kid === testKid ? testJwk : null),
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("issuer mismatch");
    });

    it("rejects JWT with mismatched audience (aud)", async () => {
      const token = createSignedJwt({ aud: "wrong-audience-tag" });
      const result = await verifyCloudflareAccessJwt(token, {
        teamDomain: testTeamDomain,
        aud: testAud,
        customKeyResolver: async (kid) => (kid === testKid ? testJwk : null),
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("audience mismatch");
    });

    it("rejects expired JWT (exp + clock skew < now)", async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createSignedJwt({ exp: nowSec - 120 }); // expired 2 mins ago
      const result = await verifyCloudflareAccessJwt(token, {
        teamDomain: testTeamDomain,
        aud: testAud,
        clockSkewSeconds: 30,
        customKeyResolver: async (kid) => (kid === testKid ? testJwk : null),
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("expired");
    });

    it("rejects non-RS256 algorithm", async () => {
      const token = createSignedJwt({}, { alg: "HS256" });
      const result = await verifyCloudflareAccessJwt(token, {
        teamDomain: testTeamDomain,
        aud: testAud,
        customKeyResolver: async (kid) => (kid === testKid ? testJwk : null),
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("expected RS256");
    });

    it("rejects missing or empty token", async () => {
      const result = await verifyCloudflareAccessJwt("", {
        teamDomain: testTeamDomain,
        aud: testAud,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("2. Standalone Backend Server (Port 3001 Prototype)", () => {
    const defaultConfig: BackendServerConfig = {
      port: 3001,
      host: "127.0.0.1",
      proxySecret: testProxySecret,
      cfAccess: {
        teamDomain: testTeamDomain,
        aud: testAud,
        customKeyResolver: async (kid) => (kid === testKid ? testJwk : null),
      },
    };

    it("timingSafeCompare compares strings safely and immune to length mismatch", () => {
      expect(timingSafeCompare("secret123", "secret123")).toBe(true);
      expect(timingSafeCompare("secret123", "wrong")).toBe(false);
      expect(timingSafeCompare("secret123", "")).toBe(false);
      expect(timingSafeCompare(undefined, "secret123")).toBe(false);
    });

    it("returns 200 with database: 'not_checked' when valid JWT and proxy secret are supplied", async () => {
      const validJwt = createSignedJwt();
      const res = await invokeBackend(defaultConfig, {
        method: "GET",
        url: "/api/health",
        headers: {
          "cf-access-jwt-assertion": validJwt,
          "x-hs-proxy-secret": testProxySecret,
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toContain("no-store");
      expect(res.body).toMatchObject({
        status: "healthy",
        service: "hs-backend-local",
        database: "not_checked",
      });
      expect(typeof res.body.timestamp).toBe("string");
    });

    it("returns 401 when cf-access-jwt-assertion header is missing", async () => {
      const res = await invokeBackend(defaultConfig, {
        method: "GET",
        url: "/api/health",
        headers: {
          "x-hs-proxy-secret": testProxySecret,
        },
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain("missing Cloudflare Access assertion");
    });

    it("returns 401 when cf-access-jwt-assertion has invalid signature", async () => {
      const forgedJwt = createSignedJwt({}, {}, wrongPrivateKey);
      const res = await invokeBackend(defaultConfig, {
        method: "GET",
        url: "/api/health",
        headers: {
          "cf-access-jwt-assertion": forgedJwt,
          "x-hs-proxy-secret": testProxySecret,
        },
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain("invalid Cloudflare Access assertion");
    });

    it("returns 403 when x-hs-proxy-secret is missing", async () => {
      const validJwt = createSignedJwt();
      const res = await invokeBackend(defaultConfig, {
        method: "GET",
        url: "/api/health",
        headers: {
          "cf-access-jwt-assertion": validJwt,
        },
      });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("invalid or missing backend proxy secret");
    });

    it("returns 403 when x-hs-proxy-secret is incorrect", async () => {
      const validJwt = createSignedJwt();
      const res = await invokeBackend(defaultConfig, {
        method: "GET",
        url: "/api/health",
        headers: {
          "cf-access-jwt-assertion": validJwt,
          "x-hs-proxy-secret": "incorrect-proxy-secret-value",
        },
      });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("invalid or missing backend proxy secret");
    });

    it("returns 404 for unknown endpoints", async () => {
      const res = await invokeBackend(defaultConfig, {
        method: "GET",
        url: "/api/orders",
      });
      expect(res.status).toBe(404);
    });

    it("returns 405 Method Not Allowed for HEAD requests", async () => {
      const res = await invokeBackend(defaultConfig, {
        method: "HEAD",
        url: "/api/health",
      });
      expect(res.status).toBe(405);
      expect(res.headers.allow).toBe("GET");
    });

    it("returns 405 for disallowed HTTP methods (POST, PUT, DELETE, PATCH)", async () => {
      for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
        const res = await invokeBackend(defaultConfig, {
          method,
          url: "/api/health",
        });
        expect(res.status).toBe(405);
        expect(res.headers.allow).toBe("GET");
      }
    });

    it("fails closed with 500 when server configuration is incomplete", async () => {
      const unconfiguredConfig: BackendServerConfig = {
        port: 3001,
        host: "127.0.0.1",
        proxySecret: "", // Missing
        cfAccess: {
          teamDomain: "", // Missing
          aud: "",
        },
      };

      const res = await invokeBackend(unconfiguredConfig, {
        method: "GET",
        url: "/api/health",
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain("Service configuration error");
    });

    it("createBackendServer builds an instance with getConfig", () => {
      const serverInst = createBackendServer(defaultConfig);
      expect(serverInst.server).toBeDefined();
      expect(serverInst.getConfig().port).toBe(3001);
      expect(serverInst.getConfig().host).toBe("127.0.0.1");
    });
  });

  describe("3. Vercel BFF Route Handler (/api/backend-health)", () => {
    it("returns 503 if BACKEND_API_URL is not configured", async () => {
      vi.stubEnv("BACKEND_API_URL", "");

      const req = new Request("https://hs-spare-parts.vercel.app/api/backend-health");
      const res = await bffGetHandler(req);

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.status).toBe("unavailable");
      expect(json.error).toContain("BACKEND_API_URL");
    });

    it("forwards required Cloudflare Access headers and proxy secret to fixed upstream /api/health", async () => {
      vi.stubEnv("BACKEND_API_URL", "https://backend-tunnel.hsspareparts.com");
      vi.stubEnv("CF_ACCESS_CLIENT_ID", "cf-client-id-xyz");
      vi.stubEnv("CF_ACCESS_CLIENT_SECRET", "cf-client-secret-abc");
      vi.stubEnv("HS_BACKEND_PROXY_SECRET", "proxy-secret-123");

      let capturedUrl = "";
      let capturedHeaders: Headers | undefined;

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        capturedUrl = url.toString();
        capturedHeaders = new Headers(init?.headers);
        return new Response(
          JSON.stringify({
            status: "healthy",
            service: "hs-backend-local",
            database: "not_checked",
            timestamp: new Date().toISOString(),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });

      const clientReq = new Request("https://hs-spare-parts.vercel.app/api/backend-health", {
        headers: {
          "x-forwarded-for": "203.0.113.195, 10.0.0.1",
          cookie: "session=untrusted-client-cookie",
          "x-hs-proxy-secret": "malicious-client-attempt",
        },
      });

      const res = await bffGetHandler(clientReq);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toContain("no-store");

      // Verify strict upstream destination
      expect(capturedUrl).toBe("https://backend-tunnel.hsspareparts.com/api/health");

      // Verify injected perimeter headers
      expect(capturedHeaders?.get("CF-Access-Client-Id")).toBe("cf-client-id-xyz");
      expect(capturedHeaders?.get("CF-Access-Client-Secret")).toBe("cf-client-secret-abc");
      expect(capturedHeaders?.get("x-hs-proxy-secret")).toBe("proxy-secret-123");
      expect(capturedHeaders?.get("x-hs-client-ip")).toBe("203.0.113.195");

      // Verify client cookies are NOT forwarded
      expect(capturedHeaders?.get("cookie")).toBeNull();

      const json = await res.json();
      expect(json.status).toBe("healthy");
      expect(json.database).toBe("not_checked");
    });

    it("handles upstream connection timeout gracefully with 504 and Cache-Control: no-store", async () => {
      vi.stubEnv("BACKEND_API_URL", "https://backend-tunnel.hsspareparts.com");

      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        const timeoutError = new Error("The operation was aborted due to timeout");
        timeoutError.name = "TimeoutError";
        throw timeoutError;
      });

      const req = new Request("https://hs-spare-parts.vercel.app/api/backend-health");
      const res = await bffGetHandler(req);

      expect(res.status).toBe(504);
      expect(res.headers.get("cache-control")).toContain("no-store");
      const json = await res.json();
      expect(json.status).toBe("unreachable");
      expect(json.error).toContain("timed out");
    });

    it("handles upstream network connection error gracefully with 502", async () => {
      vi.stubEnv("BACKEND_API_URL", "https://backend-tunnel.hsspareparts.com");

      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        throw new Error("fetch failed: ECONNREFUSED");
      });

      const req = new Request("https://hs-spare-parts.vercel.app/api/backend-health");
      const res = await bffGetHandler(req);

      expect(res.status).toBe(502);
      expect(res.headers.get("cache-control")).toContain("no-store");
      const json = await res.json();
      expect(json.status).toBe("unreachable");
      expect(json.error).toContain("unreachable");
    });

    it("strictly refuses to follow upstream redirects (redirect: 'error') and fails safely with 502", async () => {
      vi.stubEnv("BACKEND_API_URL", "https://backend-tunnel.hsspareparts.com");
      vi.stubEnv("CF_ACCESS_CLIENT_ID", "cf-client-id-xyz");
      vi.stubEnv("CF_ACCESS_CLIENT_SECRET", "cf-client-secret-abc");
      vi.stubEnv("HS_BACKEND_PROXY_SECRET", "proxy-secret-123");

      let passedFetchOptions: RequestInit | undefined;

      vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
        passedFetchOptions = init;
        // Simulate fetch runtime throwing TypeError when upstream redirects and redirect is 'error'
        const redirectError = new TypeError("Failed to fetch: redirect mode is set to error");
        throw redirectError;
      });

      const req = new Request("https://hs-spare-parts.vercel.app/api/backend-health");
      const res = await bffGetHandler(req);

      // Verify fetch options explicitly configured redirect: "error"
      expect(passedFetchOptions?.redirect).toBe("error");

      // Verify safe fail-closed response
      expect(res.status).toBe(502);
      expect(res.headers.get("cache-control")).toContain("no-store");
      const json = await res.json();
      expect(json.status).toBe("unreachable");
      expect(json.error).toBe("Backend service is unreachable");

      // Ensure credentials and internal hostnames are NEVER leaked
      expect(JSON.stringify(json)).not.toContain("cf-client-secret-abc");
      expect(JSON.stringify(json)).not.toContain("proxy-secret-123");
      expect(JSON.stringify(json)).not.toContain("backend-tunnel.hsspareparts.com");
    });
  });
});
