import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../../lib/donations/supabase.server";
import {
  buildAnimalStatusUpdatePayload,
  buildAnimalStatusUpdateRpcArgs,
  parseAnimalStatusUuid,
} from "../-status";

type HandlerContext = {
  request: Request;
  params: {
    id?: string;
  };
};

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
      // Fall through to text/status normalization.
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

async function withAnimalStatusErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return responseError(error);
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid animal status" }, { status: 400 });
    }
    if (error instanceof Error && error.message.startsWith("Invalid ")) {
      return jsonResponse({ error: error.message }, { status: 400 });
    }

    console.error(error);
    return jsonResponse({ error: "Could not update animal status" }, { status: 500 });
  }
}

async function updateAnimalStatus({ request, params }: HandlerContext) {
  return withAnimalStatusErrors(async () => {
    const animalId = parseAnimalStatusUuid(params.id, "id");
    const client = createSupabaseServiceClient();
    const admin = await requireAdmin(request, ["staff", "admin"], client);
    const payload = buildAnimalStatusUpdatePayload(animalId, await jsonBody(request));

    // The audit_animals trigger only fires for direct-from-browser writes (a real
    // JWT); this route goes over the service-role connection, so the app layer
    // owns the audit row. The RPC writes the animals update and that row in one
    // transaction — as two PostgREST calls, a failing audit insert would leave
    // the status changed, unaudited, and reported to the caller as a 500.
    const { data, error } = await client
      .rpc(
        "update_animal_status_with_audit",
        buildAnimalStatusUpdateRpcArgs(admin.authUserId, payload),
      )
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return jsonResponse({ error: "Animal not found" }, { status: 404 });
    }

    return jsonResponse({ animal: data });
  });
}

export const Route = createFileRoute("/api/admin/adoptions/animals/$id/status")({
  server: {
    handlers: {
      PATCH: ({ request, params }) => updateAnimalStatus({ request, params }),
    },
  },
});
