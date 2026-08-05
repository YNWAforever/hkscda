import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../../lib/donations/supabase.server";
import {
  buildInternalProfileUpsertPayload,
  buildInternalProfileUpsertRpcArgs,
} from "../-internalProfile";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function jsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }
}

async function responseError(error: Response) {
  const status = error.status;
  const contentType = error.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = await error.clone().json();
      if (body && typeof body === "object") {
        return jsonResponse(body, { status });
      }
    } catch {
      // Fall through to status text normalization.
    }
  }

  let message = "";
  try {
    message = (await error.clone().text()).trim();
  } catch {
    message = "";
  }

  return jsonResponse({ error: message || error.statusText || "Request failed" }, { status });
}

async function withInternalProfileErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return responseError(error);
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid internal profile" }, { status: 400 });
    }
    if (error instanceof Error) {
      if (error.message === "Invalid id" || error.message === "Animal id mismatch") {
        return jsonResponse({ error: error.message }, { status: 400 });
      }
    }

    console.error(error);
    return jsonResponse({ error: "Could not save internal profile" }, { status: 500 });
  }
}

async function upsertInternalProfile({
  request,
  params,
}: {
  request: Request;
  params: { id: string };
}) {
  return withInternalProfileErrors(async () => {
    const client = createSupabaseServiceClient();
    const admin = await requireAdmin(request, ["staff", "admin"], client);

    const payload = buildInternalProfileUpsertPayload(params.id, await jsonBody(request));

    // The audit_animal_profile_internal trigger only fires for direct-from-browser
    // writes (a real JWT); this route goes over the service-role connection, so the
    // app layer owns the audit row. The RPC writes the upsert and that row in one
    // transaction, and records only the changed column names — audit_log is
    // readable by treasurer, animal_profile_internal is not.
    const { data, error } = await client
      .rpc(
        "upsert_animal_internal_profile_with_audit",
        buildInternalProfileUpsertRpcArgs(admin.authUserId, payload),
      )
      .maybeSingle();

    if (error) throw error;
    // The RPC always returns the upserted row, so an empty result means the call
    // did not do what we think it did. Fail loudly rather than answering 200 with
    // a null profile the admin UI would render as an empty form.
    if (!data) throw new Error("Internal profile upsert returned no row");

    return jsonResponse({ profile: data });
  });
}

export const Route = createFileRoute("/api/admin/adoptions/animals/$id/internal")({
  server: {
    handlers: {
      PUT: ({ request, params }) => upsertInternalProfile({ request, params }),
    },
  },
});
