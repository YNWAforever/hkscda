import { z } from "zod";
import { credentialsSchema, tierSchema } from "./policy/schemas";

const assessmentSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().regex(/^[a-z][a-z0-9_]{0,99}$/),
  policy_version_id: z.string().min(1).max(100).optional(),
});
const requirementsSchema = z.object({
  eligibility: z.object({
    min_age: z.number().int().min(0).max(120),
    allowed_tiers: z.array(tierSchema).min(1).max(3),
    credentials: credentialsSchema,
  }),
});
type Requirements = {
  minAge: number;
  allowedTiers: z.infer<typeof tierSchema>[];
  credentials: z.infer<typeof credentialsSchema>;
};
export type RegistrationReview =
  | { state: "unavailable"; asOf: string }
  | {
      state: "evaluated";
      asOf: string;
      allowed: boolean;
      reason: string;
      policyVersionId?: string;
      requirements: Requirements | null;
    };

/** Expose only the existing evaluator's decision and resolved published conditions. */
export function registrationReview(
  evaluation: unknown,
  policy: unknown,
  asOf: string,
): RegistrationReview {
  const parsed = assessmentSchema.safeParse(evaluation);
  if (!parsed.success) return { state: "unavailable", asOf };
  const requirements = requirementsSchema.safeParse(policy);
  return {
    state: "evaluated",
    asOf,
    allowed: parsed.data.allowed,
    reason: parsed.data.reason,
    ...(parsed.data.policy_version_id ? { policyVersionId: parsed.data.policy_version_id } : {}),
    requirements: requirements.success
      ? {
          minAge: requirements.data.eligibility.min_age,
          allowedTiers: requirements.data.eligibility.allowed_tiers,
          credentials: requirements.data.eligibility.credentials,
        }
      : null,
  };
}
