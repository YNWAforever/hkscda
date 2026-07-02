import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../../lib/donations/supabase.server";

const paramsSchema = z.object({ id: z.string().uuid() });

const SPONSORSHIP_PROOF_BUCKET = "sponsorship-payment-proof";

type ProofStorageRow = {
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

async function withProofErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return responseError(error);
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid pledge request" }, { status: 400 });
    }

    console.error(error);
    return jsonResponse({ error: "Could not create proof link" }, { status: 500 });
  }
}

async function getProofUrl({ request, params }: { request: Request; params: { id: string } }) {
  return withProofErrors(async () => {
    const { id } = paramsSchema.parse(params);
    const client = createSupabaseServiceClient();
    await requireAdmin(request, ["staff", "admin"], client);

    const { data: proof, error } = await client
      .from("sponsorship_payment_proof")
      .select("storage_path,file_name")
      .eq("pledge_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!proof) return jsonResponse({ error: "Payment proof not found" }, { status: 404 });

    const row = proof as ProofStorageRow;
    const { data: signed, error: signedError } = await client.storage
      .from(SPONSORSHIP_PROOF_BUCKET)
      .createSignedUrl(row.storage_path, 60, { download: row.file_name });
    if (signedError) throw signedError;

    return jsonResponse({ url: signed.signedUrl });
  });
}

export const Route = createFileRoute("/api/admin/sponsorships/pledges/$id/proof-url")({
  server: {
    handlers: {
      GET: ({ request, params }) => getProofUrl({ request, params }),
    },
  },
});
