import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
if (process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw Error("Isolated fixtures required");
const local = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
assert.equal(local.API_URL, "http://127.0.0.1:56321");
const svc = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const actors = JSON.parse(await readFile(".local-policy-test/browser/synthetic-auth.json", "utf8"));
const catalogue = JSON.parse(
  await readFile(".local-policy-test/browser/policy-catalogue.json", "utf8"),
);
const origin = "http://127.0.0.1:56330";
const marker = crypto.randomUUID();
const out = "docs/evidence/admin-volunteer-settings/browser/dog-pilot";
await mkdir(out, { recursive: true });
const report = { checks: [], errors: [] };
async function post(actor, path, body) {
  const response = await fetch(origin + path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${actor.session.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
const pc = async (command) => {
  const r = await post(actors.admin, "/api/admin/volunteers/settings", command);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
};
const terms = (await (await fetch(origin + "/api/volunteer/policy?view=terms")).json()).terms[0].id;
const body = structuredClone(catalogue.find((x) => x.template_key === "dog-cleaning-b"));
body.template_key = "dog-pilot-" + marker;
body.name = "隔離試行狗舍 " + marker;
body.terms.version_id = terms;
body.booking.group_open = { mode: "disabled" };
body.booking.group_close = { mode: "unrestricted" };
body.booking.individual_open = { mode: "unrestricted" };
body.booking.auto_approve = true;
body.release_rules = [];
body.daily_limits = [];
const date = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const from = date(50),
  next = date(51);
async function publish(capacity, revision) {
  body.capacity.volunteers = { state: "value", value: capacity };
  assert.equal(
    (
      await pc({
        action: "save",
        template_key: body.template_key,
        expected_revision: revision - 1,
        body,
      })
    ).kind,
    "saved",
  );
  const p = await pc({
    action: "preview",
    template_key: body.template_key,
    expected_revision: revision,
    effective_from: from + "T00:00:00Z",
    effective_until: null,
    activity_ids: [],
  });
  assert.deepEqual(p.issues, []);
  assert.equal(
    (
      await pc({
        action: "publish",
        preview_id: p.preview_id,
        idempotency_key: crypto.randomUUID(),
        reason: "Synthetic dog capacity pilot",
      })
    ).kind,
    "published",
  );
}
await publish(10, 1);
const old = await pc({
  action: "generate",
  template_key: body.template_key,
  date: from,
  idempotency_key: crypto.randomUUID(),
});
await publish(12, 2);
const current = await pc({
  action: "generate",
  template_key: body.template_key,
  date: next,
  idempotency_key: crypto.randomUUID(),
});
const volunteers = [];
for (let i = 1; i <= 13; i++) {
  if (i <= 7) {
    volunteers.push(actors["volunteer" + i]);
    continue;
  }
  const email = `dog-${marker}-${i}@example.invalid`,
    password = crypto.randomUUID() + "Aa1!";
  const created = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const auth = createClient(local.API_URL, local.ANON_KEY, { auth: { persistSession: false } });
  const login = await auth.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  const actor = { id: created.data.user.id, session: login.data.session };
  const claim = await svc.rpc("volunteer_profile_command", {
    p_actor: actor.id,
    p_command: {
      action: "claim",
      display_name: "Synthetic dog volunteer " + i,
      birth_date: "1990-01-01",
    },
  });
  if (claim.error) throw claim.error;
  const verified = await svc.rpc("volunteer_profile_command", {
    p_actor: actors.admin.id,
    p_command: {
      action: "verify",
      profile_id: claim.data.profile_id,
      expected_revision: claim.data.revision,
      tier: "regular",
      reason: "Synthetic dog pilot",
    },
  });
  if (verified.error) throw verified.error;
  volunteers.push(actor);
}
for (const [i, actor] of volunteers.entries()) {
  const result = await post(actor, "/api/volunteer/policy", {
    command: {
      action: "book",
      activity_id: current.activity_id,
      role: "volunteer",
      remarks: "Synthetic dog pilot",
      accept_terms: true,
      terms_version_id: terms,
      idempotency_key: crypto.randomUUID(),
    },
  });
  assert.equal(result.status, i < 12 ? 200 : 409, JSON.stringify(result));
  if (i === 12) assert.equal(result.body.reason, "capacity_full");
}
const capacities = await svc
  .from("volunteer_activity")
  .select("id,capacity")
  .in("id", [old.activity_id, current.activity_id]);
if (capacities.error) throw capacities.error;
assert.equal(capacities.data.find((x) => x.id === old.activity_id).capacity, 10);
assert.equal(capacities.data.find((x) => x.id === current.activity_id).capacity, 12);
report.checks.push(
  "Administrator published dog10 then12; real public API accepts12/rejects13 and preserves old10",
);
const browser = await chromium.launch();
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 1000 } });
  await c.addInitScript(
    (s) => localStorage.setItem("sb-127-auth-token", JSON.stringify(s)),
    actors.admin.session,
  );
  const page = await c.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(origin + "/admin/volunteers/settings");
  await page.getByRole("combobox").first().selectOption(body.template_key);
  await page.getByLabel("名稱", { exact: true }).waitFor();
  assert.equal(await page.getByRole("spinbutton").first().inputValue(), "12");
  await page.screenshot({ path: out + "/dog-policy-12.png", fullPage: true });
  report.checks.push("Real administrator browser displays the published dog configuration at390px");
  assert.deepEqual(report.errors, []);
} finally {
  await browser.close();
}
report.activities = { old: old.activity_id, current: current.activity_id };
await writeFile(out + "/report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
