import { InvalidRequestJsonError, readBoundedJson } from "./publicJson.server";

export const MAX_ADMIN_JSON_BYTES = 8 * 1024 * 1024;

export function readAdminJson(request: Request): Promise<unknown> {
  return readBoundedJson(request, MAX_ADMIN_JSON_BYTES);
}

export async function readAdminJsonObject(request: Request): Promise<Record<string, unknown>> {
  const body = await readAdminJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidRequestJsonError("JSON object required");
  }
  return body as Record<string, unknown>;
}
