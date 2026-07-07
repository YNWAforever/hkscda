import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { getFaqById } from "../../../lib/help/faq";
import { FaqResultCard } from "./FaqResultCard";

describe("FaqResultCard", () => {
  test("does not clamp sensitive approved answers in the compact widget", () => {
    const faq = getFaqById("tax-receipt-eligibility");
    expect(faq).toBeDefined();
    if (!faq) {
      throw new Error("Expected tax receipt FAQ fixture");
    }

    const markup = renderToStaticMarkup(
      <FaqResultCard faq={faq} language="en" compact />,
    );

    expect(markup).toContain("cannot provide personal tax advice");
    expect(markup).not.toContain("line-clamp-4");
  });
});
