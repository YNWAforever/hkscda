import { describe, expect, mock, spyOn, test } from "bun:test";

import { createAdminFaqHandlers, createAdminFaqSearchGapHandler } from "./http";
import { createFaqService } from "./service";
import type { FaqEntry, FaqRepository } from "./types";
import type { SearchGapReport } from "./searchGaps";

const adminUserId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
// admin_user.id and admin_user.auth_user_id are distinct UUIDs (see CLAUDE.md's
// "critical distinction"). This fixture keeps them different on purpose: the RPCs
// behind upsert/deactivate check auth_user_id, so a handler that reads the wrong
// field must fail this test rather than passing by coincidence.
const admin = { id: adminUserId, authUserId: actorId, role: "admin" } as never;

function createService(overrides: Partial<ReturnType<typeof createFaqService>> = {}) {
  return {
    listAdmin: mock(async () => []),
    upsert: mock(async () => ({ id: "e1" })),
    deactivate: mock(async () => undefined),
    ...overrides,
  } as unknown as ReturnType<typeof createFaqService>;
}

function request(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("createAdminFaqHandlers", () => {
  test("list requires an admin and returns the service's data with no-store", async () => {
    const service = createService();
    const requireFaqAdmin = mock(async () => admin);
    const handlers = createAdminFaqHandlers({ requireFaqAdmin, service });

    const response = await handlers.list({ request: request("http://localhost/x") });
    expect(requireFaqAdmin).toHaveBeenCalledTimes(1);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.status).toBe(200);
  });

  test("list propagates a Response thrown by requireFaqAdmin (auth failure)", async () => {
    const service = createService();
    const requireFaqAdmin = mock(async () => {
      throw new Response("Forbidden", { status: 403 });
    });
    const handlers = createAdminFaqHandlers({ requireFaqAdmin, service });
    const response = await handlers.list({ request: request("http://localhost/x") });
    expect(response.status).toBe(403);
  });

  test("upsert parses the JSON body and calls service.upsert with the actor id", async () => {
    const service = createService();
    const requireFaqAdmin = mock(async () => admin);
    const handlers = createAdminFaqHandlers({ requireFaqAdmin, service });

    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ category: "sponsorship" }),
      }),
    });

    expect(response.status).toBe(200);
    expect(service.upsert).toHaveBeenCalledWith({
      actorUserId: actorId,
      input: { category: "sponsorship" },
    });
  });

  test("upsert returns 400 on invalid JSON", async () => {
    const service = createService();
    const requireFaqAdmin = mock(async () => admin);
    const handlers = createAdminFaqHandlers({ requireFaqAdmin, service });
    const response = await handlers.upsert({
      request: request("http://localhost/x", { method: "POST", body: "not json" }),
    });
    expect(response.status).toBe(400);
  });

  test("upsert returns 400 on a zod validation error", async () => {
    const service = createService({
      upsert: mock(async () => {
        const { z } = await import("zod");
        throw new z.ZodError([]);
      }),
    });
    const requireFaqAdmin = mock(async () => admin);
    const handlers = createAdminFaqHandlers({ requireFaqAdmin, service });
    const response = await handlers.upsert({
      request: request("http://localhost/x", { method: "POST", body: "{}" }),
    });
    expect(response.status).toBe(400);
  });

  test("deactivate returns 400 when the id is missing", async () => {
    const service = createService();
    const requireFaqAdmin = mock(async () => admin);
    const handlers = createAdminFaqHandlers({ requireFaqAdmin, service });
    const response = await handlers.deactivate({
      request: request("http://localhost/x", { method: "DELETE", body: "{}" }),
    });
    expect(response.status).toBe(400);
  });

  test("deactivate calls the service and returns ok", async () => {
    const service = createService();
    const requireFaqAdmin = mock(async () => admin);
    const handlers = createAdminFaqHandlers({ requireFaqAdmin, service });
    const response = await handlers.deactivate({
      request: request("http://localhost/x", {
        method: "DELETE",
        body: JSON.stringify({ id: "e1", reason: "  duplicate of another question " }),
      }),
    });
    expect(response.status).toBe(200);
    expect(service.deactivate).toHaveBeenCalledWith({
      actorUserId: actorId,
      id: "e1",
      reason: "duplicate of another question",
    });
  });

  // required-reason: faq.deactivate
  test("deactivate rejects a missing, blank or over-long reason with 400 before the service", async () => {
    const service = createService();
    const handlers = createAdminFaqHandlers({ requireFaqAdmin: mock(async () => admin), service });
    for (const body of [
      { id: "e1" },
      { id: "e1", reason: "   " },
      { id: "e1", reason: "x".repeat(501) },
      { id: "e1", reason: 7 },
    ]) {
      const response = await handlers.deactivate({
        request: request("http://localhost/x", { method: "DELETE", body: JSON.stringify(body) }),
      });
      expect(response.status).toBe(400);
    }
    const noBody = await handlers.deactivate({
      request: request("http://localhost/x", { method: "DELETE" }),
    });
    expect(noBody.status).toBe(400);
    expect(service.deactivate).not.toHaveBeenCalled();
  });

  // required-reason: faq.deactivate
  test("deactivate passes the trimmed reason through", async () => {
    const service = createService();
    const handlers = createAdminFaqHandlers({ requireFaqAdmin: mock(async () => admin), service });
    const response = await handlers.deactivate({
      request: request("http://localhost/x", {
        method: "DELETE",
        body: JSON.stringify({ id: "e1", reason: "  out of date  " }),
      }),
    });
    expect(response.status).toBe(200);
    expect(service.deactivate).toHaveBeenCalledWith({
      actorUserId: actorId,
      id: "e1",
      reason: "out of date",
    });
  });

  test("an unexpected error falls through to a generic 500", async () => {
    const service = createService({
      listAdmin: mock(async () => {
        throw new Error("db exploded");
      }),
    });
    const requireFaqAdmin = mock(async () => admin);
    const handlers = createAdminFaqHandlers({ requireFaqAdmin, service });
    const response = await handlers.list({ request: request("http://localhost/x") });
    expect(response.status).toBe(500);
  });
});

