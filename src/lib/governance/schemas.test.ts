// src/lib/governance/schemas.test.ts
import { describe, expect, test } from "bun:test";
import { boardMemberInputSchema, deactivateBoardMemberSchema } from "./schemas";

describe("boardMemberInputSchema", () => {
  test("accepts a valid new-member input and defaults sortOrder to 0", () => {
    const parsed = boardMemberInputSchema.parse({
      name: "陳大文",
      roleTitle: "主席",
      effectiveDate: "2026-08-01",
    });
    expect(parsed).toEqual({
      name: "陳大文",
      roleTitle: "主席",
      sortOrder: 0,
      effectiveDate: "2026-08-01",
    });
  });

  test("accepts an existing member's id for updates", () => {
    const parsed = boardMemberInputSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      name: "陳大文",
      roleTitle: "主席",
      sortOrder: 2,
      effectiveDate: "2026-08-01",
    });
    expect(parsed.id).toBe("11111111-1111-4111-8111-111111111111");
  });

  test("rejects an empty name", () => {
    expect(() =>
      boardMemberInputSchema.parse({ name: "", roleTitle: "主席", effectiveDate: "2026-08-01" }),
    ).toThrow();
  });

  test("rejects a malformed effectiveDate", () => {
    expect(() =>
      boardMemberInputSchema.parse({
        name: "陳大文",
        roleTitle: "主席",
        effectiveDate: "2026/08/01",
      }),
    ).toThrow();
  });

  test("rejects a calendar-invalid effectiveDate", () => {
    expect(() =>
      boardMemberInputSchema.parse({
        name: "陳大文",
        roleTitle: "主席",
        effectiveDate: "2026-02-30",
      }),
    ).toThrow();
  });

  test("rejects a negative sortOrder", () => {
    expect(() =>
      boardMemberInputSchema.parse({
        name: "陳大文",
        roleTitle: "主席",
        sortOrder: -1,
        effectiveDate: "2026-08-01",
      }),
    ).toThrow();
  });
});

describe("deactivateBoardMemberSchema", () => {
  test("accepts a valid uuid", () => {
    const parsed = deactivateBoardMemberSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
    });
    expect(parsed.id).toBe("11111111-1111-4111-8111-111111111111");
  });

  test("rejects a non-uuid id", () => {
    expect(() => deactivateBoardMemberSchema.parse({ id: "not-a-uuid" })).toThrow();
  });
});
