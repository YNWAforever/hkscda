import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { helpFaqs } from "../lib/help/faq";
import { HelpFaqDirectory } from "./help";
import { HelpSearch } from "../components/site/help/HelpSearch";

describe("HelpFaqDirectory", () => {
  test("renders every shared FAQ entry for browsing", () => {
    const markup = renderToStaticMarkup(
      <>
        <HelpSearch language="zh-HK" surface="page" />
        <HelpFaqDirectory language="zh-HK" />
      </>,
    );

    expect(markup).toContain('aria-label="\u641c\u5c0b\u5e38\u898b\u554f\u984c"');

    for (const faq of helpFaqs) {
      expect(markup).toContain(faq.question["zh-HK"]);
    }
  });
});
