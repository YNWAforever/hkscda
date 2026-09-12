import { expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readEligibleAnimals } from "./eligibility.server";

// Only simulates filtering on `status` -- `id`, the eligibility booleans, and
// `retired_at` are intentionally pass-through, since those are exercised via
// isPublicAnimalMember downstream, not at this fake's query layer.
function createEligibilityFakeClient(data: Record<string, unknown>[]) {
  let filtered = data;
  const query = {
    select: () => query,
    in: (column: string, values: readonly string[]) => {
      if (column === "status") {
        filtered = filtered.filter((row) => values.includes(row.status as string));
      }
      return query;
    },
    eq: (column: string, value: unknown) => {
      if (column === "status") filtered = filtered.filter((row) => row.status === value);
      return query;
    },
    is: async () => ({ data: filtered, error: null }),
  };
  return { from: () => query } as unknown as SupabaseClient;
}

test("submission eligibility rejects retired and wrong membership even from a stale read", async () => {
  const data = [
    {
      id: "both",
      type: "cat",
      status: "available",
      adoption_eligible: true,
      sponsorship_eligible: true,
    },
    {
      id: "sponsor",
      type: "dog",
      status: "available",
      adoption_eligible: false,
      sponsorship_eligible: true,
    },
    {
      id: "retired",
      type: "cat",
      status: "available",
      adoption_eligible: true,
      sponsorship_eligible: true,
      retired_at: "2026-09-07",
    },
    {
      id: "adopted",
      type: "cat",
      status: "adopted",
      adoption_eligible: true,
      sponsorship_eligible: true,
    },
  ];
  const client = createEligibilityFakeClient(data);
  expect(
    (
      await readEligibleAnimals(
        client,
        data.map((a) => a.id),
        "adoption",
      )
    ).map((a) => a.id),
  ).toEqual(["both"]);
  expect(
    (
      await readEligibleAnimals(
        client,
        data.map((a) => a.id),
        "sponsorship",
      )
    ).map((a) => a.id),
  ).toEqual(["both", "sponsor"]);
});

test("asks the database for fostered animals alongside available ones", async () => {
  const data = [
    {
      id: "shelter",
      type: "cat",
      status: "available",
      adoption_eligible: true,
      sponsorship_eligible: true,
    },
    {
      id: "foster",
      type: "cat",
      status: "fostered",
      adoption_eligible: true,
      sponsorship_eligible: true,
    },
    {
      id: "gone",
      type: "cat",
      status: "adopted",
      adoption_eligible: true,
      sponsorship_eligible: true,
    },
  ];
  const client = createEligibilityFakeClient(data);

  expect(
    (
      await readEligibleAnimals(
        client,
        data.map((a) => a.id),
        "adoption",
      )
    )
      .map((a) => a.id)
      .sort(),
  ).toEqual(["foster", "shelter"]);
});

test("asks the database for fostered animals for sponsorship intent too", async () => {
  const data = [
    {
      id: "foster-sponsor",
      type: "dog",
      status: "fostered",
      adoption_eligible: true,
      sponsorship_eligible: true,
    },
  ];
  const client = createEligibilityFakeClient(data);

  expect(
    (
      await readEligibleAnimals(
        client,
        data.map((a) => a.id),
        "sponsorship",
      )
    ).map((a) => a.id),
  ).toEqual(["foster-sponsor"]);
});
