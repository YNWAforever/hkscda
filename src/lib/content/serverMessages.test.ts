import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { expectNoChineseText } from "../../components/admin/i18n/testing";
import { createContentReviewHttp } from "../contentReview/http.server";
import { createContentReviewService } from "../contentReview/service";

// `mock.module` outlives this file, so the real module is captured first and put back afterwards.
// The service logs the errors it turns into a warning. They are expected here, so they are silenced.
const consoleError = spyOn(console, "error");
beforeEach(() => consoleError.mockImplementation(() => undefined));
afterAll(() => consoleError.mockRestore());

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
const { createContentHandlers } = await import("./http.server");
const { createContentLifecycleService } = await import("./lifecycle.service");
const { createSupabaseContentLifecycleRepository, mapContentLifecycleRepositoryError } =
  await import("./lifecycle.repository.server");
const { createContentMediaLifecycle } = await import("./mediaLifecycle.server");
const { createSupabaseContentMediaPorts } = await import("./mediaLifecycle.repository.server");
const { createSupabaseContentRepository } = await import("./repository.server");
const { createContentService } = await import("./service");
const {
  contentServerMessage,
  contentServerMessageCode,
  contentServerMessageCodes,
  contentServerMessageText,
} = await import("./serverMessages");
type ContentServerMessageCode = Parameters<typeof contentServerMessageText>[0];
type ContentRepository = Parameters<typeof createContentService>[0]["repo"];

const admin = {
  id: "admin-1",
  authUserId: "11111111-2222-4333-8444-555555555555",
  email: "a@b.com",
  role: "staff" as const,
  status: "active" as const,
};
const contentId = "22222222-2222-4333-8444-555555555555";
const updateId = "33333333-2222-4333-8444-555555555555";

/** A draft that passes the publish checks (a title, a slug, a summary and a cover image). */
const draft = {
  id: contentId,
  slug: "story",
  type: "report",
  title: "Title",
  subtitle: null,
  summary: "Summary",
  body: null,
  coverMediaId: "media-1",
  coverImageUrl: null,
  status: "draft",
  publishedAt: null,
  ctaLabel: null,
  ctaUrl: null,
  storyProfile: null,
  latestPublicUpdate: null,
  links: [],
  media: [],
  updates: [],
  socialCopies: [],
  notificationDrafts: [],
  createdAt: "2026-09-14T00:00:00.000Z",
  updatedAt: "2026-09-14T00:00:00.000Z",
};

/** What the database's trigger says when a version is published without an approved review. */
const TRIGGER_MESSAGE = "此版本尚未核實為可發布內容，請先完成內容來源審核";

/** The text of every code, in English: a next step where the text is a warning. */
const NEXT_STEP: Partial<Record<ContentServerMessageCode, RegExp>> = {
  internalUpdateNoDrafts: /Make the update public/,
  noAdoptersToContact: /Check the adopters/,
  draftCreationFailed: /Select Create notification drafts/,
};

describe("the table of server messages", () => {
  test("gives every code an English text without Chinese, and zh-HK by default", () => {
    for (const code of contentServerMessageCodes) {
      const zh = contentServerMessageText(code);
      expect(contentServerMessageText(code, "zh")).toBe(zh);
      expect(contentServerMessageCode(zh)).not.toBeNull();
      const en = contentServerMessageText(code, "en");
      expectNoChineseText(en);
      const next = NEXT_STEP[code];
      if (next) expect(en, code).toMatch(next);
    }
  });

  test("finds a code only for the exact zh-HK text", () => {
    expect(contentServerMessageCode("（未命名）")).toBe("unnamedAnimal");
    expect(contentServerMessageCode("（未命名")).toBeNull();
    expect(contentServerMessageCode(" （未命名）")).toBeNull();
    expect(contentServerMessageCode("小白")).toBeNull();
    expect(contentServerMessageCode(undefined)).toBeNull();
    expect(contentServerMessageCode(7)).toBeNull();
  });

  test("shows any other text as it came", () => {
    expect(contentServerMessage("小白", "en")).toBe("小白");
    expect(contentServerMessage("Something else", "en")).toBe("Something else");
    expect(contentServerMessage("（未命名）", "en")).toBe("(unnamed)");
    expect(contentServerMessage("（未命名）")).toBe("（未命名）");
  });
});

