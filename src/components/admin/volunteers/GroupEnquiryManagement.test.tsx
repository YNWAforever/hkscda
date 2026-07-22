import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("GroupEnquiryManagement", () => {
  test("contains filters, detail, status, notes, and retry notification actions", () => {
    const source = readFileSync(new URL("./GroupEnquiryManagement.tsx", import.meta.url), "utf8");
    expect(source).toContain("團體查詢");
    expect(source).toContain("/api/admin/volunteers/group-enquiries");
    expect(source).toContain("notificationStatus");
    expect(source).toContain("retryNotification");
    expect(source).toContain("adminNotes");
    expect(source).toContain("resolved");
    expect(source).toContain("failed");
  });
});
