import { describe, expect, test } from "bun:test";
import { isPubliclyEligibleContent, publicContentState } from "./publicationEligibility";

const now = new Date("2026-09-27T12:00:00.000Z");
const base = {
  status: "published",
  type: "rescue_story",
  contentClass: "unreviewed",
  effectiveFrom: null,
  effectiveUntil: null,
} as const;

describe("content publication eligibility", () => {
  test("explicit demos and drafts cannot enter any public reader", () => {
    expect(isPubliclyEligibleContent({ ...base, contentClass: "demo" }, now)).toBe(false);
    expect(isPubliclyEligibleContent({ ...base, status: "draft" }, now)).toBe(false);
  });

  test("unreviewed historical content remains readable pending human review", () => {
    expect(isPubliclyEligibleContent(base, now)).toBe(true);
  });

  test("future content and expired promotions are excluded at exact UTC boundaries", () => {
    expect(
      isPubliclyEligibleContent({ ...base, effectiveFrom: "2026-09-27T12:00:01.000Z" }, now),
    ).toBe(false);
    expect(isPubliclyEligibleContent({ ...base, effectiveFrom: now.toISOString() }, now)).toBe(
      true,
    );
    expect(
      isPubliclyEligibleContent({ ...base, effectiveUntil: "2026-09-27T11:59:59.000Z" }, now),
    ).toBe(false);
    expect(isPubliclyEligibleContent({ ...base, effectiveUntil: now.toISOString() }, now)).toBe(
      true,
    );
  });

  test("expired real articles stay reachable in the archive, never promoted", () => {
    const expired = {
      ...base,
      contentClass: "verified",
      effectiveUntil: "2026-09-26T00:00:00.000Z",
    } as const;
    expect(isPubliclyEligibleContent(expired, now)).toBe(false);
    expect(isPubliclyEligibleContent(expired, now, "detail")).toBe(true);
  });

  test("past events show ended status and remain readable, without promotion", () => {
    const event = { ...base, type: "event", effectiveUntil: "2026-09-26T00:00:00.000Z" } as const;
    expect(publicContentState(event, now)).toBe("ended");
    expect(isPubliclyEligibleContent(event, now)).toBe(true);
    expect(isPubliclyEligibleContent(event, now, "promotion")).toBe(false);
  });
});
