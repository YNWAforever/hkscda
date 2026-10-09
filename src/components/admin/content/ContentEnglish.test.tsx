import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";

import { AdminApiError, AdminSessionError } from "../../../lib/admin/session";
import type {
  ContentDetail,
  ContentSummary,
  PublishValidationIssue,
  StoryUpdate,
} from "../../../lib/content/types";
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
 * How the screens are rendered here. They read their data through React Query and navigate with
 * the router, so both are replaced for this file only (it runs with `--isolate`, as `bun run test`
 * does, because `mock.module` outlives the file otherwise).
 *
 * - `useQuery` answers by the first part of the query key, so a static render shows a loaded
 *   screen. A query with `initialData` answers with it, as the real hook does on first render.
 *   `state` chooses what a test needs: who is signed in, and which queries fail.
 * - `useMutation` is called by the editor once per action, in the same order on every render. Each
 *   call returns `state.mutationError` under a message of its own (the call number is added), so
 *   the editor shows the error of every action and React sees distinct keys. No call is
 *   addressed by its position.
 * - The router's `Link` is a plain anchor and `useBlocker` does nothing.
 *
 * Page pieces that need a click to appear (a preview, a conflict banner after a failed save) are
 * exported by their modules and rendered directly instead.
 */
const state = {
  role: "admin" as "admin" | "staff",
  listFails: false,
  /** The error a failed content list fails with, when it is not the default one. */
  listError: null as Error | null,
  reviewFails: false,
  editor: "loaded" as "loaded" | "loading" | "missing",
  detail: undefined as ContentDetail | undefined,
  revisionFails: false,
  linkSearch: "ok" as "ok" | "error",
  mutationError: null as Error | null,
};
let mutationCalls = 0;

// Names, titles and notes staff typed are data: they are shown as stored in both languages. None
// of them contains a word that is also a label (a test below checks that).
const TITLE = "小白回家路";
const TITLE_TWO = "春日同樂日";
const TITLE_THREE = "愛心義賣日";
const TITLE_FOUR = "舊日回顧";
const SUMMARY = "小白已經康復得很好";
const BODY = "今日小白吃了很多飯";
const REGION = "油麻地";
const MAP_LABEL = "油麻地公園";
const ADDRESS = "某某大廈";
const SOURCE = "來源記錄一";
const OWNER = "陳小姐";
const UPDATE_ONE = "第一次覆診";
const UPDATE_ONE_BODY = "小白精神很好";
const UPDATE_TWO = "僅供參考的記錄";
const UPDATE_THREE = "日常相處記錄";
const ALT_ONE = "小白在窗邊";
const ALT_TWO = "小白睡覺";
const CAPTION = "午後陽光";
const FACEBOOK_COPY = "小白想有個家";
const INSTAGRAM_COPY = "歡迎來探望小白";
const WHATSAPP_COPY = "小白的近況";
const TAG_ONE = "小白";
const RECIPIENT_ONE = "李先生";
const RECIPIENT_TWO = "王小姐";
const RECIPIENT_THREE = "趙先生";
const RECIPIENT_FOUR = "周小姐";
const DRAFT_BODY_ONE = "您好，小白有新消息";
const DRAFT_BODY_TWO = "小白已搬到新家";
const DRAFT_SUBJECT = "小白的消息";
const ANIMAL_NAME = "阿旺";
const ANIMAL_TITLE = "小黑的檔案";
const OLD_TITLE = "舊日大事";
const OLD_SLUG = "old-slug";
const OLD_SUMMARY = "舊的簡介";
const OLD_BODY = "舊的文字";
const OLD_UPDATE = "舊的記錄";
const OLD_UPDATE_BODY = "舊記錄的細節";
const OLD_ALT = "舊圖片的小註";
const OLD_CAPTION = "舊的圖註";
const OLD_REGION = "中西區";
const OLD_MAP = "中西區地圖";

const DATA = [
  TITLE,
  TITLE_TWO,
  TITLE_THREE,
  TITLE_FOUR,
  SUMMARY,
  BODY,
  REGION,
  MAP_LABEL,
  ADDRESS,
  SOURCE,
  OWNER,
  UPDATE_ONE,
  UPDATE_ONE_BODY,
  UPDATE_TWO,
  UPDATE_THREE,
  ALT_ONE,
  ALT_TWO,
  CAPTION,
  FACEBOOK_COPY,
  INSTAGRAM_COPY,
  WHATSAPP_COPY,
  TAG_ONE,
  RECIPIENT_ONE,
  RECIPIENT_TWO,
  RECIPIENT_THREE,
  RECIPIENT_FOUR,
  DRAFT_BODY_ONE,
  DRAFT_BODY_TWO,
  DRAFT_SUBJECT,
  ANIMAL_NAME,
  ANIMAL_TITLE,
  OLD_TITLE,
  OLD_SUMMARY,
  OLD_BODY,
  OLD_UPDATE,
  OLD_UPDATE_BODY,
  OLD_ALT,
  OLD_CAPTION,
  OLD_REGION,
  OLD_MAP,
];

const summaries: ContentSummary[] = [
  {
    id: "c-1",
    slug: "siu-bak",
    type: "rescue_story",
    title: TITLE,
    subtitle: null,
    summary: SUMMARY,
    coverMediaId: null,
    coverImageUrl: null,
    status: "published",
    publishedAt: "2026-06-20T08:00:00.000Z",
    ctaLabel: null,
    ctaUrl: null,
    contentClass: "demo",
    storyProfile: {
      contentItemId: "c-1",
      animalType: "cat",
      publicStatus: "foster_recovery",
      rescueRegion: REGION,
      rescueDate: "2026-06-01",
      showOnMap: true,
      publicMapLabel: MAP_LABEL,
      publicLat: null,
      publicLng: null,
      internalAddress: null,
      internalLocationNotes: null,
      isFeatured: true,
    },
    latestPublicUpdate: null,
    createdAt: "2026-06-01T08:00:00.000Z",
    updatedAt: "2026-06-20T08:00:00.000Z",
  },
  {
    id: "c-2",
    slug: "spring-day",
    type: "charity_market",
    title: TITLE_TWO,
    subtitle: null,
    summary: SUMMARY,
    coverMediaId: null,
    coverImageUrl: null,
    status: "published",
    publishedAt: null,
    ctaLabel: null,
    ctaUrl: null,
    storyProfile: null,
    latestPublicUpdate: null,
    createdAt: "2026-06-01T08:00:00.000Z",
    updatedAt: "2026-06-20T08:00:00.000Z",
  },
  {
    id: "c-3",
    slug: "charity-day",
    type: "report",
    title: TITLE_THREE,
    subtitle: null,
    summary: SUMMARY,
    coverMediaId: null,
    coverImageUrl: null,
    status: "draft",
    publishedAt: null,
    ctaLabel: null,
    ctaUrl: null,
    contentClass: "verified",
    storyProfile: null,
    latestPublicUpdate: null,
    createdAt: "2026-06-01T08:00:00.000Z",
    updatedAt: "2026-06-20T08:00:00.000Z",
  },
  {
    id: "c-4",
    slug: "old-event",
    type: "event",
    title: TITLE_FOUR,
    subtitle: null,
    summary: SUMMARY,
    coverMediaId: null,
    coverImageUrl: null,
    status: "archived",
    publishedAt: "2025-01-02T08:00:00.000Z",
    ctaLabel: null,
    ctaUrl: null,
    contentClass: "verified",
    storyProfile: null,
    latestPublicUpdate: null,
    createdAt: "2026-06-01T08:00:00.000Z",
    updatedAt: "2026-06-20T08:00:00.000Z",
  },
];

