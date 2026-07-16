import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DonationPromptSurface } from "./ContextualDonationPrompt";

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
  });
});
