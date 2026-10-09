import { describe, expect, mock, test } from "bun:test";

import type { AboutPageContent, TnrPageContent } from "../../../lib/aboutPages/types";
import { AdminSessionError } from "../../../lib/admin/session";
import { initialAdoptionInstructionContent } from "../../../lib/adoptionInstructions/content";
import type { AdoptionInstructionAdminPage } from "../../../lib/adoptionInstructions/repository.server";
import type { AdoptionInstructionContent } from "../../../lib/adoptionInstructions/types";
import type {
  AdminAdoptionInformationPage,
  AdoptionRuleContent,
  CareTopic,
  DogFriendlyEstate,
} from "../../../lib/adoptionInformation/types";
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
const realRouter = await import("@tanstack/react-router");

/**
 * How the screens are rendered here. They read their data through React Query, so it is replaced
 * for this file only (it runs with `--isolate`, as `bun run test` does, because `mock.module`
 * outlives the file otherwise).
 *
 * - `useQuery` answers by the first part of the query key, so a static render shows a loaded
 *   screen. `failures` names the queries that fail (and the error each fails with), and `loading`
 *   names the ones that have not answered yet.
 * - `useMutation` returns `state.mutationError` as the error of every mutation of a screen.
 * - The router's `useBlocker` does nothing.
 *
 * The forms that open from a button are exported by their modules and rendered directly.
 */
const state = {
  failures: {} as Record<string, unknown>,
  loading: new Set<string>(),
  mutationError: null as Error | null,
};

// Text staff typed is data: it is shown as stored in both languages. Every value in these
// fixtures is a token that is not a label (a test below checks that), so the allowance cannot hide
// an untranslated label.
let tokenCount = 0;
const DATA: string[] = [];
function token(): string {
  tokenCount += 1;
  const value = `甲${tokenCount}`;
  DATA.push(value);
  return value;
}
/** The same shape with every string replaced by a Chinese data token. */
function withTokens<T>(value: T): T {
  if (typeof value === "string") return token() as T;
  if (Array.isArray(value)) return value.map((item) => withTokens(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, withTokens(child)]),
    ) as T;
  }
  return value;
}

const about: AboutPageContent = withTokens({
  hero: { eyebrow: "x", title: "x", description: "x" },
  mission: { eyebrow: "x", title: "x", body: "x", sideBadge: "x", sideBody: "x" },
  impact: { eyebrow: "x", title: "x", description: "x" },
  journey: {
    eyebrow: "x",
    title: "x",
    steps: [
      { title: "x", description: "x" },
      { title: "x", description: "x" },
      { title: "x", description: "x" },
      { title: "x", description: "x" },
    ],
  },
  communityBand: {
    eyebrow: "x",
    title: "x",
    description: "x",
    cccpCard: { title: "x", description: "x" },
    tnrCard: { title: "x", description: "x" },
  },
  responsibleAdoption: {
    eyebrow: "x",
    title: "x",
    body: "x",
    linkLabel: "x",
    sideTitle: "x",
    principles: ["x", "x", "x"],
  },
  helpPaths: {
    eyebrow: "x",
    title: "x",
    items: [
      { title: "x", description: "x", label: "x" },
      { title: "x", description: "x", label: "x" },
      { title: "x", description: "x", label: "x" },
      { title: "x", description: "x", label: "x" },
    ],
  },
  closing: { title: "x", description: "x", buttonLabel: "x" },
});
const tnr: TnrPageContent = withTokens({
  hero: { eyebrow: "x", title: "x", description: "x" },
  stages: [
    { title: "x", description: "x" },
    { title: "x", description: "x" },
    { title: "x", description: "x" },
  ],
  chapter: { title: "x", description: "x", bullets: ["x", "x", "x"] },
  cta: { eyebrow: "x", title: "x", descriptionPrefix: "x" },
});
const pages = { about, tnr, cccp: null };

const fees: AdminAdoptionInformationPage = {
  resource: "fees",
  items: [
    {
      id: "f1",
      animalType: "dog",
      itemName: "Typical Species",
      priceHkd: "HK$1,500",
      sortOrder: 0,
      isPublished: true,
      version: 1,
    },
    {
      id: "f2",
      animalType: "cat",
      itemName: "DSH",
      priceHkd: "500",
      sortOrder: 0,
      isPublished: true,
      version: 1,
    },
  ],
  total: 2,
  page: 1,
  pageSize: 50,
};

const estateRows: DogFriendlyEstate[] = [
  {
    id: "e1",
    version: 1,
    estateName: token(),
    district: token(),
    notes: token(),
    sortOrder: 0,
    isPublished: true,
  },
  {
    id: "e2",
    version: 2,
    estateName: token(),
    district: token(),
    notes: null,
    sortOrder: 1,
    isPublished: false,
  },
];
const estates: AdminAdoptionInformationPage = {
  resource: "estates",
  items: estateRows,
  total: 2,
  page: 1,
  pageSize: 50,
};

