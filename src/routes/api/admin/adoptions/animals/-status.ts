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

export type AnimalStatusUpdateRpcArgs = {
  p_actor_user_id: string;
  p_animal_id: string;
  p_status: AnimalStatus;
  p_updated_at: string;
};

/**
 * Arguments for public.update_animal_status_with_audit.
 *
 * The status route writes to public.animals over the service-role connection,
 * where auth.uid() is null, so log_animal_mutation() skips it by design (see
 * 20260803120000_audit_animal_mutations.sql). The app layer owns the audit row.
 *
 * It cannot own it as a second PostgREST call, though: the update commits first,
 * so a failing audit insert leaves the change applied and unaudited while the
 * caller is told it failed. The RPC does both in one transaction and derives the
 * before-value itself, matching the trigger's `<table>.<op>` action and
 * `{changed: {col: {from, to}}}` detail so one query covers both write paths
 * (20260805120000_animal_mutation_audit_atomicity.sql).
 *
 * `p_updated_at` reuses the payload's updatedAt so the audit row and the row's
 * own updated_at column can't drift apart.
 */
export function buildAnimalStatusUpdateRpcArgs(
  actorUserId: string,
  payload: AnimalStatusUpdatePayload,
): AnimalStatusUpdateRpcArgs {
  return {
    p_actor_user_id: actorUserId,
    p_animal_id: payload.animalId,
    p_status: payload.status,
    p_updated_at: payload.updatedAt,
  };
}
