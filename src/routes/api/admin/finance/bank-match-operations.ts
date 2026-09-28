import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  BankMatchSelectionError,
  type BankMatchApplyResult,
  type BankMatchOperation,
} from "../../../../lib/donations/bankMatchConfirmation";
import {
  createBankMatchPreviewService,
  createSupabaseBankMatchRepository,
} from "../../../../lib/donations/bankMatchConfirmation.server";
import {
  BankPreviewInputError,
  BankPreviewTooBroadError,
  createBankStatementCatalogLookup,
  createBankStatementDryRunService,
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

const createBody = z
  .object({
    csvText: z.string().min(1),
    selectedOrdinals: z.array(z.number().int().min(1).max(1000)).min(1).max(1000),
  })
  .strict();
const applyBody = z
  .object({
    operationId: z.string().uuid(),
    ordinal: z.number().int().min(1).max(1000),
  })
  .strict();
const MAX_CREATE_BYTES = 320 * 1024;
const MAX_APPLY_BYTES = 4096;

type Dependencies = {
  authorize: (request: Request) => Promise<string>;
  create: (actor: string, csvText: string, ordinals: number[]) => Promise<BankMatchOperation>;
  get: (actor: string, operationId: string) => Promise<BankMatchOperation>;
  apply: (actor: string, operationId: string, ordinal: number) => Promise<BankMatchApplyResult>;
};

export function createBankMatchOperationHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const headers = { "cache-control": "no-store" };
    if (!["POST", "GET", "PATCH"].includes(request.method))
      return Response.json({ error: "Method not allowed" }, { status: 405, headers });
    try {
      const actor = await deps.authorize(request);
      if (request.method === "POST") {
        const body = createBody.parse(await readBoundedJson(request, MAX_CREATE_BYTES));
        return Response.json(await deps.create(actor, body.csvText, body.selectedOrdinals), {
          headers,
        });
      }
      if (request.method === "GET") {
        const operationId = z
          .string()
          .uuid()
          .parse(new URL(request.url).searchParams.get("operationId"));
        return Response.json(await deps.get(actor, operationId), { headers });
      }
      const body = applyBody.parse(await readBoundedJson(request, MAX_APPLY_BYTES));
      return Response.json(await deps.apply(actor, body.operationId, body.ordinal), { headers });
    } catch (error) {
      if (error instanceof Response && (error.status === 401 || error.status === 403))
        return Response.json({ error: "Access denied" }, { status: error.status, headers });
      if (error instanceof RequestBodyTooLargeError)
        return Response.json({ error: "Request too large" }, { status: 413, headers });
      if (
        error instanceof InvalidRequestJsonError ||
        error instanceof z.ZodError ||
        error instanceof BankPreviewInputError ||
        error instanceof BankMatchSelectionError
      )
        return Response.json({ error: "Invalid bank match selection" }, { status: 400, headers });
      if (error instanceof BankPreviewTooBroadError)
        return Response.json({ error: "Candidate set too broad" }, { status: 409, headers });
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (code === "42501")
        return Response.json({ error: "Access denied" }, { status: 403, headers });
      if (code === "22023" || code === "23505")
        return Response.json({ error: "Invalid or repeated selection" }, { status: 400, headers });
      if (code === "P0001" || code === "23514")
        return Response.json(
          { error: "Snapshot expired or changed; refresh" },
          { status: 409, headers },
        );
      console.error("Bank match operation unavailable");
      return Response.json({ error: "Bank match operation unavailable" }, { status: 503, headers });
    }
  };
}

function liveHandler(request: Request) {
  const client = createSupabaseServiceClient();
  const repository = createSupabaseBankMatchRepository(client);
  const create = createBankMatchPreviewService({
    preview: createBankStatementDryRunService({
      lookup: createBankStatementCatalogLookup(client),
      now: () => new Date(),
    }),
    persist: repository.create,
  });
  return createBankMatchOperationHandler({
    authorize: async (input) =>
      (await requireAdmin(input, ["treasurer", "admin"], client)).authUserId,
    create,
    get: repository.get,
    apply: repository.apply,
  })(request);
}

export const Route = createFileRoute("/api/admin/finance/bank-match-operations")({
  server: {
    handlers: {
      POST: ({ request }) => liveHandler(request),
      GET: ({ request }) => liveHandler(request),
      PATCH: ({ request }) => liveHandler(request),
    },
  },
});
