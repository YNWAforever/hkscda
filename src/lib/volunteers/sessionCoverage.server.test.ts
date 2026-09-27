import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { initialPolicyCatalogue } from "./policy/catalogue";
import { readVolunteerCoverage } from "./sessionCoverage.server";

function clientWith(
  versions: { data: unknown[]; count: number; error: null | Error },
  activities: { data: unknown[]; count: number; error: null | Error },
) {
  const reads: string[] = [];
  const client = {
    from(table: string) {
      reads.push(table);
      const result = table === "volunteer_policy_version" ? versions : activities;
      const query = {
        select: () => query,
        order: () => query,
        gte: () => query,
        lt: () => query,
        range: async () => result,
      };
      return query;
    },
  };
  return { client: client as unknown as SupabaseClient, reads };
}

describe("staff volunteer coverage read", () => {
  test("maps approved policy and actual activities with bounded reads", async () => {
    const body = structuredClone(initialPolicyCatalogue[0]);
    body.template_key = "audit_coverage_cat";
    body.schedule.weekdays = [2];
    body.schedule.excluded_dates = [];
    body.schedule.enabled = true;
    body.schedule.start_time = "09:30";
    const { client, reads } = clientWith(
      {
        data: [
          {
            id: "policy-cat",
            template_key: body.template_key,
            body,
            effective_from: "2026-09-26T00:00:00+08:00",
            effective_until: null,
            created_at: "2026-09-26T00:00:00+08:00",
          },
        ],
        count: 1,
        error: null,
      },
      {
        data: [
          {
            id: "activity-cat",
            template_key: body.template_key,
            shelter_key: body.shelter,
            starts_at: "2026-09-29T09:30:00+08:00",
            status: "published",
            policy_version_id: "policy-cat",
          },
        ],
        count: 1,
        error: null,
      },
    );
    const result = await readVolunteerCoverage(client, {
      from: "2026-09-27",
      centre: body.shelter,
      now: new Date("2026-09-27T01:00:00Z"),
    });
    expect(reads).toEqual(["volunteer_policy_version", "volunteer_activity"]);
    expect(result.centres).toContain(body.shelter);
    expect(result.next14).toMatchObject({
      scheduledSlots: 2,
      publishedSlots: 1,
      missingSlots: 1,
      nextApprovedAt: "2026-09-29T09:30:00+08:00",
    });
    expect(result.next30.scheduledSlots).toBe(4);
  });

  test("refuses a truncated read rather than reporting false zero coverage", async () => {
    const { client } = clientWith(
      { data: [], count: 501, error: null },
      { data: [], count: 0, error: null },
    );
    expect(
      readVolunteerCoverage(client, {
        from: "2026-09-27",
        centre: "all",
        now: new Date("2026-09-27T01:00:00Z"),
      }),
    ).rejects.toThrow("coverage_read_truncated");
  });
});
