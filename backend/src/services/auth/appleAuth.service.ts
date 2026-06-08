import * as jose from "jose";

export const APPLE_AUTH_DEV_MOCK_TOKEN = "dev-apple-mock-token";
export const APPLE_AUTH_DEV_MOCK_SUB = "dev-mock-apple-sub";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = new URL(`${APPLE_ISSUER}/auth/keys`);

let jwks: jose.JWTVerifyGetKey | null = null;
let jwksLoadedAt = 0;
const JWKS_TTL_MS = 60 * 60 * 1000;

function isDevMockEnabled(): boolean {
  const v = (process.env.APPLE_AUTH_DEV_MOCK ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function isProductionEnv(): boolean {
  return (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

async function getAppleJwks(): Promise<jose.JWTVerifyGetKey> {
  const now = Date.now();
  if (jwks && now - jwksLoadedAt < JWKS_TTL_MS) {
    return jwks;
  }
  jwks = jose.createRemoteJWKSet(APPLE_JWKS_URL);
  jwksLoadedAt = now;
  return jwks;
}

export type AppleIdentity = {
  sub: string;
  email?: string;
};

export async function verifyAppleIdentityToken(identityToken: string): Promise<AppleIdentity> {
  const token = identityToken.trim();
  if (!token) {
    throw new Error("APPLE_TOKEN_INVALID");
  }

  if (isDevMockEnabled() && !isProductionEnv() && token === APPLE_AUTH_DEV_MOCK_TOKEN) {
    return { sub: APPLE_AUTH_DEV_MOCK_SUB, email: "dev@example.com" };
  }

  const bundleId = process.env.APPLE_BUNDLE_ID?.trim();
  if (!bundleId) {
    throw new Error("MISSING_ENV:APPLE_BUNDLE_ID");
  }

  try {
    const keySet = await getAppleJwks();
    const { payload } = await jose.jwtVerify(token, keySet, {
      issuer: APPLE_ISSUER,
      audience: bundleId,
    });
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!sub) {
      throw new Error("APPLE_TOKEN_INVALID");
    }
    const email = typeof payload.email === "string" ? payload.email : undefined;
    return { sub, email };
  } catch (error) {
    if (error instanceof Error && error.message === "APPLE_TOKEN_INVALID") {
      throw error;
    }
    throw new Error("APPLE_TOKEN_INVALID");
  }
}

export type AppleAuthModeInfo = {
  mode: "real" | "mock";
  forcedMock: boolean;
  production: boolean;
  missingEnv: string[];
};

export function describeAppleAuthMode(): AppleAuthModeInfo {
  const missing: string[] = [];
  if (!process.env.APPLE_BUNDLE_ID?.trim()) {
    missing.push("APPLE_BUNDLE_ID");
  }
  const forcedMock = isDevMockEnabled();
  const production = isProductionEnv();
  let mode: "real" | "mock" = "real";
  if (forcedMock) {
    mode = "mock";
  } else if (missing.length > 0 && !production) {
    mode = "mock";
  }
  return { mode, forcedMock, production, missingEnv: missing };
}