const ruleRows: AdoptionRuleContent[] = [
  {
    id: "r1",
    content: { "zh-HK": token(), en: "Keep the animal safe" },
    sortOrder: 0,
    isPublished: true,
  },
  {
    id: "r2",
    content: { "zh-HK": token(), en: "Visit before adopting" },
    sortOrder: 1,
    isPublished: false,
  },
];
const topicRows: CareTopic[] = [
  {
    id: "c1",
    animalType: "cat",
    label: { "zh-HK": token(), en: "Home" },
    content: { "zh-HK": token(), en: "Content A" },
    sortOrder: 0,
    isPublished: true,
  },
  {
    id: "c2",
    animalType: "cat",
    label: { "zh-HK": token(), en: "Food" },
    content: { "zh-HK": token(), en: "Content B" },
    sortOrder: 1,
    isPublished: false,
  },
];

const instructionContent: AdoptionInstructionContent = withTokens(
  initialAdoptionInstructionContent,
);
const publishedRevision = {
  id: "11111111-1111-4111-8111-111111111111",
  pageKey: "adoption-instructions",
  revisionNumber: 1,
  state: "published" as const,
  content: instructionContent,
  version: 1,
  sourceRevisionId: null,
  createdBy: null,
  updatedBy: "staff-a",
  publishedBy: null,
  publishedAt: "2026-09-26T00:00:00Z",
  createdAt: "2026-09-26T00:00:00Z",
  updatedAt: "2026-09-26T00:00:00Z",
};
const instructionPage: AdoptionInstructionAdminPage = {
  page: {
    pageKey: "adoption-instructions",
    publishedRevisionId: publishedRevision.id,
    draftRevisionId: "22222222-2222-4222-8222-222222222222",
    version: 2,
    createdAt: publishedRevision.createdAt,
    updatedAt: publishedRevision.updatedAt,
  },
  published: publishedRevision,
  draft: {
    ...publishedRevision,
    id: "22222222-2222-4222-8222-222222222222",
    state: "draft",
    version: 4,
    revisionNumber: 2,
  },
  history: [
    publishedRevision,
    {
      ...publishedRevision,
      id: "33333333-3333-4333-8333-333333333333",
      state: "archived",
      revisionNumber: 0,
      publishedAt: null as never,
    },
  ],
};

type QueryKey = readonly unknown[];

mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useMutation: () => ({
    mutate() {},
    mutateAsync: async () => undefined,
    isPending: false,
    isError: state.mutationError !== null,
    error: state.mutationError,
  }),
  useQuery: (options: { queryKey: QueryKey }) => {
    const key = String(options.queryKey[0]);
    const base = {
      isFetching: false,
      refetch() {},
    };
    const done = { ...base, isLoading: false, isPending: false, isError: false, error: null };
    if (state.loading.has(key)) {
      return {
        ...base,
        data: undefined,
        isLoading: true,
        isPending: true,
        isError: false,
        error: null,
      };
    }
    if (key in state.failures) {
      return {
        ...base,
        data: undefined,
        isLoading: false,
        isPending: false,
        isError: true,
        error: state.failures[key],
      };
    }
    if (key === "admin-me") return { ...done, data: { admin: { role: "admin" } } };
    if (key === "admin-about-pages") return { ...done, data: pages };
    if (key === "admin-adoption-instructions") return { ...done, data: instructionPage };
    if (key === "admin-adoption-information") {
      const second = String(options.queryKey[1]);
      if (second === "rules") {
        return {
          ...done,
          data: { resource: "rules", items: ruleRows, total: 2, page: 1, pageSize: 50 },
        };
      }
      if (second === "careTopics") {
        return {
          ...done,
          data: { resource: "careTopics", items: topicRows, total: 2, page: 1, pageSize: 50 },
        };
      }
      return { ...done, data: second.includes("estates") ? estates : fees };
    }
    return { ...done, data: undefined };
  },
}));

mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useBlocker: () => ({ status: "idle", reset() {}, proceed() {} }),
}));

const { AboutPagesManagement, AboutPagesManagementView } = await import("./AboutPagesManagement");
const {
  AdoptionContentTabs,
  AdoptionInformationManagement,
  AdoptionInformationManagementView,
  EstateEditor,
} = await import("./AdoptionInformationManagement");
const { AdoptionRuleForm, AdoptionRulesManagement } = await import("./AdoptionRulesManagement");
const { CareTopicForm, CareTopicsManagement } = await import("./CareTopicsManagement");
const { AdoptionInstructionsManagement, AdoptionInstructionsManagementView } =
  await import("./AdoptionInstructionsManagement");
