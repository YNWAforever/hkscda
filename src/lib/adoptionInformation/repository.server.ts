import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type {
  AdoptionFeeInput,
  AdoptionRuleInput,
  CareTopicInput,
  CreateEstateInput,
  UpdateEstateInput,
  SetEstatePublicationInput,
} from "./schemas";
import {
  AdoptionInformationConflictError,
  type AdoptionInformationAuditLog,
  type AdoptionInformationRepository,
} from "./service";
import type {
  AdoptionFee,
  AdminAdoptionInformationQuery,
  AdoptionRuleContent,
  CareTopic,
  DogFriendlyEstate,
} from "./types";

const FEE_COLUMNS = "id,animal_type,item_name,price_hkd,sort_order,is_published";
const ESTATE_COLUMNS = "id,estate_name,district,notes,sort_order,is_published,version";
const RULE_COLUMNS = "id,content_zh,content_en,sort_order,is_published";
const CARE_TOPIC_COLUMNS =
  "id,animal_type,label_zh,label_en,content_zh,content_en,sort_order,is_published";

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
  version: z.number().int().positive(),
});
const ruleRowSchema = z.object({
  id: z.string().uuid(),
  content_zh: z.string().min(1),
  content_en: z.string().min(1),
  sort_order: z.number().int().min(0),
  is_published: z.boolean(),
});
const careTopicRowSchema = z.object({
  id: z.string().uuid(),
  animal_type: z.enum(["dog", "cat"]),
  label_zh: z.string().min(1),
  label_en: z.string().min(1),
  content_zh: z.string().min(1),
  content_en: z.string().min(1),
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
    version: parsed.data.version,
  };
}

function mapRule(row: Row): AdoptionRuleContent | null {
  const parsed = ruleRowSchema.safeParse(row);
  if (!parsed.success) return null;
  return {
    id: parsed.data.id,
    content: { "zh-HK": parsed.data.content_zh, en: parsed.data.content_en },
    sortOrder: parsed.data.sort_order,
    isPublished: parsed.data.is_published,
  };
}

function mapCareTopic(row: Row): CareTopic | null {
  const parsed = careTopicRowSchema.safeParse(row);
  if (!parsed.success) return null;
  return {
    id: parsed.data.id,
    animalType: parsed.data.animal_type,
    label: { "zh-HK": parsed.data.label_zh, en: parsed.data.label_en },
    content: { "zh-HK": parsed.data.content_zh, en: parsed.data.content_en },
    sortOrder: parsed.data.sort_order,
    isPublished: parsed.data.is_published,
  };
}

function throwRepositoryError(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && error.code === "P4090") {
    throw new AdoptionInformationConflictError("Estate version conflict; reload the latest row");
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    ["23505", "23514", "P4090"].includes(String((error as { code?: unknown }).code))
  ) {
    throw new AdoptionInformationConflictError("Adoption information conflicts with existing data");
  }
  throw error;
}

function postgrestLikeOperand(value: string) {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  return `"%${escaped}%"`;
}

function feeRow(input: AdoptionFeeInput) {
  return {
    animal_type: input.animalType,
    item_name: input.itemName,
    price_hkd: input.priceHkd,
    sort_order: input.sortOrder,
    is_published: input.isPublished,
  };
}

