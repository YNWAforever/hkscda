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