const { AdoptionInstructionsPreviewPage } =
  await import("../../../routes/admin/content/adoption-preview");
const { aboutPagesCopy } = await import("./aboutPagesCopy");
const { adoptionInformationCopy } = await import("./adoptionInformationCopy");
const { adoptionRulesCopy } = await import("./adoptionRulesCopy");
const { adoptionInstructionsCopy } = await import("./adoptionInstructionsCopy");
const { adoptionPreviewCopy } = await import("../../../routes/admin/content/-adoptionPreviewCopy");

function expectAll(markup: string, texts: string[]) {
  for (const text of texts) expect(markup, text).toContain(text);
}

function reset() {
  state.failures = {};
  state.loading = new Set();
  state.mutationError = null;
}

const noop = () => {};

describe("about pages in English", () => {
  const view = (
    activeTab: "about" | "tnr",
    props: { isSaving?: boolean; isSaveError?: boolean } = {},
  ) => (
    <AboutPagesManagementView
      activeTab={activeTab}
      onTabChange={noop}
      drafts={pages as never}
      onAboutDraftChange={noop}
      onTnrDraftChange={noop}
      onSave={noop}
      isSaving={props.isSaving ?? false}
      isSaveError={props.isSaveError ?? false}
    />
  );

  test("names the About us form's groups and fields in English", () => {
    const markup = renderAdminInEnglish(view("about"));
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      ">Website content</p>",
      ">About pages management</h1>",
      ">About us</button>",
      ">TNR</button>",
      ">Main banner</legend>",
      ">Our mission</legend>",
      ">Public information</legend>",
      ">Four key steps</legend>",
      ">TNR banner</legend>",
      ">TNR card</p>",
      ">Responsible adoption</legend>",
      ">Four ways to take part</legend>",
      ">Closing</legend>",
      "Lead-in<",
      "Title<",
      "Description<",
      "Body<",
      "Sidebar label<",
      "Sidebar text<",
      "Link text<",
      "Sidebar title<",
      "Button text<",
      "Step 1 title<",
      "Step 4 description<",
      "Principle 3<",
      "Item 1 title<",
      "Item 4 button text<",
      "Save</button>",
    ]);
    expect(markup).not.toContain("Could not save");
  });

  test("names the TNR form's groups and fields in English", () => {
    const markup = renderAdminInEnglish(view("tnr"));
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      ">Main banner</legend>",
      ">Three stages</legend>",
      "Stage 1 title<",
      "Stage 3 description<",
      ">Community involvement</legend>",
      "Point 1<",
      ">Call to action</legend>",
      "Description prefix<",
    ]);
  });

  test("says what to do after a failed save", () => {
    const markup = renderAdminInEnglish(view("about", { isSaveError: true }));
    expect(markup).toContain("Could not save. Check the details and try again.");
    expect(markup).toContain('role="alert"');
  });

  test("shows loading and a failed load in English", () => {
    reset();
    state.loading.add("admin-about-pages");
    expect(renderAdminInEnglish(<AboutPagesManagement />)).toContain("Loading page content…");
    reset();
    state.failures["admin-about-pages"] = new Error("boom");
    const failed = renderAdminInEnglish(<AboutPagesManagement />);
    expectAll(failed, ["Could not load the page content", "Retry"]);
    expectNoChineseText(failed);
    reset();
  });

  test("keeps the Chinese form as it was", () => {
    const markup = renderAdminInChinese(view("about", { isSaveError: true }));
    expectAll(markup, [
      ">宣傳內容</p>",
      ">關於頁面管理</h1>",
      ">關於我們</button>",
      ">主視覺</legend>",
      ">我們的使命</legend>",
      ">四個重要步驟</legend>",
      "引言<",
      "步驟 1 標題<",
      "原則 3<",
      "項目 4 按鈕文字<",
      "儲存失敗，請檢查資料後再試一次。",
    ]);
    const tnrMarkup = renderAdminInChinese(view("tnr"));
    expectAll(tnrMarkup, [
      ">三個階段</legend>",
      "階段 2 描述<",
      "重點 3<",
      ">行動呼籲</legend>",
      "描述前綴<",
    ]);
  });
});