export function createSupabaseAdoptionInformationRepository(
  client: SupabaseClient,
): AdoptionInformationRepository {
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

  async function readPublishedRows(table: string, columns: string, orderColumns: string[]) {
    const rows: Row[] = [];
    let from = 0;
    while (true) {
      let query = client.from(table).select(columns, { count: "exact" }).eq("is_published", true);
      for (const column of orderColumns) {
        query = query.order(column, { ascending: true });
      }
      const { data, error, count } = await query.range(from, from + 999);
      if (error) throw error;
      const batch = (data ?? []) as unknown as Row[];
      if (batch.length === 0) {
        if (count !== null && count !== undefined && from < count)
          throw new Error("Published adoption information rows were not returned");
        break;
      }
      rows.push(...batch);
      from += batch.length;
      if (count !== null && count !== undefined && from >= count) break;
    }
    return rows;
  }

  return {
    usesAtomicAudit: true,
    async listPublic() {
      const [fees, estates, rules, careTopics] = await Promise.all([
        readPublishedRows("adoption_fees", FEE_COLUMNS, ["animal_type", "sort_order", "id"]),
        readPublishedRows("dog_friendly_estates", ESTATE_COLUMNS, [
          "sort_order",
          "estate_name",
          "id",
        ]),
        readPublishedRows("adoption_rules", RULE_COLUMNS, ["sort_order", "id"]),
        readPublishedRows("care_topics", CARE_TOPIC_COLUMNS, ["animal_type", "sort_order", "id"]),
      ]);
      return {
        fees: fees.map(mapFee).filter((row): row is AdoptionFee => row !== null && row.isPublished),
        estates: estates
          .map(mapEstate)
          .filter((row): row is DogFriendlyEstate => row !== null && row.isPublished),
        rules: rules
          .map(mapRule)
          .filter((row): row is AdoptionRuleContent => row !== null && row.isPublished),
        careTopics: careTopics
          .map(mapCareTopic)
          .filter((row): row is CareTopic => row !== null && row.isPublished),
      };
    },

    async listAdmin(input: AdminAdoptionInformationQuery) {
      const from = (input.page - 1) * input.pageSize;
      const TABLE_BY_RESOURCE = {
        fees: "adoption_fees",
        estates: "dog_friendly_estates",
        rules: "adoption_rules",
        careTopics: "care_topics",
      } as const;
      const COLUMNS_BY_RESOURCE = {
        fees: FEE_COLUMNS,
        estates: ESTATE_COLUMNS,
        rules: RULE_COLUMNS,
        careTopics: CARE_TOPIC_COLUMNS,
      } as const;
      const table = TABLE_BY_RESOURCE[input.resource];
      const columns = COLUMNS_BY_RESOURCE[input.resource];
      let query = client
        .from(table)
        .select(columns, { count: "exact" })
        .order("sort_order", { ascending: true });
      query =
        input.resource === "fees" || input.resource === "careTopics"
          ? query.order("animal_type", { ascending: true })
          : input.resource === "estates"
            ? query.order("estate_name", { ascending: true })
            : query;
      query = query.range(from, from + input.pageSize - 1);
      query = query.order("id", { ascending: true });
      if ((input.resource === "fees" || input.resource === "careTopics") && input.animalType)
        query = query.eq("animal_type", input.animalType);
      if (input.q) {
        const like = postgrestLikeOperand(input.q);
        const orExpr =
          input.resource === "fees"
            ? `item_name.ilike.${like},price_hkd.ilike.${like}`
            : input.resource === "estates"
              ? `estate_name.ilike.${like},district.ilike.${like},notes.ilike.${like}`
              : input.resource === "rules"
                ? `content_zh.ilike.${like},content_en.ilike.${like}`
                : `label_zh.ilike.${like},label_en.ilike.${like},content_zh.ilike.${like},content_en.ilike.${like}`;
        query = query.or(orExpr);
      }
      const { data, error, count } = await query;
      if (error) throw error;
      const MAPPER_BY_RESOURCE = {
        fees: mapFee,
        estates: mapEstate,
        rules: mapRule,
        careTopics: mapCareTopic,
      } as const;
      const mapper = MAPPER_BY_RESOURCE[input.resource];
      const items = ((data ?? []) as unknown as Row[])
        .map((row) => mapper(row))
        .filter(
          (row): row is AdoptionFee | DogFriendlyEstate | AdoptionRuleContent | CareTopic =>
            row !== null,
        );
      return {
        resource: input.resource,
        items,
        total: count ?? 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    },

    async upsertFee(input: AdoptionFeeInput, actorUserId?: string) {
      if (!actorUserId) throw new Error("Actor user ID required");
      const { data, error } = await client.rpc("mutate_admin_content_with_audit", {
        p_actor_user_id: actorUserId,
        p_entity: "adoption_fee",
        p_operation: "upsert",
        p_id: input.id ?? null,
        p_payload: feeRow(input),
      });
      if (error) throwRepositoryError(error);
      return requireFee(data);
    },

    async createEstate(input: CreateEstateInput, actorUserId: string) {
      const { data, error } = await client.rpc("mutate_dog_friendly_estate_with_audit", {
        p_actor_user_id: actorUserId,
        p_command: "create",
        p_id: input.id,
        p_expected_version: null,
        p_payload: {
          estate_name: input.estateName,
          district: input.district,
          notes: input.notes,
          sort_order: input.sortOrder,
        },
      });
      if (error) throwRepositoryError(error);
      return requireEstate(data);
    },

    async updateEstate(input: UpdateEstateInput, actorUserId: string) {
      const { data, error } = await client.rpc("mutate_dog_friendly_estate_with_audit", {
        p_actor_user_id: actorUserId,
        p_command: "update",
        p_id: input.id,
        p_expected_version: input.expectedVersion,
        p_payload: {
          estate_name: input.fields.estateName,
          district: input.fields.district,
          notes: input.fields.notes,
          sort_order: input.fields.sortOrder,
        },
      });
      if (error) throwRepositoryError(error);
      return requireEstate(data);
    },

    async setEstatePublication(input: SetEstatePublicationInput, actorUserId: string) {
      const { data, error } = await client.rpc("mutate_dog_friendly_estate_with_audit", {
        p_actor_user_id: actorUserId,
        p_command: "publication",
        p_id: input.id,
        p_expected_version: input.expectedVersion,
        p_payload: { is_published: input.isPublished },
      });
      if (error) throwRepositoryError(error);
      return requireEstate(data);
    },

    async upsertRule(input: AdoptionRuleInput, actorUserId: string) {
      const { data, error } = await client.rpc("upsert_adoption_rule_with_audit", {
        p_actor_user_id: actorUserId,
        p_id: input.id ?? null,
        p_content_zh: input.content["zh-HK"],
        p_content_en: input.content.en,
        p_sort_order: input.sortOrder,
        p_is_published: input.isPublished,
      });
      if (error) throwRepositoryError(error);
      const mapped = data ? mapRule(data as Row) : null;
      if (!mapped) throw new Error("Invalid adoption rule row");
      return mapped;
    },

    async upsertCareTopic(input: CareTopicInput, actorUserId: string) {
      const { data, error } = await client.rpc("upsert_care_topic_with_audit", {
        p_actor_user_id: actorUserId,
        p_id: input.id ?? null,
        p_animal_type: input.animalType,
        p_label_zh: input.label["zh-HK"],
        p_label_en: input.label.en,
        p_content_zh: input.content["zh-HK"],
        p_content_en: input.content.en,
        p_sort_order: input.sortOrder,
        p_is_published: input.isPublished,
      });
      if (error) throwRepositoryError(error);
      const mapped = data ? mapCareTopic(data as Row) : null;
      if (!mapped) throw new Error("Invalid care topic row");
      return mapped;
    },

    async deleteEstate(id: string, actorUserId?: string) {
      if (!actorUserId) throw new Error("Actor user ID required");
      const { error } = await client.rpc("mutate_admin_content_with_audit", {
        p_actor_user_id: actorUserId,
        p_entity: "dog_friendly_estate",
        p_operation: "delete",
        p_id: id,
        p_payload: {},
      });
      if (error) throwRepositoryError(error);
    },

    async insertAuditLog(input: AdoptionInformationAuditLog) {
      const { error } = await client.from("audit_log").insert(input);
      if (error) throw error;
    },
  };
}
