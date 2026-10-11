import { describe, expect, test } from "bun:test";

import { revealOrder, shouldDeferReveal } from "./revealOnScroll";

describe("scroll reveal", () => {
  test("never defers content that is already on screen at hydration", () => {
    // Hiding it would flash the server-painted content and could delay LCP.
    expect(shouldDeferReveal(0, 900)).toBe(false);
    expect(shouldDeferReveal(800, 900)).toBe(false);
  });

  test("defers content that starts below the fold", () => {
    expect(shouldDeferReveal(900, 900)).toBe(true);
    expect(shouldDeferReveal(2400, 900)).toBe(true);
  });

  test("passes the stagger index to the stylesheet", () => {
    expect(revealOrder(2)).toEqual({ "--reveal-index": 2 } as never);
  });
});
