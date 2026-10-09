import { describe, expect, mock, test } from "bun:test";

import type { AdminIdentity } from "../../../lib/admin/access";
import { AdminApiError, AdminSessionError } from "../../../lib/admin/session";
import type { DocumentAsset } from "../../../lib/documents/types";
import type { BoardMember } from "../../../lib/governance/types";
import type { AdminKnowledgePage, KnowledgePost } from "../../../lib/knowledge/types";
import type { PaymentPublicConfig } from "../../../lib/paymentPublicConfig/types";
import { adminCommonCopy } from "../i18n/adminCommonCopy";
import {
  collectCopyStrings,
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../i18n/testing";

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

const realQuery = await import("@tanstack/react-query");

/**
 * How the screens are rendered here. They read their data through React Query, so it is replaced
 * for this file only (it runs with `--isolate`, as `bun run test` does, because `mock.module`
 * outlives the file otherwise).
 *
 * - `useQuery` answers by the first part of the query key, so a static render shows a loaded
 *   screen. `failures` names the queries that fail (and the error each fails with), and `loading`
 *   names the ones that have not answered yet.
 * - `useMutation` returns `state.mutationError` as the error of every mutation of a screen.
 *
 * The forms that open from a button, and the views that take their data as props, are rendered
 * directly.
 */
const state = {
  failures: {} as Record<string, unknown>,
  loading: new Set<string>(),
  mutationError: null as Error | null,
};

// Names, titles and labels staff typed are data: shown as stored in both languages. Every one is a
// token that is not a UI label (a test below checks that).
const DATA = ["丙1", "丙2", "丁1", "丁2", "戊1", "戊2", "戊3", "己1", "己2", "庚1", "辛1"];
const [
  CHAIR,
  TREASURER,
  TITLE_ONE,
  TITLE_TWO,
  POST_ONE,
  POST_TWO,
  POST_THREE,
  INTRO,
  TOPIC,
  DOC,
  PAY_ZH,
] = DATA;

const stamp = "2026-07-18T00:00:00.000Z";
const members: BoardMember[] = [
  {
    id: "m1",
    name: CHAIR,
    roleTitle: TITLE_ONE,
    sortOrder: 0,
    effectiveDate: "2026-08-01",
    isActive: true,
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: "m2",
    name: TREASURER,
    roleTitle: TITLE_TWO,
    sortOrder: 1,
    effectiveDate: "2025-01-15",
    isActive: false,
    createdAt: stamp,
    updatedAt: stamp,
  },
];

const posts: KnowledgePost[] = [
  {
    id: "post-1",
    title: POST_ONE,
    topic: TOPIC,
    shortIntro: INTRO,
    sourceName: "HKSCDA",
    destination: { kind: "external", url: "https://example.test/guide" },
    isPublished: true,
    sortOrder: 2,
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: "post-2",
    title: POST_TWO,
    topic: TOPIC,
    shortIntro: INTRO,
    sourceName: null,
    destination: { kind: "document", assetId: "asset-elsewhere" },
    isPublished: false,
    sortOrder: 3,
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: "paired-post",
    title: POST_THREE,
    topic: TOPIC,
    shortIntro: INTRO,
    sourceName: null,
    destination: { kind: "document_pair", zhHkAssetId: "zh-asset", enAssetId: "en-asset" },
    isPublished: true,
    sortOrder: 4,
    createdAt: stamp,
    updatedAt: stamp,
  },
];
const knowledgePage: AdminKnowledgePage = { posts, total: 120, page: 2, pageSize: 50 };
const documentAsset: DocumentAsset = {
  id: "asset-1",
  kind: "adoption_guide",
  title: DOC,
  language: "zh-HK",
  bucketName: "site-documents",
  objectPath: "adoption/guide.pdf",
  fileUrl: "https://cdn.example.test/guide.pdf",
  mimeType: "application/pdf",
  byteSize: 1234,
  checksumSha256: null,
  isPublished: true,
  sortOrder: 1,
  createdAt: stamp,
  updatedAt: stamp,
};

const config: PaymentPublicConfig = {
  id: "11111111-1111-1111-1111-111111111111",
  method: "fps",
  isPubliclyVisible: true,
  displayLabelZh: `${PAY_ZH} FPS`,
  displayLabelEn: "Faster Payment System",
  sortOrder: 2,
  details: {},
  state: "in_review",
  version: 2,
  createdBy: "admin-1",
  updatedBy: "admin-1",
  submittedBy: "admin-1",
  submittedAt: stamp,
  publishedBy: null,
  publishedAt: null,
  archivedBy: null,
  archivedAt: null,
  createdAt: stamp,
  updatedAt: stamp,
};
const treasurerOne: AdminIdentity = {
  id: "admin-1",
  authUserId: "auth-1",
  email: "treasurer1@example.com",
  role: "treasurer",
  status: "active",
};
const treasurerTwo: AdminIdentity = { ...treasurerOne, id: "admin-2", authUserId: "auth-2" };

mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useMutation: () => ({
    mutate() {},
    isPending: false,
    isError: state.mutationError !== null,
    error: state.mutationError,
  }),
  useQuery: (options: { queryKey: readonly unknown[] }) => {
    const key = String(options.queryKey[0]);
    const base = { isFetching: false, refetch() {} };
    if (state.loading.has(key)) {
      return {
        ...base,
        data: undefined,
        isLoading: true,
        isError: false,
        isSuccess: false,
        error: null,
      };
    }
    if (key in state.failures) {
      return {
        ...base,
        data: undefined,
        isLoading: false,
        isError: true,
        isSuccess: false,
        error: state.failures[key],
      };
    }
    const done = { ...base, isLoading: false, isError: false, isSuccess: true, error: null };
    if (key === "admin-me") return { ...done, data: { admin: treasurerTwo } };
    if (key === "admin-governance") return { ...done, data: members };
    if (key === "admin-knowledge") return { ...done, data: knowledgePage };
    if (key === "admin-knowledge-documents") {
      return { ...done, data: { items: [documentAsset], total: 120 } };
    }
    if (key === "adoption-guide-release-ownership") {
      return {
        ...done,
        data: {
          ownerReleaseIdsByAssetId: {},
          ownerReleaseIdsByKnowledgePostId: {
            "paired-post": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          },
        },
      };
    }
    if (key === "payment-methods") {
      return { ...done, data: { items: [config], total: 1, page: 1, pageSize: 50 } };
    }
    return { ...done, data: undefined };
  },
}));

