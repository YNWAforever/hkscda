import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";

import type { HelpFaq } from "../lib/help/faq";
import { HelpFaqDirectory, Route } from "./help";
import { HelpSearch } from "../components/site/help/HelpSearch";

const testFaqs: HelpFaq[] = [
  {
    id: "sponsorship-how-it-works",
    category: "sponsorship",
    question: { "zh-HK": "助養運作方式是什麼？", en: "How does sponsorship work?" },
    answer: { "zh-HK": "答案", en: "Answer" },
    keywords: { "zh-HK": ["助養"], en: ["sponsor"] },
  },
  {
    id: "adoption-apply",
    category: "adoption",
    question: { "zh-HK": "我要怎樣申請領養？", en: "How do I apply to adopt a cat or dog?" },
    answer: { "zh-HK": "答案", en: "Answer" },
    keywords: { "zh-HK": ["領養"], en: ["adopt"] },
  },
];

describe("HelpFaqDirectory", () => {
  test("renders every provided FAQ entry for browsing", () => {
    const markup = renderToStaticMarkup(
      <>
        <HelpSearch language="zh-HK" faqs={testFaqs} surface="page" />
        <HelpFaqDirectory language="zh-HK" faqs={testFaqs} />
      </>,
    );

    expect(markup).toContain('aria-label="搜尋常見問題"');

    for (const faq of testFaqs) {
      expect(markup).toContain(faq.question["zh-HK"]);
    }
  });

  test("renders nothing for a category with no active entries", () => {
    const markup = renderToStaticMarkup(<HelpFaqDirectory language="zh-HK" faqs={[]} />);
    expect(markup.match(/0 條/g)).toHaveLength(5);
    expect(markup).not.toContain("<article");
  });
});
describe("Help route data boundary", () => {
  test("renders serialized loader FAQs when the browser query cache starts empty", async () => {
    const serverQueryClient = {
      ensureQueryData: async () => testFaqs,
    };
    const loader = Route.options.loader;
    if (typeof loader !== "function") throw new Error("Help route loader is required");

    const loaderFaqs = await loader({
      context: { queryClient: serverQueryClient },
    } as never);
    expect(loaderFaqs).toEqual(testFaqs);

    const originalUseLoaderData = Route.useLoaderData;
    Object.defineProperty(Route, "useLoaderData", {
      configurable: true,
      value: () => loaderFaqs,
    });

    try {
      const browserQueryClient = new QueryClient();
      expect(browserQueryClient.getQueryData(["public-faqs"])).toBeUndefined();

      const Component = Route.options.component;
      if (!Component) throw new Error("Help route component is required");
      const router = createRouter({
        routeTree: createRootRoute(),
        history: createMemoryHistory({ initialEntries: ["/help"] }),
      });
      const markup = renderToStaticMarkup(
        <RouterContextProvider router={router}>
          <QueryClientProvider client={browserQueryClient}>
            <Component />
          </QueryClientProvider>
        </RouterContextProvider>,
      );

      expect(markup.match(/<h1/g)).toHaveLength(1);
      expect(markup).toContain("有問題？先在這裡找答案");
      expect(markup).toContain("2 條已審批答案");
      expect(markup).toContain(testFaqs[0].question["zh-HK"]);
      expect(markup).toContain(testFaqs[1].question["zh-HK"]);
    } finally {
      Object.defineProperty(Route, "useLoaderData", {
        configurable: true,
        value: originalUseLoaderData,
      });
    }
  });
});
