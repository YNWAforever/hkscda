import { describe, expect, mock, test } from "bun:test";

import { AdminSessionError } from "../../../lib/admin/session";
import type {
  AdoptionGuidePreview,
  AdoptionGuideRelease,
} from "../../../lib/adoptionGuideReleases/types";
import type { AnnualReport, DocumentAsset } from "../../../lib/documents/types";
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
 * How the screens are rendered here. The documents, annual reports and guide releases screens read
 * their data through React Query, so it is replaced for this file only (it runs with `--isolate`,
 * as `bun run test` does, because `mock.module` outlives the file otherwise).
 *
 * - `useQuery` answers by the first part of the query key, so a static render shows a loaded
 *   screen. `failures` names the queries that fail, and the error each one fails with.
 * - `useMutation` returns `state.mutationError` as the error of every mutation a screen has, so
 *   a screen shows the first one it reads. No call is addressed by its position.
 *
 * Screens with a `View` that takes props are rendered through the view, which is how the pieces
 * that need a click to appear (an error, a pager, a conflict) are shown.
 */
const state = {
  failures: {} as Record<string, unknown>,
  mutationError: null as Error | null,
};

// Titles and notes staff typed are data: shown as stored in both languages. None of them contains
// a word that is also a label (a test below checks that).
const DOC_TITLE = "松鼠樂園導覽";
const DOC_TITLE_TWO = "黃昏漫步指南";
const DOC_TITLE_THREE = "彩虹橋登記冊";
const GUIDE_TITLE = "梧桐道指南";
const GUIDE_TOPIC = "梧桐道上";
const GUIDE_INTRO = "梧桐道上的家";
const GUIDE_SOURCE = "山頂來源";
const REPORT_TITLE = "松鼠基金年冊";
const REPORT_TITLE_TWO = "黃昏基金年冊";
const DATA = [
  DOC_TITLE,
  DOC_TITLE_TWO,
  DOC_TITLE_THREE,
  GUIDE_TITLE,
  GUIDE_TOPIC,
  GUIDE_INTRO,
  GUIDE_SOURCE,
  REPORT_TITLE,
  REPORT_TITLE_TWO,
];

const stamp = "2026-07-18T00:00:00.000Z";

function asset(over: Partial<DocumentAsset> = {}): DocumentAsset {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    kind: "annual_report",
    title: DOC_TITLE,
    language: "bilingual",
    bucketName: "site-documents",
    objectPath: "annual-reports/2025-26.pdf",
    fileUrl: null,
    mimeType: "application/pdf",
    byteSize: 1024,
    checksumSha256: null,
    isPublished: false,
    sortOrder: 0,
    createdAt: stamp,
    updatedAt: stamp,
    ...over,
  };
}

const MANAGED_ID = "99999999-8888-4777-8666-555555555555";
const documents = {
  items: [
    asset(),
    asset({
      id: MANAGED_ID,
      title: DOC_TITLE_TWO,
      kind: "adoption_guide",
      language: "zh-HK",
      isPublished: true,
      byteSize: 5 * 1024 * 1024,
    }),
    asset({
      id: "d3",
      title: DOC_TITLE_THREE,
      kind: "wedding_form",
      language: "en",
      byteSize: 100,
    }),
    asset({ id: "d4", kind: "sponsorship_terms", language: "bilingual", isPublished: true }),
  ],
  total: 60,
};

function report(over: Partial<AnnualReport> = {}): AnnualReport {
  return {
    id: "22222222-3333-4444-8555-666666666666",
    title: REPORT_TITLE,
    yearLabel: "2025/26",
    isPublished: false,
    sortOrder: 1,
    createdAt: stamp,
    updatedAt: stamp,
    document: asset(),
    ...over,
  };
}

const reports = [
  report(),
  report({
    id: "r2",
    title: REPORT_TITLE_TWO,
    isPublished: true,
    document: asset({ isPublished: true }),
  }),
];