const { BoardMemberForm, GovernanceManagement } = await import("./GovernanceManagement");
const { KnowledgeManagement, KnowledgeManagementView } = await import("./KnowledgeManagement");
const { PaymentMethodsManagement, PaymentMethodsManagementView } =
  await import("./PaymentMethodsManagement");
const { governanceCopy } = await import("./governanceCopy");
const { knowledgeCopy } = await import("./knowledgeCopy");
const { paymentMethodsCopy } = await import("./paymentMethodsCopy");
const { cmsStateCopy } = await import("./cmsStateCopy");
const { paymentMethodSaveFailure, paymentMethodSaveFailureText } =
  await import("./paymentMethodsLogic");

function expectAll(markup: string, texts: string[]) {
  for (const text of texts) expect(markup, text).toContain(text);
}

function reset() {
  state.failures = {};
  state.loading = new Set();
  state.mutationError = null;
}

const noop = () => {};

describe("team and governance in English", () => {
  test("shows the list in English, with the dates in the English format", () => {
    reset();
    const markup = renderAdminInEnglish(<GovernanceManagement />);
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      ">Team and governance</h1>",
      "Add member",
      ">Name</th>",
      ">Position</th>",
      ">Sort order</th>",
      ">Effective date</th>",
      ">Status</th>",
      ">1 Aug 2026 (Sat)</td>",
      ">15 Jan 2025 (Wed)</td>",
      ">In office</td>",
      ">Stepped down</td>",
      ">Edit</button>",
      ">Mark as stepped down</button>",
    ]);
  });

  test("says what to do after a failed step down", () => {
    reset();
    state.mutationError = new Error("boom");
    const markup = renderAdminInEnglish(<GovernanceManagement />);
    expect(markup).toContain("Could not mark the member as stepped down. Try again.");
    reset();
  });

  test("shows loading and a failed load in English", () => {
    reset();
    state.loading.add("admin-governance");
    expect(renderAdminInEnglish(<GovernanceManagement />)).toContain("Loading…");
    reset();
    state.failures["admin-governance"] = new Error("boom");
    const failed = renderAdminInEnglish(<GovernanceManagement />);
    expectAll(failed, ["Could not load the team list", "Retry"]);
    expect(failed).not.toContain("<table");
    reset();
  });

  test("names the member form's fields in English", () => {
    const markup = renderAdminInEnglish(
      <BoardMemberForm
        draft={{ name: CHAIR, roleTitle: TITLE_ONE, sortOrder: 0, effectiveDate: "2026-08-01" }}
        onDraftChange={noop}
        onSubmit={noop}
        onCancel={noop}
        pending={false}
        failed
      />,
    );
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Name",
      "Position",
      "Sort order",
      "Effective date",
      "Could not save. Check the details and try again.",
      ">Save</button>",
      ">Cancel</button>",
    ]);
  });

  test("keeps the Chinese screen as it was, with the effective day in the shared format", () => {
    reset();
    const markup = renderAdminInChinese(<GovernanceManagement />);
    expectAll(markup, [
      ">團隊與管治</h1>",
      "新增成員",
      ">姓名</th>",
      ">職銜</th>",
      ">生效日期</th>",
      ">2026年8月1日 (六)</td>",
      ">在任</td>",
      ">已卸任</td>",
      ">編輯</button>",
      ">卸任</button>",
    ]);
    const form = renderAdminInChinese(
      <BoardMemberForm
        draft={{ name: CHAIR, roleTitle: TITLE_ONE, sortOrder: 0, effectiveDate: "2026-08-01" }}
        onDraftChange={noop}
        onSubmit={noop}
        onCancel={noop}
        pending={false}
        failed
      />,
    );
    expectAll(form, [
      "職銜",
      "儲存失敗，請檢查資料後再試一次。",
      ">儲存</button>",
      ">取消</button>",
    ]);
    state.mutationError = new Error("boom");
    expect(renderAdminInChinese(<GovernanceManagement />)).toContain("卸任操作失敗，請再試一次。");
    reset();
  });
});

