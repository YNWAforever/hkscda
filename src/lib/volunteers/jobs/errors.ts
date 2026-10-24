export type VolunteerJobStage =
  | "preflight"
  | "generate"
  | "release"
  | "promote"
  | "assess"
  | "defer"
  | "finish";
export class VolunteerJobLeaseLostError extends Error {
  readonly code = "VOLUNTEER_JOB_LEASE_LOST";
  constructor() {
    super("VOLUNTEER_JOB_LEASE_LOST");
  }
}
const jobCodes = [
  "VOLUNTEER_JOB_ACTOR_UNCONFIGURED",
  "VOLUNTEER_JOB_ACTOR_INVALID",
  "VOLUNTEER_JOB_ACTOR_INELIGIBLE",
  "VOLUNTEER_JOB_LEASE_LOST",
];
export function safeJobFailure(
  error: unknown,
  stage: VolunteerJobStage,
  correlationId: string,
): { code: string; stage: VolunteerJobStage; correlationId: string } {
  const raw = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const code =
    typeof raw === "string" &&
    (/^[A-Z0-9]{5}$/.test(raw) || /^PGRST[0-9]{3}$/.test(raw) || jobCodes.includes(raw))
      ? raw
      : "UNEXPECTED";
  return { code, stage, correlationId };
}
