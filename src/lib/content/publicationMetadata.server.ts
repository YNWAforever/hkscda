import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readAdminJson } from "../http/adminJson.server";
import { InvalidRequestJsonError, RequestBodyTooLargeError } from "../http/publicJson.server";

const metadataSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    contentClass: z.enum(["unreviewed", "verified", "demo"]),
    sourceReference: z.string().trim().max(500).nullable(),
    contentOwner: z.string().trim().max(120).nullable(),
    effectiveFrom: z.string().datetime({ offset: true }).nullable(),
    effectiveUntil: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.contentClass === "verified" && (!value.sourceReference || !value.contentOwner)) {
      context.addIssue({ code: "custom", message: "Verified content needs provenance and owner" });
    }
    if (
      value.effectiveFrom &&
      value.effectiveUntil &&
      Date.parse(value.effectiveFrom) > Date.parse(value.effectiveUntil)
    ) {
      context.addIssue({ code: "custom", message: "Effective date range is invalid" });
    }
  });

type MetadataInput = z.infer<typeof metadataSchema> & { actorUserId: string; contentId: string };
type HandlerPorts = {
  requireAdmin: (request: Request) => Promise<{ authUserId: string }>;
  update: (input: MetadataInput) => Promise<unknown>;
};
const json = (value: unknown, status: number) =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });

export function createPublicationMetadataHandler(ports: HandlerPorts) {
  return async (request: Request, contentId: string): Promise<Response> => {
    try {
      const admin = await ports.requireAdmin(request);
      z.string().uuid().parse(contentId);
      const input = metadataSchema.parse(await readAdminJson(request));
      const result = await ports.update({ ...input, actorUserId: admin.authUserId, contentId });
      return json(result, 200);
    } catch (error) {
      if (error instanceof Response) return error;
      if (error instanceof RequestBodyTooLargeError)
        return json({ error: "Request body too large" }, 413);
      if (
        error instanceof InvalidRequestJsonError ||
        error instanceof z.ZodError ||
        (error as { code?: string })?.code === "23514" ||
        (error as { code?: string })?.code === "22023"
      )
        return json({ error: "Invalid publication metadata" }, 400);
      const code = (error as { code?: string })?.code;
      if (code === "40001") return json({ error: "Content changed; reload before saving" }, 409);
      if (code === "P0002") return json({ error: "Content not found" }, 404);
      return json({ error: "Could not save publication metadata" }, 500);
    }
  };
}

export function createSupabasePublicationMetadataUpdater(client: SupabaseClient) {
  return async (input: MetadataInput) => {
    const { data, error } = await client.rpc("set_content_publication_metadata", {
      p_actor_user_id: input.actorUserId,
      p_content_id: input.contentId,
      p_expected_version: input.expectedVersion,
      p_values: {
        contentClass: input.contentClass,
        sourceReference: input.sourceReference,
        contentOwner: input.contentOwner,
        effectiveFrom: input.effectiveFrom,
        effectiveUntil: input.effectiveUntil,
      },
    });
    if (error) throw error;
    return data;
  };
}
