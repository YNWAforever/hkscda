import { volunteerPolicyFailure } from "../policy/errors";
const followupReasons = new Set([
  "current_terms_required",
  "verified_profile_required",
  "terms_required",
  "current_policy_required",
  "credentials_required",
  "minimum_age_not_met",
  "tier_not_allowed",
  "role_not_allowed",
  "overlapping_duty",
  "duplicate_booking",
  "group_scenario_mismatch",
]);
export function promotionDenial(error: unknown): { reason: string; needsReview: boolean } | null {
  const failure = volunteerPolicyFailure(error);
  if (!failure) return null;
  const reason = failure.code;
  if (followupReasons.has(reason)) return { reason, needsReview: true };
  if (
    new Set([
      "activity_closed",
      "date_closed",
      "not_open",
      "registration_closed",
      "capacity_full",
      "role_full",
      "reserved_for_core_role",
      "tier_quota_full",
      "daily_quota_full",
      "tier_weekday_not_allowed",
      "daily_policy_not_bound",
    ]).has(reason)
  )
    return { reason, needsReview: false };
  return null;
}