function guide(over: Partial<AdoptionGuideRelease> = {}): AdoptionGuideRelease {
  return {
    id: "0c2a4b5d-4464-49f3-8fad-d6e1021f5214",
    topic: "post_adoption",
    species: "cat",
    zhHkAssetId: "94dd21e9-ac7d-4e77-a6e8-d85e5e5d21a0",
    enAssetId: null,
    knowledgePostId: null,
    knowledgeTitle: GUIDE_TITLE,
    knowledgeTopic: GUIDE_TOPIC,
    knowledgeShortIntro: GUIDE_INTRO,
    knowledgeSourceName: GUIDE_SOURCE,
    sortOrder: 0,
    state: "draft",
    version: 2,
    createdBy: "df576625-487e-4c75-8d2f-0d45053b9d99",
    updatedBy: "df576625-487e-4c75-8d2f-0d45053b9d99",
    submittedBy: null,
    submittedAt: null,
    publishedBy: null,
    publishedAt: null,
    archivedBy: null,
    archivedAt: null,
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    ...over,
  };
}

function preview(
  release: AdoptionGuideRelease,
  readiness: AdoptionGuidePreview["readiness"] = { ready: true, issues: [] },
): AdoptionGuidePreview {
  return {
    release,
    readiness,
    adoptionPanel: { heading: GUIDE_TITLE, zhHkUrl: "https://preview.test/zh.pdf", enUrl: null },
    knowledgeCard: {
      title: GUIDE_TITLE,
      topic: GUIDE_TOPIC,
      shortIntro: GUIDE_INTRO,
      sourceName: null,
      zhHkUrl: "https://preview.test/zh.pdf",
      enUrl: "https://preview.test/en.pdf",
    },
  };
}

const incompleteDraft = guide();
const incompleteIssues: AdoptionGuidePreview["readiness"] = {
  ready: false,
  issues: [
    { field: "enAssetId", code: "english_asset_required", message: "English PDF is required." },
  ],
};
const readyReview = guide({
  enAssetId: "b71357d2-0656-4b85-a48a-cc53314e5cda",
  state: "in_review",
  submittedBy: "someone",
  submittedAt: "2026-07-31T01:00:00.000Z",
  publishedAt: "2026-08-01T01:00:00.000Z",
  archivedAt: "2026-08-02T01:00:00.000Z",
});

type QueryKey = readonly unknown[];

/** The name this file's `failures` uses for a query. */
function nameOf(key: QueryKey): string {
  const first = String(key[0]);
  if (first === "adoption-guide-releases") {
    if (key[2] === "preview") return "guide-preview";
    if (key[2] === "linked") return "guide-linked";
    return "guide-list";
  }
  if (first === "admin-documents" && key[1] === "annual-report-options") return "annual-assets";
  if (first === "documents") return "guide-assets";
  return first;
}

mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {}, refetchQueries: async () => {} }),
  useMutation: () => ({
    mutate() {},
    mutateAsync: async () => undefined,
    isPending: false,
    isError: state.mutationError !== null,
    error: state.mutationError,
    variables: undefined,
  }),
  useQuery: (options: { queryKey: QueryKey }) => {
    const name = nameOf(options.queryKey);
    const base = {
      isLoading: false,
      isFetching: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: async () => ({ isSuccess: true, isError: false, data: undefined }),
    };
    if (name in state.failures) {
      return {
        ...base,
        data: undefined,
        isError: true,
        isSuccess: false,
        error: state.failures[name],
      };
    }
    if (name === "admin-me") return { ...base, data: { admin: { role: "admin" } } };
    if (name === "admin-documents") return { ...base, data: documents };
    if (name === "adoption-guide-release-ownership") {
      return {
        ...base,
        data: {
          ownerReleaseIdsByAssetId: { [MANAGED_ID]: incompleteDraft.id },
          ownerReleaseIdsByKnowledgePostId: {},
        },
      };
    }
    if (name === "admin-annual-reports") return { ...base, data: reports };
    if (name === "annual-assets" || name === "guide-assets") return { ...base, data: [] };
    if (name === "guide-list") {
      return {
        ...base,
        data: { items: [incompleteDraft], total: 1, page: 1, pageSize: 25 },
      };
    }
    if (name === "guide-preview") return { ...base, data: preview(incompleteDraft) };
    return { ...base, data: undefined };
  },
}));

