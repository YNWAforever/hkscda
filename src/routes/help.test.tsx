import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { helpFaqs } from "../lib/help/faq";
import { HelpFaqDirectory } from "./help";

describe("HelpFaqDirectory", () => {
  test("renders every shared FAQ entry for browsing", () => {
    const markup = renderToStaticMarkup(<HelpFaqDirectory language="zh-HK" />);

    for (const faq of helpFaqs) {
      expect(markup).toContain(faq.question["zh-HK"]);
    }
  });
});
