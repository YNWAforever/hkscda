import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";

import { expectNoChineseText } from "../../components/admin/i18n/testing";
import { reviewCopy } from "../../components/admin/content/reviewCopy";
import {
  selectionErrorFrom,
  selectionErrorText,
} from "../../components/admin/content/reviewSelectionLogic";

// `mock.module` outlives this file, so the real module is captured first and put back afterwards.
const realSupabase = { ...(await import("../supabase")) };
mock.module("../supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "session-token", user: { id: "auth-1" } } },
      }),
    },
  },
}));
afterAll(() => mock.module("../supabase", () => realSupabase));

const { fetchAdminJson } = await import("../admin/session");
const { createContentReviewHttp } = await import("./http.server");
const { createContentReviewService } = await import("./service");
const { contentReviewServerErrorCode, contentReviewServerErrorText } =
  await import("./serverErrors");

const ZH = "未能完成內容審核，請檢查資料及版本後重試。";
const EN =
  "Could not complete the review request. Reload the page, check the details and the version, then try again.";

/** The route with a database that fails the way the test says; its failures are the route's own. */
function routeFailingWith(failure: unknown) {
  return createContentReviewHttp({
    authenticate: async () => "11111111-2222-4333-8444-555555555555",
    service: createContentReviewService({
      review: async () => {
        throw failure;
      },
      list: async () => {
        throw failure;
      },
    }),
  });
}

/** What `fetchAdminJson` throws in the browser for a request the route answers. */
async function browserError(handler: ReturnType<typeof routeFailingWith>, request: Request) {
  globalThis.fetch = (async () => handler(request.clone())) as unknown as typeof fetch;
  return fetchAdminJson(new URL(request.url).pathname + new URL(request.url).search, {
    method: request.method,
  }).catch((error: unknown) => error);
}

describe("the content review route's one message that is not English", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const list = () =>
    new Request("http://localhost/api/admin/content-review?kind=content&quality=all&page=2");

  test("a failed list reaches the browser as the zh-HK text, and has a code", async () => {
    const failure = await browserError(routeFailingWith({ code: "XX000", message: "db" }), list());
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(ZH);
    expect((failure as Error).message).toBe(contentReviewServerErrorText("reviewFailed"));
    expect(contentReviewServerErrorCode(failure)).toBe("reviewFailed");
  });

  test("a forbidden, a bad and a failed request all come back as that one text", async () => {
    const requests: Array<[unknown, Request]> = [
      [{ code: "42501", message: "forbidden" }, list()],
      [{ code: "XX000", message: "db" }, list()],
      // A bad query is refused by the route's own check, with a 400.
      [new Error("unused"), new Request("http://localhost/api/admin/content-review?page=0")],
    ];
    for (const [failure, request] of requests) {
      const error = await browserError(routeFailingWith(failure), request);
      expect(contentReviewServerErrorCode(error), String(failure)).toBe("reviewFailed");
    }
  });

  test("the selection error of the review queue is written in English, and in Chinese as before", async () => {
    // "Select all matching" reads the pages with `fetchAdminJson`; a failed page is kept as the
    // cause of `collect_failed` and shown by `selectionErrorText`.
    const cause = await browserError(routeFailingWith({ code: "XX000", message: "db" }), list());
    const error = selectionErrorFrom(cause, "content", "collect_failed");

    const english = selectionErrorText(error, reviewCopy.en.queue, "en");
    expectNoChineseText(english);
    expect(english).toBe(EN);
    // Every English error says what to do next.
    expect(english).toMatch(/try again/);

    expect(selectionErrorText(error, reviewCopy.zh.queue, "zh")).toBe(ZH);
  });

  test("only that exact text has a code; any other error is shown as it came", () => {
    expect(contentReviewServerErrorCode(new Error("Request body too large"))).toBeNull();
    expect(contentReviewServerErrorCode(new Error("未能完成內容審核"))).toBeNull();
    expect(contentReviewServerErrorCode(ZH)).toBeNull();
    expect(contentReviewServerErrorCode(undefined)).toBeNull();
  });

  test("the English message has no Chinese and the default is zh-HK", () => {
    expectNoChineseText(contentReviewServerErrorText("reviewFailed", "en"));
    expect(contentReviewServerErrorText("reviewFailed", "zh")).toBe(ZH);
  });
});