describe("the knowledge base in English", () => {
  test("shows the picker, the filters, the editors and the pager in English", () => {
    reset();
    const markup = renderAdminInEnglish(<KnowledgeManagement />);
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      // picker
      ">Choose a reference document</h2>",
      "Search documents",
      "Reference documents pagination",
      "Showing 1–50 of 120",
      "Only published PDFs can be chosen. Your current choice is kept when you switch document pages.",
      // view
      ">Website content</p>",
      ">Knowledge base</h1>",
      "Manage the public adoption information, pet care and reference links.",
      "Search",
      "Publication status",
      ">All</option>",
      ">Published</option>",
      ">Draft</option>",
      // editor
      ">Add knowledge article</h2>",
      "Title",
      "Topic",
      "Short introduction",
      "Link type",
      ">External URL</option>",
      ">PDF document</option>",
      "HTTPS URLs only",
      "Source",
      "Sort order",
      ">Choose a published PDF</option>",
      ">Current choice (on another page)</option>",
      "Save</button>",
      "Delete</button>",
      "Knowledge articles pagination",
      // a post a release manages
      "Managed in post-adoption guide releases",
      "Chinese asset ID",
      "English asset ID",
    ]);
  });

  test("names the publication of a post in English", () => {
    const published = renderAdminInEnglish(
      <KnowledgeManagementView
        data={{ posts: [posts[0]], total: 1, page: 1, pageSize: 50 }}
        documents={[documentAsset]}
        query=""
        onSave={noop}
        onDelete={noop}
      />,
    );
    expect(published).toContain("Published</label>");
    const draft = renderAdminInEnglish(
      <KnowledgeManagementView
        data={{ posts: [posts[1]], total: 1, page: 1, pageSize: 50 }}
        documents={[documentAsset]}
        query=""
        onSave={noop}
      />,
    );
    expect(draft).toContain("Draft</label>");
    expectNoChineseText(published + draft, { allow: DATA });
  });

  test("shows loading, an empty list and an error in English", () => {
    expect(
      renderAdminInEnglish(
        <KnowledgeManagementView loading data={undefined} documents={[]} query="" />,
      ),
    ).toContain("Loading knowledge posts");
    const empty = renderAdminInEnglish(
      <KnowledgeManagementView
        data={{ posts: [], total: 0, page: 1, pageSize: 50 }}
        documents={[]}
        query=""
      />,
    );
    expect(empty).toContain("No knowledge base articles yet.");
    const failed = renderAdminInEnglish(
      <KnowledgeManagementView
        data={{ posts: [], total: 0, page: 1, pageSize: 50 }}
        documents={[]}
        query=""
        error="Could not load"
      />,
    );
    expect(failed).toContain("Could not load");
    expect(failed).not.toContain("No knowledge base articles yet.");
  });

  test("fails closed and says what to do while ownership is unknown", () => {
    const markup = renderAdminInEnglish(
      <KnowledgeManagementView
        data={knowledgePage}
        documents={[]}
        query=""
        ownershipReady={false}
        onSave={noop}
      />,
    );
    expect(markup).toContain("Could not verify ownership. Refresh the page or try again later.");
    expect(markup).not.toContain("Save");
  });

  test("shows a failed load in English, and translates a session error", () => {
    reset();
    state.failures["admin-knowledge"] = new AdminSessionError("not_signed_in");
    expect(renderAdminInEnglish(<KnowledgeManagement />)).toContain(
      "Not signed in. Sign in again.",
    );
    expect(renderAdminInChinese(<KnowledgeManagement />)).toContain("未登入");
    reset();
  });

  test("writes the delete question in English", () => {
    expect(knowledgeCopy.en.editor.confirmDelete("Cat guide")).toBe(
      'Delete "Cat guide"? This cannot be undone.',
    );
    expect(knowledgeCopy.en.editor.thisArticle).toBe("this article");
    expect(knowledgeCopy.zh.editor.confirmDelete("甲")).toBe("確定刪除「甲」？此操作無法復原。");
    expect(knowledgeCopy.zh.editor.thisArticle).toBe("此文章");
  });

  test("keeps the Chinese screen as it was, English labels included", () => {
    reset();
    const markup = renderAdminInChinese(<KnowledgeManagement />);
    expectAll(markup, [
      ">參考文件選擇</h2>",
      "搜尋文件",
      "只可選擇已發布 PDF。切換文件頁面會保留目前所選文件。",
      // the eyebrow and these labels have always been English in the Chinese screen
      ">Content</p>",
      ">知識專區</h1>",
      "管理公開領養資訊、寵物照顧及參考連結。",
      "Publication",
      ">新增知識文章</h2>",
      "簡介",
      "連結方式",
      ">外部網址</option>",
      "只接受 HTTPS 網址",
      ">選擇已發布 PDF</option>",
      ">目前已選文件（其他頁面）</option>",
      "排序",
      "Save</button>",
      "Delete</button>",
      "由領養指南版本管理",
      "Chinese asset ID",
    ]);
  });
});

