import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("admin group enquiries route", () => {
  test("renders the group enquiry management view inside volunteer admin", () => {
    const source = readFileSync(new URL("./group-enquiries.tsx", import.meta.url), "utf8");
    expect(source).toContain("/admin/volunteers/group-enquiries");
    expect(source).toContain("GroupEnquiryManagement");
    expect(source).toContain('activeSection="volunteers"');
  });
});
