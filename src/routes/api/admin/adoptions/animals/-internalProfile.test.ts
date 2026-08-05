import { describe, expect, test } from "bun:test";

import {
  buildInternalProfileUpsertPayload,
  buildInternalProfileUpsertRpcArgs,
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

describe("internal profile upsert RPC arguments", () => {
  const actorUserId = "44444444-4444-4444-8444-444444444444";

  test("attributes the write to the admin who made it", () => {
    // This route upserts animal_profile_internal over the service-role
    // connection, where auth.uid() is null — so log_animal_mutation() skips it.
    // Without the actor reaching the RPC, an admin edit to an animal's internal
    // record leaves no trace in either the trigger path or the app layer.
    const payload = buildInternalProfileUpsertPayload(animalId, fullProfile());

    expect(buildInternalProfileUpsertRpcArgs(actorUserId, payload)).toEqual({
      p_actor_user_id: actorUserId,
      p_animal_id: animalId,
      p_values: fullProfile(),
    });
  });

  test("keeps the animal id out of the values payload", () => {
    // The RPC takes the id as its own argument and writes it itself. Leaving a
    // second copy inside p_values would let a caller upsert one animal's profile
    // under another animal's id.
    const payload = buildInternalProfileUpsertPayload(animalId, fullProfile());
    const { p_values: values } = buildInternalProfileUpsertRpcArgs(actorUserId, payload);

    expect(Object.keys(values)).not.toContain("animal_id");
  });
});
