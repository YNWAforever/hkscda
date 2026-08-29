import { describe, expect, test } from "bun:test";
import { toInput } from "./GovernanceManagement";

describe("toInput", () => {
  test("omits id for a new-member draft", () => {
    expect(
      toInput({ name: "陳大文", roleTitle: "主席", sortOrder: 0, effectiveDate: "2026-08-01" }),
    ).toEqual({ name: "陳大文", roleTitle: "主席", sortOrder: 0, effectiveDate: "2026-08-01" });
  });

  test("includes id when editing an existing member", () => {
    expect(
      toInput({
        id: "11111111-1111-4111-8111-111111111111",
        name: "陳大文",
        roleTitle: "主席",
        sortOrder: 0,
        effectiveDate: "2026-08-01",
      }),
    ).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      name: "陳大文",
      roleTitle: "主席",
      sortOrder: 0,
      effectiveDate: "2026-08-01",
    });
  });
});