const { DocumentManagement, DocumentManagementView } = await import("./DocumentManagement");
const { AnnualReportManagement, AnnualReportManagementView } =
  await import("./AnnualReportManagement");
const { AdoptionGuideReleaseManagement, AdoptionGuideReleaseManagementView } =
  await import("./AdoptionGuideReleaseManagement");
const { DocumentAdminError, documentErrorMessage } = await import("./documentErrors");
const { documentsCopy } = await import("./documentsCopy");
const { adoptionGuideCopy } = await import("./adoptionGuideCopy");
const { cmsStateCopy } = await import("./cmsStateCopy");
const { uploadDocumentPdf } = await import("./documentUpload");
const {
  adoptionGuideFailureText,
  buildAdoptionGuideUploadMetadata,
  evaluateAdoptionGuideReleaseWorkflow,
  resolveMutationError,
} = await import("./adoptionGuideReleaseLogic");

function expectAll(markup: string, texts: string[]) {
  for (const text of texts) expect(markup, text).toContain(text);
}

function reset() {
  state.failures = {};
  state.mutationError = null;
}

const noop = () => {};

describe("documents in English", () => {
  test("shows the upload form, the filters and the table in English", () => {
    reset();
    const markup = renderAdminInEnglish(
      <DocumentManagementView
        data={documents}
        ownerReleaseIds={{ [MANAGED_ID]: "rel-1" }}
        page={2}
        onUpload={noop}
        onAction={noop}
        onPageChange={noop}
      />,
    );
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      ">Website content</p>",
      ">Documents</h1>",
      "Manage public PDFs, language versions and publication status.",
      // upload form
      "PDF file",
      "Upload</button>",
      // filters
      'aria-label="Search documents"',
      'placeholder="Search by title or file path"',
      'aria-label="Document type"',
      ">All types</option>",
      'aria-label="Document language"',
      ">All languages</option>",
      ">Annual report</option>",
      ">Wedding favour form</option>",
      ">Adoption guide</option>",
      ">Sponsorship terms</option>",
      ">Chinese</option>",
      ">English</option>",
      ">Chinese and English</option>",
      // table
      ">Document</th>",
      ">Type / language</th>",
      ">Size</th>",
      ">Status</th>",
      ">Actions</th>",
      "Managed in post-adoption guide releases",
      ">Not published</td>",
      ">Published</td>",
      ">Publish</button>",
      ">Unpublish</button>",
      `aria-label="Delete ${DOC_TITLE}"`,
      "5.0 MB",
      // pager
      "Documents pagination",
      "Showing 26–50 of 60",
    ]);
    // The managed document has no publish or delete buttons of its own.
    const start = markup.indexOf(DOC_TITLE_TWO);
    const managedRow = markup.slice(start, markup.indexOf("</tr>", start));
    expect(managedRow).not.toContain("<button");
  });

  test("shows loading, empty and error states in English", () => {
    expect(renderAdminInEnglish(<DocumentManagementView loading />)).toContain("Loading...");
    expect(
      renderAdminInEnglish(<DocumentManagementView data={{ items: [], total: 0 }} />),
    ).toContain("No documents");
    const failed = renderAdminInEnglish(
      <DocumentManagementView data={{ items: [], total: 0 }} error="Could not load documents" />,
    );
    expect(failed).toContain("Could not load documents");
    expect(failed).not.toContain("No documents");
  });

  test("writes the delete question and the delete button's name in both languages", () => {
    const zh = documentsCopy.zh.documents.table;
    const en = documentsCopy.en.documents.table;
    expect(zh.confirmDelete("甲")).toBe("確定刪除「甲」？此操作無法復原。");
    expect(zh.deleteLabel("甲")).toBe("刪除 甲");
    expect(en.confirmDelete("A")).toBe('Delete "A"? This cannot be undone.');
    expect(en.deleteLabel("A")).toBe("Delete A");
    const annualZh = documentsCopy.zh.annualReports.table;
    const annualEn = documentsCopy.en.annualReports.table;
    expect(annualZh.confirmDelete("甲")).toBe("確定刪除「甲」？此操作無法復原。");
    expect(annualEn.confirmDelete("A")).toBe('Delete "A"? This cannot be undone.');
  });

  test("keeps the Chinese screen as it was", () => {
    const markup = renderAdminInChinese(
      <DocumentManagementView
        data={documents}
        ownerReleaseIds={{ [MANAGED_ID]: "rel-1" }}
        onUpload={noop}
        onAction={noop}
      />,
    );
    expectAll(markup, [
      ">宣傳內容</p>",
      ">文件</h1>",
      "管理公開 PDF、語言版本與發佈狀態。",
      "PDF 檔案",
      "上載</button>",
      'aria-label="搜尋文件"',
      'placeholder="搜尋標題或檔案路徑"',
      ">全部類型</option>",
      ">婚宴回禮表格</option>",
      ">中英雙語</option>",
      ">未發佈</td>",
      ">已發佈</td>",
      "由領養指南版本管理",
      `aria-label="刪除 ${DOC_TITLE}"`,
    ]);
  });

  test("the runtime shows a failed load in English and translates a session error", () => {
    reset();
    state.failures["admin-documents"] = new AdminSessionError("not_signed_in");
    const english = renderAdminInEnglish(<DocumentManagement />);
    expect(english).toContain("Not signed in. Sign in again.");
    expectNoChineseText(english, { allow: DATA });
    expect(renderAdminInChinese(<DocumentManagement />)).toContain("未登入");
    reset();
  });

  test("the runtime shows an upload refusal in English and keeps its zh-HK message", () => {
    reset();
    state.mutationError = new DocumentAdminError("title_and_file_required");
    const english = renderAdminInEnglish(<DocumentManagement />);
    expect(english).toContain("Enter a title and choose a PDF file.");
    expectNoChineseText(english, { allow: DATA });
    expect(renderAdminInChinese(<DocumentManagement />)).toContain("請填寫標題並選擇 PDF 檔案");
    reset();
  });
});

