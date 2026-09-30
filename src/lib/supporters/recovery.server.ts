import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import type { RateLimitResult } from "../security/rate-limit.server";

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export class RecoveryError extends Error {
  constructor(
    readonly code: "invalid_email" | "invalid_code" | "unavailable" | "rate_limited" | "challenge",
    readonly retryAfter?: number,
  ) {
    super(code);
  }
}

export type RecoveryDependencies = {
  ip: string;
  rate: (key: string) => Promise<RateLimitResult>;
  challenge: (token: string | undefined, ip: string) => Promise<boolean>;
  sendOtp: (email: string, challengeId: string) => Promise<void>;
};

export function normalizeRecoveryEmail(email: string): string {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) throw new RecoveryError("invalid_email");
  return parsed.data;
}

export async function guardRecoveryAttempt(
  input: { email: string; challengeToken?: string },
  deps: Omit<RecoveryDependencies, "sendOtp">,
): Promise<string> {
  const email = normalizeRecoveryEmail(input.email);
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
  return email;
}

export async function requestRecovery(
  input: { email: string; challengeToken?: string },
  deps: RecoveryDependencies,
): Promise<{ accepted: true; challengeId: string }> {
  const email = await guardRecoveryAttempt(input, deps);
  const challengeId = randomUUID();
  try {
    await deps.sendOtp(email, challengeId);
  } catch {
    // Provider failures and non-existent identities have the same public shape.
    console.error("Supporter recovery OTP request failed");
  }
  return { accepted: true, challengeId };
}
