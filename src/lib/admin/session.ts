import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import {
  canRoleAccessAdminArea,
  getFirstAllowedAdminRoute,
  type AdminAccessArea,
  type AdminIdentity,
} from "./access";
import { adminIdentityQueryOptions } from "./identity";
import { supabase } from "../supabase";

export type AdminMeResponse = {
  admin: AdminIdentity;
};

export type AdminApiErrorFields = Record<string, string[]>;

export class AdminApiError extends Error {
  constructor({
    status,
    code,
    message,
    fields,
  }: {
    status: number;
    code?: string;
    message: string;
    fields?: AdminApiErrorFields;
  }) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  readonly status: number;
  readonly code?: string;
  readonly fields?: AdminApiErrorFields;
}
export async function getAdminAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("未登入");
  return session.access_token;
}

export async function fetchAdminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAdminAccessToken();
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "content-type": "application/json" }),
      authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const structuredError = structuredAdminApiError(response.status, body);
    if (structuredError) throw structuredError;

    throw new Error(
      body && typeof body === "object" && typeof body.error === "string"
        ? body.error
        : "API request failed",
    );
  }

  return response.json() as Promise<T>;
}

export async function fetchAdminIdentity() {
  return fetchAdminJson<AdminMeResponse>("/api/admin/me");
}

function structuredAdminApiError(status: number, body: unknown): AdminApiError | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;

  const details = error as {
    code?: unknown;
    message?: unknown;
    fields?: unknown;
  };
  const message =
    typeof details.message === "string" && details.message.trim()
      ? details.message
      : "API request failed";

  return new AdminApiError({
    status,
    code: safeErrorCode(details.code),
    message,
    fields: safeErrorFields(details.fields),
  });
}

function safeErrorCode(value: unknown) {
  return typeof value === "string" && /^[a-z_]{1,64}$/.test(value) ? value : undefined;
}

function safeErrorFields(value: unknown): AdminApiErrorFields | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const fields = Object.entries(value).reduce<AdminApiErrorFields>((result, [key, messages]) => {
    if (
      key.length > 0 &&
      Array.isArray(messages) &&
      messages.every((message) => typeof message === "string")
    ) {
      result[key] = messages;
    }
    return result;
  }, {});

  return Object.keys(fields).length > 0 ? fields : undefined;
}

export async function requireSignedInAdminIdentity(queryClient: QueryClient) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw redirect({ to: "/admin/login" });
  // ensureQueryData is what makes AdminLayout's later useQuery a cache hit
  // instead of a second GET /api/admin/me.
  return queryClient.ensureQueryData(adminIdentityQueryOptions());
}

export async function requireAdminPageAccess(area: AdminAccessArea, queryClient: QueryClient) {
  const { admin } = await requireSignedInAdminIdentity(queryClient);
  if (!canRoleAccessAdminArea(admin.role, area)) {
    throw redirect({
      to: "/admin/access-denied",
      search: { area },
    } as never);
  }
  return admin;
}

export function firstAllowedAdminRouteForIdentity(admin: AdminIdentity | null | undefined) {
  return admin ? getFirstAllowedAdminRoute(admin.role) : "/admin/login";
}
