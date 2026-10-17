export type VolunteerJobStage =
  | "preflight"
  | "generate"
  | "release"
  | "promote"
  | "assess"
  | "defer"
  | "finish";
const actorCodes = [
  "VOLUNTEER_JOB_ACTOR_UNCONFIGURED",
  "VOLUNTEER_JOB_ACTOR_INVALID",
  "VOLUNTEER_JOB_ACTOR_INELIGIBLE",
];
export function safeJobFailure(
  error: unknown,
  stage: VolunteerJobStage,
  correlationId: string,
): { code: string; stage: VolunteerJobStage; correlationId: string } {
  const raw = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const code =
    typeof raw === "string" &&
    (/^[A-Z0-9]{5}$/.test(raw) || /^PGRST[0-9]{3}$/.test(raw) || actorCodes.includes(raw))
      ? raw
      : "UNEXPECTED";
  return { code, stage, correlationId };
}