describe("annual reports in English", () => {
  test("shows the form and the table in English", () => {
    const markup = renderAdminInEnglish(
      <AnnualReportManagementView
        rows={reports}
        assets={[asset(), asset({ id: "a2", title: DOC_TITLE_TWO, isPublished: true })]}
        title={REPORT_TITLE}
        yearLabel="2025/26"
        onCreate={noop}
        onAction={noop}
      />,
    );
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      ">Website content</p>",
      ">Annual reports</h1>",
      "Set the year, order and publication status of the public reports.",
      "Title",
      "Year",
      'placeholder="2025/26"',
      ">PDF",
      ">Choose a document</option>",
      `${DOC_TITLE} · Draft`,
      `${DOC_TITLE_TWO} · Published`,
      "Sort order",
      "Add</button>",
      ">Report</th>",
      ">Status</th>",
      ">Actions</th>",
      "Publish the PDF first",
      `aria-label="${REPORT_TITLE} sort order"`,
      ">Draft</td>",
      ">Published</td>",
      ">Publish</button>",
      ">Unpublish</button>",
      `aria-label="Delete ${REPORT_TITLE}"`,
    ]);
  });

  test("shows loading, empty and error states in English", () => {
    expect(renderAdminInEnglish(<AnnualReportManagementView rows={[]} loading />)).toContain(
      "Loading...",
    );
    expect(renderAdminInEnglish(<AnnualReportManagementView rows={[]} />)).toContain(
      "No annual reports yet",
    );
    const failed = renderAdminInEnglish(<AnnualReportManagementView rows={[]} error="boom" />);
    expect(failed).toContain("boom");
    expect(failed).not.toContain("No annual reports yet");
  });

  test("keeps the Chinese screen as it was", () => {
    const markup = renderAdminInChinese(
      <AnnualReportManagementView
        rows={reports}
        assets={[asset()]}
        onCreate={noop}
        onAction={noop}
      />,
    );
    expectAll(markup, [
      ">宣傳內容</p>",
      ">年度報告</h1>",
      "安排公開報告年度、次序及發佈狀態。",
      ">選擇文件</option>",
      `${DOC_TITLE} · 草稿`,
      "請先發佈 PDF",
      `aria-label="${REPORT_TITLE} 次序"`,
      `aria-label="刪除 ${REPORT_TITLE}"`,
    ]);
  });

  test("the runtime shows a failed load, and the refusal of an incomplete form, in English", () => {
    reset();
    state.failures["admin-annual-reports"] = new AdminSessionError("identity_changed");
    expect(renderAdminInEnglish(<AnnualReportManagement />)).toContain(
      "Your signed-in account has changed. Reload the page.",
    );
    reset();
    state.mutationError = new DocumentAdminError("report_fields_required");
    const english = renderAdminInEnglish(<AnnualReportManagement />);
    expect(english).toContain("Enter a title and a year, then choose a PDF.");
    expectNoChineseText(english, { allow: DATA });
    expect(renderAdminInChinese(<AnnualReportManagement />)).toContain(
      "請填寫標題、年度並選擇 PDF",
    );
    reset();
  });
});

