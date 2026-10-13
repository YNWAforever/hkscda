import { expect, test } from "bun:test";
import { parseVolunteerJobActorId } from "./config";

for (const raw of [undefined, "", "  ", "not-a-uuid", "private@example.invalid"]) {
  test(`rejects invalid actor configuration without exposing the input (${raw?.length ?? 0})`, () => {
    let error: unknown;
    try {
      parseVolunteerJobActorId(raw);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      code: !raw?.trim() ? "VOLUNTEER_JOB_ACTOR_UNCONFIGURED" : "VOLUNTEER_JOB_ACTOR_INVALID",
    });
    if (raw?.trim()) expect(JSON.stringify(error)).not.toContain(raw);
  });
}
test("accepts a UUID actor", () => {
  expect(parseVolunteerJobActorId("90000000-0000-4000-8000-000000000001")).toBe(
    "90000000-0000-4000-8000-000000000001",
  );
});
