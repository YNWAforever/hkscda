import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
if (process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw new Error("Isolated fixtures required");
const local = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
assert.equal(local.API_URL, "http://127.0.0.1:56321");
const db = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const marker = "terms-refresh-" + crypto.randomUUID(),
  origin = "http://127.0.0.1:56330",
  output = "docs/evidence/admin-volunteer-settings/browser/terms-refresh";
await mkdir(output, { recursive: true });
const report = { marker, checks: [], errors: [] };
async function createActor(role) {
  const email = marker + "-" + (role ?? "volunteer") + "@example.invalid",
    password = crypto.randomUUID() + "Aa1!";
  const r = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (r.error) throw r.error;
  if (role) {
    const x = await db
      .from("admin_user")
      .insert({ auth_user_id: r.data.user.id, email, role, status: "active" });
    if (x.error) throw x.error;
  }
  const client = createClient(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { id: r.data.user.id, session: login.data.session };
}
const admin = await createActor("admin"),
  volunteer = await createActor();
async function rpc(name, args) {
  const r = await db.rpc(name, args);
  if (r.error) throw r.error;
  return r.data;
}
const profile = await rpc("volunteer_profile_command", {
  p_actor: volunteer.id,
  p_command: {
    action: "claim",
    display_name: "Synthetic terms refresh volunteer",
    birth_date: "1990-01-01",
  },
});
await rpc("volunteer_profile_command", {
  p_actor: admin.id,
  p_command: {
    action: "verify",
    profile_id: profile.profile_id,
    expected_revision: profile.revision,
    tier: "regular",
    reason: "Synthetic browser terms regression",
  },
});
const oldTerms = crypto.randomUUID(),
  newTerms = crypto.randomUUID();
const rows = [
  {
    id: oldTerms,
    body: "Synthetic OLD terms " + marker,
    content_hash: crypto.randomUUID(),
    published_at: "2000-01-01T00:00:00Z",
    published_by: admin.id,
  },
  {
    id: newTerms,
    body: "Synthetic NEW terms " + marker,
    content_hash: crypto.randomUUID(),
    published_at: "2000-01-02T00:00:00Z",
    published_by: admin.id,
  },
];
const insert = spawnSync(
  "bun",
  [
    "-e",
    `import {SQL} from 'bun';if(process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES!=='1')throw new Error('Isolated fixtures required');const rows=JSON.parse(await Bun.stdin.text());const db=new SQL('postgresql://postgres:postgres@127.0.0.1:56322/postgres',{max:1,prepare:false});for(const r of rows)await db\`insert into public.volunteer_terms_version(id,body,content_hash,published_at,published_by)values(\${r.id}::uuid,\${r.body},\${r.content_hash},\${r.published_at}::timestamptz,\${r.published_by}::uuid)\`;await db.close();`,
  ],
  { input: JSON.stringify(rows), encoding: "utf8", windowsHide: true },
);
if (insert.status !== 0) throw new Error(insert.stderr);
const body = structuredClone(
  JSON.parse(await readFile(".local-policy-test/browser/policy-catalogue.json", "utf8"))[0],
);
body.template_key = marker;
body.name = "Synthetic terms refresh";
body.booking.auto_approve = true;
body.booking.individual_open = { mode: "unrestricted" };
body.terms.version_id = oldTerms;
const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
const pc = (command) => rpc("volunteer_policy_command", { p_actor: admin.id, p_command: command });
async function publish(revision, ids = []) {
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
  const preview = await pc({
    action: "preview",
    template_key: body.template_key,
    expected_revision: revision,
    effective_from: date + "T00:00:00Z",
    effective_until: null,
    activity_ids: ids,
  });
  assert.equal(preview.kind, "preview");
  assert.equal(
    (
      await pc({
        action: "publish",
        preview_id: preview.preview_id,
        idempotency_key: crypto.randomUUID(),
        reason: "Synthetic reviewed terms refresh",
      })
    ).kind,
    "published",
  );
}
await publish(1);
const generated = await pc({
  action: "generate",
  template_key: body.template_key,
  date,
  idempotency_key: crypto.randomUUID(),
});
assert.equal(generated.kind, "generated");
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 768, height: 1000 } });
  await context.addInitScript(
    (s) => localStorage.setItem("sb-127-auth-token", JSON.stringify(s)),
    volunteer.session,
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  let mutations = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/volunteer/policy") && r.method() === "POST") {
      const c = JSON.parse(r.postData()).command;
      if (["book", "accept_terms"].includes(c?.action)) mutations++;
    }
  });
  await page.goto(origin + "/volunteer", { waitUntil: "networkidle" });
  const region = page.getByRole("region", { name: "已核實義工場次" });
  await region.getByRole("combobox").first().selectOption(generated.activity_id);
  await page.getByText(rows[0].body, { exact: true }).waitFor();
  const checkbox = page.getByRole("checkbox", { name: "我已閱讀並同意以上義工條款" });
  assert.equal(await checkbox.isChecked(), false);
  await checkbox.check();
  assert.equal(await checkbox.isChecked(), true);
  report.checks.push("Fresh verified volunteer explicitly checked the displayed old terms");
  body.terms.version_id = newTerms;
  await publish(2, [generated.activity_id]);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByText(rows[1].body, { exact: true }).waitFor();
  assert.equal(await checkbox.isChecked(), false);
  assert.equal(
    await page.getByRole("button", { name: "提交報名／候補", exact: true }).isDisabled(),
    true,
  );
  assert.equal(mutations, 0);
  report.checks.push(
    "Admin policy publication changed selected session terms; focus refresh displayed new version and cleared consent; booking disabled",
  );
  for (const table of ["volunteer_registration", "volunteer_terms_acceptance"]) {
    const r = await db
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.profile_id);
    if (r.error) throw r.error;
    assert.equal(r.count, 0);
  }
  report.checks.push(
    "No booking or immutable terms acceptance was created by checking or refreshing",
  );
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await region.screenshot({ path: output + "/new-terms-unchecked-" + width + ".png" });
  }
  await checkbox.check();
  assert.equal(await checkbox.isChecked(), true);
  assert.equal(mutations, 0);
  report.checks.push(
    "New terms require a separate explicit checkbox action; test never submitted booking",
  );
  assert.deepEqual(report.errors, []);
  await writeFile(output + "/report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
