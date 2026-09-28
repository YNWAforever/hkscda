import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  InvalidRequestJsonError,
  readBoundedJson,
  RequestBodyTooLargeError,
} from "../http/publicJson.server";

const uuid = z.string().uuid();
const assignmentSchema = z
  .object({
    assigneeUserId: uuid,
    expectedVersion: z.number().int().positive().safe(),
  })
  .strict();

export type FollowupAssignmentInput = {
  actorUserId: string;
  pledgeId: string;
  assigneeUserId: string;
  expectedVersion: number;
};

export type FollowupAssignmentResult = {
  pledgeId: string;
  assigneeUserId: string;
  version: number;
  replayed: boolean;
};

export function createFollowupAssignmentHandler(deps: {
  authorize: (request: Request) => Promise<string>;
  assign: (input: FollowupAssignmentInput) => Promise<FollowupAssignmentResult>;
}) {
  return async (request: Request, pledgeId: string): Promise<Response> => {
    const headers = { "cache-control": "no-store" };
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405, headers });
    }
    try {
      const actorUserId = await deps.authorize(request);
      if (!uuid.safeParse(pledgeId).success) {
        return Response.json({ error: "Invalid pledge" }, { status: 400, headers });
      }
      const input = assignmentSchema.parse(await readBoundedJson(request, 8 * 1024));
      const result = await deps.assign({
        actorUserId,
        pledgeId,
        assigneeUserId: input.assigneeUserId,
        expectedVersion: input.expectedVersion,
      });
      return Response.json(result, { headers });
    } catch (error) {
      if (error instanceof Response) {
        return Response.json({ error: "Access denied" }, { status: error.status, headers });
      }
      if (error instanceof RequestBodyTooLargeError) {
        return Response.json({ error: "Request too large" }, { status: 413, headers });
      }
      if (error instanceof InvalidRequestJsonError || error instanceof z.ZodError) {
        return Response.json({ error: "Invalid assignment" }, { status: 400, headers });
      }
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code === "42501")
        return Response.json({ error: "Access denied" }, { status: 403, headers });
      if (code === "40001")
        return Response.json({ error: "Pledge changed; refresh" }, { status: 409, headers });
      if (code === "22023")
        return Response.json({ error: "Invalid assignment" }, { status: 400, headers });
      console.error("Sponsorship follow-up assignment unavailable");
      return Response.json(
        { error: "Assignment temporarily unavailable" },
        { status: 503, headers },
      );
    }
  };
}

export function createSupabaseFollowupAssignmentPort(client: SupabaseClient) {
  return async (input: FollowupAssignmentInput): Promise<FollowupAssignmentResult> => {
    const { data, error } = await client.rpc("assign_sponsorship_followup", {
      p_actor: input.actorUserId,
      p_pledge: input.pledgeId,
      p_assignee: input.assigneeUserId,
      p_expected_version: input.expectedVersion,
    });
    if (error) throw error;
    return z
      .object({
        pledgeId: uuid,
        assigneeUserId: uuid,
        version: z.number().int().positive(),
        replayed: z.boolean(),
      })
      .parse(data);
  };
}

const assigneeSchema = z.object({
  authUserId: uuid,
  email: z.string().email(),
  role: z.enum(["staff", "admin"]),
});
export type FollowupAssignee = z.infer<typeof assigneeSchema>;

export function createFollowupAssigneesHandler(deps: {
  authorize: (request: Request) => Promise<string>;
  list: () => Promise<FollowupAssignee[]>;
}) {
  return async (request: Request): Promise<Response> => {
    const headers = { "cache-control": "no-store" };
    if (request.method !== "GET")
      return Response.json({ error: "Method not allowed" }, { status: 405, headers });
    try {
      await deps.authorize(request);
      const assignees = z.array(assigneeSchema).parse(await deps.list());
      return Response.json({ assignees }, { headers });
    } catch (error) {
      if (error instanceof Response)
        return Response.json({ error: "Access denied" }, { status: error.status, headers });
      console.error("Sponsorship follow-up assignees unavailable");
      return Response.json(
        { error: "Assignees temporarily unavailable" },
        { status: 503, headers },
      );
    }
  };
}

export function createSupabaseFollowupAssigneesPort(client: SupabaseClient) {
  return async (): Promise<FollowupAssignee[]> => {
    const { data, error } = await client
      .from("admin_user")
      .select("auth_user_id,email,role")
      .eq("status", "active")
      .in("role", ["staff", "admin"])
      .order("email", { ascending: true })
      .limit(1000);
    if (error) throw error;
    return z.array(assigneeSchema).parse(
      (data ?? []).map((row) => ({
        authUserId: row.auth_user_id,
        email: row.email,
        role: row.role,
      })),
    );
  };
}
