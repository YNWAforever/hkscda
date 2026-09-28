import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";
import { readBoundedJson, RequestBodyTooLargeError } from "../../../../lib/http/publicJson.server";
import {
  buildContactFormatPreview,
  type ContactFormatSourceRow,
} from "../../../../lib/crm/contactFormatPreview";

const previewSchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1)
    .max(1000)
    .refine((ids) => new Set(ids).size === ids.length),
  filterHash: z.string().regex(/^[0-9a-f]{64}$/),
});

type Dependencies = {
  authorize: (request: Request) => Promise<void>;
  loadRows: (ids: string[]) => Promise<ContactFormatSourceRow[]>;
  now: () => Date;
};

export function createCrmContactFormatPreviewHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const headers = { "cache-control": "no-store" };
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405, headers });
    }
    try {
      await deps.authorize(request);
      const command = previewSchema.parse(await readBoundedJson(request, 64 * 1024));
      const rows = await deps.loadRows(command.ids);
      const items = buildContactFormatPreview(command.ids, rows);
      const counts = { suggested: 0, manual_review: 0, unchanged: 0, skipped: 0 };
      for (const item of items) counts[item.status] += 1;
      return Response.json(
        { filterHash: command.filterHash, generatedAt: deps.now().toISOString(), counts, items },
        { headers },
      );
    } catch (error) {
      if (error instanceof Response) {
        return Response.json({ error: "Access denied" }, { status: error.status, headers });
      }
      if (error instanceof RequestBodyTooLargeError) {
        return Response.json({ error: "Request too large" }, { status: 413, headers });
      }
      if (error instanceof z.ZodError) {
        return Response.json({ error: "Invalid preview request" }, { status: 400, headers });
      }
      console.error("CRM contact format preview failed");
      return Response.json({ error: "Preview temporarily unavailable" }, { status: 503, headers });
    }
  };
}

function liveHandler(request: Request) {
  const client = createSupabaseServiceClient();
  return createCrmContactFormatPreviewHandler({
    authorize: async (input) => {
      await requireAdmin(input, ["treasurer", "admin"], client);
    },
    loadRows: async (ids) => {
      const rows: ContactFormatSourceRow[] = [];
      for (let start = 0; start < ids.length; start += 100) {
        const { data, error } = await client
          .from("supporter")
          .select("id,name,email,phone,updated_at,deleted_at")
          .in("id", ids.slice(start, start + 100));
        if (error) throw error;
        for (const row of data ?? []) {
          rows.push({
            id: row.id,
            name: row.name,
            email: row.email,
            phone: row.phone,
            updatedAt: row.updated_at,
            deletedAt: row.deleted_at,
          });
        }
      }
      return rows;
    },
    now: () => new Date(),
  })(request);
}

export const Route = createFileRoute("/api/admin/supporters/format-preview")({
  server: { handlers: { POST: ({ request }) => liveHandler(request) } },
});