const timestamps = { createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" };

const updates: StoryUpdate[] = [
  {
    id: "u1",
    contentItemId: "c-1",
    kind: "medical",
    title: UPDATE_ONE,
    body: UPDATE_ONE_BODY,
    occurredAt: "2026-07-05T10:00:00.000Z",
    visibility: "public",
    shouldGenerateAdopterDrafts: true,
    media: [],
    ...timestamps,
  },
  {
    id: "u2",
    contentItemId: "c-1",
    kind: "foster",
    title: UPDATE_TWO,
    body: null,
    bodyLoaded: false,
    occurredAt: "2026-07-06T10:00:00.000Z",
    visibility: "internal",
    shouldGenerateAdopterDrafts: false,
    media: [],
    ...timestamps,
  },
  {
    id: "u3",
    contentItemId: "c-1",
    kind: "general",
    title: UPDATE_THREE,
    body: null,
    occurredAt: "2026-07-07T10:00:00.000Z",
    visibility: "public",
    shouldGenerateAdopterDrafts: false,
    media: [],
    ...timestamps,
  },
];

const detail: ContentDetail = {
  ...summaries[0]!,
  status: "draft",
  publishedAt: null,
  subtitle: null,
  body: BODY,
  ctaLabel: null,
  ctaUrl: null,
  seoTitle: null,
  seoDescription: null,
  ogTitle: null,
  ogDescription: null,
  contentClass: "unreviewed",
  sourceReference: SOURCE,
  contentOwner: OWNER,
  effectiveFrom: "2026-06-01T02:00:00.000Z",
  effectiveUntil: null,
  version: 5,
  revisionId: "rev-5",
  history: { page: 2, hasMore: true },
  links: [
    {
      id: "l1",
      contentItemId: "c-1",
      linkedType: "animal",
      linkedId: "a1",
      relationship: "primary_subject",
      label: null,
      ...timestamps,
    },
    {
      id: "l2",
      contentItemId: "c-1",
      linkedType: "volunteer_activity",
      linkedId: "v1",
      relationship: "volunteer_context",
      label: "（未命名活動）",
      ...timestamps,
    },
  ],
  media: [
    {
      id: "m1",
      contentItemId: "c-1",
      storyUpdateId: null,
      url: "https://example.test/cover.jpg",
      storageBucket: "b",
      storagePath: "c-1/cover.jpg",
      altText: ALT_ONE,
      caption: null,
      sortOrder: 0,
      isCover: true,
      ...timestamps,
    },
    {
      id: "m2",
      contentItemId: "c-1",
      storyUpdateId: "u2",
      url: "",
      storageBucket: "b",
      storagePath: "c-1/second.jpg",
      altText: ALT_TWO,
      caption: CAPTION,
      sortOrder: 1,
      isCover: false,
      ...timestamps,
    },
  ],
  updates,
  socialCopies: [
    {
      id: "s1",
      contentItemId: "c-1",
      storyUpdateId: null,
      platform: "facebook",
      language: "zh-HK",
      copyText: FACEBOOK_COPY,
      hashtags: [TAG_ONE, "#adopt"],
      status: "copied",
      ...timestamps,
    },
    {
      id: "s2",
      contentItemId: "c-1",
      storyUpdateId: null,
      platform: "instagram",
      language: "zh-HK",
      copyText: INSTAGRAM_COPY,
      hashtags: [],
      status: "draft",
      ...timestamps,
    },
    {
      id: "s3",
      contentItemId: "c-1",
      storyUpdateId: null,
      platform: "whatsapp",
      language: "zh-HK",
      copyText: WHATSAPP_COPY,
      hashtags: [],
      status: "archived",
      ...timestamps,
    },
  ],
  notificationDrafts: [
    {
      id: "d1",
      storyUpdateId: "u1",
      contentItemId: "c-1",
      adoptionCaseId: null,
      supporterId: null,
      channel: "email",
      recipientName: RECIPIENT_ONE,
      recipientContact: "li@example.org",
      subject: DRAFT_SUBJECT,
      body: DRAFT_BODY_ONE,
      status: "draft",
      ...timestamps,
    },
    {
      id: "d2",
      storyUpdateId: "u1",
      contentItemId: "c-1",
      adoptionCaseId: null,
      supporterId: null,
      channel: "whatsapp",
      recipientName: RECIPIENT_TWO,
      recipientContact: "91234567",
      subject: null,
      body: DRAFT_BODY_TWO,
      status: "sent_manually",
      ...timestamps,
    },
    {
      id: "d3",
      storyUpdateId: "u1",
      contentItemId: "c-1",
      adoptionCaseId: null,
      supporterId: null,
      channel: "email",
      recipientName: RECIPIENT_THREE,
      recipientContact: "chiu@example.org",
      subject: null,
      body: DRAFT_BODY_TWO,
      status: "copied",
      ...timestamps,
    },
    {
      id: "d4",
      storyUpdateId: "u1",
      contentItemId: "c-1",
      adoptionCaseId: null,
      supporterId: null,
      channel: "email",
      recipientName: RECIPIENT_FOUR,
      recipientContact: "chow@example.org",
      subject: null,
      body: DRAFT_BODY_TWO,
      status: "dismissed",
      ...timestamps,
    },
  ],
};

const queueRows = (kind: string) => [
  {
    entity_kind: kind,
    entity_id: "11111111-1111-4111-8111-111111111111",
    revision_key: "1",
    title: ANIMAL_TITLE,
    publication_state: "published",
    classification: "demo",
    evidence: null,
    quality_reason: "demo",
  },
  {
    entity_kind: kind,
    entity_id: "22222222-2222-4222-8222-222222222222",
    revision_key: "2",
    title: TITLE_TWO,
    publication_state: "draft",
    classification: "needs_review",
    evidence: null,
    quality_reason: "expired",
  },
  {
    entity_kind: kind,
    entity_id: "33333333-3333-4333-8333-333333333333",
    revision_key: "3",
    title: TITLE_THREE,
    publication_state: "draft",
    classification: "approved",
    evidence: "checked",
    quality_reason: "missing_source",
  },
];

const revisions = [
  {
    id: "r1",
    contentId: "c-1",
    version: 5,
    operation: "save_content",
    createdBy: "u",
    createdAt: "x",
    isPublished: true,
  },
  {
    id: "r2",
    contentId: "c-1",
    version: 4,
    operation: "create",
    createdBy: "u",
    createdAt: "x",
    isPublished: false,
  },
  {
    id: "r3",
    contentId: "c-1",
    version: 3,
    operation: "something_new",
    createdBy: "u",
    createdAt: "x",
    isPublished: false,
  },
];

const snapshot = {
  content: { title: OLD_TITLE, slug: OLD_SLUG, summary: OLD_SUMMARY, body: OLD_BODY },
  profile: {
    rescue_region: OLD_REGION,
    show_on_map: true,
    public_map_label: OLD_MAP,
    internal_address: ADDRESS,
  },
  updates: [
    { title: OLD_UPDATE, body: OLD_UPDATE_BODY, visibility: "internal" },
    { body: UPDATE_THREE, visibility: "public" },
  ],
  media: [{ alt_text: OLD_ALT, is_cover: true, caption: OLD_CAPTION }, { is_cover: false }],
  links: [
    { linked_type: "animal" },
    { linked_type: "adoption_case" },
    { linked_type: "successful_adoption" },
    { linked_type: "supporter" },
    { linked_type: "volunteer_activity" },
    { linked_type: "mystery" },
  ],
};

mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {}, setQueryData: () => {} }),
  useMutation: () => {
    mutationCalls += 1;
    const error = state.mutationError
      ? Object.assign(new Error(`${state.mutationError.message} ${mutationCalls}`), {
          status: (state.mutationError as Error & { status?: number }).status,
        })
      : null;
    return { mutate() {}, mutateAsync: async () => undefined, reset() {}, isPending: false, error };
  },
  useQuery: (options: { queryKey: readonly unknown[] }) => {
    const key = String(options.queryKey[0]);
    const base = {
      isLoading: false,
      isFetching: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: async () => ({ isSuccess: true, isError: false, data: undefined }),
    };
    const failed = { ...base, data: undefined, error: new Error("boom"), isError: true };
    if (key === "admin-me") return { ...base, data: { admin: { role: state.role } } };
    if (key === "editorial-review")
      return state.reviewFails
        ? failed
        : { ...base, data: { total: 60, items: queueRows(String(options.queryKey[1])) } };
    if (key === "admin-content")
      return state.listFails
        ? { ...failed, error: state.listError ?? failed.error }
        : {
            ...base,
            data: {
              content: summaries,
              pagination: { page: 2, pageSize: 25, total: 60, pageCount: 3 },
            },
          };
    if (key === "admin-content-detail") {
      if (state.editor === "loading") return { ...base, data: undefined, isLoading: true };
      if (state.editor === "missing") return { ...base, data: undefined };
      return { ...base, data: { content: state.detail ?? detail } };
    }
    if (key === "admin-content-revisions")
      return state.revisionFails ? failed : { ...base, data: { revisions, nextBeforeVersion: 2 } };
    if (key === "admin-content-revision")
      return { ...base, data: { revision: { id: "r1", version: 5, snapshot } } };
    if (key === "content-link-search")
      return state.linkSearch === "error"
        ? failed
        : {
            ...base,
            data: [
              { id: "a1", label: ANIMAL_NAME, sublabel: "cat" },
              { id: "a2", label: "（未命名）", sublabel: "" },
              { id: "a3", label: "（未填姓名）", sublabel: "" },
              { id: "a4", label: "（無編號）", sublabel: "" },
              { id: "a5", label: "（未命名活動）", sublabel: "" },
            ],
          };
    return { ...base, data: undefined };
  },
}));

mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useNavigate: () => () => Promise.resolve(),
  useBlocker: () => ({ status: "idle", reset() {}, proceed() {} }),
  Link: ({
    children,
    className,
    to,
    params,
  }: {
    children: ReactNode;
    className?: string;
    to: string;
    params?: Record<string, string>;
  }) => {
    const href = params
      ? Object.entries(params).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)
      : to;
    return (
      <a data-router-link="true" href={href} className={className}>
        {children}
      </a>
    );
  },
}));

const { ContentManagement, CreateContentDraft } = await import("./ContentManagement");
const { ContentCreateForm, createErrorMessage } = await import("./ContentCreateForm");
const {
  ActionErrors,
  ContentAuthoringPanels,
  ContentEditor,
  PublishValidationPanel,
  StoryUpdateDraftNotice,
  createContentMediaWithUpload,
  formatAdopterDraftNotice,
} = await import("./ContentEditor");
const { ContentReviewPanel, ContentReviewQueue } = await import("./ContentReview");
const { recordContentReview } = await import("./recordContentReview");
const { CmsReviewBulkPanel } = await import("./CmsReviewBulkPanel");
const { AnimalReviewBulkPanel } = await import("./AnimalReviewBulkPanel");
const { ReviewBulkOperation } = await import("./ReviewBulkOperation");
const { ContentRevisionPanel, RevisionChildren } = await import("./ContentRevisionPanel");
const { ContentTimeline } = await import("./ContentTimeline");
const { LinkedRecordPicker } = await import("./LinkedRecordPicker");
const { NotificationDraftPanel } = await import("./NotificationDraftPanel");
const { SocialCopyPanel } = await import("./SocialCopyPanel");
const { uploadContentMediaImage } = await import("./contentMediaUpload");
const { createEditorOperationGate } = await import("./editorState");
const { contentCommonCopy } = await import("./contentCommonCopy");
const { managementCopy } = await import("./managementCopy");
const { editorCopy } = await import("./editorCopy");
const { editorPanelsCopy } = await import("./editorPanelsCopy");
const { reviewCopy } = await import("./reviewCopy");
const { cmsStateCopy } = await import("./cmsStateCopy");
const { ContentAdminError } = await import("./contentErrors");
const { errorReference } = await import("../LoadFailure");

function expectAll(markup: string, texts: string[]) {
  for (const text of texts) expect(markup, text).toContain(text);
}

function reset() {
  state.role = "admin";
  state.listFails = false;
  state.listError = null;
  state.reviewFails = false;
  state.editor = "loaded";
  state.detail = undefined;
  state.revisionFails = false;
  state.linkSearch = "ok";
  state.mutationError = null;
  mutationCalls = 0;
}

const noop = () => {};
const authoringProps = {
  pending: false,
  onCreateLink: async () => undefined,
  onSaveStoryProfile: async () => undefined,
  onCreateStoryUpdate: async () => undefined,
  onCreateMedia: async () => undefined,
};

describe("content list in English", () => {
  const view = (
    <ContentManagement
      initialData={{
        content: summaries,
        pagination: { page: 2, pageSize: 25, total: 60, pageCount: 3 },
      }}
    />
  );

  test("shows the page, the cards, the eligibility check and the table in English", () => {
    reset();
    const markup = renderAdminInEnglish(view);
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      ">Website content</p>",
      ">Content</h1>",
      "Manage story, event, market and report pages.",
      ">Create content</a>",
      ">Adoption information</a>",
      ">Post-adoption guide releases</a>",
      ">Documents</a>",
      ">Annual reports</a>",
      // cards
      "All content",
      ">60</p>",
      "Published on this page",
      "Drafts on this page",
      "Rescue stories on this page",
      // eligibility
      "Content on this page that needs an eligibility check",
      "This list is read-only.",
      `${TITLE} · Demo`,
      `${TITLE_TWO} · Awaiting verification`,
      "ID c-1 · Public location /stories/siu-bak · Featured candidate · Map candidate",
      "ID c-2 · Public location /stories/spring-day</p>",
      "Suggested: check the data source, owner and effective date",
      ">View</a>",
      // filters
      "Title, summary or slug",
      "All types",
      "All statuses",
      "Rescue region",
      'placeholder="e.g. Wan Chai"',
      "Published from",
      "Published to",
      "Map display",
      ">Shown</option>",
      ">Not shown</option>",
      "Update records",
      ">Has updates</option>",
      ">No updates</option>",
      "Notification drafts",
      ">Sent manually</option>",
      ">Dismissed</option>",
      // table
      ">Title</th>",
      ">Publication date</th>",
      "20 Jun 2026 (Sat)",
      ">Not published</td>",
      ">Not applicable</td>",
      ">Edit</a>",
      "Rescue story",
      "Charity market",
      ">Draft</",
      ">Published</",
      ">Archived</",
    ]);
    // A type or status is never printed as its stored code.
    for (const code of ["rescue_story", "charity_market"]) {
      expect(markup.replace(/value="[^"]*"/g, "")).not.toContain(code);
    }
  });

  test("shows the runtime page with the review queue and the quick form in English", () => {
    reset();
    const markup = renderAdminInEnglish(<ContentManagement />);
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Content source review queue",
      "Add content",
      "The draft editor opens after you create it.",
      ">Create draft</button>",
      ">Refresh</button>",
      'aria-label="Content pagination"',
      "Showing 26–50 of 60",
    ]);
  });

  test("shows a failed load in English, without zeroed cards", () => {
    reset();
    state.listFails = true;
    const markup = renderAdminInEnglish(<ContentManagement />);
    expectNoChineseText(markup, { allow: DATA });
    expect(markup).toContain("Could not load");
    expect(markup).toContain(
      "Could not load the list to check. Refresh the page or try again later.",
    );
    expect((markup.match(/—/g) ?? []).length).toBe(4);
  });

  test("writes a lapsed session in English, and keeps the Chinese reference as it was", () => {
    reset();
    state.listFails = true;
    state.listError = new AdminSessionError("not_signed_in");
    // The failure shows only a reference made from the error's text, never the text itself, so
    // the reference is made from the English text in English and from 未登入 in Chinese, as before.
    const markup = renderAdminInEnglish(<ContentManagement />);
    expectNoChineseText(markup, { allow: DATA });
    expect(markup).toContain(`>${errorReference("Not signed in. Sign in again.")}</span>`);
    const chinese = renderAdminInChinese(<ContentManagement />);
    expect(chinese).toContain(`>${errorReference("未登入")}</span>`);
    reset();
  });

  test("shows an empty list in English", () => {
    reset();
    const markup = renderAdminInEnglish(
      <ContentManagement
        initialData={{
          content: [],
          pagination: { page: 1, pageSize: 25, total: 0, pageCount: 1 },
        }}
      />,
    );
    expectNoChineseText(markup);
    expectAll(markup, ["No content", "Nothing on this page needs checking."]);
  });

  test("groups the thousands of a card's figure in English, and leaves the Chinese figure plain", () => {
    reset();
    const list = (
      <ContentManagement
        initialData={{
          content: [],
          pagination: { page: 1, pageSize: 25, total: 1234, pageCount: 50 },
        }}
      />
    );
    expect(renderAdminInEnglish(list)).toContain(">1,234</p>");
    expect(renderAdminInChinese(list)).toContain(">1234</p>");
  });

  test("tells staff what to do when the quick form fails", () => {
    const failed = renderAdminInEnglish(
      <CreateContentDraft onCreate={async () => undefined} busy={false} failed />,
    );
    expectNoChineseText(failed);
    expect(failed).toContain("Could not create the draft. Check the details and try again.");
    const busy = renderAdminInEnglish(
      <CreateContentDraft onCreate={async () => undefined} busy failed={false} />,
    );
    expect(busy).toContain("Creating…");
    expect(busy).not.toContain('role="alert"');
  });

  test("keeps the Chinese list as it was", () => {
    reset();
    const markup = renderAdminInChinese(view);
    expectAll(markup, [
      ">宣傳</p>",
      ">宣傳內容</h1>",
      "管理故事、活動、市集與報告頁面。",
      ">建立內容</a>",
      ">領養後指南版本</a>",
      "本頁內容資格待核對",
      "小白回家路 · 示範",
      "春日同樂日 · 待核實",
      "ID c-1 · 公開位置 /stories/siu-bak · 精選候選 · 地圖候選",
      "標題、摘要或 slug",
      "全部類型",
      "發布日期（起）",
      ">有更新</option>",
      ">已手動發送</option>",
      "2026年6月20日",
      ">未發布</td>",
      ">不適用</td>",
      "救援故事",
      "慈善市集",
    ]);
  });
});

