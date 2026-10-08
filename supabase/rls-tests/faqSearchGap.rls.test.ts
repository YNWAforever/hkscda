import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// See moneyPii.rls.test.ts for the rationale behind these fixed local demo
// keys and the env var overrides -- this file intentionally mirrors that
// setup (as sponsorshipAssignment.rls.test.ts does) rather than inventing a
// second convention.
const SUPABASE_URL = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:55321";
const ANON_KEY =
  process.env.SUPABASE_LOCAL_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function isLocalStackReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: ANON_KEY },
      // See moneyPii.rls.test.ts for why this timeout is generous rather than
      // tight.
      signal: AbortSignal.timeout(5000),
    });
    return res.status > 0;
  } catch {
    return false;
  }
}

let warnedSkip = false;
function warnSkipOnce() {
  if (warnedSkip) return;
  warnedSkip = true;
  console.log(
    "Skipping RLS behavioral tests: local Supabase stack not reachable at " +
      SUPABASE_URL +
      ". Run `bunx supabase start` first, then `bun run test:rls` (not plain `bun test`).",
  );
}

// Top-level await: Bun evaluates a test file's module body before registering
// its describe/test blocks, so describe.skipIf gets a resolved check.
const reachable = await isLocalStackReachable();
if (!reachable) warnSkipOnce();

// Every topic this file writes starts with this prefix, so afterAll can delete
// exactly its own rows and the assertions can ignore whatever else the shared
// local table holds.
const TOPIC_PREFIX = `rls-faq-gap-${crypto.randomUUID().slice(0, 8)}`;

const AUTHENTICATED_EMAIL = "rls-test-faq-gap-authenticated@example.test";
const AUTHENTICATED_PASSWORD = "test-password-12345";

// The 22023 raised by list_faq_search_gaps for an out-of-range argument.
const INVALID_PARAMETER_VALUE = "22023";
// PostgREST's code for a role that lacks the table or function privilege.
const INSUFFICIENT_PRIVILEGE = "42501";
// Some PostgREST versions leave a function the role cannot execute out of the
// schema cache, so a denied RPC answers "function not found" instead.
const FUNCTION_NOT_FOUND = "PGRST202";

function expectRpcDenied(error: { code?: string } | null) {
  expect(error).not.toBeNull();
  expect([INSUFFICIENT_PRIVILEGE, FUNCTION_NOT_FOUND]).toContain(error?.code ?? "");
}

