import { expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readEligibleAnimals } from "./eligibility.server";

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
  const query = {
    select: () => query,
    in: () => query,
    eq: () => query,
    is: async () => ({ data, error: null }),
  };
  const client = { from: () => query } as unknown as SupabaseClient;
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
