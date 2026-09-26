import { createHmac, timingSafeEqual } from "node:crypto";

import { getSupabaseServerConfig } from "../donations/config.server";

const INTENT_LIFETIME_MS = 24 * 60 * 60 * 1000;
const HMAC_CONTEXT = "sponsorship-proof-upload:v1:";

type ProofIntentSubject = { pledgeId: string; path: string };
type ProofIntentOptions = { secret?: string; now?: Date };

function signingSecret(options: ProofIntentOptions): string {
  return options.secret ?? getSupabaseServerConfig().serviceRoleKey;
}

function signature(encoded: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(HMAC_CONTEXT).update(encoded).digest();
}

/** A verified upload challenge, bound to one pledge and one Storage path. */
export function createProofUploadIntent(
  subject: ProofIntentSubject,
  options: ProofIntentOptions = {},
): string {
  const expiresAt = (options.now ?? new Date()).getTime() + INTENT_LIFETIME_MS;
  const encoded = Buffer.from(
    JSON.stringify({ v: 1, p: subject.pledgeId, s: subject.path, e: expiresAt }),
  ).toString("base64url");
  return encoded + "." + signature(encoded, signingSecret(options)).toString("base64url");
}

export function verifyProofUploadIntent(
  token: string | undefined,
  subject: ProofIntentSubject,
  options: ProofIntentOptions = {},
): boolean {
  if (!token || token.length > 2048) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) {
    return false;
  }
  const [encoded, supplied] = parts;
  const expected = signature(encoded, signingSecret(options));
  const actual = Buffer.from(supplied, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    return (
      payload.v === 1 &&
      payload.p === subject.pledgeId &&
      payload.s === subject.path &&
      typeof payload.e === "number" &&
      Number.isSafeInteger(payload.e) &&
      payload.e > (options.now ?? new Date()).getTime()
    );
  } catch {
    return false;
  }
}
