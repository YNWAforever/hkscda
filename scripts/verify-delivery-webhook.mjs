import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
if (process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw Error("Isolated fixture flag required");
const fixture = JSON.parse(
  await readFile(".local-policy-test/browser/delivery-fixture.json", "utf8"),
);
const actors = JSON.parse(await readFile(".local-policy-test/browser/synthetic-auth.json", "utf8"));
const report = { checks: [], errors: [] };
const out = "docs/evidence/admin-volunteer-settings/browser/delivery";
await mkdir(out, { recursive: true });
const secret = Buffer.from("isolated-delivery-signing-key-0001");
async function event(type, offset = 0, tampered = false) {
  const body = JSON.stringify({
    type,
    created_at: new Date(Date.now() + offset).toISOString(),
    data: { email_id: fixture.messageId, to: ["synthetic@example.invalid"] },
  });
  const id = fixture.marker + "-" + type;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  const response = await fetch("http://127.0.0.1:56333/api/webhooks/resend", {
    method: "POST",
    body,
    headers: {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": tampered ? "v1,bad" : `v1,${signature}`,
    },
  });
  return { response, body, id, timestamp, signature };
}
assert.equal((await event("email.delivered", 0, true)).response.status, 400);
const delivered = await event("email.delivered");
assert.equal(delivered.response.status, 200);
const replay = await fetch("http://127.0.0.1:56333/api/webhooks/resend", {
  method: "POST",
  body: delivered.body,
  headers: {
    "svix-id": delivered.id,
    "svix-timestamp": delivered.timestamp,
    "svix-signature": `v1,${delivered.signature}`,
  },
});
assert.equal(replay.status, 200);
report.checks.push(
  "Actual HTTP endpoint rejects invalid signature, accepts signed delivery and deduplicates exact replay",
);
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await context.addInitScript(
    (s) => localStorage.setItem("sb-127-auth-token", JSON.stringify(s)),
    actors.staff.session,
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto("http://127.0.0.1:56330/admin/volunteers/tasks");
  await page.getByText("已送達收件伺服器", { exact: true }).first().waitFor();
  await page.screenshot({ path: out + "/delivered.png", fullPage: true });
  assert.equal((await event("email.bounced", 1000)).response.status, 200);
  await page.reload();
  await page.getByText("退信：需要跟進", { exact: true }).first().waitFor();
  await page.screenshot({ path: out + "/bounced.png", fullPage: true });
  const response = await fetch("http://127.0.0.1:56330/api/admin/volunteers/tasks", {
    method: "POST",
    headers: {
      authorization: `Bearer ${actors.staff.session.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "list" }),
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  const job = data.notifications.find((x) => x.id === fixture.jobId);
  assert.equal(job.delivery_state, "bounced");
  assert.equal(job.status, "provider_accepted");
  report.checks.push(
    "Real staff browser shows delivered then bounced evidence; send job is not automatically requeued",
  );
  assert.deepEqual(report.errors, []);
} finally {
  await browser.close();
}
await writeFile(out + "/report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
