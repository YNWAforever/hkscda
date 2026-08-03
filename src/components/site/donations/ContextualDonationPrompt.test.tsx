import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DonationPromptSurface } from "./ContextualDonationPrompt";
import { isPromptStateCurrent } from "./useDonationPromptTrigger";
import { hasLocalDonationAction } from "./localDonationAction";

test("hides reducer state owned by the previous pathname before effect reset", () => {
  expect(isPromptStateCurrent("/stories/old", "/stories/new")).toBe(false);
  expect(isPromptStateCurrent("/stories/new", "/stories/new")).toBe(true);
});

test("suppresses the floating prompt where stories have local medical actions", () => {
  expect(hasLocalDonationAction("/stories")).toBe(true);
  expect(hasLocalDonationAction("/stories/siu-bak")).toBe(true);
  expect(hasLocalDonationAction("/adoption/instructions")).toBe(false);
});

describe("DonationPromptSurface", () => {
  test("renders approved story copy and accessible actions", () => {
    const markup = renderToStaticMarkup(
      <DonationPromptSurface
        message="讓下一個生命也迎來轉機"
        action="支持救援"
        href="/donate?source=contextual-cta"
        onDismiss={() => undefined}
        register={() => undefined}
      />,
    );

    expect(markup).toContain("讓下一個生命也迎來轉機");
    expect(markup).toContain("支持救援");
    expect(markup).toContain('aria-label="關閉捐助提示"');
    expect(markup).toContain("min-h-11");
    expect(markup).toContain("inset-x-3");
    expect(markup).toContain("md:max-w-sm");
  });
});
