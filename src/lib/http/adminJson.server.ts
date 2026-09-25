import { InvalidRequestJsonError, readBoundedJson } from "./publicJson.server";

const MAX_ADMIN_JSON_BYTES = 8 * 1024 * 1024;

export async function readAdminJsonObject(request: Request): Promise<Record<string, unknown>> {
  const body = await readBoundedJson(request, MAX_ADMIN_JSON_BYTES);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidRequestJsonError("JSON object required");
  }
  return body as Record<string, unknown>;
}
