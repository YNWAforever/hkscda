import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { PUBLIC_INDIVIDUAL_MIN_AGE } from "../lib/volunteers/types";

describe("volunteer route copy", () => {
  test("shows the individual volunteer age floor and group enquiry link", () => {
    const source = readFileSync(new URL("./volunteer.tsx", import.meta.url), "utf8");

    expect(source).toContain("\u500b\u4eba\u7fa9\u5de5\u5831\u540d");
    expect(source).toContain("\u53ea\u63a5\u53d7");
    expect(source).toContain("PUBLIC_INDIVIDUAL_MIN_AGE");
    expect(source).toContain("\u6b72\u4ee5\u4e0a\u500b\u4eba\u7fa9\u5de5\u7533\u8acb");
    expect(source).toContain('href="/volunteer/group"');
  });
});
