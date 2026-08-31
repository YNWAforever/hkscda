import { fetchAdminJson } from "../../../lib/admin/http";
import { AdminApiError } from "../../../lib/admin/session";
import type {
  PaginatedPaymentPublicConfig,
  PaymentPublicConfigPublishResult,
} from "../../../lib/paymentPublicConfig/repository.server";
import type {
  PaymentPublicConfig,
  PaymentPublicConfigMethod,
  PaymentPublicConfigState,
} from "../../../lib/paymentPublicConfig/types";

export type PaymentMethodFilters = {
  method?: PaymentPublicConfigMethod | "all";
  state?: PaymentPublicConfigState | "all";
  page?: number;
  pageSize?: number;
};

export type PaymentMethodMutationOperation =
  | "save"
  | "submit"
  | "withdraw"
  | "return-to-draft"
  | "publish";
export type AdminJsonRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export type PaymentMethodPublishAttempt = {
  idempotencyKey: string;
  payload: { expectedVersion: number; idempotencyKey: string };
};

export type PaymentMethodMutationError<T> =
  | { kind: "conflict"; message: string; preservedDraft: T }
  | { kind: "error"; message: string };

export function buildPaymentMethodSearchParams(input: PaymentMethodFilters = {}) {
  const params = new URLSearchParams();
  if (input.method && input.method !== "all") params.set("method", input.method);
  if (input.state && input.state !== "all") params.set("state", input.state);
  params.set("page", String(boundInteger(input.page ?? 1, 1, Number.MAX_SAFE_INTEGER)));
  params.set("pageSize", String(boundInteger(input.pageSize ?? 25, 1, 50)));
  return params;
}

export async function fetchPaymentMethodConfigs(
  filters: PaymentMethodFilters = {},
  request: AdminJsonRequest = fetchAdminJson,
) {
  return request<PaginatedPaymentPublicConfig>(
    `/api/admin/payment-methods?${buildPaymentMethodSearchParams(filters)}`,
  );
}

export async function mutatePaymentMethodConfig(
  id: string,
  operation: PaymentMethodMutationOperation,
  payload: unknown,
  request: AdminJsonRequest = fetchAdminJson,
) {
  const encodedId = encodeURIComponent(id);
  const route =
    operation === "save"
      ? `/api/admin/payment-methods/${encodedId}`
      : `/api/admin/payment-methods/${encodedId}/${operation}`;

  return request<PaymentPublicConfig | PaymentPublicConfigPublishResult>(route, {
    method: operation === "save" ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function createPaymentMethodConfig(
  input: {
    method: PaymentPublicConfigMethod;
    isPubliclyVisible: boolean;
    displayLabelZh: string;
    displayLabelEn: string;
    sortOrder: number;
    details: Record<string, string>;
  },
  request: AdminJsonRequest = fetchAdminJson,
) {
  return request<PaymentPublicConfig>("/api/admin/payment-methods", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function resolveMutationError<T>(
  error: unknown,
  localDraft: T,
): PaymentMethodMutationError<T> {
  const isConflict =
    error instanceof AdminApiError
      ? error.status === 409 && error.code === "conflict"
      : hasStructuredConflict(error);

  if (isConflict) {
    return {
      kind: "conflict",
      message: "This configuration changed elsewhere. Reload before saving again.",
      preservedDraft: localDraft,
    };
  }

  return {
    kind: "error",
    message:
      error instanceof Error && error.message
        ? error.message
        : "Unable to save this configuration.",
  };
}

export function createPaymentMethodPublishAttempt(
  expectedVersion: number,
  createIdempotencyKey: () => string = () => crypto.randomUUID(),
): PaymentMethodPublishAttempt {
  const idempotencyKey = createIdempotencyKey();
  return { idempotencyKey, payload: { expectedVersion, idempotencyKey } };
}

export function canPublish(input: {
  config: Pick<PaymentPublicConfig, "state" | "submittedBy">;
  currentActorAdminUserId: string;
  currentActorRole: "staff" | "treasurer" | "admin";
}) {
  if (input.config.state !== "in_review") return false;
  if (input.currentActorRole !== "treasurer" && input.currentActorRole !== "admin") return false;
  if (input.config.submittedBy && input.config.submittedBy === input.currentActorAdminUserId)
    return false;
  return true;
}

function boundInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function hasStructuredConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; error?: { code?: unknown } };
  return candidate.status === 409 && candidate.error?.code === "conflict";
}
