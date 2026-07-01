import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../../../lib/donations/supabase.server";

const photoParamsSchema = z.object({
  applicationId: z.string().uuid(),
  photoId: z.string().uuid(),
});

type PhotoStorageRow = {
  storage_bucket: string;
  storage_path: string;
  file_name: string;
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function responseError(error: Response) {
  const status = error.status;
  const contentType = error.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = await error.clone().json();
      if (body && typeof body === "object") return jsonResponse(body, { status });
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

async function withPhotoErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return responseError(error);
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid photo request" }, { status: 400 });
    }

    console.error(error);
    return jsonResponse({ error: "Could not create photo link" }, { status: 500 });
  }
}

async function getPhotoUrl({
  request,
  params,
}: {
  request: Request;
  params: { applicationId: string; photoId: string };
}) {
  return withPhotoErrors(async () => {
    const { applicationId, photoId } = photoParamsSchema.parse(params);
    const client = createSupabaseServiceClient();
    await requireAdmin(request, ["staff", "admin"], client);

    const { data: photo, error } = await client
      .from("adoption_application_photo")
      .select("storage_bucket,storage_path,file_name")
      .eq("public_application_id", applicationId)
      .eq("id", photoId)
      .maybeSingle();
    if (error) throw error;
    if (!photo) return jsonResponse({ error: "Photo not found" }, { status: 404 });

    const row = photo as PhotoStorageRow;
    const { data: signed, error: signedError } = await client.storage
      .from(row.storage_bucket)
      .createSignedUrl(row.storage_path, 60, { download: row.file_name });
    if (signedError) throw signedError;

    return jsonResponse({ url: signed.signedUrl });
  });
}

export const Route = createFileRoute(
  "/api/admin/adoptions/applications/$applicationId/photos/$photoId",
)({
  server: {
    handlers: {
      GET: ({ request, params }) => getPhotoUrl({ request, params }),
    },
  },
});
