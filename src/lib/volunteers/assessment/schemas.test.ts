import { describe, expect, test } from "bun:test";
import { assessmentCommandSchema } from "./schemas";
import { initialMonthlyPolicy } from "../policy/catalogue";
describe("monthly assessment commands", () => {
  test("rejects unresolved catalogue policy for publish only at DB readiness boundary but accepts typed save", () => {
    expect(
      assessmentCommandSchema.parse({
        kind: "save",
        body: initialMonthlyPolicy,
        expected_revision: 0,
      }).kind,
    ).toBe("save");
  });
  test("requires a month start run scope", () => {
    expect(() =>
      assessmentCommandSchema.parse({
        kind: "run",
        period_start: "2026-08",
        scope_key: "combined",
      }),
    ).toThrow();
  });
});