describe("the notice a saved story update comes back with", () => {
  function createRepo(overrides: Partial<ContentRepository>): ContentRepository {
    return {
      createStoryUpdate: async () => updateId,
      getStoryUpdate: async () => ({
        id: updateId,
        contentItemId: contentId,
        kind: "medical",
        title: "Check-up",
        body: null,
        occurredAt: "2026-09-14T00:00:00.000Z",
        visibility: "public",
        shouldGenerateAdopterDrafts: true,
        media: [],
        createdAt: "2026-09-14T00:00:00.000Z",
        updatedAt: "2026-09-14T00:00:00.000Z",
      }),
      listNotificationDraftKeys: async () => [],
      resolveAdopterRecipients: async () => [],
      insertNotificationDrafts: async () => undefined,
      insertAuditLog: async () => undefined,
      getAdminContent: async () => draft,
      ...overrides,
    } as unknown as ContentRepository;
  }

  async function saveUpdate(
    repo: ContentRepository,
    visibility: "public" | "internal",
  ): Promise<{ created: number; warning: string | null }> {
    const handlers = createContentHandlers({
      requireContentAdmin: async () => admin,
      service: createContentService({ repo, publicBaseUrl: "https://example.test" }),
    });
    const response = await handlers.createStoryUpdate({
      request: new Request(`http://localhost/api/admin/content/${contentId}/updates`, {
        method: "POST",
        body: JSON.stringify({
          kind: "medical",
          title: "Check-up",
          occurredAt: "2026-09-14T00:00:00.000Z",
          visibility,
          shouldGenerateAdopterDrafts: true,
        }),
      }),
      params: { id: contentId },
    });
    expect(response.status).toBe(201);
    return (
      (await response.json()) as { notificationDrafts: { created: number; warning: string | null } }
    ).notificationDrafts;
  }

  test("an internal update says it makes no drafts", async () => {
    const result = await saveUpdate(createRepo({}), "internal");
    expect(result.warning).toBe(contentServerMessageText("internalUpdateNoDrafts"));
    expect(contentServerMessageCode(result.warning)).toBe("internalUpdateNoDrafts");
  });

  test("an update with no adopter to contact says so", async () => {
    const result = await saveUpdate(
      createRepo({ resolveAdopterRecipients: async () => [] }),
      "public",
    );
    expect(result.warning).toBe(contentServerMessageText("noAdoptersToContact"));
    expect(contentServerMessageCode(result.warning)).toBe("noAdoptersToContact");
  });

  test("an update whose drafts failed says the update is saved", async () => {
    const result = await saveUpdate(
      createRepo({
        resolveAdopterRecipients: async () => {
          throw new Error("boom");
        },
      }),
      "public",
    );
    expect(result.warning).toBe(contentServerMessageText("draftCreationFailed"));
    expect(contentServerMessageCode(result.warning)).toBe("draftCreationFailed");
  });

  test("an update whose drafts were made has no warning to translate", async () => {
    const result = await saveUpdate(
      createRepo({
        resolveAdopterRecipients: async () => [
          {
            adoptionCaseId: "case-1",
            supporterId: "supporter-1",
            name: "Ada",
            email: "ada@example.com",
            phone: null,
          },
        ],
      }),
      "public",
    );
    expect(result.warning).toBeNull();
    expect(result.created).toBeGreaterThan(0);
  });
});

describe("the stand-in label the record search gives a record with no name", () => {
  /** A client whose queries all answer with the rows of the table they ask for. */
  function clientWith(rows: Record<string, unknown[]>): SupabaseClient {
    return {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "or", "ilike", "order", "limit"])
          chain[method] = () => chain;
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve({ data: rows[table] ?? [], error: null });
        return chain;
      },
    } as unknown as SupabaseClient;
  }

  const rows = {
    animals: [{ id: "a1", name: " ", name_en: null, type: "cat" }],
    adoption_case: [{ id: "c1", applicant_name: null, applicant_email: null }],
    successful_adoption: [{ id: "s1", case_number: "", animal_id: null }],
    supporter: [{ id: "p1", name: "  ", phone: null }],
    volunteer_activity: [{ id: "v1", title: null, starts_at: null }],
  };
  const expected: Array<[string, ContentServerMessageCode]> = [
    ["animal", "unnamedAnimal"],
    ["adoption_case", "unnamedPerson"],
    ["successful_adoption", "noCaseNumber"],
    ["supporter", "unnamedPerson"],
    ["volunteer_activity", "unnamedActivity"],
  ];

  for (const [linkedType, code] of expected) {
    test(`a ${linkedType} without a name is labelled with the text that has code ${code}`, async () => {
      const repo = createSupabaseContentRepository(clientWith(rows));
      const [result] = await repo.searchLinks({
        linkedType: linkedType as never,
        q: "x",
        limit: 5,
      });
      expect(result?.label).toBe(contentServerMessageText(code));
      expect(contentServerMessageCode(result?.label)).toBe(code);
      const english = contentServerMessage(result?.label ?? "", "en");
      expectNoChineseText(english);
      expect(english).toMatch(/^\(.+\)$/);
    });
  }

  test("a record with a name keeps it", async () => {
    const repo = createSupabaseContentRepository(
      clientWith({ animals: [{ id: "a1", name: "小白", name_en: "Snowy", type: "cat" }] }),
    );
    const [result] = await repo.searchLinks({ linkedType: "animal", q: "x", limit: 5 });
    expect(result?.label).toBe("小白");
    expect(contentServerMessage(result?.label ?? "", "en")).toBe("小白");
  });
});

