import { describe, expect, test } from "bun:test";

import { caseSearchSchema, statusInputSchema } from "./schemas";

describe("adoption coordinator schemas", () => {
  test("normalizes case search defaults", () => {
    expect(caseSearchSchema.parse({ q: " Ada ", page: "0", pageSize: "500" })).toEqual({
      q: "Ada",
      animalType: undefined,
      openOnly: false,
      page: 1,
      pageSize: 25,
    });
  });

  test("parses open-only search filters safely", () => {
    expect(caseSearchSchema.parse({ openOnly: "false" }).openOnly).toBe(false);
    expect(caseSearchSchema.parse({ openOnly: "0" }).openOnly).toBe(false);
    expect(caseSearchSchema.parse({ openOnly: "true" }).openOnly).toBe(true);
    expect(caseSearchSchema.parse({ openOnly: "1" }).openOnly).toBe(true);
  });

  test("rejects invalid status keys", () => {
    expect(() =>
      statusInputSchema.parse({
        category: "adoption_case",
        key: "已批准",
        labelZh: "已批准",
        labelEn: "Approved",
      }),
    ).toThrow();
  });
});
