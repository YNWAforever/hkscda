import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../../lib/donations/supabase.server";
import { buildAnimalStatusUpdatePayload, parseAnimalStatusUuid } from "../-status";

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
    await requireAdmin(request, ["staff", "admin"], client);
    const payload = buildAnimalStatusUpdatePayload(animalId, await jsonBody(request));

    const { data, error } = await client
      .from("animals")
      .update({
        status: payload.status,
        updated_at: payload.updatedAt,
      })
      .eq("id", payload.animalId)
      .select(
        "id,type,name,name_en,gender,age,description,notes,status,image_url,created_at,updated_at",
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
