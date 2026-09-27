import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getReceiptBucket } from "../../../../lib/donations/config.server";
import { createSupabaseServiceClient } from "../../../../lib/supabase.server";
import {
  requireVerifiedPrincipal,
  type AuthReader,
} from "../../../../lib/supporters/portal.server";
import { findAuthorizedReceipt } from "../../../../lib/supporters/receiptAccess.server";

type ReceiptPath = { path: string; fileName: string };
type Deps = {
  auth: AuthReader;
  find: (email: string, receiptId: string) => Promise<ReceiptPath | null>;
  sign: (path: string, fileName: string) => Promise<string>;
};

export function createReceiptDownloadHandler(deps: Deps) {
  return async ({
    request,
    params,
  }: {
    request: Request;
    params: { receiptId: string };
  }): Promise<Response> => {
    const headers = { "cache-control": "no-store" };
    if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed" }, { status: 405, headers });
    }
    if (!z.string().uuid().safeParse(params.receiptId).success) {
      return Response.json({ error: "Receipt not found" }, { status: 404, headers });
    }
    try {
      const principal = await requireVerifiedPrincipal(request, deps.auth);
      const receipt = await deps.find(principal.email, params.receiptId);
      if (!receipt) return Response.json({ error: "Receipt not found" }, { status: 404, headers });
      const url = await deps.sign(receipt.path, receipt.fileName);
      return Response.json({ url, expiresIn: 60 }, { status: 200, headers });
    } catch (error) {
      if (error instanceof Response) {
        return Response.json({ error: "Access denied" }, { status: error.status, headers });
      }
      console.error("Supporter receipt signing failed");
      return Response.json({ error: "Receipt temporarily unavailable" }, { status: 503, headers });
    }
  };
}

function liveHandler() {
  const client = createSupabaseServiceClient();
  return createReceiptDownloadHandler({
    auth: client.auth,
    find: (email, receiptId) => findAuthorizedReceipt(client, email, receiptId),
    sign: async (path, fileName) => {
      const { data, error } = await client.storage
        .from(getReceiptBucket())
        .createSignedUrl(path, 60, { download: fileName });
      if (error || !data?.signedUrl) throw new Error("Could not sign receipt");
      return data.signedUrl;
    },
  });
}

export const Route = createFileRoute("/api/supporter/receipts/$receiptId")({
  server: {
    handlers: {
      GET: async (context) => liveHandler()(context),
    },
  },
});