describe("create content form in English", () => {
  test("labels every field in English", () => {
    reset();
    const markup = renderAdminInEnglish(<ContentCreateForm />);
    expectNoChineseText(markup);
    expectAll(markup, [
      ">Website content</p>",
      ">Add content</h1>",
      "URL slug (lowercase letters, numbers and hyphens)",
      "Body (can be added later)",
      "CTA label",
      "CTA link",
      "SEO title",
      "SEO description",
      "OG title",
      "OG description",
      ">Create draft</button>",
      ">Rescue story</option>",
      ">Charity market</option>",
    ]);
  });

  test("says what to do when a slug is taken, a field is wrong or creating fails", () => {
    const conflict = new AdminApiError({ status: 409, message: "slug already exists" });
    const fields = new AdminApiError({
      status: 400,
      message: "Invalid content management request",
      fields: { slug: ["Invalid"], title: ["Required"] },
    });
    expect(createErrorMessage(conflict, "en")).toBe(
      "This URL is already in use. Use a different slug.",
    );
    expect(createErrorMessage(conflict)).toBe("此網址已被使用，請改用其他 slug。");
    expect(createErrorMessage(fields, "en")).toBe("slug: Invalid\ntitle: Required");
    expect(createErrorMessage(null, "en")).toBe("Could not create the content. Try again.");
    expect(createErrorMessage(null)).toBe("建立失敗，請重試。");
    // A reason the server gave is shown as it came; a session error is translated.
    expect(createErrorMessage(new Error("Forbidden"), "en")).toBe("Forbidden");
    expect(createErrorMessage(new AdminSessionError("not_signed_in"), "en")).toBe(
      "Not signed in. Sign in again.",
    );
    expect(createErrorMessage(new AdminSessionError("not_signed_in"))).toBe("未登入");
  });

  test("keeps the Chinese form as it was", () => {
    reset();
    const markup = renderAdminInChinese(<ContentCreateForm />);
    expectAll(markup, [
      ">新增宣傳內容</h1>",
      "網址 slug（小寫英數字與連字號）",
      "正文（可稍後填寫）",
      "CTA 標籤",
      "OG 描述",
      ">建立草稿</button>",
    ]);
  });
});

describe("content editor in English", () => {
  test("shows a rescue story with every panel in English", () => {
    reset();
    const markup = renderAdminInEnglish(<ContentEditor contentId="c-1" initialContent={detail} />);
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Back to content",
      `>${TITLE}</h1>`,
      ">Draft</",
      "Rescue story · siu-bak",
      ">Refresh</button>",
      ">Publish</button>",
      ">Archive</button>",
      "Draft saved · version 5",
      'aria-label="Content history pages"',
      "Previous history page",
      "History page 2 · up to 20 per type",
      "Next history page",
      // the source review panel, and the version history
      "Source review of this saved version",
      "Version history and comparison",
      // publication eligibility
      "Publication eligibility and source",
      "Content classification",
      ">Awaiting verification</option>",
      ">Verified</option>",
      ">Demo (not public)</option>",
      "Data source / approval record",
      "Content owner",
      "Effective from",
      "Effective until",
      "Save publication eligibility",
      // basic content
      "Basic content",
      "Title, summary, SEO and CTA settings.",
      ">Save draft</button>",
      "Subtitle",
      ">Body<",
      "CTA label",
      // linked records
      ">Linked records</h2>",
      ">Add linked record</button>",
      ">Adoption application</option>",
      ">Successful adoption</option>",
      ">Main subject</option>",
      ">Volunteer background</option>",
      "Animal · Main subject",
      "Volunteer activity · Volunteer background",
      // story wall
      "Story wall settings",
      ">Recovering in foster care</option>",
      ">Cats and dogs</option>",
      "Public latitude",
      "Public longitude",
      "Internal location notes",
      "Show on the public map",
      "Featured story",
      "Save story wall settings",
      // story updates
      ">Story updates</h2>",
      "Allow adopter notification drafts after publishing",
      ">Add story update</button>",
      // media
      "Media and photos",
      "Upload an image as the cover or as a photo for a story update (JPG, PNG or WEBP, up to 8 MiB).",
      "Images are first saved as private media.",
      "Image file",
      "Linked update",
      ">Whole content item</option>",
      `${UPDATE_TWO} (internal)</option>`,
      "Alt text",
      "Caption",
      "Sort order",
      "Set as cover",
      ">Add media</button>",
      ">Cover</p>",
      // social copy and notification drafts
      "Social media copy",
      ">Generate copy</button>",
      "Notification drafts",
      "Drafts of notifications for adopters or supporters, sent by hand.",
    ]);
    // A stand-in label the server sends for a record without a name is written in English.
    expect(markup).not.toContain("（");
  });

  test("shows a page that is not a rescue story in English", () => {
    reset();
    state.detail = {
      ...detail,
      type: "event",
      status: "published",
      revisionId: null,
      links: [],
      media: [],
      updates: [],
      socialCopies: [],
      notificationDrafts: [],
      storyProfile: null,
      history: undefined,
      version: undefined,
    };
    const markup = renderAdminInEnglish(<ContentEditor contentId="c-1" />);
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      ">Published</",
      "Event · siu-bak",
      "Draft saved · version —",
      "Only rescue stories need story wall settings.",
      "No records are linked.",
      "No story updates yet.",
      "No media yet.",
      "No social media copy yet.",
      "No notification drafts yet.",
      "History page 1 · up to 20 per type",
    ]);
    expect(markup).not.toContain("Source review of this saved version");
  });

  test("shows the loading and not-found pages in English", () => {
    reset();
    state.editor = "loading";
    const loading = renderAdminInEnglish(<ContentEditor contentId="c-1" />);
    expectNoChineseText(loading);
    expect(loading).toContain("Loading content...");
    state.editor = "missing";
    const missing = renderAdminInEnglish(<ContentEditor contentId="c-1" />);
    expectNoChineseText(missing);
    expectAll(missing, [
      "Back to content",
      "Content not found. Go back to the content list and choose another item.",
    ]);
  });

  test("shows the conflict banner and each failed action in English", () => {
    reset();
    state.mutationError = Object.assign(new Error("Content changed"), { status: 409 });
    const markup = renderAdminInEnglish(<ContentEditor contentId="c-1" initialContent={detail} />);
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "The content has a newer version, or its public URL clashes with another item.",
      "copy any text you want to keep before you reload",
      ">Compare latest content</button>",
      ">Reload latest version</button>",
    ]);
    // Each failed action shows the reason the server gave, as it came.
    expect(markup).toMatch(/Content changed \d+/);
    reset();
  });

  test("shows the authoring panels while an action is pending, with every generating state", () => {
    reset();
    const markup = renderAdminInEnglish(
      <ContentAuthoringPanels
        {...authoringProps}
        content={detail}
        generatingUpdateId="u1"
        onGenerateDrafts={noop}
      />,
    );
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      ">Creating</button>",
      ">Medical<",
      ">Foster<",
      ">General<",
      ">Public<",
      ">Internal<",
      "5 Jul 2026 (Sun)",
      `Read the update text`,
      "No body text",
    ]);
    const waiting = renderAdminInEnglish(
      <ContentAuthoringPanels
        {...authoringProps}
        content={detail}
        generatingUpdateId={null}
        onGenerateDrafts={noop}
      />,
    );
    expect(waiting).toContain(">Create notification drafts</button>");
  });

  test("keeps the Chinese editor as it was", () => {
    reset();
    const markup = renderAdminInChinese(<ContentEditor contentId="c-1" initialContent={detail} />);
    expectAll(markup, [
      "返回宣傳內容",
      "救援故事 · siu-bak",
      ">重新整理</button>",
      ">發布</button>",
      ">封存</button>",
      "已儲存草稿 · 版本 5",
      'aria-label="內容歷史分頁"',
      "紀錄第 2 頁 · 每類最多 20 筆",
      "發布資格與來源",
      "資料來源／批准記錄",
      ">儲存草稿</button>",
      "CTA 文字",
      "新增關聯紀錄",
      "動物 · 主要主角",
      "故事牆設定",
      ">暫養康復</option>",
      "發佈後可產生領養人通知草稿",
      "上傳圖片作為封面或故事更新相片（JPG、PNG 或 WEBP，8 MiB 以內）。",
      `${UPDATE_TWO}（內部）</option>`,
      "（未命名活動）",
      "社交平台文案",
      ">產生文案</button>",
    ]);
  });
});

