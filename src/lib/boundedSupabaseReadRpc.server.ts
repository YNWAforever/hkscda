import { z } from "zod";

const uuid = z.string().uuid();
const page = z.number().int().min(1).max(100000);
const scope = z.enum(["all", "upcoming", "overdue"]);
const detail = z
  .object({
    p_actor: uuid,
    p_command: z
      .object({
        action: z.literal("detail"),
        activity_id: uuid,
        page: page.optional(),
        history_page: page.optional(),
      })
      .strict(),
  })
  .strict();
const support = z
  .object({
    p_actor: uuid,
    p_command: z
      .object({
        action: z.literal("list"),
        scope: scope.optional(),
        page: page.optional(),
        pageSize: z.number().int().min(0).max(100).optional(),
        q: z.string().max(100).optional(),
        include_pending: z.literal(false).optional(),
      })
      .strict(),
  })
  .strict();
const pending = z
  .object({
    p_actor: uuid,
    p_scope: scope,
    p_page: page,
    p_page_size: z.number().int().min(0).max(100),
    p_as_of: z.string().datetime({ offset: true }),
    p_query: z.string().max(100),
  })
  .strict();
const reads = new Map<string, z.ZodType<unknown>>([
  ["volunteer_bulk_command", detail],
  ["volunteer_task_command", support],
  ["volunteer_pending_work_snapshot", pending],
]);

/** Transport allowlist, never an authorization or response cache. Unknown shapes use native fetch. */
export function boundedSupabaseReadRpcBody(
  base: URL,
  target: URL,
  init: RequestInit,
): string | null {
  if (
    target.origin !== base.origin ||
    target.username !== base.username ||
    target.password !== base.password ||
    target.search ||
    target.hash ||
    !target.pathname.startsWith(base.pathname) ||
    (init.method ?? "GET").toUpperCase() !== "POST" ||
    typeof init.body !== "string" ||
    Buffer.byteLength(init.body) > 8192
  )
    return null;
  const schema = reads.get(target.pathname.slice(base.pathname.length));
  if (!schema) return null;
  const headers = new Headers(init.headers);
  if (
    headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" ||
    headers.has("transfer-encoding") ||
    headers.has("content-encoding") ||
    (headers.has("content-length") &&
      headers.get("content-length") !== String(Buffer.byteLength(init.body)))
  )
    return null;
  try {
    return schema.safeParse(JSON.parse(init.body) as unknown).success ? init.body : null;
  } catch {
    return null;
  }
}