describe("adoption information in English", () => {
  test("shows the fees tab in English", () => {
    reset();
    const markup = renderAdminInEnglish(
      <AdoptionInformationManagement initialData={{ fees, estates }} />,
    );
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      ">Adoption</p>",
      ">Adoption information management</h1>",
      "Manage the public adoption fees and the reference list of dog-friendly estates.",
      ">Post-adoption guide releases</a>",
      'href="/admin/content/adoption-guides"',
      ">Adoption fees</button>",
      ">Page content</button>",
      ">Dog-friendly estates</button>",
      ">Adoption rules</button>",
      ">Animal care guidelines</button>",
      'aria-label="Adoption fees"',
      ">Dogs</h2>",
      ">Cats</h2>",
      'aria-label="Fee item"',
      'aria-label="Price"',
      'aria-label="Move up"',
      'aria-label="Move down"',
      ">Save</button>",
    ]);
  });

  test("shows the estates tab, its editors and its pager in English", () => {
    const markup = renderAdminInEnglish(
      <AdoptionInformationManagementView
        activeTab="estates"
        data={{ ...estates, total: 120 }}
        page={2}
        query=""
        onPageChange={noop}
        onCreateEstate={async () => estateRows[0]}
      />,
    );
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Search estates",
      'placeholder="Estate or district"',
      'aria-label="Dog-friendly estates"',
      ">Add estate</h2>",
      ">Edit estate</h2>",
      'aria-label="Estate name"',
      'placeholder="Estate name"',
      'aria-label="District"',
      'aria-label="Note"',
      'placeholder="Note (optional)"',
      "Add estate</button>",
      ">Save changes</button>",
      ">Unpublish</button>",
      ">Publish</button>",
      "Delete</button>",
      "Dog-friendly estates pagination",
      "Showing 51–100 of 120",
    ]);
  });

  test("shows an empty list, loading and an error in English", () => {
    const empty = renderAdminInEnglish(
      <AdoptionInformationManagementView
        activeTab="estates"
        data={{ ...estates, items: [], total: 0 }}
        query=""
      />,
    );
    expect(empty).toContain("No dog-friendly estates");
    const noFees = renderAdminInEnglish(
      <AdoptionInformationManagementView activeTab="fees" data={{ ...fees, items: [] }} query="" />,
    );
    expect(noFees).toContain("No adoption fees");
    expect(
      renderAdminInEnglish(<AdoptionInformationManagementView activeTab="fees" loading query="" />),
    ).toContain("Loading adoption information…");
    expect(
      renderAdminInEnglish(
        <AdoptionInformationManagementView activeTab="fees" error="Could not load" query="" />,
      ),
    ).toContain("Could not load");
  });

  test("shows the editor of one estate, a new one and an unpublished one", () => {
    const created = renderAdminInEnglish(<EstateEditor pending={false} />);
    expectAll(created, [">Add estate</h2>", "Add estate</button>"]);
    expect(created).not.toContain("Delete");
    const published = renderAdminInEnglish(<EstateEditor estate={estateRows[0]} pending={false} />);
    expectAll(published, [">Edit estate</h2>", ">Unpublish</button>", "Delete</button>"]);
    const hidden = renderAdminInEnglish(<EstateEditor estate={estateRows[1]} pending />);
    expectAll(hidden, [">Publish</button>"]);
    expectNoChineseText(created + published + hidden, { allow: DATA });
  });

  test("shows a failed load in English, and translates a session error", () => {
    reset();
    state.failures["admin-adoption-information"] = new AdminSessionError("not_signed_in");
    const english = renderAdminInEnglish(<AdoptionInformationManagement />);
    expect(english).toContain("Not signed in. Sign in again.");
    expectNoChineseText(english, { allow: DATA });
    expect(renderAdminInChinese(<AdoptionInformationManagement />)).toContain("未登入");
    reset();
    state.mutationError = new Error("Estate is already published");
    expect(renderAdminInEnglish(<AdoptionInformationManagement />)).toContain(
      "Estate is already published",
    );
    reset();
  });

  test("writes the delete question and the leave dialog's messages in English", () => {
    const english = adoptionInformationCopy.en;
    expect(english.estates.confirmDelete("Garden Estate")).toBe(
      'Delete "Garden Estate"? This cannot be undone.',
    );
    expect(english.estates.confirmDelete(english.estates.thisEstate)).toBe(
      'Delete "this estate"? This cannot be undone.',
    );
    expect(adoptionInformationCopy.zh.estates.confirmDelete("某某")).toBe(
      "確定刪除「某某」？此操作無法復原。",
    );
    expect(english.leave).toEqual({
      title: "Unsaved page content",
      description:
        "You can save the draft, discard your changes on this device or cancel and keep editing.",
      cancel: "Cancel",
      discard: "Discard and leave",
      save: "Save and leave",
      problems: {
        not_saved_check_draft:
          "The draft was not saved, so you are still on this page. Close this dialog and check the draft for errors.",
        not_saved: "The draft was not saved, so you are still on this page. Try saving again.",
      },
    });
    expect(adoptionInformationCopy.zh.leave.problems).toEqual({
      not_saved_check_draft: "儲存未成功，仍留在原頁。請關閉此對話框檢查草稿錯誤。",
      not_saved: "儲存未成功，仍留在原頁。",
    });
  });

  test("keeps the Chinese text of the conflict panels and the leave dialog, which need a click to show", () => {
    const zh = adoptionInformationCopy.zh;
    expect(zh.fees.conflict).toBe("領養費用已由其他人更新。請檢查最新版本後重新輸入。");
    expect(zh.estates.conflict).toBe(
      "此屋苑已由其他人更新。請先檢查最新版本，再重新輸入你的修改。",
    );
    expect(zh.fees.staleHint).toBe("最新資料暫未載入，請重新整理頁面。");
    expect(zh.estates.staleHint).toBe("最新資料暫未載入，請重新整理頁面。");
    expect(zh.fees.loadLatest).toBe("載入最新費用");
    expect(zh.estates.loadLatest).toBe("載入最新版本");
    expect(zh.estates.thisEstate).toBe("此屋苑");
    expect([zh.leave.title, zh.leave.cancel, zh.leave.discard, zh.leave.save]).toEqual([
      "尚有未儲存的頁面內容",
      "取消",
      "捨棄並離開",
      "儲存並離開",
    ]);
    expect(zh.leave.description).toBe("你可以先儲存草稿、捨棄本機修改，或取消並繼續編輯。");
    // Every English text that tells the admin something went wrong says what to do next.
    const english = adoptionInformationCopy.en;
    expect(english.fees.conflict).toContain("enter your changes again");
    expect(english.estates.conflict).toContain("enter your changes again");
    expect(english.fees.staleHint).toBe("The latest data has not loaded yet. Refresh the page.");
  });

  test("puts a space between the conflict sentence and the stale-data hint in English only", () => {
    for (const part of ["fees", "estates"] as const) {
      const english = adoptionInformationCopy.en[part];
      const chinese = adoptionInformationCopy.zh[part];
      const englishPanel = english.conflict + english.hintSeparator + english.staleHint;
      expect(englishPanel).toContain(
        "enter your changes again. The latest data has not loaded yet.",
      );
      expect(englishPanel).not.toContain("again.The");
      // Chinese runs the two together, exactly as it always has.
      expect(chinese.hintSeparator).toBe("");
      expect(chinese.conflict + chinese.hintSeparator + chinese.staleHint).toBe(
        `${chinese.conflict}最新資料暫未載入，請重新整理頁面。`,
      );
    }
  });

  test("keeps the conflict sentence apart from its load button with a margin, not with text", async () => {
    // The panels show only after a conflicting save, which a static render cannot reach, so the
    // markup is pinned at the source: each load-latest button carries the margin class.
    const source = await Bun.file(
      new URL("./AdoptionInformationManagement.tsx", import.meta.url),
    ).text();
    const labels = [...source.matchAll(/\{copy\.loadLatest\}/g)].map((match) => match.index);
    expect(labels).toHaveLength(2);
    for (const label of labels) {
      const button = source.slice(source.lastIndexOf("<button", label), label);
      expect(button, button).toContain('className="ml-2"');
    }
  });

  test("names the five tabs in both languages", () => {
    const markup = renderAdminInEnglish(
      <AdoptionContentTabs activeTab="rules" onTabChange={noop} />,
    );
    expect(markup.match(/role="tab"/g)).toHaveLength(5);
    expect(adoptionInformationCopy.zh.tabs).toEqual({
      fees: "領養費用",
      page: "頁面內容",
      estates: "可養狗屋苑",
      rules: "領養規則",
      careTopics: "動物照顧須知",
    });
  });

  test("keeps the Chinese screen as it was", () => {
    reset();
    const markup = renderAdminInChinese(
      <AdoptionInformationManagement initialData={{ fees, estates }} />,
    );
    expectAll(markup, [
      ">領養</p>",
      ">領養資料管理</h1>",
      "管理公開領養費用及可養狗屋苑參考名單。",
      ">領養後指南版本</a>",
      ">狗隻</h2>",
      ">貓隻</h2>",
      'aria-label="費用項目"',
      'aria-label="上移"',
    ]);
    const estatesMarkup = renderAdminInChinese(
      <AdoptionInformationManagementView activeTab="estates" data={estates} query="" />,
    );
    expectAll(estatesMarkup, [
      "搜尋屋苑",
      'placeholder="屋苑或地區"',
      ">新增屋苑</h2>",
      ">編輯屋苑</h2>",
      'placeholder="備註（選填）"',
      ">編輯</button>",
      ">取消發佈</button>",
    ]);
  });
});

