import { describe, expect, mock, test } from "bun:test";

/**
 * The FAQ disable and board member step-down dialogs show whatever their mutation rejects with.
 * The API's error strings in these domains are English, so each screen's mutationFn rethrows the
 * screen's own failure line in the admin's language. These tests render each screen in Chinese
 * and in English, take the mutationFn the screen hands to useMutation, and make it fail.
 */

const realReactQuery = await import("@tanstack/react-query");
const { AdminHttpError, AdminSessionError } = await import("../../../lib/admin/session");

const ENTRY = {
  id: "11111111-1111-4111-8111-111111111111",
  category: "sponsorship",
  question: { "zh-HK": "助養問題", en: "Sponsor question" },
  answer: { "zh-HK": "答案", en: "Answer" },
  keywords: { "zh-HK": [], en: [] },
  ctaKey: null,
  sensitive: false,
  sortOrder: 0,
  isActive: true,
};
const MEMBER = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Member",
  roleTitle: "Chair",
  sortOrder: 0,
  effectiveDate: "2026-08-01",
  isActive: true,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
};

type MutationOptions = { mutationFn: (input: unknown) => Promise<unknown> };
const mutations: MutationOptions[] = [];
const calls: Array<{ url: string; method: string | undefined }> = [];
let failure: unknown = null;

mock.module("../../../lib/admin/http", () => ({
  fetchAdminJson: async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method });
    if (failure) throw failure;
    return { ok: true };
  },
  getAdminAccessToken: async () => "token",
}));

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useMutation: (options: MutationOptions) => {
    mutations.push(options);
    return {
      mutate: () => {},
      mutateAsync: async () => {},
      isPending: false,
      isError: false,
      error: null,
    };
  },
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data:
      queryKey[0] === "admin-faq-search-gaps"
        ? { days: 30, gaps: [] }
        : queryKey[0] === "admin-governance"
          ? [MEMBER]
          : [ENTRY],
    error: null,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: () => {},
  }),
}));

const { renderAdminInChinese, renderAdminInEnglish, expectNoChineseText } =
  await import("../i18n/testing");
const { FaqManagement } = await import("./FaqManagement");
const { GovernanceManagement } = await import("./GovernanceManagement");

/**
 * Renders the screen, then runs each mutationFn it registered until one sends a DELETE to `url`,
 * and returns what that one rejected with.
 */
async function failedDelete(render: () => string, url: string, input: unknown): Promise<unknown> {
  mutations.length = 0;
  render();
  for (const options of [...mutations]) {
    calls.length = 0;
    const outcome = await Promise.resolve()
      .then(() => options.mutationFn(input))
      .then(
        () => null,
        (error: unknown) => error,
      );
    if (calls.some((call) => call.url === url && call.method === "DELETE")) return outcome;
  }
  throw new Error(`no mutation sent DELETE ${url}`);
}

const faqInput = { id: ENTRY.id, reason: "duplicate question" };
const memberInput = { id: MEMBER.id, reason: "term ended" };

describe("a failed FAQ disable, inside its dialog", () => {
  test("zh: shows 停用操作失敗，請再試一次。, not the server's English text", async () => {
    failure = new AdminHttpError("Invalid FAQ request", 400);
    const error = await failedDelete(
      () => renderAdminInChinese(<FaqManagement />),
      "/api/admin/faq",
      faqInput,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("停用操作失敗，請再試一次。");
    failure = null;
  });

  test("en: shows the English failure line", async () => {
    failure = new AdminHttpError("Could not process FAQ request", 500);
    const error = await failedDelete(
      () => renderAdminInEnglish(<FaqManagement />),
      "/api/admin/faq",
      faqInput,
    );
    expect((error as Error).message).toBe("Could not disable the question. Try again.");
    expectNoChineseText((error as Error).message);
    failure = null;
  });

  test("a lapsed session still says so, rather than the generic line", async () => {
    failure = new AdminSessionError("not_signed_in");
    const error = await failedDelete(
      () => renderAdminInEnglish(<FaqManagement />),
      "/api/admin/faq",
      faqInput,
    );
    expect(error).toBeInstanceOf(AdminSessionError);
    failure = null;
  });
});

describe("a failed board member step-down, inside its dialog", () => {
  test("zh: shows 卸任操作失敗，請再試一次。, not the server's English text", async () => {
    failure = new AdminHttpError("Board member not found", 404);
    const error = await failedDelete(
      () => renderAdminInChinese(<GovernanceManagement />),
      "/api/admin/governance",
      memberInput,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("卸任操作失敗，請再試一次。");
    failure = null;
  });

  test("en: shows the English failure line", async () => {
    failure = new AdminHttpError("Could not process governance request", 500);
    const error = await failedDelete(
      () => renderAdminInEnglish(<GovernanceManagement />),
      "/api/admin/governance",
      memberInput,
    );
    expect((error as Error).message).toBe("Could not mark the member as stepped down. Try again.");
    expectNoChineseText((error as Error).message);
    failure = null;
  });

  test("a successful step-down still resolves", async () => {
    failure = null;
    const outcome = await failedDelete(
      () => renderAdminInChinese(<GovernanceManagement />),
      "/api/admin/governance",
      memberInput,
    );
    expect(outcome).toBeNull();
  });
});
