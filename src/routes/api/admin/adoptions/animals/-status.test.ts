import { describe, expect, test } from "bun:test";

import {
  buildAnimalStatusUpdatePayload,
  buildAnimalStatusUpdateRpcArgs,
  parseAnimalStatusUuid,
} from "./-status";

const animalId = "11111111-1111-4111-8111-111111111111";

describe("animal status update payload", () => {
  test("accepts supported lifecycle statuses and stamps the update time", () => {
    expect(
      buildAnimalStatusUpdatePayload(
        animalId,
        { status: "fostered" },
        () => new Date("2026-06-27T10:30:00.000Z"),
      ),
    ).toEqual({
      animalId,
      status: "fostered",
      updatedAt: "2026-06-27T10:30:00.000Z",
    });
  });

  test("rejects invalid animal ids before status updates", () => {
    expect(() => parseAnimalStatusUuid("not-a-uuid", "id")).toThrow("Invalid id");
  });

  test("rejects lifecycle statuses outside the current animals constraint", () => {
    expect(() => buildAnimalStatusUpdatePayload(animalId, { status: "reserved" })).toThrow();
  });
});

describe("animal status update RPC arguments", () => {
  const actorUserId = "22222222-2222-4222-8222-222222222222";

  test("attributes the write to the admin who made it", () => {
    // This route updates public.animals over the service-role connection, where
    // auth.uid() is null — so log_animal_mutation() deliberately skips it. The
    // actor has to travel to the RPC explicitly or the change leaves no trace at
    // all, in either the trigger path or the app layer.
    const payload = buildAnimalStatusUpdatePayload(
      animalId,
      { status: "adopted" },
      () => new Date("2026-06-27T10:30:00.000Z"),
    );

    expect(buildAnimalStatusUpdateRpcArgs(actorUserId, payload)).toEqual({
      p_actor_user_id: actorUserId,
      p_animal_id: animalId,
      p_status: "adopted",
      p_updated_at: "2026-06-27T10:30:00.000Z",
    });
  });

  test("reuses the payload's update timestamp rather than reading the clock again", () => {
    // The audit row and the animals.updated_at column describe the same event.
    // Calling the clock a second time would let them disagree, which is exactly
    // the drift that makes an audit trail hard to reconcile later.
    const payload = buildAnimalStatusUpdatePayload(
      animalId,
      { status: "fostered" },
      () => new Date("2026-01-02T03:04:05.000Z"),
    );
    expect(buildAnimalStatusUpdateRpcArgs(actorUserId, payload).p_updated_at).toBe(
      payload.updatedAt,
    );
  });
});
