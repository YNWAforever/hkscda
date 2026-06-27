import { z } from "zod";

const nullableTrimmedString = z.union([z.string(), z.null()]).transform((value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
});

function isRealDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const nullableDate = z.union([z.string(), z.null()]).transform((value, context) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isRealDate(trimmed)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
    return z.NEVER;
  }
  return trimmed;
});

const nullableUuid = z.union([z.string(), z.null()]).transform((value, context) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!z.string().uuid().safeParse(trimmed).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid UUID" });
    return z.NEVER;
  }
  return trimmed;
});

const nullableBoolean = z.union([z.boolean(), z.null()]);

export const internalProfileInputSchema = z.object({
  animal_id: z.string().uuid().optional(),
  internal_code: nullableTrimmedString,
  arrival_date: nullableDate,
  arrival_source_id: nullableUuid,
  current_position_id: nullableUuid,
  cage: nullableTrimmedString,
  has_chip: nullableBoolean,
  chip_remarks: nullableTrimmedString,
  is_desexed: nullableBoolean,
  desexed_at: nullableDate,
  desex_remarks: nullableTrimmedString,
  is_adoptable: z.boolean(),
  is_inside_support_pool: z.boolean(),
  adopted_at: nullableDate,
  deceased_at: nullableDate,
  internal_remarks: nullableTrimmedString,
});

export type InternalProfileUpsertPayload = Omit<
  z.infer<typeof internalProfileInputSchema>,
  "animal_id"
> & {
  animal_id: string;
};

export function parseAnimalProfileUuid(value: string | undefined, key: string) {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid ${key}`);
  }
  return parsed.data;
}

export function buildInternalProfileUpsertPayload(
  animalIdParam: string | undefined,
  input: unknown,
): InternalProfileUpsertPayload {
  const animalId = parseAnimalProfileUuid(animalIdParam, "id");
  const parsed = internalProfileInputSchema.parse(input);

  if (parsed.animal_id && parsed.animal_id !== animalId) {
    throw new Error("Animal id mismatch");
  }

  return {
    animal_id: animalId,
    internal_code: parsed.internal_code,
    arrival_date: parsed.arrival_date,
    arrival_source_id: parsed.arrival_source_id,
    current_position_id: parsed.current_position_id,
    cage: parsed.cage,
    has_chip: parsed.has_chip,
    chip_remarks: parsed.chip_remarks,
    is_desexed: parsed.is_desexed,
    desexed_at: parsed.desexed_at,
    desex_remarks: parsed.desex_remarks,
    is_adoptable: parsed.is_adoptable,
    is_inside_support_pool: parsed.is_inside_support_pool,
    adopted_at: parsed.adopted_at,
    deceased_at: parsed.deceased_at,
    internal_remarks: parsed.internal_remarks,
  };
}
