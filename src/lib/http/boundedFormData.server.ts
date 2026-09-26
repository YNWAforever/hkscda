import { readBoundedBytes } from "./boundedBody.server";

export async function readBoundedFormData(
  request: Request,
  maxBytes: number,
): Promise<FormData | null> {
  const bytes = await readBoundedBytes(request, maxBytes);
  if (bytes === null) return null;
  const contentType = request.headers.get("content-type");
  return new Response(bytes, {
    headers: contentType ? { "content-type": contentType } : undefined,
  }).formData();
}
