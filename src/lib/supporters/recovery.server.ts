import { createHash } from "node:crypto";
import { z } from "zod";

import type { RateLimitResult } from "../security/rate-limit.server";

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export class RecoveryError extends Error {
  constructor(
    readonly code: "invalid_email" | "unavailable" | "rate_limited" | "challenge",
    readonly retryAfter?: number,
  ) {
    super(code);
  }
}

export type RecoveryDependencies = {
  ip: string;
  rate: (key: string) => Promise<RateLimitResult>;
  challenge: (token: string | undefined, ip: string) => Promise<boolean>;
  sendOtp: (email: string) => Promise<void>;
};

export async function requestRecovery(
  input: { email: string; challengeToken?: string },
  deps: RecoveryDependencies,
): Promise<{ accepted: true }> {
  const parsed = emailSchema.safeParse(input.email);
  if (!parsed.success) throw new RecoveryError("invalid_email");
  const email = parsed.data;
  const ipKey = createHash("sha256").update(deps.ip).digest("hex");
  const emailKey = createHash("sha256").update(email).digest("hex");
  for (const key of ["ip:" + ipKey, "email:" + emailKey]) {
    const result = await deps.rate(key);
    if (result.unavailable) throw new RecoveryError("unavailable");
    if (!result.ok) throw new RecoveryError("rate_limited", result.reset);
  }
  if (!(await deps.challenge(input.challengeToken, deps.ip))) {
    throw new RecoveryError("challenge");
  }
  try {
    await deps.sendOtp(email);
  } catch {
    // Provider failures and non-existent identities have the same public shape.
    console.error("Supporter recovery OTP request failed");
  }
  return { accepted: true };
}
