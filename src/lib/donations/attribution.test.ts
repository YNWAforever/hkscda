import { describe, expect, test } from "bun:test";
import {
  buildDonationAttribution,
  buildDonationPromptHref,
  donationAttributionSchema,
} from "./attribution";
import { resolveDonationPrompt } from "./prompt";

describe("donation attribution", () => {
  test("builds a controlled contextual CTA URL", () => {
    const profile = resolveDonationPrompt("/stories/rescue-1");
    if (!profile) throw new Error("Expected story profile");
    const attribution = buildDonationAttribution(profile, "mobile-bottom", "scroll");
    expect(buildDonationPromptHref(attribution)).toBe(
      "/donate?source=contextual-cta&context=story&purpose=general&placement=mobile-bottom&trigger=scroll",
    );
  });

  test("rejects unsupported or free-form values", () => {
    expect(() =>
      donationAttributionSchema.parse({
        source: "contextual-cta",
        context: "story<script>",
        purpose: "general",
        placement: "mobile-bottom",
        trigger: "scroll",
      }),
    ).toThrow();
  });

  test("does not serialize extra runtime properties", () => {
    const attribution = {
      source: "contextual-cta",
      context: "story",
      purpose: "general",
      placement: "mobile-bottom",
      trigger: "scroll",
      email: "person@example.com",
      name: "A Person",
      note: "free-form context",
    } as unknown as Parameters<typeof buildDonationPromptHref>[0];

    expect(buildDonationPromptHref(attribution)).toBe(
      "/donate?source=contextual-cta&context=story&purpose=general&placement=mobile-bottom&trigger=scroll",
    );
  });
});
