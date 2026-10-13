import { z } from "zod";

export type VolunteerJobActorCode =
  | "VOLUNTEER_JOB_ACTOR_UNCONFIGURED"
  | "VOLUNTEER_JOB_ACTOR_INVALID"
  | "VOLUNTEER_JOB_ACTOR_INELIGIBLE";
export class VolunteerJobActorError extends Error {
  constructor(readonly code: VolunteerJobActorCode) {
    super(code);
  }
}
export function parseVolunteerJobActorId(raw: string | undefined): string {
  if (!raw?.trim()) throw new VolunteerJobActorError("VOLUNTEER_JOB_ACTOR_UNCONFIGURED");
  const parsed = z.string().uuid().safeParse(raw.trim());
  if (!parsed.success) throw new VolunteerJobActorError("VOLUNTEER_JOB_ACTOR_INVALID");
  return parsed.data;
}