describe("adoption rules and care guidelines in English", () => {
  test("lists the rules in English, with the English column shown", () => {
    reset();
    const markup = renderAdminInEnglish(
      <AdoptionRulesManagement activeTab="rules" onTabChange={noop} />,
    );
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      ">Adoption</p>",
      ">Adoption rules management</h1>",
      ">Adoption rules</h2>",
      "Add rule",
      "1. Keep the animal safe",
      "2. Visit before adopting (disabled)",
      ">Edit</button>",
    ]);
    // Chinese shows the Chinese column.
    const zh = renderAdminInChinese(
      <AdoptionRulesManagement activeTab="rules" onTabChange={noop} />,
    );
    expect(zh).toContain(`1. ${ruleRows[0].content["zh-HK"]}`);
    expect(zh).toContain(`2. ${ruleRows[1].content["zh-HK"]}（已停用）`);
  });

  test("shows loading, a failed load and an empty list in English", () => {
    reset();
    state.loading.add("admin-adoption-information");
    expect(
      renderAdminInEnglish(<AdoptionRulesManagement activeTab="rules" onTabChange={noop} />),
    ).toContain("Loading adoption rules…");
    reset();
    state.failures["admin-adoption-information"] = new Error("boom");
    const failed = renderAdminInEnglish(
      <AdoptionRulesManagement activeTab="rules" onTabChange={noop} />,
    );
    expectAll(failed, ["Could not load adoption rules", "Retry"]);
    reset();
  });

  test("names the rule form's fields and its failure in English", () => {
    const markup = renderAdminInEnglish(
      <AdoptionRuleForm
        draft={{ contentZh: token(), contentEn: "Rule", sortOrder: 2, isPublished: true }}
        onDraftChange={noop}
        onSubmit={noop}
        onCancel={noop}
        pending={false}
        failed
      />,
    );
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Rule content (Chinese)",
      "Rule content (English)",
      "Sort order",
      "Show on the adoption instructions page",
      "Could not save. Check the details and try again.",
      ">Save</button>",
      ">Cancel</button>",
    ]);
    const zh = renderAdminInChinese(
      <AdoptionRuleForm
        draft={{ contentZh: token(), contentEn: "Rule", sortOrder: 2, isPublished: true }}
        onDraftChange={noop}
        onSubmit={noop}
        onCancel={noop}
        pending={false}
        failed={false}
      />,
    );
    expectAll(zh, [
      "規則內容（中文）",
      "排序",
      "在領養須知頁面顯示",
      ">儲存</button>",
      ">取消</button>",
    ]);
  });

  test("lists the care topics in English, with the English column shown", () => {
    reset();
    const markup = renderAdminInEnglish(
      <CareTopicsManagement activeTab="careTopics" onTabChange={noop} />,
    );
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      ">Animal care guidelines management</h1>",
      'aria-label="Species"',
      ">Cats</button>",
      ">Dogs</button>",
      ">Cat care guidelines</h2>",
      "Add topic",
      "Home",
      "Food (disabled)",
    ]);
    const zh = renderAdminInChinese(
      <CareTopicsManagement activeTab="careTopics" onTabChange={noop} />,
    );
    expectAll(zh, [">動物照顧須知管理</h1>", 'aria-label="物種"', ">養貓需知</h2>", "新增主題"]);
    expect(zh).toContain(`${topicRows[1].label["zh-HK"]}（已停用）`);
  });

  test("shows loading and a failed load of the care topics in English", () => {
    reset();
    state.loading.add("admin-adoption-information");
    expect(
      renderAdminInEnglish(<CareTopicsManagement activeTab="careTopics" onTabChange={noop} />),
    ).toContain("Loading care guidelines…");
    reset();
    state.failures["admin-adoption-information"] = new Error("boom");
    expect(
      renderAdminInEnglish(<CareTopicsManagement activeTab="careTopics" onTabChange={noop} />),
    ).toContain("Could not load care guidelines");
    reset();
  });

  test("names the care topic form's fields in English", () => {
    const markup = renderAdminInEnglish(
      <CareTopicForm
        draft={{
          animalType: "dog",
          labelZh: token(),
          labelEn: "Home",
          contentZh: token(),
          contentEn: "Content",
          sortOrder: 1,
          isPublished: false,
        }}
        onDraftChange={noop}
        onSubmit={noop}
        onCancel={noop}
        pending={false}
        failed
      />,
    );
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Species",
      ">Cat</option>",
      ">Dog</option>",
      "Topic label (Chinese)",
      "Topic label (English)",
      "Content (Chinese)",
      "Content (English)",
      "Sort order",
      "Show on the adoption instructions page",
      "Could not save. Check the details and try again.",
    ]);
  });
});

