import { z } from "zod";
import { createSupabaseServiceClient, requireAdmin } from "../../donations/supabase.server";
import { createBulkRepository } from "../bulk/repository.server";
import { createBulkService, hkDate } from "../bulk/service";
const query = z
  .object({
    from: z.string().datetime({ offset: true }),
    until: z.string().datetime({ offset: true }),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .refine(
    (v) =>
      Date.parse(v.until) > Date.parse(v.from) &&
      Date.parse(v.until) - Date.parse(v.from) <= 93 * 86400000,
  );
/** Calendar summaries use the same bounded, filtered read as the daily workspace.
 * Roster, factual history and descriptions are available from the detail command. */
export async function readVolunteerCalendar(request: Request) {
  try {
    const client = createSupabaseServiceClient();
    const actor = await requireAdmin(request, ["staff", "admin"], client);
    const range = query.parse(Object.fromEntries(new URL(request.url).searchParams));
    const result = await createBulkService(createBulkRepository(client).execute).command(
      actor.authUserId,
      {
        action: "list",
        page: range.page,
        filter: {
          from: hkDate(new Date(range.from)),
          until: hkDate(new Date(Date.parse(range.until) - 1)),
          sort: "asc",
        },
      },
    );
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError)
      return Response.json({ error: "日期範圍須在93日內" }, { status: 400 });
    console.error("Volunteer calendar read failed", {
      code: typeof error === "object" && error && "code" in error ? error.code : undefined,
    });
    return Response.json({ error: "未能載入義工月曆，請稍後重試" }, { status: 500 });
  }
}