describe("what the editor says when an action fails", () => {
  const errors = [
    new ContentAdminError("choose_image"),
    new ContentAdminError("save_before_publish"),
    new AdminSessionError("identity_changed"),
    new Error("Content item not found"),
  ];

  test("writes coded and session errors in English, and shows a server reason as it came", () => {
    const markup = renderAdminInEnglish(<ActionErrors errors={[...errors, null, "text"]} />);
    expectNoChineseText(markup);
    expectAll(markup, [
      "Choose an image to upload.",
      "Save the content and reload the page, then publish.",
      "Your signed-in account has changed. Reload the page.",
      "Content item not found",
    ]);
  });

  test("writes the same errors in Chinese, as the error messages always were", () => {
    const markup = renderAdminInChinese(<ActionErrors errors={errors} />);
    expectAll(markup, [
      "請選擇圖片",
      "請先儲存內容並重新載入後再發布",
      "登入身份已變更，請重新載入頁面。",
      "Content item not found",
    ]);
  });

  test("shows nothing when there is no error", () => {
    expect(renderAdminInEnglish(<ActionErrors errors={[undefined, null]} />)).toBe("");
  });

  test("names the field of each publish check in English, and as sent in Chinese", () => {
    const issues: PublishValidationIssue[] = [
      { field: "coverMediaId", message: "Cover image is required before publishing" },
      {
        field: "storyProfile",
        message: "Rescue stories need Story Wall settings before publishing",
      },
      { field: "publicLat", message: "Approximate public latitude is required for map stories" },
      { field: "somethingNew", message: "Something else is required" },
    ];
    const english = renderAdminInEnglish(<PublishValidationPanel issues={issues} />);
    expectNoChineseText(english);
    expectAll(english, [
      "Fix these before publishing",
      ">Cover image</span>: Cover image is required before publishing",
      ">Story wall settings</span>: Rescue stories need Story Wall settings",
      ">Public latitude</span>: Approximate public latitude",
      ">somethingNew</span>: Something else is required",
    ]);
    const chinese = renderAdminInChinese(<PublishValidationPanel issues={issues} />);
    expectAll(chinese, ["發布前需要修正", ">coverMediaId</span>: Cover image is required"]);
    for (const code of ["coverMediaId", "storyProfile", "publicLat"]) {
      expect(english).not.toContain(`>${code}<`);
    }
  });

  test("a failed upload or publish carries a code, and its message is the zh-HK text it always was", async () => {
    const form = {
      file: null,
      storyUpdateId: "",
      altText: "",
      caption: "",
      sortOrder: "0",
      isCover: false,
    };
    const noFile = await createContentMediaWithUpload("c-1", form, 1).catch((e: unknown) => e);
    expect(noFile).toBeInstanceOf(ContentAdminError);
    expect(noFile).toMatchObject({ code: "choose_image", message: "請選擇圖片" });
    const file = new File([new Uint8Array(8)], "a.jpg", { type: "image/jpeg" });
    const noVersion = await createContentMediaWithUpload("c-1", { ...form, file }, undefined).catch(
      (e: unknown) => e,
    );
    expect(noVersion).toMatchObject({
      code: "reload_before_upload",
      message: "請重新載入內容後再上傳圖片",
    });
    // The editor's own publish check throws this one before it asks the server anything.
    expect(new ContentAdminError("save_before_publish")).toMatchObject({
      code: "save_before_publish",
      message: "請先儲存內容並重新載入後再發布",
    });

    const pdf = new File([new Uint8Array(8)], "a.pdf", { type: "application/pdf" });
    const big = new File([new Uint8Array(9 * 1024 * 1024)], "a.jpg", { type: "image/jpeg" });
    const upload = (picked: File) =>
      uploadContentMediaImage({
        file: picked,
        contentId: "c-1",
        storyUpdateId: null,
        requestUploadTarget: async () => ({ token: "t", path: "p" }),
        uploadToSignedUrl: async () => undefined,
      }).catch((e: unknown) => e);
    expect(await upload(pdf)).toMatchObject({
      code: "media_type",
      message: "請選擇 JPG、PNG 或 WEBP 圖片",
    });
    expect(await upload(big)).toMatchObject({ code: "media_size", message: "圖片不可超過 8 MiB" });

    const run = createEditorOperationGate();
    let finish: () => void = () => undefined;
    const first = run(
      "content",
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const busy = await run("profile", async () => undefined).catch((e: unknown) => e);
    finish();
    await first;
    expect(busy).toMatchObject({
      code: "operation_busy",
      message: "另一個面板正在儲存，請稍後重試。",
    });
  });

  test("every English error says what to do next and has no Chinese", () => {
    for (const [code, text] of Object.entries(contentCommonCopy.en.errors)) {
      expectNoChineseText(text);
      expect(text, code).toMatch(/(Choose|Wait a moment|Reload|Try again|Save the content)/);
    }
    expect(Object.keys(contentCommonCopy.en.errors)).toEqual(
      Object.keys(contentCommonCopy.zh.errors),
    );
  });
});

describe("the notice after a story update is saved", () => {
  test("writes the count, and the three warnings the server sends, in English", () => {
    expect(formatAdopterDraftNotice({ created: 2, warning: null }, "en")).toBe(
      "Created 2 notification drafts",
    );
    expect(formatAdopterDraftNotice({ created: 1, warning: null }, "en")).toBe(
      "Created 1 notification draft",
    );
    expect(formatAdopterDraftNotice({ created: 0, warning: null }, "en")).toBeNull();
    expect(formatAdopterDraftNotice(null, "en")).toBeNull();
    for (const warning of [
      "內部更新不會建立通知草稿。",
      "沒有可聯絡的領養者，已略過通知草稿。",
      "通知草稿建立失敗，更新已儲存。",
    ]) {
      const english = formatAdopterDraftNotice({ created: 0, warning }, "en");
      expect(english).not.toBeNull();
      expectNoChineseText(english ?? "");
      // The notice gives the next step.
      expect(english, warning).toMatch(/(Make the update public|Check the adopters|Select Create)/);
      // Chinese shows the warning as the server sent it.
      expect(formatAdopterDraftNotice({ created: 0, warning }, "zh")).toBe(warning);
      expect(formatAdopterDraftNotice({ created: 0, warning })).toBe(warning);
    }
    // A warning that is not one of those is shown as it came.
    expect(formatAdopterDraftNotice({ created: 0, warning: "Something else" }, "en")).toBe(
      "Something else",
    );
    expect(formatAdopterDraftNotice({ created: 3, warning: null })).toBe("已建立 3 份通知草稿");
  });

  test("renders as a status", () => {
    const markup = renderAdminInEnglish(
      <StoryUpdateDraftNotice notice="Created 2 notification drafts" />,
    );
    expect(markup).toContain('role="status"');
  });
});

describe("source review in English", () => {
  test("shows the review panel for an animal and for content", () => {
    reset();
    for (const kind of ["animal", "content"] as const) {
      const markup = renderAdminInEnglish(<ContentReviewPanel kind={kind} id="a" revision="3" />);
      expectNoChineseText(markup);
      expectAll(markup, [
        "Source review of this saved version",
        "Classify the version only by verified sources.",
        "Classification",
        ">Verified and publishable</option>",
        ">Demo data (cannot be published)</option>",
        ">Awaiting verification</option>",
        "Verified source and reason",
        ">Record review of this version</button>",
      ]);
    }
    const disabled = renderAdminInEnglish(
      <ContentReviewPanel kind="content" id="c" revision="r" disabled />,
    );
    expect(disabled).toContain("<fieldset");
    expect(disabled).toContain('disabled=""');
  });

  test("keeps the Chinese review panel as it was", () => {
    reset();
    const markup = renderAdminInChinese(<ContentReviewPanel kind="animal" id="a" revision="3" />);
    expectAll(markup, [
      "此已儲存版本的來源審核",
      "只按已核實來源分類。示範資料及未核實資料不可發布；每次儲存新版本均須重新審核。",
      ">已核實可發布</option>",
      ">示範資料（不可發布）</option>",
      ">待核實</option>",
      "核實來源及理由",
      "記錄此版本審核",
    ]);
  });

  test("records a review, and reports any failure in the panel's own words", async () => {
    const calls: unknown[] = [];
    const input = {
      kind: "animal" as const,
      id: "a-1",
      revision: "4",
      classification: "approved" as const,
      evidence: "Checked the vet records",
    };
    const ok = await recordContentReview(input, (async (path: string, init?: RequestInit) => {
      calls.push([path, init?.method, JSON.parse(String(init?.body))]);
      return {};
    }) as never);
    expect(ok).toBe("recorded");
    expect(calls).toEqual([
      [
        "/api/admin/content-review",
        "POST",
        {
          entity_kind: "animal",
          entity_id: "a-1",
          revision_key: "4",
          classification: "approved",
          evidence: "Checked the vet records",
        },
      ],
    ]);
    // The review route answers a failure in zh-HK, and the database trigger that blocks an
    // unreviewed publish does too. Neither text is shown: the panel writes its own.
    const failed = await recordContentReview(input, (async () => {
      throw new AdminApiError({
        status: 500,
        message: "未能完成內容審核，請檢查資料及版本後重試。",
      });
    }) as never);
    expect(failed).toBe("failed");
    expect(reviewCopy.en.panel.failed).toBe(
      "Could not record the review. The version may have changed. Reload the page, then review again.",
    );
    expectNoChineseText(reviewCopy.en.panel.failed);
  });

  test("shows the queue for content in English", () => {
    reset();
    const markup = renderAdminInEnglish(<ContentReviewQueue initialKind="content" />);
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Content source review queue",
      "Classifying does not take down existing public content automatically.",
      "Record type",
      ">Content</option>",
      ">Animal records</option>",
      "Quality queue",
      ">All content</option>",
      ">Demo content</option>",
      ">Expired content</option>",
      ">Content missing a source</option>",
      ">Select this page</button>",
      "Select all matching content (up to 1,000)",
      ">Clear selection</button>",
      "Select this CMS draft",
      `${ANIMAL_TITLE} · Demo data (cannot be published) · Suggested to unpublish (needs authorisation) · Demo content awaiting action`,
      `${TITLE_TWO} · Awaiting verification · Validity has expired`,
      `${TITLE_THREE} · Verified and publishable · Source not recorded`,
      ">Open and verify the source</a>",
      'aria-label="Review records pagination"',
      // the CMS bulk panel under the list
      "Send CMS drafts for source review in bulk",
      "Source and reason for review",
      "0 selected (up to 1,000)",
      ">Preview submission</button>",
    ]);
  });

  test("shows the queue for animal records in English", () => {
    reset();
    const markup = renderAdminInEnglish(<ContentReviewQueue initialKind="animal" />);
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Select all matching animal records (up to 1,000)",
      "Select this animal draft",
      "Send animal drafts for source review in bulk",
    ]);
    expect(markup).not.toContain("Quality queue");
  });

  test("shows a staff member the list without the bulk controls", () => {
    reset();
    state.role = "staff";
    const markup = renderAdminInEnglish(<ContentReviewQueue initialKind="content" />);
    expectNoChineseText(markup, { allow: DATA });
    expect(markup).toContain(">Open and verify the source</a>");
    for (const hidden of ["Select this page", "Send CMS drafts", "Select this CMS draft"]) {
      expect(markup, hidden).not.toContain(hidden);
    }
  });

  test("explains the quality queue and says how to load it again", () => {
    reset();
    const quality = renderAdminInEnglish(
      <ContentReviewQueue initialKind="content" initialQuality="expired" />,
    );
    expectNoChineseText(quality, { allow: DATA });
    expect(quality).toContain(
      "The quality queue is for checking items one by one. To send drafts for review in bulk, go back to &quot;All content&quot;.",
    );
    expect(quality).not.toContain("Send CMS drafts");
    state.reviewFails = true;
    const failed = renderAdminInEnglish(<ContentReviewQueue initialKind="content" />);
    reset();
    expectNoChineseText(failed);
    expect(failed).toContain("Could not load the review queue. Select Retry or refresh the page.");
    expect(failed).toContain(">Retry</button>");
  });

  test("keeps the Chinese queue as it was", () => {
    reset();
    const markup = renderAdminInChinese(<ContentReviewQueue initialKind="content" />);
    expectAll(markup, [
      "內容來源審核佇列",
      "資料類型",
      "品質隊列",
      ">缺來源內容</option>",
      ">選取本頁</button>",
      "選取全部符合篩選的宣傳內容（最多 1000 筆）",
      ">清除選取</button>",
      "選取此CMS草稿",
      `${ANIMAL_TITLE} · 示範資料（不可發布） · 建議暫停公開（待授權） · 示範內容待處理`,
      `${TITLE_TWO} · 待核實 · 有效期已過`,
      `${TITLE_THREE} · 已核實可發布 · 來源未記錄`,
      "批量送交 CMS 草稿來源審核",
      "已選 0 筆（最多 1000）",
    ]);
  });

  test("shows the bulk panels in English, and as they were in Chinese", () => {
    reset();
    const cms = renderAdminInEnglish(
      <CmsReviewBulkPanel selectedIds={["a", "b"]} filterKey="content" selectionDisabled={false} />,
    );
    expectNoChineseText(cms);
    expectAll(cms, [
      'aria-label="Bulk source review of CMS drafts"',
      "Send CMS drafts for source review in bulk",
      "It does not change public status, media or body text.",
      "2 selected (up to 1,000)",
    ]);
    const animal = renderAdminInEnglish(
      <AnimalReviewBulkPanel selectedIds={[]} filterKey="animal" selectionDisabled />,
    );
    expectNoChineseText(animal);
    expectAll(animal, [
      'aria-label="Bulk source review of animal drafts"',
      "It does not change public status, photos or animal matches.",
      "0 selected (up to 1,000)",
    ]);
    const zh = renderAdminInChinese(
      <CmsReviewBulkPanel selectedIds={["a"]} filterKey="content" selectionDisabled={false} />,
    );
    expectAll(zh, [
      'aria-label="CMS 草稿批量送審"',
      "不修改公開狀態、媒體或內容正文。 套用時逐筆重查職員權限、草稿版本及現有分類。",
      "已選 1 筆（最多 1000）",
      ">建立送審預覽</button>",
    ]);
  });

  test("shows the preview of a bulk review in English, and in Chinese as it was", () => {
    const operation = {
      operationId: "op-1",
      evidence: "Checked the vet records",
      expiresAt: "2999-01-01T00:00:00.000Z",
      items: [
        {
          entityId: "id-1",
          status: "pending" as const,
          reasonCode: null,
          beforeClassification: null,
          afterClassification: "needs_review",
        },
        {
          entityId: "id-2",
          status: "skipped" as const,
          reasonCode: "already_reviewed",
          beforeClassification: "approved",
          afterClassification: "approved",
        },
        {
          entityId: "id-3",
          status: "pending" as const,
          reasonCode: null,
          beforeClassification: "demo",
          afterClassification: "mystery",
        },
      ],
    };
    const english = renderAdminInEnglish(
      <ReviewBulkOperation kind="cms" operation={operation} busy={false} onApply={noop} />,
    );
    expectNoChineseText(english);
    expectAll(english, [
      "Reason for this submission: Checked the vet records",
      "CMS drafts for review · 3 drafts",
      ">Unclassified</td>",
      ">Awaiting verification</td>",
      ">Verified</td>",
      ">Demo data</td>",
    ]);
    const animal = renderAdminInEnglish(
      <ReviewBulkOperation
        kind="animal"
        operation={{ ...operation, items: operation.items.slice(0, 1) }}
        busy={false}
        onApply={noop}
      />,
    );
    expect(animal).toContain("Animal drafts for review · 1 draft");
    const chinese = renderAdminInChinese(
      <ReviewBulkOperation kind="cms" operation={operation} busy={false} onApply={noop} />,
    );
    expectAll(chinese, [
      "本次理由：Checked the vet records",
      "CMS 草稿送審 · 3 筆",
      ">未分類</td>",
      ">待核實</td>",
      ">已核實</td>",
      ">示範資料</td>",
    ]);
    const chineseAnimal = renderAdminInChinese(
      <ReviewBulkOperation kind="animal" operation={operation} busy={false} onApply={noop} />,
    );
    expect(chineseAnimal).toContain("動物草稿送審 · 3 筆");
  });

  test("every English bulk and selection message says what to do next", () => {
    for (const text of Object.values(reviewCopy.en.bulk.errors)) {
      expectNoChineseText(text);
      expect(text).toMatch(/(Select Reload result|try again|Try again)/i);
    }
    const selection = reviewCopy.en.queue.selectionErrors;
    for (const text of [
      selection.select_failed,
      selection.filter_changed,
      selection.collect_failed,
      ...Object.values(selection.content),
      ...Object.values(selection.animal),
    ]) {
      expectNoChineseText(text);
      expect(text).toMatch(/(try again|Select again|Select the drafts again|Clear some)/i);
    }
  });
});