describe("createAdminFaqSearchGapHandler", () => {
  const report: SearchGapReport = {
    days: 30,
    gaps: [
      {
        topic: "寵物證書",
        language: "zh-HK",
        confidence: "none",
        searchCount: 4,
        lastSeenDay: "2026-10-07",
      },
    ],
  };

  test("requires an admin and returns the report with no-store", async () => {
    const requireFaqAdmin = mock(async () => admin);
    const service = { listReport: mock(async () => report) };
    const handler = createAdminFaqSearchGapHandler({ requireFaqAdmin, service });

    const response = await handler({ request: request("http://localhost/x") });

    expect(requireFaqAdmin).toHaveBeenCalledTimes(1);
    expect(service.listReport).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(report);
  });

  test("propagates a Response thrown by requireFaqAdmin and does not read the report", async () => {
    const requireFaqAdmin = mock(async () => {
      throw new Response("Forbidden", { status: 403 });
    });
    const service = { listReport: mock(async () => report) };
    const handler = createAdminFaqSearchGapHandler({ requireFaqAdmin, service });

    const response = await handler({ request: request("http://localhost/x") });

    expect(response.status).toBe(403);
    expect(service.listReport).not.toHaveBeenCalled();
  });

  test("a failing report falls through to the generic 500 without leaking the error", async () => {
    const requireFaqAdmin = mock(async () => admin);
    const service = {
      listReport: mock(async (): Promise<SearchGapReport> => {
        throw new Error("db exploded");
      }),
    };
    const handler = createAdminFaqSearchGapHandler({ requireFaqAdmin, service });
    const logged = spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await handler({ request: request("http://localhost/x") });

      expect(response.status).toBe(500);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: "Could not process FAQ request" });
    } finally {
      logged.mockRestore();
    }
  });
});

