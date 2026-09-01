import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  paymentPublicConfigDraftInputSchema,
  paymentPublicConfigIdSchema,
  paymentPublicConfigMethodSchema,
  paymentPublicConfigMutationSchema,
  paymentPublicConfigStateSchema,
  paymentPublicConfigVersionSchema,
} from "./schemas";
import type {
  PaymentPublicConfig,
  PaymentPublicConfigMethod,
  PaymentPublicConfigState,
} from "./types";

const CONFIG_COLUMNS =
  "id,method,is_publicly_visible,display_label_zh,display_label_en,sort_order,details,state,version,created_by,updated_by,submitted_by,submitted_at,published_by,published_at,archived_by,archived_at,created_at,updated_at";

export type PaymentPublicConfigDraftInput = z.infer<typeof paymentPublicConfigDraftInputSchema>;
export type PaymentPublicConfigMutationInput = z.infer<typeof paymentPublicConfigMutationSchema>;

export type PaymentPublicConfigAdminQuery = {
  page: number;
  pageSize: number;
  method?: PaymentPublicConfigMethod;
  state?: PaymentPublicConfigState;
};

export type PaginatedPaymentPublicConfig = {
  items: PaymentPublicConfig[];
  total: number;
  page: number;
  pageSize: number;
};

export type PaymentPublicConfigPublishResult = {
  configId: string;
  configVersion: number;
  method: PaymentPublicConfigMethod;
};

export type PaymentPublicConfigErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid"
  | "internal";

const defaultErrorMessages: Record<PaymentPublicConfigErrorCode, string> = {
  unauthorized: "Authentication is required.",
  forbidden: "You do not have permission to perform this action.",
  not_found: "Payment method configuration not found.",
  conflict: "This configuration changed or cannot make that transition.",
  invalid: "The configuration is not ready for this action.",
  internal: "The payment configuration request could not be completed.",
};

export class PaymentPublicConfigError extends Error {
  name = "PaymentPublicConfigError";

  constructor(
    public readonly code: PaymentPublicConfigErrorCode,
    public readonly status: number,
    message = defaultErrorMessages[code],
  ) {
    super(message);
  }
}

export type PaymentPublicConfigRepository = {
  list(query: PaymentPublicConfigAdminQuery): Promise<PaginatedPaymentPublicConfig>;
  getById(id: string): Promise<PaymentPublicConfig | null>;
  create(input: PaymentPublicConfigDraftInput, actorUserId: string): Promise<PaymentPublicConfig>;
  update(
    id: string,
    input: PaymentPublicConfigMutationInput,
    actorUserId: string,
  ): Promise<PaymentPublicConfig>;
  transition(input: {
    id: string;
    expectedVersion: number;
    operation: "submit" | "withdraw" | "return_to_draft";
    actorUserId: string;
  }): Promise<PaymentPublicConfig>;
  publish(input: {
    id: string;
    expectedVersion: number;
    actorUserId: string;
    idempotencyKey: string;
  }): Promise<PaymentPublicConfigPublishResult>;
};

type ProviderError = {
  code?: unknown;
  message?: unknown;
};

