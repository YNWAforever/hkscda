import { readBoundedText } from "./boundedBody.server";

const MAX_PUBLIC_JSON_BYTES = 1024 * 1024;

export class RequestBodyTooLargeError extends Error {}
export class InvalidRequestJsonError extends Error {}

export async function readPublicJson(request: Request): Promise<unknown> {
  const body = await readBoundedText(request, MAX_PUBLIC_JSON_BYTES);
  if (body === null) throw new RequestBodyTooLargeError("Request body too large");
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new InvalidRequestJsonError("Invalid JSON body");
  }
}
