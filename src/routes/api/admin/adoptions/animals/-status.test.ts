import { describe, expect, test } from "bun:test";

import {
  buildAnimalStatusAuditEntry,
  buildAnimalStatusUpdatePayload,
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

describe("animal status audit entry", () => {
  const actorUserId = "22222222-2222-4222-8222-222222222222";

  function entry(animal: unknown = { id: animalId, status: "adopted" }) {
    const payload = buildAnimalStatusUpdatePayload(
      animalId,
      { status: "adopted" },
      () => new Date("2026-06-27T10:30:00.000Z"),
    );
    return buildAnimalStatusAuditEntry(actorUserId, payload, animal);
  }

  test("attributes the write to the admin who made it", () => {
    // This route updates public.animals over the service-role connection, where
    // auth.uid() is null — so log_animal_mutation() deliberately skips it. If
    // this row isn't written here, an admin status change leaves no trace at
    // all, in either the trigger path or the app layer.
    expect(entry()).toEqual({
      actor_user_id: actorUserId,
      action: "animals.status_update",
      entity: "animals",
      entity_id: animalId,
      timestamp: "2026-06-27T10:30:00.000Z",
      detail: { status: "adopted", animal: { id: animalId, status: "adopted" } },
    });
  });

  test("reuses the payload's update timestamp rather than reading the clock again", () => {
    // The audit row and the animals.updated_at column describe the same event.
    // Calling the clock a second time here would let them disagree, which is
    // exactly the drift that makes an audit trail hard to reconcile later.
    const payload = buildAnimalStatusUpdatePayload(
      animalId,
      { status: "fostered" },
      () => new Date("2026-01-02T03:04:05.000Z"),
    );
    expect(buildAnimalStatusAuditEntry(actorUserId, payload, null).timestamp).toBe(
      payload.updatedAt,
    );
  });
});
