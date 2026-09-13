import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// See moneyPii.rls.test.ts for the rationale behind these fixed local demo
// keys and the env var overrides -- this file intentionally mirrors that
// setup rather than inventing a second convention.
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

const reachable = await isLocalStackReachable();
if (!reachable) warnSkipOnce();

let service: SupabaseClient;
let anon: SupabaseClient;
const seededAnimalIds: string[] = [];

// Covers the status and publication_state conjuncts of the public "animals"
// read policy -- the two axes this feature slice changed or depends on.
// retired_at and the (adoption_eligible or sponsorship_eligible) disjunction
// are deliberately not separately exercised here: per the design spec, this
// is "one small addition, not a general RLS audit of the animals table."
describe.skipIf(!reachable)("RLS behavioral matrix: public animal visibility", () => {
  beforeAll(() => {
    service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    anon = createClient(SUPABASE_URL, ANON_KEY);
  });

  afterAll(async () => {
    if (seededAnimalIds.length === 0) return;
    try {
      await service.from("animals").delete().in("id", seededAnimalIds);
    } catch (error) {
      console.error("Failed to clean up seeded RLS test animals", error);
    }
  });

  test("anon can read a fostered, published, eligible animal", async () => {
    const { data: fostered, error: insertError } = await service
      .from("animals")
      .insert({
        type: "cat",
        name: "RLS Foster Test Cat",
        gender: "female",
        age: "約 2 歲",
        status: "fostered",
        adoption_eligible: true,
        sponsorship_eligible: false,
        publication_state: "published",
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();
    seededAnimalIds.push(fostered!.id as string);

    const { data, error } = await anon
      .from("animals")
      .select("id")
      .eq("id", fostered!.id)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.id).toBe(fostered!.id);
  });

  test("anon cannot read an adopted animal, or one still in draft", async () => {
    const { data: adopted, error: adoptedError } = await service
      .from("animals")
      .insert({
        type: "cat",
        name: "RLS Adopted Test Cat",
        gender: "female",
        age: "約 3 歲",
        status: "adopted",
        adoption_eligible: true,
        sponsorship_eligible: false,
        publication_state: "published",
      })
      .select("id")
      .single();
    expect(adoptedError).toBeNull();
    seededAnimalIds.push(adopted!.id as string);

    const { data: draft, error: draftError } = await service
      .from("animals")
      .insert({
        type: "cat",
        name: "RLS Draft Test Cat",
        gender: "female",
        age: "約 1 歲",
        status: "fostered",
        adoption_eligible: true,
        sponsorship_eligible: false,
        publication_state: "draft",
      })
      .select("id")
      .single();
    expect(draftError).toBeNull();
    seededAnimalIds.push(draft!.id as string);

    const { data: adoptedRead, error: adoptedReadError } = await anon
      .from("animals")
      .select("id")
      .eq("id", adopted!.id)
      .maybeSingle();
    const { data: draftRead, error: draftReadError } = await anon
      .from("animals")
      .select("id")
      .eq("id", draft!.id)
      .maybeSingle();

    expect(adoptedReadError).toBeNull();
    expect(adoptedRead).toBeNull();
    expect(draftReadError).toBeNull();
    expect(draftRead).toBeNull();
  });
});
