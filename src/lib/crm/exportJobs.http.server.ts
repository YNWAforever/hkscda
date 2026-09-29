import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAdminJson } from "../http/adminJson.server";
import { RequestBodyTooLargeError } from "../http/publicJson.server";
import type { AdminUser } from "../admin/session.server";
import {
  cancelCrmExportJob,
  downloadCrmExportJob,
  enqueueCrmExportJob,
  getCrmExportJob,
} from "./exportJobs.server";

const idSchema = z.string().uuid();
const requestSchema = z.object({
  kind: z.enum(["supporters", "donations"]),
  filters: z.record(z.unknown()),
});

type Dependencies = {
  client: SupabaseClient;
  isEnabled?: () => boolean;
  requireTreasurer(request: Request): Promise<AdminUser>;
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

async function guarded(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestBodyTooLargeError)
      return json({ error: "Request body too large" }, 413);
    if (error instanceof z.ZodError) return json({ error: "Invalid export request" }, 400);
    if (error && typeof error === "object" && "code" in error && error.code === "P4130")
      return json({ error: "Export exceeds 20000 rows", limit: 20000 }, 413);
    console.error(error);
    return json({ error: "Could not process export job" }, 500);
  }
}

export function createCrmExportJobHandlers({
  client,
  requireTreasurer,
  isEnabled = () => false,
}: Dependencies) {
  return {
    create(request: Request) {
      return guarded(async () => {
        const actor = await requireTreasurer(request);
        const body = requestSchema.parse(await readAdminJson(request));
        if (!isEnabled())
          return json(
            { error: "Background exports are temporarily unavailable", code: "export_unavailable" },
            503,
          );
        const job = await enqueueCrmExportJob(client, actor.authUserId, body.kind, body.filters);
        return json(job, 201);
      });
    },
    status(request: Request, rawId: string) {
      return guarded(async () => {
        const actor = await requireTreasurer(request);
        const id = idSchema.parse(rawId);
        const job = await getCrmExportJob(client, actor.authUserId, id);
        return job ? json(job) : json({ error: "Export job not found" }, 404);
      });
    },
    cancel(request: Request, rawId: string) {
      return guarded(async () => {
        const actor = await requireTreasurer(request);
        const id = idSchema.parse(rawId);
        const cancelled = await cancelCrmExportJob(client, actor.authUserId, id);
        return cancelled
          ? json({ status: "cancelled" })
          : json({ error: "Export job not found" }, 404);
      });
    },
    download(request: Request, rawId: string) {
      return guarded(async () => {
        const actor = await requireTreasurer(request);
        const id = idSchema.parse(rawId);
        const job = await getCrmExportJob(client, actor.authUserId, id);
        if (!job || job.status !== "ready") return json({ error: "Export not available" }, 404);
        const csv = await downloadCrmExportJob(client, actor.authUserId, id);
        if (csv === null) return json({ error: "Export not available" }, 404);
        return new Response(csv, {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": "attachment; filename=" + JSON.stringify(job.kind + ".csv"),
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          },
        });
      });
    },
  };
}
