import { volunteerErrorMessage } from "../volunteers/apiResult";
import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import {
  canRoleAccessAdminArea,
  getFirstAllowedAdminRoute,
  type AdminAccessArea,
  type AdminIdentity,
} from "./access";
import { ADMIN_IDENTITY_QUERY_KEY, adminIdentityQueryOptions } from "./identity";
import type { AdminLanguage } from "./language";
import { supabase } from "../supabase";

export type AdminMeResponse = {
  admin: AdminIdentity;
};

export type AdminApiErrorFields = Record<string, string[]>;

/**
 * Why the browser could not get an admin access token. The error's `message` stays zh-HK,
 * as it always was, so code that matches on it keeps working; a screen shows the text for
 * the active language with `adminErrorMessage`.
 */
export type AdminSessionErrorCode = "not_signed_in" | "identity_changed";

const SESSION_ERROR_TEXT: Record<AdminSessionErrorCode, Record<AdminLanguage, string>> = {
  not_signed_in: { zh: "未登入", en: "Not signed in. Sign in again." },
  identity_changed: {
    zh: "登入身份已變更，請重新載入頁面。",
    en: "Your signed-in account has changed. Reload the page.",
  },
};

export function adminSessionErrorText(
  code: AdminSessionErrorCode,
  language: AdminLanguage = "zh",
): string {
  return SESSION_ERROR_TEXT[code][language];
}

export class AdminSessionError extends Error {
  /** A lapsed session is what a 401 means, so a failure screen can treat the two alike. */
  readonly status = 401;

  constructor(readonly code: AdminSessionErrorCode) {
    super(adminSessionErrorText(code));
    this.name = "AdminSessionError";
  }
}

/**
 * An error `fetchAdminJson` throws for a response that carried no structured error. Its
 * message is exactly what the plain `Error` it replaces carried; `status` is the HTTP status.
 */
export class AdminHttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "AdminHttpError";
  }
}

/**
 * The message to show for a caught error in `language`: the translated text for a session
 * error, the error's own message for any other `Error`, and `null` for anything else so
 * the caller can use its own fallback. Messages that come from the server are shown as sent.
 */
export function adminErrorMessage(error: unknown, language: AdminLanguage = "zh"): string | null {
  if (error instanceof AdminSessionError) return adminSessionErrorText(error.code, language);
  return error instanceof Error ? error.message : null;
}

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
export async function getAdminAccessToken(expectedActorUserId?: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new AdminSessionError("not_signed_in");
  if (expectedActorUserId && session.user?.id !== expectedActorUserId)
    throw new AdminSessionError("identity_changed");
  return session.access_token;
}

/** Puts `status` on `error` if it can; `false`, never a throw, when it cannot. */
function attachStatus(error: Error, status: number | null): boolean {
  // defineProperty throws on a frozen or non-extensible error and on a non-configurable own
  // `status`; any of those means the error keeps what it has.
  try {
    Object.defineProperty(error, "status", { value: status, configurable: true });
  } catch {
    return false;
  }
  return (error as { status?: unknown }).status === status;
}

export async function fetchAdminJson<T>(
  path: string,
  init?: RequestInit,
  expectedActorUserId?: string,
): Promise<T> {
  const token = await getAdminAccessToken(expectedActorUserId);
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "content-type": "application/json" }),
      authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  }).catch((error: unknown) => {
    // A request that never got a response has no status. The error is rethrown as it was, so
    // its message and class are unchanged.
    if (!(error instanceof Error) || error.name === "AbortError") throw error;
    if (attachStatus(error, null)) throw error;
    // A frozen error, or one whose own `status` cannot be redefined, cannot carry this status,
    // so it is wrapped with the same message.
    throw new AdminHttpError(error.message, null);
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const structuredError = structuredAdminApiError(response.status, body);
    if (structuredError) throw structuredError;
    if (path.includes("/volunteers"))
      throw new AdminApiError({
        status: response.status,
        message: volunteerErrorMessage(body, response.status),
      });

    throw new AdminHttpError(
      body && typeof body === "object" && typeof body.error === "string"
        ? body.error
        : "API request failed",
      response.status,
    );
  }

  const result = (await response.json()) as T;
  if (expectedActorUserId) await getAdminAccessToken(expectedActorUserId);
  return result;
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
  if (!session) {
    queryClient.removeQueries({ queryKey: ADMIN_IDENTITY_QUERY_KEY });
    throw redirect({ to: "/admin/login" });
  }
  const cachedIdentity = queryClient.getQueryData<AdminMeResponse>(ADMIN_IDENTITY_QUERY_KEY);
  if (cachedIdentity && cachedIdentity.admin.authUserId !== session.user.id) {
    queryClient.removeQueries({ queryKey: ADMIN_IDENTITY_QUERY_KEY });
  }
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
