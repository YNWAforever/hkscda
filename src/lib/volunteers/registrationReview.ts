import { z } from "zod";
import { credentialsSchema, tierSchema } from "./policy/schemas";

const assessmentSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().regex(/^[a-z][a-z0-9_]{0,99}$/),
  policy_version_id: z.string().min(1).max(100).optional(),
});
const capacitySchema = z.object({
  capacity: z.number().int().nonnegative(),
  confirmed: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});
const roleSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
  allowed_tiers: z.array(tierSchema).min(1).max(3),
  credentials: credentialsSchema,
});
const requirementsSchema = z.object({
  eligibility: z.object({
    min_age: z.number().int().min(0).max(120),
    allowed_tiers: z.array(tierSchema).min(1).max(3),
    credentials: credentialsSchema,
  }),
  roles: z.array(roleSchema).max(30).optional(),
});
type Requirements = {
  minAge: number;
  allowedTiers: z.infer<typeof tierSchema>[];
  credentials: z.infer<typeof credentialsSchema>;
  roleKey?: string;
  role?: {
    key: string;
    allowedTiers: z.infer<typeof tierSchema>[];
    credentials: z.infer<typeof credentialsSchema>;
  };
};
export type RegistrationReview =
  | { state: "unavailable"; asOf: string }
  | {
      state: "evaluated";
      asOf: string;
      allowed: boolean;
      reason: string;
      policyVersionId?: string;
      /** Evaluator figures exclude this registration's existing occupancy. */
      capacity?: z.infer<typeof capacitySchema>;
      requirements: Requirements | null;
    };

/** Expose only the existing evaluator's decision and resolved published conditions. */
export function registrationReview(
  evaluation: unknown,
  policy: unknown,
  asOf: string,
  dutyRole?: string | null,
): RegistrationReview {
  const parsed = assessmentSchema.safeParse(evaluation);
  if (!parsed.success) return { state: "unavailable", asOf };
  const requirements = requirementsSchema.safeParse(policy);
  const capacity = capacitySchema.safeParse(evaluation);
  let conditions: Requirements | null = null;
  if (requirements.success) {
    const { eligibility, roles } = requirements.data;
    const roleKey = dutyRole && /^[a-z][a-z0-9_-]{0,79}$/.test(dutyRole) ? dutyRole : undefined;
    const role =
      roles?.find((row) => row.key === roleKey) ??
      (roles?.length === 0 && roleKey === "volunteer"
        ? {
            key: "volunteer",
            allowed_tiers: eligibility.allowed_tiers,
            credentials: eligibility.credentials,
          }
        : undefined);
    conditions = {
      minAge: eligibility.min_age,
      allowedTiers: eligibility.allowed_tiers,
      credentials: eligibility.credentials,
      ...(roleKey ? { roleKey } : {}),
      ...(role
        ? {
            role: {
              key: role.key,
              allowedTiers: role.allowed_tiers,
              credentials: role.credentials,
            },
          }
        : {}),
    };
  }
  return {
    state: "evaluated",
    asOf,
    allowed: parsed.data.allowed,
    reason: parsed.data.reason,
    ...(parsed.data.policy_version_id ? { policyVersionId: parsed.data.policy_version_id } : {}),
    ...(capacity.success ? { capacity: capacity.data } : {}),
    requirements: conditions,
  };
}
