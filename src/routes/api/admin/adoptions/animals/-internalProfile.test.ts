import { describe, expect, test } from "bun:test";

import {
  buildInternalProfileAuditEntry,
  buildInternalProfileUpsertPayload,
  parseAnimalProfileUuid,
} from "./-internalProfile";

const animalId = "11111111-1111-4111-8111-111111111111";
const sourceId = "22222222-2222-4222-8222-222222222222";
const positionId = "33333333-3333-4333-8333-333333333333";

function fullProfile(overrides: Record<string, unknown> = {}) {
  return {
    internal_code: "CAT-204",
    arrival_date: "2026-06-15",
    arrival_source_id: null,
    current_position_id: positionId,
    cage: "A-12",
    has_chip: false,
    chip_remarks: null,
    is_desexed: true,
    desexed_at: null,
    desex_remarks: null,
    is_adoptable: true,
    is_inside_support_pool: false,
    adopted_at: null,
    deceased_at: null,
    internal_remarks: null,
    ...overrides,
  };
}

describe("internal animal profile payload", () => {
  test("trims strings, converts blanks to null, and preserves booleans", () => {
    expect(
      buildInternalProfileUpsertPayload(
        animalId,
        fullProfile({
          internal_code: "  CAT-204  ",
          arrival_date: "2026-06-15",
          arrival_source_id: " ",
          current_position_id: positionId,
          cage: "",
          has_chip: false,
          chip_remarks: "  no scan record  ",
          is_desexed: true,
          desexed_at: "",
          desex_remarks: "  completed at partner clinic  ",
          is_adoptable: false,
          is_inside_support_pool: true,
          adopted_at: null,
          deceased_at: " ",
          internal_remarks: "  monitor diet  ",
        }),
      ),
    ).toEqual({
      animal_id: animalId,
      internal_code: "CAT-204",
      arrival_date: "2026-06-15",
      arrival_source_id: null,
      current_position_id: positionId,
      cage: null,
      has_chip: false,
      chip_remarks: "no scan record",
      is_desexed: true,
      desexed_at: null,
      desex_remarks: "completed at partner clinic",
      is_adoptable: false,
      is_inside_support_pool: true,
      adopted_at: null,
      deceased_at: null,
      internal_remarks: "monitor diet",
    });
  });

  test("rejects partial bodies instead of wiping existing fields", () => {
    expect(() => buildInternalProfileUpsertPayload(animalId, { cage: "A-12" })).toThrow();
  });

  test("rejects invalid UUID values and invalid dates", () => {
    expect(() => parseAnimalProfileUuid("not-a-uuid", "id")).toThrow("Invalid id");
    expect(() =>
      buildInternalProfileUpsertPayload(
        animalId,
        fullProfile({
          arrival_source_id: sourceId.replace("2", "x"),
        }),
      ),
    ).toThrow();
    expect(() =>
      buildInternalProfileUpsertPayload(
        animalId,
        fullProfile({
          arrival_date: "2026-02-31",
        }),
      ),
    ).toThrow();
  });
});

describe("internal profile audit entry", () => {
  const actorUserId = "44444444-4444-4444-8444-444444444444";

  test("attributes the write to the admin who made it", () => {
    // This route upserts animal_profile_internal over the service-role
    // connection, where auth.uid() is null — so log_animal_mutation() skips it.
    // Without this row an admin edit to an animal's internal record leaves no
    // trace in either the trigger path or the app layer.
    const payload = buildInternalProfileUpsertPayload(animalId, fullProfile());
    const profile = { animal_id: animalId, internal_code: "CAT-204" };

    expect(
      buildInternalProfileAuditEntry(
        actorUserId,
        payload,
        profile,
        () => new Date("2026-06-27T10:30:00.000Z"),
      ),
    ).toEqual({
      actor_user_id: actorUserId,
      action: "animal_profile_internal.upsert",
      entity: "animal_profile_internal",
      entity_id: animalId,
      timestamp: "2026-06-27T10:30:00.000Z",
      detail: { profile },
    });
  });

  test("takes its timestamp from the injected clock, not the wall clock", () => {
    // The whole point of injecting the clock: a test that pins the timestamp
    // can't rot on a future calendar date the way an inline new Date() would.
    const payload = buildInternalProfileUpsertPayload(animalId, fullProfile());

    expect(
      buildInternalProfileAuditEntry(
        actorUserId,
        payload,
        null,
        () => new Date("2020-01-02T03:04:05.000Z"),
      ).timestamp,
    ).toBe("2020-01-02T03:04:05.000Z");
  });
});
