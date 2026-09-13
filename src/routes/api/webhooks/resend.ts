import { createFileRoute } from "@tanstack/react-router";
import {
  createDeliveryWebhook,
  verifyResendDelivery,
} from "../../../lib/notifications/deliveryWebhook.server";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";
import {
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
} from "../../../lib/security/rate-limit.server";
export const Route = createFileRoute("/api/webhooks/resend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limit = await enforceRateLimit(getClientIp(request), {
          prefix: "wh-resend",
          max: 100,
          window: "1 m",
        });
        if (!limit.ok)
          return new Response("Too many requests", {
            status: 429,
            headers: { "retry-after": String(retryAfterSeconds(limit)) },
          });
        return createDeliveryWebhook({
          secret: () => process.env.RESEND_WEBHOOK_SECRET,
          verify: verifyResendDelivery,
          record: async (event) => {
            const { error } = await createSupabaseServiceClient().rpc(
              "record_mail_delivery_event",
              {
                p_event_id: event.eventId,
                p_message_id: event.messageId,
                p_type: event.type,
                p_occurred_at: event.occurredAt,
                p_body_hash: event.bodyHash,
              },
            );
            if (error) throw error;
          },
        })(request);
      },
    },
  },
});