// Same day arithmetic as the database: calendar days in Hong Kong time.
function hkDay(daysAgo = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

type GapRow = {
  topic: string;
  language: string;
  confidence: string;
  search_count: number | string;
  last_seen_day: string;
};

let service: SupabaseClient | undefined;
let anon: SupabaseClient;
let authenticated: SupabaseClient;
let authenticatedUserId: string | undefined;

function svc(): SupabaseClient {
  if (!service) throw new Error("service client was not created");
  return service;
}

async function seed(
  rows: Array<{
    topic: string;
    day: string;
    search_count?: number;
    language?: "zh-HK" | "en";
    confidence?: "none" | "low";
  }>,
) {
  const { error } = await svc()
    .from("faq_search_gap")
    .insert(rows.map((row) => ({ language: "en", confidence: "none", ...row })));
  if (error) throw new Error(`Failed to seed faq_search_gap: ${error.message}`);
}

// Only this file's rows, in the database's own order. list_faq_search_gaps
// caps at 500 rows; a fresh stack holds far fewer than that.
async function listOurs(days = 30): Promise<GapRow[]> {
  const { data, error } = await svc().rpc("list_faq_search_gaps", { p_days: days, p_limit: 500 });
  if (error) throw new Error(`list_faq_search_gaps failed: ${error.message}`);
  return (data as GapRow[]).filter((row) => row.topic.startsWith(TOPIC_PREFIX));
}

describe.skipIf(!reachable)("RLS behavioral matrix: faq_search_gap", () => {
  beforeAll(async () => {
    // Assigned before anything that can throw, so afterAll can always reach it.
    const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    service = serviceClient;
    anon = createClient(SUPABASE_URL, ANON_KEY);

    let { data, error } = await serviceClient.auth.admin.createUser({
      email: AUTHENTICATED_EMAIL,
      password: AUTHENTICATED_PASSWORD,
      email_confirm: true,
    });
    // Self-heal a collision left by a previous interrupted run -- see
    // moneyPii.rls.test.ts's createRoleUser. Only ever touches this suite's own
    // `rls-test-*@example.test` address, on the loopback stack.
    if (error && /already.*registered/i.test(error.message)) {
      const { data: existing } = await serviceClient.auth.admin.listUsers();
      const stale = existing?.users.find((user) => user.email === AUTHENTICATED_EMAIL);
      if (stale) await serviceClient.auth.admin.deleteUser(stale.id);
      ({ data, error } = await serviceClient.auth.admin.createUser({
        email: AUTHENTICATED_EMAIL,
        password: AUTHENTICATED_PASSWORD,
        email_confirm: true,
      }));
    }
    if (error || !data.user) {
      throw new Error(`Failed to create test user ${AUTHENTICATED_EMAIL}: ${error?.message}`);
    }
    authenticatedUserId = data.user.id;

    authenticated = createClient(SUPABASE_URL, ANON_KEY);
    const { error: signInError } = await authenticated.auth.signInWithPassword({
      email: AUTHENTICATED_EMAIL,
      password: AUTHENTICATED_PASSWORD,
    });
    if (signInError) {
      throw new Error(`Failed to sign in test user ${AUTHENTICATED_EMAIL}: ${signInError.message}`);
    }
    // Creates an auth user over HTTP and signs it in -- see moneyPii.rls.test.ts
    // for why the budget is raised well above bun:test's 5s default.
  }, 60_000);

  afterAll(async () => {
    if (!service) return;
    // Each cleanup step is isolated so one failure cannot leak the other.
    try {
      await service.from("faq_search_gap").delete().like("topic", `${TOPIC_PREFIX}%`);
    } catch (err) {
      console.error(`Failed to clean up faq_search_gap rows for ${TOPIC_PREFIX}:`, err);
    }
    if (authenticatedUserId) {
      try {
        await service.auth.admin.deleteUser(authenticatedUserId);
      } catch (err) {
        console.error(`Failed to clean up auth user ${authenticatedUserId}:`, err);
      }
    }
  });

  describe("client access is denied", () => {
    const roles = [
      ["anon", () => anon],
      ["authenticated", () => authenticated],
    ] as const;

    // A real row exists so a misconfigured grant could not pass vacuously by
    // reading an empty table.
    test.each(roles)("%s can neither select nor insert on the table", async (name, client) => {
      await seed([{ topic: `${TOPIC_PREFIX}-denied-seed-${name}`, day: hkDay() }]);

      const read = await client().from("faq_search_gap").select("topic");
      expect(read.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

      const write = await client()
        .from("faq_search_gap")
        .insert({
          topic: `${TOPIC_PREFIX}-denied-insert-${name}`,
          day: hkDay(),
          language: "en",
          confidence: "none",
        });
      expect(write.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    });

    test.each(roles)("%s cannot call the record, list or purge RPCs", async (name, client) => {
      const record = await client().rpc("record_faq_search_gap", {
        p_topic: `${TOPIC_PREFIX}-denied-rpc-${name}`,
        p_language: "en",
        p_confidence: "none",
      });
      expectRpcDenied(record.error);

      const list = await client().rpc("list_faq_search_gaps", { p_days: 30, p_limit: 10 });
      expectRpcDenied(list.error);

      const purge = await client().rpc("purge_faq_search_gaps");
      expectRpcDenied(purge.error);

      // Nothing slipped through the denied record call.
      expect(
        (await listOurs()).some((row) => row.topic === `${TOPIC_PREFIX}-denied-rpc-${name}`),
      ).toBe(false);
    });
  });

  describe("record", () => {
    test("recording one topic twice keeps a single row with a count of 2", async () => {
      const topic = `${TOPIC_PREFIX}-twice`;
      for (let i = 0; i < 2; i++) {
        const { error } = await svc().rpc("record_faq_search_gap", {
          p_topic: topic,
          p_language: "en",
          p_confidence: "none",
        });
        expect(error).toBeNull();
      }

      const { data, error } = await svc()
        .from("faq_search_gap")
        .select("day, search_count")
        .eq("topic", topic);
      expect(error).toBeNull();
      expect(data).toEqual([{ day: hkDay(), search_count: 2 }]);
    });

    test("the same topic in different language/confidence buckets is listed separately", async () => {
      const topic = `${TOPIC_PREFIX}-buckets`;
      for (const [language, confidence] of [
        ["zh-HK", "none"],
        ["en", "none"],
        ["en", "low"],
      ] as const) {
        const { error } = await svc().rpc("record_faq_search_gap", {
          p_topic: topic,
          p_language: language,
          p_confidence: confidence,
        });
        expect(error).toBeNull();
      }

      const rows = (await listOurs()).filter((row) => row.topic === topic);
      expect(
        rows.map((row) => `${row.language}/${row.confidence}/${Number(row.search_count)}`).sort(),
      ).toEqual(["en/low/1", "en/none/1", "zh-HK/none/1"]);
    });
  });

  describe("purge", () => {
    test("deletes rows older than 90 Hong Kong days and keeps the 90th", async () => {
      const oldTopic = `${TOPIC_PREFIX}-purge-91`;
      const keptTopic = `${TOPIC_PREFIX}-purge-90`;
      await seed([
        { topic: oldTopic, day: hkDay(91) },
        { topic: keptTopic, day: hkDay(90) },
      ]);

      const { data, error } = await svc().rpc("purge_faq_search_gaps");
      expect(error).toBeNull();
      expect(Number(data)).toBeGreaterThanOrEqual(1);

      const { data: remaining } = await svc()
        .from("faq_search_gap")
        .select("topic")
        .like("topic", `${TOPIC_PREFIX}-purge-%`);
      expect(remaining).toEqual([{ topic: keptTopic }]);
    });
  });

  describe("list", () => {
    test("sums today and the 29th day back, but not the 30th", async () => {
      const topic = `${TOPIC_PREFIX}-window`;
      await seed([
        { topic, day: hkDay(), search_count: 2 },
        { topic, day: hkDay(29), search_count: 3 },
        { topic, day: hkDay(30), search_count: 100 },
      ]);

      const rows = (await listOurs(30)).filter((row) => row.topic === topic);
      expect(rows).toHaveLength(1);
      expect(Number(rows[0]?.search_count)).toBe(5);
      expect(rows[0]?.last_seen_day).toBe(hkDay());
    });

    test("orders by total descending", async () => {
      await seed([
        { topic: `${TOPIC_PREFIX}-order-mid`, day: hkDay(), search_count: 5 },
        { topic: `${TOPIC_PREFIX}-order-top`, day: hkDay(), search_count: 9 },
        { topic: `${TOPIC_PREFIX}-order-low`, day: hkDay(), search_count: 1 },
      ]);

      const topics = (await listOurs())
        .filter((row) => row.topic.startsWith(`${TOPIC_PREFIX}-order-`))
        .map((row) => row.topic);
      expect(topics).toEqual([
        `${TOPIC_PREFIX}-order-top`,
        `${TOPIC_PREFIX}-order-mid`,
        `${TOPIC_PREFIX}-order-low`,
      ]);
    });

    test("breaks ties by most recent day, then by topic", async () => {
      await seed([
        { topic: `${TOPIC_PREFIX}-tie-b-old`, day: hkDay(3), search_count: 4 },
        { topic: `${TOPIC_PREFIX}-tie-b-new`, day: hkDay(), search_count: 4 },
        { topic: `${TOPIC_PREFIX}-tie-a-new`, day: hkDay(), search_count: 4 },
      ]);

      const topics = (await listOurs())
        .filter((row) => row.topic.startsWith(`${TOPIC_PREFIX}-tie-`))
        .map((row) => row.topic);
      expect(topics).toEqual([
        `${TOPIC_PREFIX}-tie-a-new`,
        `${TOPIC_PREFIX}-tie-b-new`,
        `${TOPIC_PREFIX}-tie-b-old`,
      ]);
    });

    // The same topic and total in several buckets must come back in one fixed
    // order, so the report cannot reshuffle between refreshes.
    test("breaks the last ties by language, then confidence, in text order", async () => {
      const topic = `${TOPIC_PREFIX}-sort-buckets`;
      await seed([
        { topic, day: hkDay(), search_count: 2, language: "zh-HK", confidence: "none" },
        { topic, day: hkDay(), search_count: 2, language: "en", confidence: "none" },
        { topic, day: hkDay(), search_count: 2, language: "en", confidence: "low" },
      ]);

      const buckets = (await listOurs())
        .filter((row) => row.topic === topic)
        .map((row) => `${row.language}/${row.confidence}`);
      expect(buckets).toEqual(["en/low", "en/none", "zh-HK/none"]);
    });

    test.each([
      { p_days: 0, p_limit: 1 },
      { p_days: 91, p_limit: 1 },
      { p_days: 1, p_limit: 0 },
      { p_days: 1, p_limit: 501 },
    ])("rejects out-of-range arguments %j", async (args) => {
      const { error } = await svc().rpc("list_faq_search_gaps", args);
      expect(error?.code).toBe(INVALID_PARAMETER_VALUE);
    });
  });
});
