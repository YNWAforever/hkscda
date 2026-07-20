import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { AdoptionFeeInput, EstateInput } from "./schemas";
import { AdoptionInformationConflictError, type AdoptionInformationAuditLog, type AdoptionInformationRepository } from "./service";
import type { AdoptionFee, AdminAdoptionInformationQuery, DogFriendlyEstate } from "./types";

const FEE_COLUMNS = "id,animal_type,item_name,price_hkd,sort_order,is_published";
const ESTATE_COLUMNS = "id,estate_name,district,notes,sort_order,is_published";

const feeRowSchema = z.object({
  id: z.string().uuid(),
  animal_type: z.enum(["dog", "cat"]),
  item_name: z.string().min(1),
  price_hkd: z.string().min(1),
  sort_order: z.number().int().min(0),
  is_published: z.boolean(),
});
const estateRowSchema = z.object({
  id: z.string().uuid(),
  estate_name: z.string().min(1),
  district: z.string().min(1),
  notes: z.string().nullable(),
  sort_order: z.number().int().min(0),
  is_published: z.boolean(),
});

type Row = Record<string, unknown>;

function mapFee(row: Row): AdoptionFee | null {
  const parsed = feeRowSchema.safeParse(row);
  if (!parsed.success) return null;
  return {
    id: parsed.data.id,
    animalType: parsed.data.animal_type,
    itemName: parsed.data.item_name,
    priceHkd: parsed.data.price_hkd,
    sortOrder: parsed.data.sort_order,
    isPublished: parsed.data.is_published,
  };
}

function mapEstate(row: Row): DogFriendlyEstate | null {
  const parsed = estateRowSchema.safeParse(row);
  if (!parsed.success) return null;
  return {
    id: parsed.data.id,
    estateName: parsed.data.estate_name,
    district: parsed.data.district,
    notes: parsed.data.notes,
    sortOrder: parsed.data.sort_order,
    isPublished: parsed.data.is_published,
  };
}

function throwRepositoryError(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && ["23505", "23514"].includes(String((error as { code?: unknown }).code))) {
    throw new AdoptionInformationConflictError("Adoption information conflicts with existing data");
  }
  throw error;
}

function postgrestLikeOperand(value: string) {
  const escaped = value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "\\%").replaceAll("_", "\\_");
  return `"%${escaped}%"`;
}

function feeRow(input: AdoptionFeeInput) {
  return { animal_type: input.animalType, item_name: input.itemName, price_hkd: input.priceHkd, sort_order: input.sortOrder, is_published: input.isPublished };
}

function estateRow(input: EstateInput) {
  return { estate_name: input.estateName, district: input.district, notes: input.notes, sort_order: input.sortOrder, is_published: input.isPublished };
}

export function createSupabaseAdoptionInformationRepository(client: SupabaseClient): AdoptionInformationRepository {
  async function requireFee(data: unknown) {
    const mapped = data && typeof data === "object" ? mapFee(data as Row) : null;
    if (!mapped) throw new Error("Invalid adoption fee row");
    return mapped;
  }
  async function requireEstate(data: unknown) {
    const mapped = data && typeof data === "object" ? mapEstate(data as Row) : null;
    if (!mapped) throw new Error("Invalid dog-friendly estate row");
    return mapped;
  }

  return {
    async listPublic() {
      const [feeResult, estateResult] = await Promise.all([
        client.from("adoption_fees").select(FEE_COLUMNS).eq("is_published", true).order("animal_type", { ascending: true }).order("sort_order", { ascending: true }),
        client.from("dog_friendly_estates").select(ESTATE_COLUMNS).eq("is_published", true).order("sort_order", { ascending: true }).order("estate_name", { ascending: true }),
      ]);
      if (feeResult.error) throw feeResult.error;
      if (estateResult.error) throw estateResult.error;
      return {
        fees: ((feeResult.data ?? []) as Row[]).map(mapFee).filter((row): row is AdoptionFee => row !== null && row.isPublished),
        estates: ((estateResult.data ?? []) as Row[]).map(mapEstate).filter((row): row is DogFriendlyEstate => row !== null && row.isPublished),
      };
    },

    async listAdmin(input: AdminAdoptionInformationQuery) {
      const from = (input.page - 1) * input.pageSize;
      const table = input.resource === "fees" ? "adoption_fees" : "dog_friendly_estates";
      const columns = input.resource === "fees" ? FEE_COLUMNS : ESTATE_COLUMNS;
      let query = client.from(table).select(columns, { count: "exact" }).order("sort_order", { ascending: true });
      query = input.resource === "fees" ? query.order("animal_type", { ascending: true }) : query.order("estate_name", { ascending: true });
      query = query.range(from, from + input.pageSize - 1);
      if (input.resource === "fees" && input.animalType) query = query.eq("animal_type", input.animalType);
      if (input.q) {
        const like = postgrestLikeOperand(input.q);
        query = query.or(input.resource === "fees" ? `item_name.ilike.${like},price_hkd.ilike.${like}` : `estate_name.ilike.${like},district.ilike.${like},notes.ilike.${like}`);
      }
      const { data, error, count } = await query;
      if (error) throw error;
      const items = ((data ?? []) as Row[])
        .map((row) => (input.resource === "fees" ? mapFee(row) : mapEstate(row)))
        .filter((row): row is AdoptionFee | DogFriendlyEstate => row !== null);
      return { resource: input.resource, items, total: count ?? 0, page: input.page, pageSize: input.pageSize };
    },

    async upsertFee(input: AdoptionFeeInput) {
      const query = input.id
        ? client.from("adoption_fees").update(feeRow(input)).eq("id", input.id)
        : client.from("adoption_fees").insert(feeRow(input));
      const { data, error } = await query.select(FEE_COLUMNS).single();
      if (error) throwRepositoryError(error);
      return requireFee(data);
    },

    async upsertEstate(input: EstateInput) {
      const query = input.id
        ? client.from("dog_friendly_estates").update(estateRow(input)).eq("id", input.id)
        : client.from("dog_friendly_estates").insert(estateRow(input));
      const { data, error } = await query.select(ESTATE_COLUMNS).single();
      if (error) throwRepositoryError(error);
      return requireEstate(data);
    },

    async deleteEstate(id: string) {
      const { error } = await client.from("dog_friendly_estates").delete().eq("id", id);
      if (error) throwRepositoryError(error);
    },

    async insertAuditLog(input: AdoptionInformationAuditLog) {
      const { error } = await client.from("audit_log").insert(input);
      if (error) throw error;
    },
  };
}
