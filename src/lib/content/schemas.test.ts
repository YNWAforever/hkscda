import { describe, expect, test } from "bun:test";

import { contentInputSchema } from "./schemas";

const baseInput = {
  type: "event",
  slug: "adoption-day",
  title: "領養日",
  summary: "歡迎參加領養日。",
};

describe("content schemas", () => {
  test("accepts public-safe CTA URLs", () => {
    expect(contentInputSchema.parse({ ...baseInput, ctaUrl: " /donate " }).ctaUrl).toBe("/donate");
    expect(
      contentInputSchema.parse({
        ...baseInput,
        ctaUrl: "https://www.hkscda.com/stories",
      }).ctaUrl,
    ).toBe("https://www.hkscda.com/stories");
  });

  test("rejects executable or protocol-relative CTA URLs", () => {
    expect(() =>
      contentInputSchema.parse({ ...baseInput, ctaUrl: "javascript:alert(1)" }),
    ).toThrow();
    expect(() =>
      contentInputSchema.parse({ ...baseInput, ctaUrl: "//evil.example/path" }),
    ).toThrow();
    expect(() =>
      contentInputSchema.parse({ ...baseInput, ctaUrl: "data:text/html,<script></script>" }),
    ).toThrow();
  });
});