describe("post-adoption guide releases in English", () => {
  const view = (props: Partial<Parameters<typeof AdoptionGuideReleaseManagementView>[0]> = {}) => (
    <AdoptionGuideReleaseManagementView
      actorRole="staff"
      releases={[incompleteDraft]}
      selected={incompleteDraft}
      preview={preview(incompleteDraft, incompleteIssues)}
      {...props}
    />
  );

  test("shows the page, the filters, the list and the five steps in English", () => {
    const markup = renderAdminInEnglish(
      view({
        total: 120,
        page: 2,
        filters: { q: "", species: "cat", state: "draft" },
        assets: [
          asset({
            id: incompleteDraft.zhHkAssetId!,
            kind: "adoption_guide",
            language: "zh-HK",
            title: DOC_TITLE,
          }),
        ],
        onUpload: noop,
      }),
    );
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      ">Website content</p>",
      ">Post-adoption guide</h1>",
      "Manage the Chinese and English PDFs, the knowledge base content and the publishing workflow.",
      "Add guide",
      'aria-label="Filter post-adoption guides"',
      "Search",
      "Species",
      "Status",
      ">All</option>",
      ">Cat</option>",
      ">Dog</option>",
      ">General</option>",
      ">Draft</option>",
      ">In review</option>",
      ">Published</option>",
      ">Archived</option>",
      ">Guide list</h2>",
      "Cat · Draft",
      // pager
      'aria-label="Release pages"',
      "Previous",
      "Next",
      "2 / 5",
      // editor
      'aria-label="Post-adoption guide editor"',
      "1. Topic and species",
      "2. Chinese PDF",
      "3. English PDF",
      "4. Knowledge base content",
      "5. Preview and publish",
      ">2. Chinese PDF</h2>",
      ">3. English PDF</h2>",
      ">5. Preview and submit</h2>",
      "Short introduction",
      "Source name (optional)",
      "Choose the Chinese PDF",
      "Choose the English PDF",
      ">Choose an uploaded adoption guide PDF</option>",
      "Upload a new PDF",
      "Only PDF files can be uploaded. This list shows only Chinese adoption guide documents.",
      "Only PDF files can be uploaded. This list shows only English adoption guide documents.",
      "Adoption page preview",
      "Knowledge base card preview",
      ">Chinese</a>",
      "English PDF not ready yet",
      // what the server sent is shown as sent
      "English PDF is required.",
      // history
      'aria-label="Publication history"',
      ">History</h3>",
      "Created: 31 Jul 2026 (Fri) 08:00",
      // actions of a draft
      "Save draft",
      "Submit for review",
      "Refresh preview",
    ]);
  });

  test("names the actions of a release in review, for staff and for an administrator", () => {
    const review = {
      releases: [readyReview],
      selected: readyReview,
      preview: preview(readyReview),
    };
    const staff = renderAdminInEnglish(view(review));
    expect(staff).toContain("Withdraw submission");
    expect(staff).not.toContain(">Publish</button>");
    expect(staff).not.toContain("Return to draft");
    expect(staff).toContain("Submitted: 31 Jul 2026 (Fri) 09:00");
    expect(staff).toContain("Published: 1 Aug 2026 (Sat) 09:00");
    expect(staff).toContain("Archived: 2 Aug 2026 (Sun) 09:00");

    const admin = renderAdminInEnglish(view({ ...review, actorRole: "admin" }));
    expectAll(admin, ["Withdraw submission", "Return to draft", ">Publish</button>"]);
    expectNoChineseText(admin, { allow: DATA });
  });

  test("says why a release cannot go on, in English", () => {
    const stale = renderAdminInEnglish(
      view({
        selected: incompleteDraft,
        preview: preview(guide({ version: 1 })),
      }),
    );
    expect(stale).toContain("Refresh the preview to confirm the current version.");

    const notReady = renderAdminInEnglish(view());
    expect(notReady).toContain("Complete the items listed in the preview first.");

    const ready = renderAdminInEnglish(view({ preview: preview(incompleteDraft) }));
    expect(ready).not.toContain("Refresh the preview to confirm");
    expect(ready).not.toContain("Complete the items listed");
  });

  test("shows loading, an empty list and an error in English", () => {
    const loading = renderAdminInEnglish(
      view({ releases: [], selected: null, preview: null, loading: true, error: "Could not load" }),
    );
    expectAll(loading, ["Loading...", "Could not load"]);
    const empty = renderAdminInEnglish(view({ releases: [], selected: null, preview: null }));
    expectAll(empty, [
      "No post-adoption guides yet",
      "Choose a guide from the list or add a new one.",
    ]);
    expectNoChineseText(empty, { allow: DATA });
  });

  test("keeps the Chinese screen as it was, English pager and species included", () => {
    const markup = renderAdminInChinese(view({ total: 120, page: 2 }));
    expectAll(markup, [
      ">宣傳內容</p>",
      ">領養後指南</h1>",
      "管理中英文 PDF、知識庫內容和發佈流程。",
      "新增指南",
      'aria-label="篩選領養後指南"',
      ">審閱中</option>",
      ">指南列表</h2>",
      // the Chinese list has always shown the stored species and state
      "cat · 草稿",
      // the pager has always been English in the Chinese screen
      'aria-label="Release pages"',
      "Previous",
      "Next",
      "1. 主題及物種",
      "5. 預覽及發佈",
      "5. 預覽及提交",
      "選擇 中文版 PDF",
      "只可上傳 PDF 檔案；此欄只顯示 adoption_guide 的 zh-HK 文件。",
      "English PDF 尚未準備",
      "建立：2026-07-31T00:00:00.000Z",
      "儲存草稿",
      "提交審閱",
      "重新整理預覽",
      // what the server sent is shown as sent
      "English PDF is required.",
      "請先完成預覽中的準備項目。",
    ]);
    const noPdf = { heading: GUIDE_TITLE, zhHkUrl: null, enUrl: null };
    const withoutPdfs = view({ preview: { ...preview(incompleteDraft), adoptionPanel: noPdf } });
    expect(renderAdminInChinese(withoutPdfs)).toContain("中文版 PDF 尚未準備");
    expect(renderAdminInEnglish(withoutPdfs)).toContain("Chinese PDF not ready yet");
  });

  test("the runtime shows a failed identity load in English", () => {
    reset();
    state.failures["admin-me"] = new AdminSessionError("not_signed_in");
    const english = renderAdminInEnglish(<AdoptionGuideReleaseManagement />);
    expect(english).toContain("Not signed in. Sign in again.");
    expectNoChineseText(english, { allow: DATA });
    expect(renderAdminInChinese(<AdoptionGuideReleaseManagement />)).toContain("未登入");
    reset();
  });
});

