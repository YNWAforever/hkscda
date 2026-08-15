import { createFileRoute } from "@tanstack/react-router";

import { getCodConfig } from "../../../lib/donations/config.server";
import {
  CodNotificationError,
  processCodNotification,
} from "../../../lib/donations/cod-webhook.server";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import {
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
} from "../../../lib/security/rate-limit.server";

type HandlerDependencies = {
  enforce?: typeof enforceRateLimit;
  process?: (envelope: unknown) => Promise<unknown>;
  getConfig?: typeof getCodConfig;
  createClient?: typeof createSupabaseServiceClient;
};

export async function handleCodWebhookRequest(
  request: Request,
  {
    enforce = enforceRateLimit,
    process,
    getConfig = getCodConfig,
    createClient = createSupabaseServiceClient,
  }: HandlerDependencies = {},
) {
  const limit = await enforce(getClientIp(request), {
    prefix: "wh-cod",
    max: 100,
    window: "1 m",
  });
  if (!limit.ok) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "retry-after": String(retryAfterSeconds(limit)) },
    });
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(await request.text());
  } catch {
    return new Response("Invalid COD notification", { status: 400 });
  }

  try {
    const processEnvelope =
      process ??
      ((value: unknown) =>
        processCodNotification({ envelope: value, config: getConfig(), client: createClient() }));
    await processEnvelope(envelope);
    return new Response("success");
  } catch (error) {
    if (error instanceof CodNotificationError) {
      return new Response("Invalid COD notification", { status: 400 });
    }
    console.error("COD notification processing failed");
    return new Response("COD notification processing failed", { status: 500 });
  }
}

export const Route = createFileRoute("/api/webhooks/cod")({
  server: {
    handlers: {
      POST: ({ request }) => handleCodWebhookRequest(request),
    },
  },
});
