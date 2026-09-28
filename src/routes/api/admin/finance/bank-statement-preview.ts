import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  BankPreviewInputError,
  BankPreviewTooBroadError,
  createBankStatementCatalogLookup,
  createBankStatementDryRunService,
  type BankStatementDryRunResult,
} from "../../../../lib/donations/bankStatementDryRun.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";
import {
  InvalidRequestJsonError,
  readBoundedJson,
  RequestBodyTooLargeError,
} from "../../../../lib/http/publicJson.server";

const bodySchema = z.object({ csvText: z.string().min(1) }).strict();
const MAX_BODY_BYTES = 320 * 1024;

type Dependencies = {
  authorize: (request: Request) => Promise<string>;
  preview: (actor: string, csvText: string) => Promise<BankStatementDryRunResult>;
};

export function createBankStatementPreviewHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const headers = { "cache-control": "no-store" };
    if (request.method !== "POST")
      return Response.json({ error: "Method not allowed" }, { status: 405, headers });
    try {
      const actor = await deps.authorize(request);
      const body = bodySchema.parse(await readBoundedJson(request, MAX_BODY_BYTES));
      return Response.json(await deps.preview(actor, body.csvText), { headers });
    } catch (error) {
      if (error instanceof Response && (error.status === 401 || error.status === 403))
        return Response.json({ error: "Access denied" }, { status: error.status, headers });
      if (error instanceof RequestBodyTooLargeError)
        return Response.json({ error: "File too large" }, { status: 413, headers });
      if (
        error instanceof InvalidRequestJsonError ||
        error instanceof z.ZodError ||
        error instanceof BankPreviewInputError
      )
        return Response.json({ error: "Invalid bank statement" }, { status: 400, headers });
      if (error instanceof BankPreviewTooBroadError)
        return Response.json(
          { error: "Too many candidates; narrow the statement" },
          { status: 409, headers },
        );
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (code === "42501")
        return Response.json({ error: "Access denied" }, { status: 403, headers });
      if (code === "22023")
        return Response.json({ error: "Invalid bank statement" }, { status: 400, headers });
      console.error("Bank statement preview unavailable");
      return Response.json({ error: "Preview unavailable" }, { status: 503, headers });
    }
  };
}

function liveHandler(request: Request) {
  const client = createSupabaseServiceClient();
  return createBankStatementPreviewHandler({
    authorize: async (input) =>
      (await requireAdmin(input, ["treasurer", "admin"], client)).authUserId,
    preview: createBankStatementDryRunService({
      lookup: createBankStatementCatalogLookup(client),
      now: () => new Date(),
    }),
  })(request);
}

export const Route = createFileRoute("/api/admin/finance/bank-statement-preview")({
  server: { handlers: { POST: ({ request }) => liveHandler(request) } },
});
