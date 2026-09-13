import { z } from "zod";
import { createSupabaseServiceClient, requireAdmin } from "../../donations/supabase.server";
const shared = {
  profile_id: z.string().uuid(),
  expected_revision: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000),
};
export const qualificationCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }).strict(),
  z.object({ action: z.literal("list_legacy") }).strict(),
  z
    .object({
      action: z.literal("link_legacy"),
      registration_id: z.string().uuid(),
      profile_id: z.string().uuid(),
      expected_updated_at: z.string().datetime({ offset: true }),
      reason: z.string().trim().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      action: z.literal("verify"),
      ...shared,
      tier: z.enum(["newcomer", "regular", "senior"]),
      joined_on: z.string().date().nullable().optional(),
      history_coverage_start: z.string().date().nullable().optional(),
    })
    .strict(),
  z.object({ action: z.literal("suspend"), ...shared }).strict(),
  z
    .object({
      action: z.literal("credential"),
      ...shared,
      credential_key: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
      valid_from: z.string().datetime({ offset: true }),
      valid_until: z.string().datetime({ offset: true }).nullable(),
      evidence: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z.object({ action: z.literal("revoke"), ...shared, credential_id: z.string().uuid() }).strict(),
]);
export async function handleQualificationCommand(request: Request) {
  const headers = { "cache-control": "no-store" };
  try {
    const client = createSupabaseServiceClient();
    const actor = await requireAdmin(request, ["staff", "admin"], client);
    const input = qualificationCommandSchema.parse(await request.json());
    const { data, error } = await client.rpc(
      input.action === "list_legacy" || input.action === "link_legacy"
        ? "volunteer_legacy_identity_command"
        : "volunteer_profile_command",
      {
        p_actor: actor.authUserId,
        p_command: input,
      },
    );
    if (error) throw error;
    return Response.json(data, {
      headers,
      status: data.kind === "conflict" ? 409 : data.kind === "not_found" ? 404 : 200,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json({ error: "請檢查資格資料及核實理由" }, { status: 400, headers });
    if (error && typeof error === "object" && "code" in error && error.code === "42501")
      return Response.json({ error: "沒有核實資格權限" }, { status: 403, headers });
    console.error("Qualification command failed", error);
    return Response.json({ error: "未能更新資格，請重新整理後重試" }, { status: 500, headers });
  }
}