describe("payment method settings in English", () => {
  const view = (
    identity: AdminIdentity | undefined,
    configs: PaymentPublicConfig[],
    extra: { errorMessage?: string; pending?: boolean } = {},
  ) => (
    <PaymentMethodsManagementView
      identity={identity}
      configs={configs}
      pending={extra.pending ?? false}
      errorMessage={extra.errorMessage}
      onSubmit={noop}
      onWithdraw={noop}
      onPublish={noop}
    />
  );

  test("shows the English name, the state and the approval rule in English", () => {
    const markup = renderAdminInEnglish(view(treasurerOne, [config]));
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      ">Payment method settings</h1>",
      "Faster Payment System",
      "(FPS)",
      ">In review</span>",
      ">Withdraw</button>",
      ">Approve and publish</button>",
      "Another treasurer or administrator must approve this",
    ]);
    expect(markup).not.toContain(PAY_ZH);
  });

  test("names the actions of a draft, and a method that is not public", () => {
    const markup = renderAdminInEnglish(
      view(treasurerOne, [{ ...config, state: "draft", isPubliclyVisible: false }]),
    );
    expectAll(markup, [">Draft</span>", ">Submit for approval</button>", "Not public"]);
    expect(markup).not.toContain("Withdraw");
  });

  test("names every state in English", () => {
    for (const [stateName, label] of [
      ["draft", "Draft"],
      ["in_review", "In review"],
      ["published", "Published"],
      ["archived", "Archived"],
    ] as const) {
      const markup = renderAdminInEnglish(view(treasurerTwo, [{ ...config, state: stateName }]));
      expect(markup).toContain(`>${label}</span>`);
    }
  });

  test("names the method behind each setting in English, and shows its stored code in Chinese", () => {
    const methods = [
      // A payment method is named as its product is, with nothing added.
      ["stripe", "Stripe"],
      ["payme", "PayMe"],
      ["fps", "FPS"],
      ["paypal", "PayPal"],
      ["alipayhk", "AlipayHK"],
    ] as const;
    for (const [code, name] of methods) {
      const configs = [{ ...config, method: code }];
      expect(renderAdminInEnglish(view(treasurerOne, configs))).toContain(`(${name})</span>`);
      expect(renderAdminInChinese(view(treasurerOne, configs))).toContain(`(${code})</span>`);
    }
    // A method the screen does not know shows its code.
    expect(paymentMethodsCopy.en.method("new_method")).toBe("new_method");
    expect(paymentMethodsCopy.zh.method("fps")).toBe("fps");
  });

  test("shows an empty list and an error in English", () => {
    expect(renderAdminInEnglish(view(treasurerOne, []))).toContain(
      "No payment methods have been set up yet",
    );
    expect(
      renderAdminInEnglish(view(treasurerOne, [], { errorMessage: "Could not publish" })),
    ).toContain("Could not publish");
  });

  test("the runtime shows loading and a failed load in English", () => {
    reset();
    state.loading.add("payment-methods");
    expect(renderAdminInEnglish(<PaymentMethodsManagement />)).toContain(
      "Loading payment method settings...",
    );
    reset();
    state.failures["payment-methods"] = new Error("boom");
    const failed = renderAdminInEnglish(<PaymentMethodsManagement />);
    expect(failed).toContain("Could not load the payment method settings. Refresh the page.");
    expectNoChineseText(failed, { allow: DATA });
    expect(renderAdminInChinese(<PaymentMethodsManagement />)).toContain(
      "無法載入付款方式設定，請重新整理頁面。",
    );
    reset();
  });

  test("writes a failed action from its cause first, else from its code", () => {
    const en = paymentMethodsCopy.en.errors;
    const zh = paymentMethodsCopy.zh.errors;
    // The two save errors have always been English in the Chinese screen.
    expect(zh.conflict).toBe("This configuration changed elsewhere. Reload before saving again.");
    expect(zh.save_failed).toBe("Unable to save this configuration.");

    const conflict = paymentMethodSaveFailure(
      new AdminApiError({ status: 409, code: "conflict", message: "Changed elsewhere" }),
    );
    expect(conflict).toEqual({ code: "conflict" });
    expect(paymentMethodSaveFailureText(conflict, en, "en")).toBe(
      "This configuration changed elsewhere. Reload the page before saving again.",
    );
    expect(paymentMethodSaveFailureText(conflict, zh, "zh")).toBe(zh.conflict);

    const server = new Error("Configuration is not in review");
    expect(paymentMethodSaveFailureText(paymentMethodSaveFailure(server), en, "en")).toBe(
      "Configuration is not in review",
    );
    const session = new AdminSessionError("not_signed_in");
    expect(paymentMethodSaveFailureText(paymentMethodSaveFailure(session), en, "en")).toBe(
      "Not signed in. Sign in again.",
    );
    expect(paymentMethodSaveFailureText(paymentMethodSaveFailure(session), zh, "zh")).toBe(
      "未登入",
    );
    // An error without a message, or something that is not an error, shows the code's text.
    for (const error of [new Error(""), "text", undefined]) {
      const failure = paymentMethodSaveFailure(error);
      expect(failure).toEqual({ code: "save_failed", cause: undefined });
      expect(paymentMethodSaveFailureText(failure, en, "en")).toBe(
        "Could not save this configuration. Check the details and try again.",
      );
      expect(paymentMethodSaveFailureText(failure, zh, "zh")).toBe(zh.save_failed);
    }
  });

  test("keeps the Chinese screen as it was, with the Chinese name and the stored method", () => {
    const markup = renderAdminInChinese(view(treasurerOne, [config]));
    expectAll(markup, [
      ">付款方式設定</h1>",
      `${PAY_ZH} FPS`,
      "(fps)",
      ">審閱中</span>",
      ">撤回</button>",
      ">核准並發佈</button>",
      "需要由另一位財務或管理員核准",
    ]);
    expect(markup).not.toContain("Faster Payment System");
    const draft = renderAdminInChinese(
      view(treasurerOne, [{ ...config, state: "draft", isPubliclyVisible: false }]),
    );
    expectAll(draft, [">草稿</span>", ">提交審批</button>", "未公開"]);
    expect(renderAdminInChinese(view(treasurerOne, []))).toContain("尚未建立任何付款方式設定");
  });
});

describe("the copy modules", () => {
  const modules = [governanceCopy, knowledgeCopy, paymentMethodsCopy];

  test("have no Chinese in English and as many texts in English as in Chinese", () => {
    for (const module of modules) {
      expectNoChineseInCopy(module.en);
      expect(collectCopyStrings(module.en).length).toBeGreaterThan(0);
      expect(collectCopyStrings(module.zh).length).toBe(collectCopyStrings(module.en).length);
    }
  });

  test("fixture values are not labels, so allowing them cannot hide an untranslated label", () => {
    const labels = [...modules, cmsStateCopy, adminCommonCopy]
      .flatMap((module) => collectCopyStrings(module.zh))
      .filter((text) => text.length >= 2 && /\p{Script=Han}/u.test(text));
    const clashes = DATA.flatMap((data) =>
      labels
        .filter((label) => data.includes(label) || label.includes(data))
        .map((label) => `${data} / ${label}`),
    );
    expect(clashes).toEqual([]);
  });
});