describe("the document code's errors", () => {
  test("carry the zh-HK message they always had, and a code", () => {
    const zh = documentsCopy.zh.errors;
    expect(new DocumentAdminError("not_pdf").message).toBe("請選擇 PDF 檔案");
    expect(new DocumentAdminError("too_large").message).toBe("PDF 檔案不可超過 50 MiB");
    expect(new DocumentAdminError("title_and_file_required").message).toBe(
      "請填寫標題並選擇 PDF 檔案",
    );
    expect(new DocumentAdminError("report_fields_required").message).toBe(
      "請填寫標題、年度並選擇 PDF",
    );
    expect(new DocumentAdminError("release_required").message).toBe("請先選擇領養後指南");
    expect(Object.keys(zh)).toEqual(Object.keys(documentsCopy.en.errors));
    expect(new DocumentAdminError("not_pdf").code).toBe("not_pdf");
  });

  test("are written in the admin's language, and every English one says what to do next", () => {
    const english = documentsCopy.en.errors;
    for (const code of Object.keys(english) as Array<keyof typeof english>) {
      const error = new DocumentAdminError(code);
      expect(documentErrorMessage(error, "en")).toBe(english[code]);
      expect(documentErrorMessage(error, "zh")).toBe(error.message);
      expect(documentErrorMessage(error)).toBe(error.message);
      expectNoChineseText(english[code]);
    }
    expect(english.too_large).toBe("The PDF must be 50 MiB or smaller. Choose a smaller file.");
    expect(english.not_pdf).toBe("Choose a PDF file.");
  });

  test("leave other errors alone: a session error is translated, the rest keep their message", () => {
    expect(documentErrorMessage(new AdminSessionError("identity_changed"), "en")).toBe(
      "Your signed-in account has changed. Reload the page.",
    );
    expect(documentErrorMessage(new AdminSessionError("identity_changed"), "zh")).toBe(
      "登入身份已變更，請重新載入頁面。",
    );
    expect(documentErrorMessage(new Error("Document is published"), "en")).toBe(
      "Document is published",
    );
    expect(documentErrorMessage("text", "en")).toBeNull();
    expect(documentErrorMessage(undefined, "en")).toBeNull();
  });

  test("are what uploadDocumentPdf throws before it asks for an upload target", async () => {
    const requestUploadTarget = mock(async () => ({ token: "t", path: "p" }));
    const dependencies = {
      requestUploadTarget,
      uploadToSignedUrl: mock(async () => undefined),
      createAsset: mock(async () => undefined),
    };
    const metadata = {
      kind: "annual_report" as const,
      title: DOC_TITLE,
      language: "bilingual" as const,
      sortOrder: 0,
    };

    const notPdf = await uploadDocumentPdf({
      file: new File(["text"], "report.txt", { type: "text/plain" }),
      objectPath: "annual-reports/report.pdf",
      metadata,
      ...dependencies,
    }).catch((error: unknown) => error);
    expect(notPdf).toBeInstanceOf(DocumentAdminError);
    expect((notPdf as InstanceType<typeof DocumentAdminError>).code).toBe("not_pdf");
    expect((notPdf as Error).message).toBe("請選擇 PDF 檔案");

    const big = new File(["%PDF"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 51 * 1024 * 1024 });
    const tooLarge = await uploadDocumentPdf({
      file: big,
      objectPath: "annual-reports/big.pdf",
      metadata,
      ...dependencies,
    }).catch((error: unknown) => error);
    expect((tooLarge as InstanceType<typeof DocumentAdminError>).code).toBe("too_large");
    expect(requestUploadTarget).not.toHaveBeenCalled();
  });
});

