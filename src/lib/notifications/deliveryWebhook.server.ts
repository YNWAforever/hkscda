import { createHash } from "node:crypto";
import { Resend } from "resend";
import { z } from "zod";
const supported = [
  "email.delivered",
  "email.bounced",
  "email.failed",
  "email.complained",
  "email.delivery_delayed",
] as const;
const eventSchema = z.object({
  type: z.enum(supported),
  created_at: z.string().datetime({ offset: true }),
  data: z.object({ email_id: z.string().uuid() }),
});
export type DeliveryEvidence = {
  eventId: string;
  type: (typeof supported)[number];
  messageId: string;
  occurredAt: string;
  bodyHash: string;
};
export function verifyResendDelivery(body: string, headers: Headers, secret: string): unknown {
  return new Resend("signature-verification-only").webhooks.verify({
    payload: body,
    headers: {
      id: headers.get("svix-id") ?? "",
      timestamp: headers.get("svix-timestamp") ?? "",
      signature: headers.get("svix-signature") ?? "",
    },
    webhookSecret: secret,
  });
}
export function createDeliveryWebhook(deps: {
  secret: () => string | undefined;
  verify: typeof verifyResendDelivery;
  record: (event: DeliveryEvidence) => Promise<unknown>;
}) {
  return async (request: Request) => {
    const secret = deps.secret();
    if (!secret) return Response.json({ error: "delivery_webhook_unconfigured" }, { status: 503 });
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "invalid_webhook" }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        return Response.json({ error: "payload_too_large" }, { status: 413 });
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    let verified: unknown;
    try {
      verified = deps.verify(body, request.headers, secret);
    } catch {
      return Response.json({ error: "invalid_webhook" }, { status: 400 });
    }
    const type = z.object({ type: z.string() }).safeParse(verified);
    if (type.success && !supported.includes(type.data.type as (typeof supported)[number]))
      return Response.json({ ignored: true });
    const parsed = eventSchema.safeParse(verified);
    const eventId = request.headers.get("svix-id");
    if (!parsed.success || !eventId || eventId.length > 200)
      return Response.json({ error: "invalid_webhook" }, { status: 400 });
    try {
      await deps.record({
        eventId,
        type: parsed.data.type,
        messageId: parsed.data.data.email_id,
        occurredAt: parsed.data.created_at,
        bodyHash: createHash("sha256").update(body).digest("hex"),
      });
    } catch {
      return Response.json({ error: "delivery_event_not_recorded" }, { status: 503 });
    }
    return Response.json({ received: true }, { headers: { "cache-control": "no-store" } });
  };
}
