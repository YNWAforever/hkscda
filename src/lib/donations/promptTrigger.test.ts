import { describe, expect, test } from "bun:test";
import { initialPromptTriggerState, reducePromptTrigger, scrollProgress } from "./promptTrigger";

describe("donation prompt trigger", () => {
  test("qualifies once with the first trigger", () => {
    const qualified = reducePromptTrigger(initialPromptTriggerState, {
      type: "qualify",
      trigger: "scroll",
    });
    expect(qualified).toEqual({ visible: true, dismissed: false, trigger: "scroll" });
    expect(reducePromptTrigger(qualified, { type: "qualify", trigger: "timer" })).toBe(qualified);
  });

  test("dismissal wins for the session", () => {
    const dismissed = reducePromptTrigger(initialPromptTriggerState, { type: "dismiss" });
    expect(reducePromptTrigger(dismissed, { type: "qualify", trigger: "timer" }).visible).toBe(
      false,
    );
  });

  test("resets route visibility without clearing session dismissal", () => {
    expect(
      reducePromptTrigger(
        reducePromptTrigger(initialPromptTriggerState, { type: "qualify", trigger: "scroll" }),
        { type: "reset", dismissed: false },
      ),
    ).toEqual(initialPromptTriggerState);
    expect(
      reducePromptTrigger(reducePromptTrigger(initialPromptTriggerState, { type: "dismiss" }), {
        type: "reset",
        dismissed: true,
      }),
    ).toEqual({ visible: false, dismissed: true });
  });

  test("calculates progress from scrollable range", () => {
    expect(scrollProgress({ scrollY: 350, scrollHeight: 1800, viewportHeight: 800 })).toBe(0.35);
    expect(scrollProgress({ scrollY: 0, scrollHeight: 800, viewportHeight: 800 })).toBe(0);
    expect(scrollProgress({ scrollY: 2000, scrollHeight: 1800, viewportHeight: 800 })).toBe(1);
  });
});