describe("the post-adoption guide logic's messages", () => {
  const release = incompleteDraft;
  const draft = {
    topic: release.topic,
    species: release.species,
    zhHkAssetId: release.zhHkAssetId,
    enAssetId: release.enAssetId,
    knowledgeTitle: release.knowledgeTitle,
    knowledgeTopic: release.knowledgeTopic,
    knowledgeShortIntro: release.knowledgeShortIntro,
    knowledgeSourceName: release.knowledgeSourceName,
    sortOrder: release.sortOrder,
  };

  test("name why a release cannot go on by a code, with the zh-HK text they always had", () => {
    const unsaved = evaluateAdoptionGuideReleaseWorkflow({
      release,
      draft: { ...draft, knowledgeTitle: "changed" },
      preview: preview(release),
      previewSucceeded: true,
    });
    const stale = evaluateAdoptionGuideReleaseWorkflow({
      release,
      draft,
      preview: preview(guide({ version: 1 })),
      previewSucceeded: true,
    });
    const notReady = evaluateAdoptionGuideReleaseWorkflow({
      release,
      draft,
      preview: preview(release, incompleteIssues),
      previewSucceeded: true,
    });
    const ready = evaluateAdoptionGuideReleaseWorkflow({
      release,
      draft,
      preview: preview(release),
      previewSucceeded: true,
    });
    expect([unsaved.blocker, stale.blocker, notReady.blocker, ready.blocker]).toEqual([
      "unsaved_changes",
      "stale_preview",
      "not_ready",
      null,
    ]);
    expect(adoptionGuideCopy.zh.blockers).toEqual({
      unsaved_changes: "請先儲存變更，然後重新整理預覽。",
      stale_preview: "請先重新整理預覽，確認目前版本。",
      not_ready: "請先完成預覽中的準備項目。",
    });
    expect(adoptionGuideCopy.en.blockers).toEqual({
      unsaved_changes: "Save your changes, then refresh the preview.",
      stale_preview: "Refresh the preview to confirm the current version.",
      not_ready: "Complete the items listed in the preview first.",
    });
  });

  test("write a failed save from its cause first, else from its code, in the admin's language", () => {
    const zh = adoptionGuideCopy.zh.errors;
    const en = adoptionGuideCopy.en.errors;
    // The two zh-HK texts have always been English in the Chinese screen.
    expect(zh.conflict).toBe("This release changed elsewhere. Reload before saving again.");
    expect(zh.save_failed).toBe("Unable to save this release.");

    expect(adoptionGuideFailureText({ code: "conflict" }, en, "en")).toBe(en.conflict);
    expect(adoptionGuideFailureText({ code: "conflict" }, zh, "zh")).toBe(zh.conflict);
    expect(adoptionGuideFailureText({ code: "save_failed" }, en, "en")).toBe(
      "Could not save this release. Check the details and try again.",
    );
    // The server's own message comes first.
    expect(
      adoptionGuideFailureText(
        { code: "save_failed", cause: new Error("Release is not in draft") },
        en,
        "en",
      ),
    ).toBe("Release is not in draft");
    // A session error is translated.
    expect(
      adoptionGuideFailureText({ cause: new AdminSessionError("not_signed_in") }, en, "en"),
    ).toBe("Not signed in. Sign in again.");
    // The upload refusals carry their own code.
    expect(
      adoptionGuideFailureText({ cause: new DocumentAdminError("release_required") }, en, "en"),
    ).toBe("Choose a post-adoption guide first.");
    // Nothing to show.
    expect(adoptionGuideFailureText(undefined, en, "en")).toBeUndefined();
    expect(adoptionGuideFailureText({ cause: "text" }, en, "en")).toBeUndefined();
  });

  test("keep an error only when it has a message to show", () => {
    expect(resolveMutationError(new Error(""), draft)).toEqual({ kind: "error" });
    expect(resolveMutationError("text", draft)).toEqual({ kind: "error" });
    const withMessage = new Error("Release not found");
    expect(resolveMutationError(withMessage, draft)).toEqual({ kind: "error", cause: withMessage });
  });

  test("store the title of an uploaded document in Chinese or English, as before", () => {
    expect(buildAdoptionGuideUploadMetadata(release, "zh-HK").title).toBe("post_adoption 中文 PDF");
    expect(buildAdoptionGuideUploadMetadata(release, "en").title).toBe("post_adoption English PDF");
  });

  test("name the five steps in both languages", () => {
    expect(adoptionGuideCopy.zh.steps).toEqual({
      topic: "主題及物種",
      chinese_pdf: "中文 PDF",
      english_pdf: "English PDF",
      knowledge: "知識庫內容",
      preview: "預覽及發佈",
    });
    expect(adoptionGuideCopy.en.steps).toEqual({
      topic: "Topic and species",
      chinese_pdf: "Chinese PDF",
      english_pdf: "English PDF",
      knowledge: "Knowledge base content",
      preview: "Preview and publish",
    });
  });
});

describe("the copy modules", () => {
  test("have no Chinese in English and the same keys in both languages", () => {
    for (const module of [documentsCopy, adoptionGuideCopy]) {
      expectNoChineseInCopy(module.en);
      expect(collectCopyStrings(module.en).length).toBeGreaterThan(0);
      expect(collectCopyStrings(module.zh).length).toBe(collectCopyStrings(module.en).length);
    }
  });

  test("fixture names are not labels, so allowing them cannot hide an untranslated label", () => {
    const labels = [documentsCopy, adoptionGuideCopy, cmsStateCopy, adminCommonCopy]
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