describe("version history in English", () => {
  const panel = (
    <ContentRevisionPanel content={detail} disabled={false} onRestore={async () => undefined} />
  );

  test("shows the history, the comparison and the restore button in English", () => {
    reset();
    const markup = renderAdminInEnglish(panel);
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      'aria-label="Version history and comparison"',
      "Current saved version 5. Restoring creates a new draft; the public version does not change.",
      ">Version 5 · Saved content · Was published</button>",
      ">Version 4 · Created</button>",
      ">Version 3 · Other change</button>",
      ">Show latest versions</button>",
      ">Show earlier versions</button>",
      ">Field</th>",
      ">Currently saved</th>",
      ">Selected version</th>",
      ">URL</th>",
      ">Body</th>",
      "Story wall settings, updates and media in the selected version",
      ">Restore as new draft</button>",
    ]);
    // The code of an operation is never printed.
    for (const code of ["save_content", "something_new"]) {
      expect(markup, code).not.toContain(code);
    }
  });

  test("shows the story wall settings, updates, media and records of a version in English", () => {
    const markup = renderAdminInEnglish(<RevisionChildren snapshot={snapshot} />);
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "<dt>Rescue region</dt>",
      "<dt>Public map</dt>",
      "<dt>Internal address</dt>",
      "Story updates (2)",
      `${OLD_UPDATE} · Internal`,
      `Untitled update · Public`,
      "Media (2)",
      `${OLD_ALT} · Cover`,
      "Untitled image",
      "Linked records (6)",
      "<li>Animal</li>",
      "<li>Adoption application</li>",
      "<li>Successful adoption</li>",
      "<li>Supporter</li>",
      "<li>Volunteer activity</li>",
      "<li>Related record</li>",
    ]);
    const bare = renderAdminInEnglish(
      <RevisionChildren
        snapshot={{ profile: { show_on_map: false, rescue_region: null, internal_address: null } }}
      />,
    );
    expectNoChineseText(bare);
    expectAll(bare, ["<dd>Not entered</dd>", "<dd>Not shown</dd>"]);
    const none = renderAdminInEnglish(<RevisionChildren snapshot={{}} />);
    expect(none).toContain("No story wall settings");
  });

  test("says how to load the history again when it fails", () => {
    reset();
    state.revisionFails = true;
    const markup = renderAdminInEnglish(panel);
    reset();
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, ["Could not load the version history", "Try again.", ">Retry<"]);
  });

  test("keeps the Chinese history as it was", () => {
    reset();
    const markup = renderAdminInChinese(panel);
    expectAll(markup, [
      'aria-label="版本紀錄與比較"',
      "目前已儲存版本 5；還原會建立新草稿，公開版本保持不變。",
      "版本 5 · save_content · 曾發布",
      "版本 3 · something_new",
      ">最新版本</button>",
      ">較早版本</button>",
      "<th>欄位</th>",
      "<th>網址</th>",
      "所選版本的故事設定、更新與媒體資料",
      ">還原為新草稿</button>",
    ]);
    const children = renderAdminInChinese(<RevisionChildren snapshot={snapshot} />);
    expectAll(children, [
      "<dt>救援地區</dt>",
      "故事更新（2）",
      `${OLD_UPDATE} · 內部`,
      "未命名更新 · 公開",
      "媒體（2）",
      "未命名圖片",
      "關聯紀錄（6）",
      "<li>相關紀錄</li>",
    ]);
    expect(
      renderAdminInChinese(<RevisionChildren snapshot={{ profile: { show_on_map: false } }} />),
    ).toContain("<dd>未填寫</dd><dt>公開地圖</dt><dd>不顯示</dd>");
  });
});

