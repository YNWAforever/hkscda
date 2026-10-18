import { expect, test } from "bun:test";
import { createVolunteerTiming } from "./telemetry.server";
test("successful and rejected stages record bounded durations and never retain payloads", async () => {
  let now = 10;
  const timing = createVolunteerTiming(() => now);
  expect(
    await timing.measure("auth", async () => {
      now = 20;
      return "private";
    }),
  ).toBe("private");
  await expect(
    timing.measure("rpc", async () => {
      now = 17;
      throw new Error("private");
    }),
  ).rejects.toThrow("private");
  expect(timing.snapshot()).toEqual({ auth: 10, rpc: 0 });
  expect(JSON.stringify(timing.snapshot())).not.toContain("private");
});
