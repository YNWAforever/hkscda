import { describe, expect, test } from "bun:test";

import { buildAnimalStatusUpdatePayload, parseAnimalStatusUuid } from "./-status";

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