const nullableUuid = z.string().uuid().nullable();
const nullableTimestamp = z.string().datetime({ offset: true }).nullable();
const configRowSchema = z.object({
  id: paymentPublicConfigIdSchema,
  method: paymentPublicConfigMethodSchema,
  is_publicly_visible: z.boolean(),
  display_label_zh: z.string(),
  display_label_en: z.string(),
  sort_order: z.number().int().nonnegative(),
  details: z.record(z.string(), z.string()),
  state: paymentPublicConfigStateSchema,
  version: paymentPublicConfigVersionSchema,
  created_by: nullableUuid,
  updated_by: nullableUuid,
  submitted_by: nullableUuid,
  submitted_at: nullableTimestamp,
  published_by: nullableUuid,
  published_at: nullableTimestamp,
  archived_by: nullableUuid,
  archived_at: nullableTimestamp,
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
const publishResultSchema = z.object({
  config_id: paymentPublicConfigIdSchema,
  config_version: paymentPublicConfigVersionSchema,
  method: paymentPublicConfigMethodSchema,
});

function providerError(error: unknown): ProviderError {
  return error && typeof error === "object" ? (error as ProviderError) : {};
}

function throwRepositoryError(error: unknown): never {
  const source = providerError(error);
  const code = String(source.code ?? "");
  const message = String(source.message ?? "");
  const normalized = message.toLowerCase();
  const illegalTransition =
    normalized.includes("only draft payment public config rows can be") ||
    normalized.includes("only in-review payment public config rows can be");

  if (
    code === "23505" ||
    code === "40001" ||
    normalized.includes("stale payment public config version") ||
    normalized.includes("idempotency key was already used") ||
    illegalTransition
  ) {
    throw new PaymentPublicConfigError("conflict", 409);
  }
  if (code === "PGRST116" || code === "P0002" || normalized.includes("config not found")) {
    throw new PaymentPublicConfigError("not_found", 404);
  }
  if (code === "42501") {
    throw new PaymentPublicConfigError("forbidden", 403);
  }
  if (code === "23514" || code === "22023" || normalized.includes("labels are incomplete")) {
    throw new PaymentPublicConfigError("invalid", 422);
  }
  throw new PaymentPublicConfigError("internal", 500);
}

function mapConfig(value: unknown): PaymentPublicConfig | null {
  const result = configRowSchema.safeParse(value);
  if (!result.success) return null;
  const row = result.data;
  return {
    id: row.id,
    method: row.method,
    isPubliclyVisible: row.is_publicly_visible,
    displayLabelZh: row.display_label_zh,
    displayLabelEn: row.display_label_en,
    sortOrder: row.sort_order,
    details: row.details,
    state: row.state,
    version: row.version,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    publishedBy: row.published_by,
    publishedAt: row.published_at,
    archivedBy: row.archived_by,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireConfig(value: unknown) {
  const config = mapConfig(value);
  if (!config) throw new PaymentPublicConfigError("internal", 500);
  return config;
}

function configValues(input: PaymentPublicConfigDraftInput | PaymentPublicConfigMutationInput) {
  return {
    method: input.method,
    is_publicly_visible: input.isPubliclyVisible,
    display_label_zh: input.displayLabelZh,
    display_label_en: input.displayLabelEn,
    sort_order: input.sortOrder,
    details: input.details,
  };
}

export function createSupabasePaymentPublicConfigRepository(
  client: SupabaseClient,
): PaymentPublicConfigRepository {
  async function runMutation(input: {
    operation: "create" | "update" | "submit" | "withdraw" | "return_to_draft";
    id: string | null;
    expectedVersion: number | null;
    values: Record<string, unknown>;
    actorUserId: string;
  }) {
    const { data, error } = await client.rpc("mutate_payment_public_config_with_audit", {
      p_actor_user_id: input.actorUserId,
      p_operation: input.operation,
      p_config_id: input.id,
      p_expected_version: input.expectedVersion,
      p_values: input.values,
    });
    if (error) throwRepositoryError(error);
    return requireConfig(data);
  }

  return {
    async list(query) {
      const page = Math.max(1, Math.trunc(query.page));
      const pageSize = Math.min(50, Math.max(1, Math.trunc(query.pageSize)));
      const from = (page - 1) * pageSize;
      let request = client
        .from("payment_public_config")
        .select(CONFIG_COLUMNS, { count: "exact" })
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + pageSize - 1);

      if (query.method) request = request.eq("method", query.method);
      if (query.state) request = request.eq("state", query.state);

      const { data, error, count } = await request;
      if (error) throwRepositoryError(error);
      return {
        items: ((data ?? []) as unknown[]).map(mapConfig).filter((item) => item !== null),
        total: count ?? 0,
        page,
        pageSize,
      };
    },

    async getById(id) {
      const { data, error } = await client
        .from("payment_public_config")
        .select(CONFIG_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throwRepositoryError(error);
      if (!data) return null;
      return requireConfig(data);
    },

    create(input, actorUserId) {
      return runMutation({
        operation: "create",
        id: null,
        expectedVersion: null,
        values: configValues(input),
        actorUserId,
      });
    },

    update(id, input, actorUserId) {
      return runMutation({
        operation: "update",
        id,
        expectedVersion: input.expectedVersion,
        values: configValues(input),
        actorUserId,
      });
    },

    transition(input) {
      return runMutation({
        operation: input.operation,
        id: input.id,
        expectedVersion: input.expectedVersion,
        values: {},
        actorUserId: input.actorUserId,
      });
    },

    async publish(input) {
      const { data, error } = await client.rpc("publish_payment_public_config", {
        p_config_id: input.id,
        p_expected_version: input.expectedVersion,
        p_actor_user_id: input.actorUserId,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throwRepositoryError(error);
      const parsed = publishResultSchema.safeParse(data);
      if (!parsed.success) throw new PaymentPublicConfigError("internal", 500);
      return {
        configId: parsed.data.config_id,
        configVersion: parsed.data.config_version,
        method: parsed.data.method,
      };
    },
  };
}
