import { afterAll, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AdminApiError } from "../../../lib/admin/session";
import { renderAdminInChinese } from "../i18n/testing";
import { contentCommonCopy } from "./contentCommonCopy";

// `mock.module` mocks are process-global in Bun's test runner and outlive this
// file, so capture the real module first and put it back in `afterAll` (the
// same pattern as ContentEditor.test.tsx).
const realReactRouter = { ...(await import("@tanstack/react-router")) };

mock.module("@tanstack/react-router", () => ({
  ...realReactRouter,
  useNavigate: () => () => Promise.resolve(),
}));

afterAll(() => {
  mock.module("@tanstack/react-router", () => realReactRouter);
});

describe("ContentCreateForm", () => {
  test("renders the required fields and every optional label", async () => {
    const { ContentCreateForm } = await import("./ContentCreateForm");
    const markup = renderAdminInChinese(
      <QueryClientProvider client={new QueryClient()}>
        <ContentCreateForm />
      </QueryClientProvider>,
    );

    expect(markup).toContain("類型");
    expect(markup).toContain("標題");
    expect(markup).toContain("網址 slug");
    expect(markup).toContain("摘要");
    for (const label of Object.values(contentCommonCopy.zh.optionalFields)) {
      expect(markup).toContain(label);
    }
  });

  test("BUG-73: the body and optional text inputs carry the server's length limits", async () => {
    const { ContentCreateForm } = await import("./ContentCreateForm");
    const markup = renderAdminInChinese(
      <QueryClientProvider client={new QueryClient()}>
        <ContentCreateForm />
      </QueryClientProvider>,
    );
    const inputAfter = (label: string) =>
      new RegExp(`${label.replace(/[()]/g, "\\$&")}<(input|textarea)[^>]*>`).exec(markup)?.[0];
    const optional = contentCommonCopy.zh.optionalFields;

    expect(inputAfter(optional.ctaLabel)).toContain('maxLength="60"');
    expect(inputAfter(optional.seoTitle)).toContain('maxLength="120"');
    expect(inputAfter(optional.seoDescription)).toContain('maxLength="320"');
    expect(inputAfter(optional.ogTitle)).toContain('maxLength="180"');
    expect(inputAfter(optional.ogDescription)).toContain('maxLength="320"');
    expect(inputAfter("正文（可稍後填寫）")).toContain('maxLength="50000"');
  });
});

describe("buildCreateContentPayload", () => {
  test("maps the form to a draft payload and forwards empty optionals verbatim", async () => {
    const { buildCreateContentPayload } = await import("./ContentCreateForm");

    const payload = buildCreateContentPayload({
      type: "event",
      title: "慈善市集",
      slug: "charity-market",
      summary: "摘要",
      body: "",
      optional: {
        ctaLabel: "",
        ctaUrl: "",
        seoTitle: "",
        seoDescription: "",
        ogTitle: "",
        ogDescription: "",
      },
    });

    expect(payload).toEqual({
      type: "event",
      title: "慈善市集",
      slug: "charity-market",
      summary: "摘要",
      body: "",
      status: "draft",
      ctaLabel: "",
      ctaUrl: "",
      seoTitle: "",
      seoDescription: "",
      ogTitle: "",
      ogDescription: "",
    });
  });

  test("forwards populated body and optional values", async () => {
    const { buildCreateContentPayload } = await import("./ContentCreateForm");

    const payload = buildCreateContentPayload({
      type: "rescue_story",
      title: "小白",
      slug: "siu-bak",
      summary: "康復中",
      body: "正文",
      optional: {
        ctaLabel: "捐款",
        ctaUrl: "https://example.test/donate",
        seoTitle: "SEO",
        seoDescription: "SEO 描述",
        ogTitle: "OG",
        ogDescription: "OG 描述",
      },
    });

    expect(payload.status).toBe("draft");
    expect(payload.body).toBe("正文");
    expect(payload.ctaLabel).toBe("捐款");
    expect(payload.seoDescription).toBe("SEO 描述");
  });
});

describe("createErrorMessage", () => {
  test("shows the slug-conflict message for a 409", async () => {
    const { createErrorMessage } = await import("./ContentCreateForm");

    const error = new AdminApiError({ status: 409, message: "slug already exists" });

    expect(createErrorMessage(error)).toBe("此網址已被使用，請改用其他 slug。");
  });

  test("names the offending field when a 400 carries field errors", async () => {
    const { createErrorMessage } = await import("./ContentCreateForm");

    const error = new AdminApiError({
      status: 400,
      message: "Invalid content management request",
      fields: { slug: ["此網址格式不正確"] },
    });

    const message = createErrorMessage(error);
    expect(message).toContain("slug");
    expect(message).toContain("此網址格式不正確");
  });

  test("BUG-68: names each field by its form label, with the reason in the admin's language", async () => {
    const { createErrorMessage } = await import("./ContentCreateForm");
    const error = new AdminApiError({
      status: 400,
      code: "invalid",
      message: "Invalid content management request",
      fields: {
        title: ["String must contain at most 180 character(s)"],
        ctaUrl: ["CTA URL must be an http(s) URL or a root-relative path"],
      },
    });

    expect(createErrorMessage(error).split("\n")).toEqual([
      "標題：不可超過 180 個字元。",
      "CTA 連結：請填寫 http(s) 網址，或以 / 開頭的站內路徑。",
    ]);
    expect(createErrorMessage(error, "en").split("\n")).toEqual([
      "Title: Must be 180 characters or fewer.",
      "CTA link: Enter an http(s) URL or a site path starting with /.",
    ]);
  });

  test("falls back to the generic message for unknown errors", async () => {
    const { createErrorMessage } = await import("./ContentCreateForm");

    expect(createErrorMessage(null)).toBe("建立失敗，請重試。");
    expect(createErrorMessage(new Error("boom"))).toBe("boom");
  });
});