describe("the adoption instructions page editor in English", () => {
  test("shows the draft, its status and the revision history in English", () => {
    const markup = renderAdminInEnglish(
      <AdoptionInstructionsManagementView
        data={{ ...instructionPage, historyNextCursor: "1:x" }}
        role="admin"
        onLoadHistory={async () => ({ items: [], nextCursor: null })}
        onLoadRevision={async () => publishedRevision}
      />,
    );
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      ">Page content</h2>",
      "Edit the Chinese page titles and descriptions. Use the separate tabs for the bilingual adoption rules and care guidelines. To manage documents, go to ",
      ">Post-adoption guide releases</a>.",
      "Published revision 1 · Draft version 4",
      "Last updated: 26 Sep 2026 (Sat) 08:00 · staff-a",
      ">Chinese page text</legend>",
      "Page header / Lead-in",
      "Page header / Title",
      "Page header / Short description",
      "Adoption fees / Section title",
      "Adoption fees / Dogs title",
      "Adoption fees / Fee note",
      "Dog-friendly estates / Estate column heading",
      "Post-adoption guides / Chinese download button",
      "Animal care guidelines / Cats / Title",
      ">Save draft</button>",
      "Preview saved draft",
      ">Publish page</button>",
      ">Archive draft (do not publish)</button>",
      ">Revision history</h3>",
      "Archive or publish the current draft before you restore an earlier version as a new draft.",
      "Revision 1 · Published · 26 Sep 2026 (Sat) 08:00",
      "Revision 0 · Archived<",
      ">View content</button>",
      ">Restore this version</button>",
      ">Show more revisions</button>",
    ]);
  });

  test("hides publishing from staff and says when there is no draft", () => {
    const staff = renderAdminInEnglish(
      <AdoptionInstructionsManagementView data={instructionPage} role="staff" />,
    );
    expect(staff).not.toContain("Publish page");
    expect(staff).not.toContain("Restore this version");
    const noDraft = renderAdminInEnglish(
      <AdoptionInstructionsManagementView
        data={{ ...instructionPage, draft: null as never }}
        role="admin"
      />,
    );
    expectAll(noDraft, ["No draft yet", ">Create draft</button>"]);
  });

  test("names a field that is not valid, in English", () => {
    const invalid = {
      ...instructionPage,
      draft: {
        ...instructionPage.draft!,
        content: {
          ...instructionContent,
          hero: { ...instructionContent.hero, title: "" },
        },
      },
    };
    const markup = renderAdminInEnglish(
      <AdoptionInstructionsManagementView data={invalid} role="admin" />,
    );
    expect(markup).toContain(
      "Page header / Title: Enter valid plain text within the length limit.",
    );
    expect(markup).not.toContain("hero.title: ");
    expect(markup).toContain('aria-invalid="true"');
  });

  test("shows loading, a load error and a missing page in English", () => {
    expect(renderAdminInEnglish(<AdoptionInstructionsManagementView loading />)).toContain(
      "Loading page content…",
    );
    expect(
      renderAdminInEnglish(<AdoptionInstructionsManagementView error="Could not load" />),
    ).toContain("Could not load");
    expect(renderAdminInEnglish(<AdoptionInstructionsManagementView />)).toContain(
      "Could not load the page content. Check that the page content has been set up, then reload the page.",
    );
  });

  test("the runtime shows a failed load in English and translates a session error", () => {
    reset();
    state.failures["admin-adoption-instructions"] = new AdminSessionError("identity_changed");
    expect(renderAdminInEnglish(<AdoptionInstructionsManagement />)).toContain(
      "Your signed-in account has changed. Reload the page.",
    );
    reset();
  });

  test("writes the conflict, history and reload messages in English, each with a next step", () => {
    const english = adoptionInstructionsCopy.en;
    expect(english.conflict.intro(7)).toBe(
      "The server draft is version 7. Compare your copy with the server copy, then decide which to use.",
    );
    expect(english.problems.server_updated).toBe(
      "The server version has been updated. Your input is kept. Copy any text you want to keep, then reload.",
    );
    for (const message of Object.values(english.problems)) expect(message).toMatch(/\.$/);
    expect(adoptionInstructionsCopy.zh.problems).toEqual({
      server_updated: "伺服器版本已更新；你的輸入已保留。請複製需要保留的文字，再重新載入。",
      action_failed: "未能完成操作，請稍後再試。",
      reload_failed: "未能重新載入。",
      history_failed: "未能載入更多版本。",
      revision_failed: "未能載入版本內容。",
    });
    expect(adoptionInstructionsCopy.zh.conflict.intro(null)).toBe(
      "伺服器草稿版本 —。請比較本機與伺服器內容，再決定是否採用。",
    );
    expect(english.history.revisionContent(3)).toBe("Revision 3 content");
  });

  test("names a field by its label in English wherever its path would show, and by the path in Chinese", () => {
    const english = adoptionInstructionsCopy.en;
    const chinese = adoptionInstructionsCopy.zh;
    expect(english.fieldPath("hero.title")).toBe("Page header / Title");
    expect(english.fieldPath("care.cat.title")).toBe("Animal care guidelines / Cats / Title");
    expect(english.fieldPath("fees.unknownKey")).toBe("Adoption fees / unknownKey");
    expect(english.fieldLabel("hero.title")).toBe(english.fieldPath("hero.title"));
    expect(english.issueLine("hero.title", "Enter valid plain text within the length limit.")).toBe(
      "Page header / Title: Enter valid plain text within the length limit.",
    );
    // Chinese keeps the path in the message and the list, and the label on the field.
    expect(chinese.fieldPath("hero.title")).toBe("hero.title");
    expect(chinese.fieldLabel("hero.title")).toBe("頁首 / 標題");
    expect(chinese.issueLine("hero.title", "請填寫有效的純文字，並遵守字數限制。")).toBe(
      "hero.title：請填寫有效的純文字，並遵守字數限制。",
    );
  });

  test("ends a revision line at its state when it has no date, in English only", () => {
    const english = adoptionInstructionsCopy.en.history.item;
    const chinese = adoptionInstructionsCopy.zh.history.item;
    expect(english(0, "archived", null)).toBe("Revision 0 · Archived");
    expect(english(1, "published", "2026-09-26T00:00:00Z")).toBe(
      "Revision 1 · Published · 26 Sep 2026 (Sat) 08:00",
    );
    expect(chinese(0, "archived", null)).toBe("修訂 0 · 已封存 · ");
    expect(chinese(1, "published", "2026-09-26T00:00:00Z")).toBe(
      "修訂 1 · 已發布 · 2026-09-26T00:00:00Z",
    );
  });

  test("keeps the Chinese editor as it was", () => {
    const markup = renderAdminInChinese(
      <AdoptionInstructionsManagementView
        data={{ ...instructionPage, historyNextCursor: "1:x" }}
        role="admin"
        onLoadHistory={async () => ({ items: [], nextCursor: null })}
        onLoadRevision={async () => publishedRevision}
      />,
    );
    expectAll(markup, [
      ">頁面內容</h2>",
      "編輯中文頁面標題及說明。領養規則及照顧須知的雙語內容，請使用各自的分頁；文件請到",
      ">領養後指南版本</a>管理。",
      "已發布修訂 1 · 草稿版本 4",
      "最後更新：2026-09-26T00:00:00Z · staff-a",
      "頁首 / 引題",
      "動物照顧須知 / 貓隻 / 標題",
      ">儲存草稿</button>",
      "預覽已儲存草稿",
      ">發布頁面</button>",
      ">封存草稿（不發布）</button>",
      ">版本紀錄</h3>",
      "修訂 1 · 已發布 · 2026-09-26T00:00:00Z",
      ">查看內容</button>",
      ">還原此版本</button>",
      ">查看更多版本</button>",
    ]);
  });
});

