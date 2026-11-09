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
    // Each refusal names the field the admin has to fix, so the editor can say which one
    // (CMS-03, the same structured shape BUG-68 gave the main content routes).
    if (value.contentClass === "verified" && !value.sourceReference) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceReference"],
        message: "Required",
      });
    }
    if (value.contentClass === "verified" && !value.contentOwner) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["contentOwner"], message: "Required" });
    }
    if (
      value.effectiveFrom &&
      value.effectiveUntil &&
      Date.parse(value.effectiveFrom) > Date.parse(value.effectiveUntil)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effectiveUntil"],
        message: "Effective until must be after effective from",
      });
    }
  });

type MetadataInput = z.infer<typeof metadataSchema> & { actorUserId: string; contentId: string };
type HandlerPorts = {
  requireAdmin: (request: Request) => Promise<{ authUserId: string }>;
  update: (input: MetadataInput) => Promise<unknown>;
};

/**
 * The admin client reads `{error:{code,message,fields}}` (`structuredAdminApiError`), so the
 * publication metadata panel names the fields and writes the reason in the admin's language
 * instead of showing an English string with no field (CMS-03, the shape BUG-68 introduced).
 */
type ErrorCode = "invalid" | "conflict" | "not_found" | "internal";

const json = (value: unknown, status: number) =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });

function errorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  fields?: Record<string, string[]>,
) {
  return json({ error: { code, message, ...(fields ? { fields } : {}) } }, status);
}

function validationFields(error: z.ZodError): Record<string, string[]> {
  return error.issues.reduce<Record<string, string[]>>((fields, issue) => {
    const key = issue.path.join(".") || "form";
    (fields[key] ??= []).push(issue.message);
    return fields;
  }, {});
}

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
        return errorResponse(413, "invalid", "Request body too large");
      if (error instanceof z.ZodError)
        return errorResponse(
          400,
          "invalid",
          "Invalid publication metadata",
          validationFields(error),
        );
      if (error instanceof InvalidRequestJsonError)
        return errorResponse(400, "invalid", "Invalid publication metadata");
      const code = (error as { code?: string })?.code;
      if (code === "23514" || code === "22023")
        return errorResponse(400, "invalid", "Invalid publication metadata");
      if (code === "40001") return errorResponse(409, "conflict", "Content changed; reload before saving");
      if (code === "P0002") return errorResponse(404, "not_found", "Content not found");
      return errorResponse(500, "internal", "Could not save publication metadata");
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