describe("createAdminFaqHandlers with the real service — regression", () => {
  const existingId = "33333333-3333-4333-8333-333333333333";
  const unknownId = "44444444-4444-4444-8444-444444444444";

  function existingEntry(overrides: Partial<FaqEntry> = {}): FaqEntry {
    return {
      id: existingId,
      category: "sponsorship",
      question: { "zh-HK": "問題", en: "Question" },
      answer: { "zh-HK": "答案", en: "Answer" },
      keywords: { "zh-HK": [], en: [] },
      ctaKey: null,
      sensitive: false,
      sortOrder: 0,
      isActive: true,
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
      ...overrides,
    };
  }

  // supabase-js returns a plain PostgrestError-shaped object, not an Error instance.
  const notFound = { code: "P0002", message: "FAQ entry not found", details: null, hint: null };

  function createRepo(overrides: Partial<FaqRepository> = {}): FaqRepository {
    return {
      listPublic: mock(async () => []),
      listAdmin: mock(async () => [existingEntry()]),
      upsert: mock(async () => existingEntry()),
      deactivate: mock(async () => undefined),
      ...overrides,
    };
  }

  const body = (overrides: Record<string, unknown> = {}) => ({
    category: "sponsorship",
    questionZh: "問題",
    questionEn: "Question",
    answerZh: "答案",
    answerEn: "Answer",
    keywordsZh: [],
    keywordsEn: [],
    ctaKey: null,
    sensitive: false,
    sortOrder: 0,
    ...overrides,
  });

  test("BUG-07: upsert cannot deactivate an existing FAQ entry without a reason", async () => {
    const repo = createRepo();
    const handlers = createAdminFaqHandlers({
      requireFaqAdmin: mock(async () => admin),
      service: createFaqService({ repo }),
    });

    const response = await handlers.upsert({
      request: request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify(body({ id: existingId, isActive: false })),
      }),
    });

    expect(response.status).toBe(400);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  test.each(["ABCDEFAB-1234-4ABC-8DEF-ABCDEFABCDEF", "AbCdEfAb-1234-4aBc-8dEf-AbCdEfAbCdEf"])(
    "BUG-07: differently cased UUID %s still requires a reason to deactivate",
    async (id) => {
      const repo = createRepo({
        listAdmin: mock(async () => [
          existingEntry({ id: "abcdefab-1234-4abc-8def-abcdefabcdef" }),
        ]),
      });
      const handlers = createAdminFaqHandlers({
        requireFaqAdmin: mock(async () => admin),
        service: createFaqService({ repo }),
      });

      const response = await handlers.upsert({
        request: request("http://localhost/x", {
          method: "POST",
          body: JSON.stringify(body({ id, isActive: false })),
        }),
      });

      expect(response.status).toBe(400);
      expect(repo.upsert).not.toHaveBeenCalled();
    },
  );

  test("BUG-16: upsert of an unknown FAQ id (P0002) returns 404, not 500", async () => {
    const repo = createRepo({
      listAdmin: mock(async () => []),
      upsert: mock(async (): Promise<FaqEntry> => {
        throw notFound;
      }),
    });
    const handlers = createAdminFaqHandlers({
      requireFaqAdmin: mock(async () => admin),
      service: createFaqService({ repo }),
    });
    const logged = spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await handlers.upsert({
        request: request("http://localhost/x", {
          method: "POST",
          body: JSON.stringify(body({ id: unknownId, isActive: true })),
        }),
      });
      expect(response.status).toBe(404);
    } finally {
      logged.mockRestore();
    }
  });

  test("BUG-16: deactivating an unknown FAQ id (P0002) returns 404, not 500", async () => {
    const repo = createRepo({
      deactivate: mock(async (): Promise<void> => {
        throw notFound;
      }),
    });
    const handlers = createAdminFaqHandlers({
      requireFaqAdmin: mock(async () => admin),
      service: createFaqService({ repo }),
    });
    const logged = spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await handlers.deactivate({
        request: request("http://localhost/x", {
          method: "DELETE",
          body: JSON.stringify({ id: unknownId, reason: "duplicate" }),
        }),
      });
      expect(response.status).toBe(404);
    } finally {
      logged.mockRestore();
    }
  });
});
