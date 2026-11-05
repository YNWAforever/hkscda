import { describe, expect, test } from "bun:test";

import { offeredLegacyProfileId } from "./legacyReconciliationLogic";

const a = { id: "profile-a", display_name: "A", status: "active" };
const b = { id: "profile-b", display_name: "B", status: "active" };

describe("legacy reconciliation profile choice", () => {
  test("BUG-65: a profile chosen before the volunteer changed is never sent", () => {
    // Staff chose A, then picked B in the search: only B is offered now, so A must not link.
    expect(offeredLegacyProfileId("profile-a", [b])).toBe("");
    expect(offeredLegacyProfileId("profile-a", [])).toBe("");
  });

  test("the chosen profile is used while it is still offered and active", () => {
    expect(offeredLegacyProfileId("profile-a", [a])).toBe("profile-a");
    expect(offeredLegacyProfileId("profile-a", [{ ...a, status: "suspended" }])).toBe("");
    expect(offeredLegacyProfileId("", [a])).toBe("");
  });
});
