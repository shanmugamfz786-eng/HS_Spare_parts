import crypto from "node:crypto";
import https from "node:https";
import http from "node:http";

export interface CloudflareAccessJwtConfig {
  teamDomain: string; // e.g. "https://hs-spare-parts.cloudflareaccess.com" or "hs-spare-parts"
  aud: string; // Expected Application Audience Tag
  jwksUrl?: string; // Optional custom JWKS endpoint URL
  customKeyResolver?: (kid: string) => Promise<crypto.JsonWebKey | null>; // For testing / offline injection
  clockSkewSeconds?: number; // Clock skew tolerance (default: 30)
}

export interface VerifyJwtResult {
  valid: boolean;
  payload?: Record<string, unknown>;
  error?: string;
}

interface JwksResponse {
  keys: Array<crypto.JsonWebKey & { kid?: string; use?: string; alg?: string }>;
}

// In-memory cache for fetched JWKS keys to avoid per-request network hops
const jwksKeyCache = new Map<string, { key: crypto.KeyObject; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Normalizes the Cloudflare Access team domain to standard HTTPS origin format.
 */
export function normalizeTeamDomain(teamDomain: string): string {
  const trimmed = teamDomain.trim().replace(/\/+$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}.cloudflareaccess.com`;
}

/**
 * Fetches JWKS from Cloudflare's published certs endpoint with a 10s timeout.
 */
async function fetchCloudflareJwks(jwksUrl: string): Promise<JwksResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(jwksUrl);
    const client = url.protocol === "https:" ? https : http;

    const req = client.get(
      url,
      {
        headers: { Accept: "application/json", "User-Agent": "HS-Spare-Parts-Backend/1.0" },
        timeout: 10000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`JWKS fetch failed with HTTP ${res.statusCode}`));
        }

        let rawData = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          rawData += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(rawData);
            resolve(parsed);
          } catch {
            reject(new Error("Failed to parse JWKS JSON response"));
          }
        });
      }
    );

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("JWKS fetch timed out after 10000ms"));
    });
  });
}

/**
 * Resolves an RSA public key matching the given Key ID (kid).
 */
async function getPublicKeyForKid(
  kid: string,
  config: CloudflareAccessJwtConfig
): Promise<crypto.KeyObject | null> {
  // 1. Check in-memory cache
  const cached = jwksKeyCache.get(kid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.key;
  }

  // 2. Custom key resolver for mock testing / offline operation
  if (config.customKeyResolver) {
    const customJwk = await config.customKeyResolver(kid);
    if (!customJwk) return null;
    return crypto.createPublicKey({ key: customJwk, format: "jwk" });
  }

  // 3. Live fetch from Cloudflare Access certs endpoint
  const teamOrigin = normalizeTeamDomain(config.teamDomain);
  const jwksUrl = config.jwksUrl || `${teamOrigin}/cdn-cgi/access/certs`;

  const jwks = await fetchCloudflareJwks(jwksUrl);
  if (!jwks || !Array.isArray(jwks.keys)) {
    return null;
  }

  for (const jwk of jwks.keys) {
    if (jwk.kid && jwk.kty === "RSA") {
      try {
        const pubKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
        jwksKeyCache.set(jwk.kid, { key: pubKey, expiresAt: Date.now() + CACHE_TTL_MS });
      } catch {
        // Skip unparseable key
      }
    }
  }

  const resolved = jwksKeyCache.get(kid);
  return resolved ? resolved.key : null;
}

/**
 * Validates a Cloudflare Access JWT assertion using Node.js native crypto.
 * Verifies RS256 signature, issuer, audience, and expiration.
 * Never logs raw tokens or authorization headers.
 */
export async function verifyCloudflareAccessJwt(
  rawToken: string,
  config: CloudflareAccessJwtConfig
): Promise<VerifyJwtResult> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.trim().length === 0) {
    return { valid: false, error: "Missing or empty JWT assertion token." };
  }

  if (!config.teamDomain || !config.aud) {
    return { valid: false, error: "Cloudflare Access configuration (teamDomain or aud) missing." };
  }

  const parts = rawToken.trim().split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "Malformed JWT: expected 3 dot-separated segments." };
  }

  const headerB64 = parts[0];
  const payloadB64 = parts[1];
  const signatureB64 = parts[2];

  if (!headerB64 || !payloadB64 || !signatureB64) {
    return { valid: false, error: "Malformed JWT segments." };
  }

  // 1. Parse header
  let header: { alg?: string; kid?: string; typ?: string };
  try {
    header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
  } catch {
    return { valid: false, error: "Invalid JWT header encoding." };
  }

  if (header.alg !== "RS256") {
    return { valid: false, error: `Unsupported JWT algorithm: expected RS256, got ${header.alg}` };
  }

  if (!header.kid || typeof header.kid !== "string") {
    return { valid: false, error: "JWT header missing required 'kid' (Key ID)." };
  }

  // 2. Parse payload
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { valid: false, error: "Invalid JWT payload encoding." };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const skew = config.clockSkewSeconds ?? 30;

  // 3. Verify expiration
  if (typeof payload.exp !== "number") {
    return { valid: false, error: "JWT payload missing required numeric 'exp' claim." };
  }
  if (payload.exp + skew < nowSec) {
    return { valid: false, error: "JWT assertion has expired." };
  }

  // 4. Verify Not-Before (nbf)
  if (typeof payload.nbf === "number" && payload.nbf - skew > nowSec) {
    return { valid: false, error: "JWT assertion is not yet valid (nbf in future)." };
  }

  // 5. Verify Issuer (iss)
  const expectedIssuer = normalizeTeamDomain(config.teamDomain);
  if (payload.iss !== expectedIssuer) {
    return { valid: false, error: "JWT issuer mismatch." };
  }

  // 6. Verify Audience (aud)
  const expectedAud = config.aud.trim();
  let audMatches = false;
  if (Array.isArray(payload.aud)) {
    audMatches = payload.aud.includes(expectedAud);
  } else if (typeof payload.aud === "string") {
    audMatches = payload.aud === expectedAud;
  }

  if (!audMatches) {
    return { valid: false, error: "JWT audience mismatch." };
  }

  // 7. Verify Signature using JWKS public key
  let publicKey: crypto.KeyObject | null;
  try {
    publicKey = await getPublicKeyForKid(header.kid, config);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to retrieve public key";
    return { valid: false, error: `Key resolution failed: ${msg}` };
  }

  if (!publicKey) {
    return { valid: false, error: `Public key for kid '${header.kid}' not found in JWKS.` };
  }

  try {
    const signedData = Buffer.from(`${headerB64}.${payloadB64}`, "utf8");
    const signature = Buffer.from(signatureB64, "base64url");
    const isSignatureValid = crypto.verify("sha256", signedData, publicKey, signature);

    if (!isSignatureValid) {
      return { valid: false, error: "Cryptographic signature verification failed." };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Verification error";
    return { valid: false, error: `Signature verification error: ${msg}` };
  }

  return { valid: true, payload };
}

/**
 * Clears the in-memory JWKS cache (used for unit testing).
 */
export function clearJwksCache(): void {
  jwksKeyCache.clear();
}

