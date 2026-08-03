import { z } from "zod";

import type { AnimalStatus } from "../../../../../types/animal";

const animalStatusSchema = z.enum(["available", "fostered", "adopted"]);

const animalStatusInputSchema = z.object({
  status: animalStatusSchema,
});

export type AnimalStatusUpdatePayload = {
  animalId: string;
  status: AnimalStatus;
  updatedAt: string;
};

export function parseAnimalStatusUuid(value: string | undefined, key: string) {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid ${key}`);
  }
  return parsed.data;
}

export function buildAnimalStatusUpdatePayload(
  animalIdParam: string | undefined,
  input: unknown,
  now = () => new Date(),
): AnimalStatusUpdatePayload {
  const animalId = parseAnimalStatusUuid(animalIdParam, "id");
  const parsed = animalStatusInputSchema.parse(input);

  return {
    animalId,
    status: parsed.status,
    updatedAt: now().toISOString(),
  };
}

export type AnimalStatusAuditEntry = {
  actor_user_id: string;
  action: "animals.status_update";
  entity: "animals";
  entity_id: string;
  timestamp: string;
  detail: { status: AnimalStatus; animal: unknown };
};

/**
 * Audit row for an admin lifecycle-status change.
 *
 * The status route writes to public.animals over the service-role connection,
 * where auth.uid() is null, so log_animal_mutation() skips it by design (see
 * 20260803120000_audit_animal_mutations.sql). That makes this row the only
 * record of the change — the app layer owns it, exactly as the sibling
 * animal_profile_internal route does.
 *
 * `timestamp` reuses the payload's updatedAt so the audit row and the row's own
 * updated_at column can't drift apart.
 */
export function buildAnimalStatusAuditEntry(
  actorUserId: string,
  payload: AnimalStatusUpdatePayload,
  animal: unknown,
): AnimalStatusAuditEntry {
  return {
    actor_user_id: actorUserId,
    action: "animals.status_update",
    entity: "animals",
    entity_id: payload.animalId,
    timestamp: payload.updatedAt,
    detail: { status: payload.status, animal },
  };
}
