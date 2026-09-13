import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { createDeliveryWebhook, verifyResendDelivery } from "./deliveryWebhook.server";
const secret = "whsec_" + Buffer.from("isolated-delivery-signing-key-0001").toString("base64");
const event = {
  type: "email.delivered",
  created_at: "2026-09-13T10:00:00Z",
  data: { email_id: "ad000000-0000-4000-8000-000000000001", to: ["private@example.invalid"] },
};
function signed(body = JSON.stringify(event), timestamp = String(Math.floor(Date.now() / 1000))) {
  const id = "msg_fixture_delivery";
  const signature = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    body,
    headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` },
  });
}
test("verified event stores minimal immutable delivery evidence without recipient data", async () => {
  let saved: unknown;
  const handler = createDeliveryWebhook({
    secret: () => secret,
    verify: verifyResendDelivery,
    record: async (e) => {
      saved = e;
    },
  });
  expect((await handler(signed())).status).toBe(200);
  expect(saved).toMatchObject({
    eventId: "msg_fixture_delivery",
    type: "email.delivered",
    messageId: event.data.email_id,
  });
  expect(JSON.stringify(saved)).not.toContain("private@example.invalid");
});
test("tampered and expired signatures cannot reach persistence", async () => {
  let calls = 0;
  const h = createDeliveryWebhook({
    secret: () => secret,
    verify: verifyResendDelivery,
    record: async () => {
      calls++;
    },
  });
  const req = signed();
  req.headers.set("svix-signature", "v1,invalid");
  expect((await h(req)).status).toBe(400);
  expect((await h(signed(undefined, "1"))).status).toBe(400);
  expect(calls).toBe(0);
});
test("unconfigured signing fails closed and database failure requests retry", async () => {
  const deps = {
    verify: verifyResendDelivery,
    record: async () => {
      throw Error("database detail");
    },
  };
  expect((await createDeliveryWebhook({ ...deps, secret: () => undefined })(signed())).status).toBe(
    503,
  );
  const r = await createDeliveryWebhook({ ...deps, secret: () => secret })(signed());
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("database detail");
});
test("verified irrelevant event is ignored and invalid payload rejected", async () => {
  let calls = 0;
  const h = createDeliveryWebhook({
    secret: () => secret,
    verify: verifyResendDelivery,
    record: async () => {
      calls++;
    },
  });
  expect((await h(signed(JSON.stringify({ ...event, type: "email.opened" })))).status).toBe(200);
  expect((await h(signed(JSON.stringify({ ...event, data: { email_id: "bad" } })))).status).toBe(
    400,
  );
  expect(calls).toBe(0);
});
test("oversized body is refused before verification or database work", async () => {
  const h = createDeliveryWebhook({
    secret: () => secret,
    verify: () => {
      throw Error("must not verify");
    },
    record: async () => {
      throw Error("must not record");
    },
  });
  expect((await h(signed("x".repeat(65537)))).status).toBe(413);
});
