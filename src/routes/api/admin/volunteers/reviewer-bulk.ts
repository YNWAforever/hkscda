import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";
import { readBoundedJson, RequestBodyTooLargeError } from "../../../../lib/http/publicJson.server";

type BulkStatus = "pending" | "succeeded" | "skipped" | "conflict" | "failed";
export type VolunteerReviewBulkOperation = {
  operationId: string;
  reviewerUserId: string;
  filterHash: string;
  createdAt: string;
  expiresAt: string;
  state: "queued" | "partial" | "done" | "failed";
  items: Array<{
    entityId: string;
    status: BulkStatus;
    reasonCode: string | null;
    beforeReviewer: string | null;
    afterReviewer: string | null;
    expectedProfileRevision: number | null;
    expectedAssignmentVersion: number | null;
  }>;
};

const previewSchema = z.object({
  action: z.literal("preview"),
  ids: z
    .array(z.string().uuid())
    .min(1)
    .max(1000)
    .refine((ids) => new Set(ids).size === ids.length),
  reviewerUserId: z.string().uuid(),
  filterHash: z.string().regex(/^[0-9a-f]{64}$/),
});
const applySchema = z.object({
  action: z.literal("apply"),
  operationId: z.string().uuid(),
});
const commandSchema = z.discriminatedUnion("action", [previewSchema, applySchema]);

type Dependencies = {
  authorize: (request: Request) => Promise<string>;
  preview: (
    actor: string,
    ids: string[],
    reviewerUserId: string,
    filterHash: string,
  ) => Promise<VolunteerReviewBulkOperation>;
  read: (actor: string, operationId: string) => Promise<VolunteerReviewBulkOperation>;
  applyItem: (
    actor: string,
    operationId: string,
    entityId: string,
  ) => Promise<{
    entityId: string;
    status: BulkStatus;
    reasonCode: string | null;
  }>;
};

export function createVolunteerReviewBulkHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const headers = { "cache-control": "no-store" };
    if (request.method !== "GET" && request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405, headers });
    }
    try {
      const actor = await deps.authorize(request);
      if (request.method === "GET") {
        const id = new URL(request.url).searchParams.get("operationId");
        if (!z.string().uuid().safeParse(id).success) {
          return Response.json({ error: "Invalid operation" }, { status: 400, headers });
        }
        return Response.json(await deps.read(actor, id!), { headers });
      }
      const raw = await readBoundedJson(request, 128 * 1024);
      const command = commandSchema.parse(raw);
      if (command.action === "preview") {
        return Response.json(
          await deps.preview(actor, command.ids, command.reviewerUserId, command.filterHash),
          { headers },
        );
      }
      const operation = await deps.read(actor, command.operationId);
      for (const item of operation.items.filter((row) => row.status === "pending").slice(0, 25)) {
        await deps.applyItem(actor, command.operationId, item.entityId);
      }
      return Response.json(await deps.read(actor, command.operationId), { headers });
    } catch (error) {
      if (error instanceof Response) {
        return Response.json({ error: "Access denied" }, { status: error.status, headers });
      }
      if (error instanceof RequestBodyTooLargeError) {
        return Response.json({ error: "Request too large" }, { status: 413, headers });
      }
      if (error instanceof z.ZodError) {
        return Response.json({ error: "Invalid bulk request" }, { status: 400, headers });
      }
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (code === "42501")
        return Response.json({ error: "Access denied" }, { status: 403, headers });
      if (code === "22023")
        return Response.json({ error: "Invalid bulk request" }, { status: 400, headers });
      if (code === "P0001")
        return Response.json({ error: "Preview expired" }, { status: 409, headers });
      console.error("Volunteer reviewer bulk request failed");
      return Response.json(
        { error: "Bulk operation temporarily unavailable" },
        { status: 503, headers },
      );
    }
  };
}

function liveHandler(request: Request) {
  const client = createSupabaseServiceClient();
  const rpc = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<VolunteerReviewBulkOperation> => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("Invalid bulk response");
    return data as VolunteerReviewBulkOperation;
  };
  return createVolunteerReviewBulkHandler({
    authorize: async (input) => (await requireAdmin(input, ["admin"], client)).authUserId,
    preview: (actor, ids, reviewerUserId, filterHash) =>
      rpc("create_volunteer_review_bulk_preview", {
        p_actor: actor,
        p_ids: ids,
        p_reviewer: reviewerUserId,
        p_filter_hash: filterHash,
      }),
    read: (actor, operationId) =>
      rpc("get_volunteer_review_bulk_operation", {
        p_actor: actor,
        p_operation: operationId,
      }),
    applyItem: async (actor, operationId, entityId) => {
      const { data, error } = await client.rpc("apply_volunteer_review_bulk_item", {
        p_actor: actor,
        p_operation: operationId,
        p_profile: entityId,
      });
      if (error) throw error;
      return data as { entityId: string; status: BulkStatus; reasonCode: string | null };
    },
  })(request);
}

export const Route = createFileRoute("/api/admin/volunteers/reviewer-bulk")({
  server: {
    handlers: {
      GET: ({ request }) => liveHandler(request),
      POST: ({ request }) => liveHandler(request),
    },
  },
});