describe("the adoption page preview", () => {
  test("shows its loading and failure messages in English", () => {
    reset();
    state.loading.add("adoption-instructions");
    expect(renderAdminInEnglish(<AdoptionInstructionsPreviewPage />)).toContain(
      "Loading the adoption page preview…",
    );
    reset();
    state.failures["adoption-instructions"] = new Error("boom");
    const failed = renderAdminInEnglish(<AdoptionInstructionsPreviewPage />);
    expect(failed).toContain(adoptionPreviewCopy.en.failed);
    expectNoChineseText(failed);
    reset();
  });

  test("keeps its Chinese messages", () => {
    reset();
    state.loading.add("adoption-instructions");
    expect(renderAdminInChinese(<AdoptionInstructionsPreviewPage />)).toContain(
      "正在載入領養頁面預覽…",
    );
    reset();
    state.failures["adoption-instructions"] = new Error("boom");
    expect(renderAdminInChinese(<AdoptionInstructionsPreviewPage />)).toContain(
      "未能載入領養頁面預覽。",
    );
    reset();
  });
});

describe("the copy modules", () => {
  const modules = [
    aboutPagesCopy,
    adoptionInformationCopy,
    adoptionRulesCopy,
    adoptionInstructionsCopy,
    adoptionPreviewCopy,
  ];

  test("have no Chinese in English and as many texts in English as in Chinese", () => {
    for (const module of modules) {
      expectNoChineseInCopy(module.en);
      expect(collectCopyStrings(module.en).length).toBeGreaterThan(0);
      expect(collectCopyStrings(module.zh).length).toBe(collectCopyStrings(module.en).length);
    }
  });

  test("fixture values are not labels, so allowing them cannot hide an untranslated label", () => {
    const labels = [...modules, adminCommonCopy]
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