describe("messages that never reach the editor", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /** The database refuses a publish, with the trigger's zh-HK message. */
  const refusedByTrigger = { code: "22023", message: TRIGGER_MESSAGE };

  async function publishThrough(
    service: ReturnType<typeof createContentService>,
  ): Promise<unknown> {
    const handlers = createContentHandlers({ requireContentAdmin: async () => admin, service });
    globalThis.fetch = (async (_url: string, init: RequestInit) =>
      handlers.publishContent({
        request: new Request(`http://localhost/api/admin/content/${contentId}/publish`, init),
        params: { id: contentId },
      })) as unknown as typeof fetch;
    return fetchAdminJson(`/api/admin/content/${contentId}/publish`, {
      method: "POST",
      body: JSON.stringify({
        expectedVersion: 3,
        revisionId: "44444444-2222-4333-8444-555555555555",
        idempotencyKey: "content-publish-0123456789abcdef",
      }),
    }).catch((error: unknown) => error);
  }

  test("a publish the database refuses reaches the browser in English, not as the trigger's text", async () => {
    // The live wiring (see `routes/api/admin/content/-handlers.ts`): the media lifecycle prepares
    // the public copies, then the lifecycle repository publishes, and that is where the trigger
    // refuses an unreviewed version.
    const client = {
      rpc: async (name: string) =>
        name === "prepare_content_public_assets"
          ? { data: [], error: null }
          : { data: null, error: refusedByTrigger },
    } as unknown as SupabaseClient;
    const service = createContentService({
      repo: { getAdminContent: async () => draft } as unknown as ContentRepository,
      publicBaseUrl: "https://example.test",
      lifecycle: createContentLifecycleService(createSupabaseContentLifecycleRepository(client)),
      mediaLifecycle: createContentMediaLifecycle(createSupabaseContentMediaPorts(client)),
    });
    const failure = await publishThrough(service);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("Content lifecycle operation failed");
    expectNoChineseText((failure as Error).message);
  });

  test("a trigger text that no layer maps becomes a generic English error", async () => {
    const service = createContentService({
      repo: {
        getAdminContent: async () => draft,
        updateContent: async () => draft,
        publishContent: async () => {
          throw refusedByTrigger;
        },
        insertAuditLog: async () => undefined,
      } as unknown as ContentRepository,
      publicBaseUrl: "https://example.test",
    });
    const failure = await publishThrough(service);
    expect((failure as Error).message).toBe("Could not process content management request");
    expectNoChineseText((failure as Error).message);
  });

  test("the lifecycle maps the database's code, never its message", () => {
    const error = mapContentLifecycleRepositoryError(refusedByTrigger);
    expect(error).toMatchObject({ code: "invalid", status: 422 });
    expect(error.message).not.toContain(TRIGGER_MESSAGE);
    expectNoChineseText(error.message);
  });

  test("the review route answers a failure in zh-HK, and the review panel does not show it", async () => {
    const handler = createContentReviewHttp({
      authenticate: async () => admin.authUserId,
      service: createContentReviewService({
        review: async () => {
          throw refusedByTrigger;
        },
        list: async () => ({ items: [], total: 0 }),
      }),
    });
    const answer = () =>
      handler(
        new Request("http://localhost/api/admin/content-review", {
          method: "POST",
          body: JSON.stringify({
            entity_kind: "content",
            entity_id: contentId,
            revision_key: "rev-1",
            classification: "approved",
            evidence: "Checked",
          }),
        }),
      );
    const response = await answer();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "未能完成內容審核，請檢查資料及版本後重試。" });

    // The browser reads that answer with `fetchAdminJson`; the panel keeps only that it failed
    // and writes its own message (see `recordContentReview`).
    globalThis.fetch = (async () => answer()) as unknown as typeof fetch;
    const failure = await fetchAdminJson("/api/admin/content-review", { method: "POST" }).catch(
      (error: unknown) => error,
    );
    expect((failure as Error).message).toBe("未能完成內容審核，請檢查資料及版本後重試。");
    const { recordContentReview } =
      await import("../../components/admin/content/recordContentReview");
    expect(
      await recordContentReview({
        kind: "content",
        id: contentId,
        revision: "rev-1",
        classification: "approved",
        evidence: "Checked",
      }),
    ).toBe("failed");
  });
});