describe("timeline, record picker and the two draft panels in English", () => {
  test("shows the story update timeline in English", () => {
    const markup = renderAdminInEnglish(
      <ContentTimeline updates={updates} onGenerateDrafts={noop} />,
    );
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Medical",
      "Foster",
      "General",
      "Public",
      "Internal",
      "5 Jul 2026 (Sun)",
      ">Create notification drafts</button>",
      "Read the update text",
      "No body text",
    ]);
    const empty = renderAdminInEnglish(<ContentTimeline updates={[]} />);
    expectNoChineseText(empty);
    expect(empty).toContain("No story updates yet.");
    const chinese = renderAdminInChinese(
      <ContentTimeline updates={updates} onGenerateDrafts={noop} generatingUpdateId="u1" />,
    );
    expectAll(chinese, [
      "醫療",
      "寄養",
      "一般",
      "公開",
      "內部",
      "2026年7月5日",
      ">產生中</button>",
    ]);
    expect(renderAdminInChinese(<ContentTimeline updates={[]} />)).toContain("尚未有故事更新。");
  });

  test("shows the record picker in English and writes a stand-in label in English", () => {
    reset();
    const markup = renderAdminInEnglish(
      <LinkedRecordPicker linkedType="animal" value="a1" label={ANIMAL_NAME} onChange={noop} />,
    );
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      'placeholder="Search by name or reference number"',
      'aria-label="Search linked records"',
      `Selected: ${ANIMAL_NAME}`,
      `>${ANIMAL_NAME}</span>`,
      // The animal's type is named, not printed as the stored code.
      ">Cat</span>",
      ">(unnamed)</span>",
      ">(no name entered)</span>",
      ">(no case number)</span>",
      ">(unnamed activity)</span>",
    ]);
    expect(markup).not.toContain(">cat</span>");
    // A volunteer activity's date comes as a timestamp and is shown as a date.
    const detail = editorPanelsCopy.en.picker.detail;
    expect(detail("volunteer_activity", "2026-09-14T08:00:00.000Z")).toBe("14 Sep 2026 (Mon)");
    expect(detail("animal", "dog")).toBe("Dog");
    expect(detail("animal", "something")).toBe("something");
    expect(detail("supporter", "****4567")).toBe("****4567");
    expect(
      editorPanelsCopy.zh.picker.detail("volunteer_activity", "2026-09-14T08:00:00.000Z"),
    ).toBe("2026-09-14T08:00:00.000Z");
    const picked = renderAdminInEnglish(
      <LinkedRecordPicker linkedType="animal" value="a2" label="（未命名）" onChange={noop} />,
    );
    expectNoChineseText(picked, { allow: DATA });
    expect(picked).toContain("Selected: (unnamed)");
    const unlabelled = renderAdminInEnglish(
      <LinkedRecordPicker linkedType="animal" value="a2" label="  " onChange={noop} />,
    );
    expect(unlabelled).toContain("Selected: a2");
    state.linkSearch = "error";
    const failed = renderAdminInEnglish(
      <LinkedRecordPicker linkedType="animal" value="" onChange={noop} />,
    );
    reset();
    expectNoChineseText(failed);
    expect(failed).toContain("Could not load linked records. Try again.");
  });

  test("keeps the Chinese record picker as it was", () => {
    reset();
    const markup = renderAdminInChinese(
      <LinkedRecordPicker linkedType="animal" value="a2" label="（未命名）" onChange={noop} />,
    );
    expectAll(markup, [
      'placeholder="搜尋名稱或編號"',
      'aria-label="搜尋關聯紀錄"',
      "已選擇：（未命名）",
      ">（未命名）</span>",
      ">（未填姓名）</span>",
      ">（無編號）</span>",
      ">（未命名活動）</span>",
    ]);
  });

  test("shows the notification drafts in English", () => {
    const markup = renderAdminInEnglish(
      <NotificationDraftPanel drafts={detail.notificationDrafts} onUpdateStatus={noop} />,
    );
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Notification drafts",
      "Drafts of notifications for adopters or supporters, sent by hand.",
      ">Draft</span>",
      ">Copied</span>",
      ">Sent manually</span>",
      ">Dismissed</span>",
      ">Email</span>",
      ">WhatsApp</span>",
      ">Copy</button>",
      ">Mark as sent</button>",
      ">Dismiss</button>",
    ]);
    const readOnly = renderAdminInEnglish(
      <NotificationDraftPanel drafts={detail.notificationDrafts} />,
    );
    expect(readOnly).not.toContain(">Copy</button>");
    const empty = renderAdminInEnglish(<NotificationDraftPanel drafts={[]} />);
    expectNoChineseText(empty);
    expect(empty).toContain("No notification drafts yet.");
    const chinese = renderAdminInChinese(
      <NotificationDraftPanel drafts={detail.notificationDrafts} onUpdateStatus={noop} />,
    );
    expectAll(chinese, [
      "給領養人或支持者的手動通知草稿。",
      "已人手發送",
      "已略過",
      "已複製",
      ">email</span>",
      ">whatsapp</span>",
      ">複製</button>",
      ">已手動送出</button>",
      ">略過</button>",
    ]);
  });

  test("shows the social media copy in English", () => {
    const editing = renderAdminInEnglish(
      <SocialCopyPanel
        copies={detail.socialCopies}
        onGenerate={noop}
        onUpdateStatus={noop}
        onSave={noop}
        savingCopyId="s1"
      />,
    );
    expectNoChineseText(editing, { allow: DATA });
    expectAll(editing, [
      "Social media copy",
      "Promotional text you can copy, organised by platform.",
      ">Generate copy</button>",
      ">Facebook</h3>",
      ">Copied</span>",
      ">Draft</span>",
      ">Archived</span>",
      "Post text",
      "Hashtags (separated by spaces)",
      "Saving",
      ">Copy</button>",
      ">Archive</button>",
    ]);
    const readOnly = renderAdminInEnglish(<SocialCopyPanel copies={detail.socialCopies} />);
    expectNoChineseText(readOnly, { allow: DATA });
    expect(readOnly).toContain(`#${TAG_ONE} #adopt`);
    const generating = renderAdminInEnglish(
      <SocialCopyPanel copies={[]} onGenerate={noop} generating />,
    );
    expectNoChineseText(generating);
    expectAll(generating, ["Generating", "No social media copy yet."]);
    const chinese = renderAdminInChinese(
      <SocialCopyPanel
        copies={detail.socialCopies}
        onGenerate={noop}
        onUpdateStatus={noop}
        onSave={noop}
      />,
    );
    expectAll(chinese, [
      "社交平台文案",
      "按平台整理可複製的宣傳文字。",
      ">產生文案</button>",
      ">copied</span>",
      "標籤（以空格分隔）",
      ">儲存</button>",
      ">複製</button>",
      ">封存</button>",
    ]);
  });

  test("writes a failed copy to the clipboard in English, with the browser's reason", () => {
    const english = contentCommonCopy.en;
    expect(english.clipboardFailed()).toBe("Could not copy. Select the text and copy it by hand.");
    expect(english.clipboardFailed("Clipboard is not available in this browser.")).toBe(
      "Could not copy: Clipboard is not available in this browser. Select the text and copy it by hand.",
    );
    expect(english.clipboardFailed("clipboard blocked")).toBe(
      "Could not copy: clipboard blocked. Select the text and copy it by hand.",
    );
    expect(contentCommonCopy.zh.clipboardFailed()).toBe("複製失敗，請手動選取文字。");
    expect(contentCommonCopy.zh.clipboardFailed("clipboard blocked")).toBe(
      "複製失敗：clipboard blocked",
    );
  });
});

