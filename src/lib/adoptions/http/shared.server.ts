import { z } from "zod";
import { readAdminJson } from "../../http/adminJson.server";
import { RequestBodyTooLargeError } from "../../http/publicJson.server";

import type { AdminUser } from "../../donations/supabase.server";

export type AdoptionCoordinatorService = ReturnType<
  typeof import("../service").createAdoptionCoordinatorService
>;
export type CoordinatorAuthorizer = (request: Request) => Promise<AdminUser>;
export type HandlerContext = {
  request: Request;
  params?: Record<string, string | undefined>;
};

export function queryParams(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams);
}

export function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

export function csvResponse(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

export async function jsonBody(request: Request) {
  try {
    return await readAdminJson(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError)
      throw jsonResponse({ error: "Request body too large" }, { status: 413 });
    throw jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }
}

export function requiredUuid(params: HandlerContext["params"], key: string) {
  const value = params?.[key];
  if (!value || !z.string().uuid().safeParse(value).success) {
    throw jsonResponse({ error: `Invalid ${key}` }, { status: 400 });
  }
  return value;
}

export const badRequestDomainErrors = new Set([
  "Invalid case status",
  "Inactive case status",
  "Closing case status not allowed at intake",
  "reason_required",
  "Invalid match status",
  "Inactive match status",
  "Invalid followup status",
  "Inactive followup status",
  "Invalid coordinator task links",
  "Completed tasks require a completed date",
  "Completed tasks require an outcome or remarks",
  "Cancelled tasks require an outcome or remarks",
  "Invalid adoption outcome status",
  "Inactive adoption outcome status",
  "Invalid successful adoption outcome status",
  "Adopter filters match too many records",
  "Too many animal pipeline candidates; narrow the search or filters",
  "Invalid manual intake identity",
  "Unsupported coordinator export audit",
]);

export const notFoundDomainErrors = new Set([
  "Status not found",
  "Task not found",
  "Adoption case not found",
  "Adopter profile not found",
  "Supporter not found",
  "Export audit not found",
  "Match not found for adoption case",
]);

export const conflictDomainErrors = new Set([
  "System statuses cannot be deleted",
  "System status keys cannot be changed",
  "System status categories cannot be changed",
  "Match must be approved before finalization",
  "Adoption case is missing adopter profile",
  "Adoption case is missing supporter",
  "Approved match has no animal",
  // finalize_successful_adoption refusals (BUG-02, migration 20261029160000).
  "Animal already has a successful adoption",
  "Adoption case already finalized",
  "Adoption case is closed",
]);

export async function responseError(error: Response) {
  const status = error.status;
  const contentType = error.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = await error.clone().json();
      if (body && typeof body === "object") {
        return jsonResponse(body, { status });
      }
    } catch {
      // Fall through to text/status normalization.
    }
  }

  let message = "";
  try {
    message = (await error.clone().text()).trim();
  } catch {
    message = "";
  }

  return jsonResponse({ error: message || error.statusText || "Request failed" }, { status });
}

export function domainError(error: { message: string }) {
  const normalizedMessage = error.message.toLowerCase();

  if (notFoundDomainErrors.has(error.message)) {
    return jsonResponse({ error: error.message }, { status: 404 });
  }
  if (
    conflictDomainErrors.has(error.message) ||
    (error instanceof Error &&
      normalizedMessage.includes("protected") &&
      (normalizedMessage.includes("status") ||
        normalizedMessage.includes("delete") ||
        normalizedMessage.includes("mutation")))
  ) {
    return jsonResponse({ error: error.message }, { status: 409 });
  }
  if (badRequestDomainErrors.has(error.message)) {
    return jsonResponse({ error: error.message }, { status: 400 });
  }

  return null;
}

// PostgREST names the constraint in the message (`… unique constraint "<name>"`);
// the details carry the clashing values, which stay private.
const uniqueViolationMessages = new Map([
  [
    "successful_adoption_case_number_key",
    "This case number is already in use. Use another number or reload.",
  ],
  [
    "coordinator_status_category_key_key",
    "A status with this key already exists in this category. Use another key.",
  ],
  [
    "supporter_email_key",
    "A supporter with this email already exists. Choose the existing supporter instead.",
  ],
]);

function uniqueViolationMessage(error: object) {
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const constraint = /unique constraint "([^"]+)"/.exec(message)?.[1] ?? "";
  return (
    uniqueViolationMessages.get(constraint) ?? "This record already exists. Reload and try again."
  );
}

export async function withErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return responseError(error);
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid coordinator request" }, { status: 400 });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "42501") {
      return jsonResponse({ error: "Forbidden" }, { status: 403 });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P0002") {
      return jsonResponse({ error: "Coordinator item not found" }, { status: 404 });
    }
    // A unique violation is a 409 (BUG-15), worded for the constraint that was hit (BUG-40).
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return jsonResponse({ error: uniqueViolationMessage(error) }, { status: 409 });
    }
    if (error instanceof Error) {
      const response = domainError(error);
      if (response) return response;
    } else if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P0001" &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      // RPC exceptions are plain PostgREST objects. Only exact, known domain
      // messages are public; arbitrary database text and details stay private.
      const response = domainError({ message: error.message });
      if (response) return response;
    }

    console.error(error);
    return jsonResponse({ error: "Could not process coordinator request" }, { status: 500 });
  }
}
