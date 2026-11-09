import { describe, expect, test } from "bun:test";

import { assertCanMutateStatus, normalizeStatusKey } from "./status";
import type { CoordinatorStatus } from "./types";

function status(overrides: Partial<CoordinatorStatus> = {}): CoordinatorStatus {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    category: "adoption_case",
    key: "new",
    labelZh: "新申請",
    labelEn: "New",
    sortOrder: 10,
    color: "blue",
    isActive: true,
    isSystem: true,
    isClosing: false,
    isFinal: false,
    ...overrides,
  };
}

describe("coordinator status helpers", () => {
  test("normalizes staff-entered keys", () => {
    expect(normalizeStatusKey(" Home Visit ")).toBe("home_visit");
    expect(normalizeStatusKey("已 批准")).toBe("");
  });

  test("prevents deleting system statuses", () => {
    expect(() => assertCanMutateStatus(status(), { delete: true })).toThrow(
      "System statuses cannot be deleted",
    );
  });

  test("prevents changing system status keys", () => {
    expect(() => assertCanMutateStatus(status(), { nextKey: "fresh" })).toThrow(
      "System status keys cannot be changed",
    );
  });

  test("prevents changing system status categories", () => {
    expect(() => assertCanMutateStatus(status(), { nextCategory: "match" })).toThrow(
      "System status categories cannot be changed",
    );
  });

  test("allows relabeling system statuses", () => {
    expect(() => assertCanMutateStatus(status(), { nextLabelZh: "新個案" })).not.toThrow();
  });

  test("prevents changing a system status's semantic flags", () => {
    // OPS-02: the seeded flags are load-bearing — turning off `active` on the match status
    // `approved` blocks finalisation, and clearing `closing` on `rejected` leaves a rejected
    // case open. They are part of the system identity.
    for (const change of [
      { nextIsActive: false },
      { nextIsClosing: true },
      { nextIsFinal: true },
    ] as const) {
      expect(() => assertCanMutateStatus(status(), change)).toThrow(
        "System status flags cannot be changed",
      );
    }
  });

  test("allows a system status update that keeps its flags and changes only presentation", () => {
    expect(() =>
      assertCanMutateStatus(status(), {
        nextIsActive: true,
        nextIsClosing: false,
        nextIsFinal: false,
        nextLabelEn: "New application",
        nextKey: "new",
      }),
    ).not.toThrow();
  });

  test("still allows a non-system status to set its semantic flags", () => {
    expect(() =>
      assertCanMutateStatus(status({ isSystem: false }), {
        nextIsActive: false,
        nextIsClosing: true,
        nextIsFinal: true,
      }),
    ).not.toThrow();
  });
});