describe("the copy modules", () => {
  test("have no Chinese in English and the same keys in both languages", () => {
    for (const module of [
      contentCommonCopy,
      managementCopy,
      editorCopy,
      editorPanelsCopy,
      reviewCopy,
      cmsStateCopy,
    ]) {
      expectNoChineseInCopy(module.en);
      expect(collectCopyStrings(module.en).length).toBeGreaterThan(0);
    }
  });

  test("fixture names are not labels, so allowing them cannot hide an untranslated label", () => {
    const labels = [
      contentCommonCopy,
      managementCopy,
      editorCopy,
      editorPanelsCopy,
      reviewCopy,
      cmsStateCopy,
      adminCommonCopy,
    ]
      .flatMap((module) => collectCopyStrings(module.zh))
      .filter((text) => text.length >= 2 && /\p{Script=Han}/u.test(text));
    const clashes = DATA.flatMap((data) =>
      labels.filter((label) => data.includes(label)).map((label) => `${data} contains ${label}`),
    );
    expect(clashes).toEqual([]);
  });

  test("name the four workflow states in both languages", () => {
    expect(cmsStateCopy.zh).toEqual({
      draft: "草稿",
      in_review: "審閱中",
      published: "已發佈",
      archived: "已封存",
    });
    expect(cmsStateCopy.en).toEqual({
      draft: "Draft",
      in_review: "In review",
      published: "Published",
      archived: "Archived",
    });
  });

  test("write the English type labels in sentence case", () => {
    expect(contentCommonCopy.en.types).toEqual({
      rescue_story: "Rescue story",
      event: "Event",
      charity_market: "Charity market",
      report: "Report",
    });
    expect(contentCommonCopy.zh.types.charity_market).toBe("慈善市集");
  });
});
