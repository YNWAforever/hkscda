import { z } from "zod";
import { createSupabaseServiceClient, requireAdmin } from "../../donations/supabase.server";
import { createBulkRepository } from "../bulk/repository.server";
import { createBulkService, hkDate, type BulkCommand } from "../bulk/service";
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
type CalendarDeps = {
  authorize(request: Request): Promise<string>;
  execute(actor: string, command: BulkCommand): Promise<unknown>;
};

function serviceDeps(): CalendarDeps {
  const client = createSupabaseServiceClient();
  return {
    authorize: async (request) =>
      (await requireAdmin(request, ["staff", "admin"], client)).authUserId,
    execute: createBulkRepository(client).execute,
  };
}

/** Calendar summaries use the same bounded, filtered read as the daily workspace.
 * Roster, factual history and descriptions are available from the detail command. */
export async function readVolunteerCalendar(request: Request, deps?: CalendarDeps) {
  try {
    const { authorize, execute } = deps ?? serviceDeps();
    const actor = await authorize(request);
    const range = query.parse(Object.fromEntries(new URL(request.url).searchParams));
    const result = (await createBulkService(execute).command(actor, {
      action: "list",
      page: range.page,
      filter: {
        from: hkDate(new Date(range.from)),
        until: hkDate(new Date(Date.parse(range.until) - 1)),
        // The overview lists only published sessions; filtering after the 25-row page dropped
        // published ones on busy days (BUG-62).
        status: "published",
        sort: "asc",
      },
    })) as { activities?: unknown[]; total?: number };
    // The read is one 25-row page: say so when more sessions match, so the overview shows its
    // partial-list notice (BUG-62).
    const shown = (range.page - 1) * 25 + (result.activities?.length ?? 0);
    const truncated = typeof result.total === "number" && result.total > shown;
    return Response.json({ ...result, truncated }, { headers: { "cache-control": "no-store" } });
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
