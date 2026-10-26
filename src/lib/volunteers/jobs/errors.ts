export const volunteerJobStages = [
  "preflight",
  "generate",
  "release",
  "promote",
  "assess",
  "defer",
  "finish",
] as const;
export type VolunteerJobStage = (typeof volunteerJobStages)[number];
export const volunteerJobActorCodes = [
  "VOLUNTEER_JOB_ACTOR_UNCONFIGURED",
  "VOLUNTEER_JOB_ACTOR_INVALID",
  "VOLUNTEER_JOB_ACTOR_INELIGIBLE",
] as const;
export type VolunteerJobActorCode = (typeof volunteerJobActorCodes)[number];
export const volunteerJobFailureCodes = [
  ...volunteerJobActorCodes,
  "VOLUNTEER_JOB_LEASE_LOST",
] as const;
const passThroughCodes: readonly string[] = volunteerJobFailureCodes;
export function isVolunteerJobStage(value: string): value is VolunteerJobStage {
  return (volunteerJobStages as readonly string[]).includes(value);
}
export class VolunteerJobLeaseLostError extends Error {
  readonly code = "VOLUNTEER_JOB_LEASE_LOST" satisfies (typeof volunteerJobFailureCodes)[number];
  constructor() {
    super("VOLUNTEER_JOB_LEASE_LOST");
  }
}
/** Postgres or PostgREST `code` when the thrown value carries a string one. */
export function readErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}
export function safeJobFailure(
  error: unknown,
  stage: VolunteerJobStage,
  correlationId: string,
): { code: string; stage: VolunteerJobStage; correlationId: string } {
  const raw = readErrorCode(error);
  const code =
    raw !== undefined &&
    (/^[A-Z0-9]{5}$/.test(raw) || /^PGRST[0-9]{3}$/.test(raw) || passThroughCodes.includes(raw))
      ? raw
      : "UNEXPECTED";
  return { code, stage, correlationId };
}
