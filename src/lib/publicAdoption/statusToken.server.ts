import { createHash, randomBytes } from "node:crypto";

export const STATUS_TOKEN_DAYS = 30;

export function hashStatusToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function createStatusTokenPair(random = randomBytes) {
  const rawToken = random(32).toString("base64url");
  return {
    rawToken,
    tokenHash: hashStatusToken(rawToken),
  };
}

export function statusTokenExpiry(now = () => new Date()) {
  const expiresAt = now();
  expiresAt.setDate(expiresAt.getDate() + STATUS_TOKEN_DAYS);
  return expiresAt.toISOString();
}

export function isTokenExpired(expiresAt: string, now = new Date()) {
  return new Date(expiresAt).getTime() <= now.getTime();
}
