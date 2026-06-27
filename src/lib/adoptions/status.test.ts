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
});
