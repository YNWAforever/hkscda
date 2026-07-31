import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  AdoptionGuidePreview,
  AdoptionGuideRelease,
} from "../../../lib/adoptionGuideReleases/types";
import { AdoptionGuideReleaseManagementView } from "./AdoptionGuideReleaseManagement";

const incompleteCatDraft: AdoptionGuideRelease = {
  id: "0c2a4b5d-4464-49f3-8fad-d6e1021f5214",
  topic: "post_adoption",
  species: "cat",
  zhHkAssetId: "94dd21e9-ac7d-4e77-a6e8-d85e5e5d21a0",
  enAssetId: null,
  knowledgePostId: null,
  knowledgeTitle: "貓咪領養後照顧",
  knowledgeTopic: "領養後",
  knowledgeShortIntro: "協助新主人照顧貓咪。",
  knowledgeSourceName: null,
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
};

const incompletePreview: AdoptionGuidePreview = {
  release: incompleteCatDraft,
  readiness: {
    ready: false,
    issues: [
      {
        field: "enAssetId",
        code: "english_asset_required",
        message: "English PDF is required before submission.",
      },
    ],
  },
  adoptionPanel: { heading: "領養後指南", zhHkUrl: "https://preview.test/cat-zh.pdf", enUrl: null },
  knowledgeCard: {
    title: "貓咪領養後照顧",
    topic: "領養後",
    shortIntro: "協助新主人照顧貓咪。",
    sourceName: null,
    zhHkUrl: "https://preview.test/cat-zh.pdf",
    enUrl: null,
  },
};

const readyReview: AdoptionGuideRelease = {
  ...incompleteCatDraft,
  enAssetId: "b71357d2-0656-4b85-a48a-cc53314e5cda",
  state: "in_review",
  submittedBy: "df576625-487e-4c75-8d2f-0d45053b9d99",
  submittedAt: "2026-07-31T01:00:00.000Z",
};

function view({
  role = "staff",
  release = readyReview,
}: {
  role?: "staff" | "admin";
  release?: AdoptionGuideRelease;
} = {}) {
  return (
    <AdoptionGuideReleaseManagementView
      actorRole={role}
      releases={[release]}
      selected={release}
      preview={{ ...incompletePreview, release, readiness: { ready: true, issues: [] } }}
    />
  );
}

describe("AdoptionGuideReleaseManagementView", () => {
  test("renders five steps and blocks incomplete submission", () => {
    const html = renderToStaticMarkup(
      <AdoptionGuideReleaseManagementView
        actorRole="staff"
        releases={[incompleteCatDraft]}
        selected={incompleteCatDraft}
        preview={incompletePreview}
      />,
    );

    expect(html).toContain("主題及物種");
    expect(html).toContain("中文 PDF");
    expect(html).toContain("English PDF");
    expect(html).toContain("知識庫內容");
    expect(html).toContain("預覽及發佈");
    expect(html).toContain("English PDF is required before submission.");
    expect(html).toContain("disabled");
  });

  test("shows publish only to admins reviewing a ready release", () => {
    const staffHtml = renderToStaticMarkup(view({ role: "staff", release: readyReview }));
    const adminHtml = renderToStaticMarkup(view({ role: "admin", release: readyReview }));

    expect(staffHtml).not.toContain("正式發佈");
    expect(adminHtml).toContain("正式發佈");
  });

  test("renders loading, API error, empty-list, filters, and history states", () => {
    const loadingHtml = renderToStaticMarkup(
      <AdoptionGuideReleaseManagementView
        actorRole="staff"
        releases={[]}
        selected={null}
        preview={null}
        loading
        error="Unable to load releases"
      />,
    );
    const emptyHtml = renderToStaticMarkup(
      <AdoptionGuideReleaseManagementView
        actorRole="staff"
        releases={[]}
        selected={null}
        preview={null}
      />,
    );
    const historyHtml = renderToStaticMarkup(view({ role: "admin", release: readyReview }));

    expect(loadingHtml).toContain("載入中");
    expect(loadingHtml).toContain("Unable to load releases");
    expect(loadingHtml).toContain("搜尋");
    expect(loadingHtml).toContain("物種");
    expect(loadingHtml).toContain("狀態");
    expect(emptyHtml).toContain("尚未建立領養後指南");
    expect(historyHtml).toContain("提交：");
  });

  test("renders upload guidance, authenticated preview links, and review transitions", () => {
    const reviewHtml = renderToStaticMarkup(view({ role: "admin", release: readyReview }));
    const draftHtml = renderToStaticMarkup(
      <AdoptionGuideReleaseManagementView
        actorRole="staff"
        releases={[incompleteCatDraft]}
        selected={incompleteCatDraft}
        preview={incompletePreview}
      />,
    );

    expect(draftHtml).toContain('accept="application/pdf"');
    expect(draftHtml).toContain("只可上傳 PDF 檔案");
    expect(draftHtml).toContain("中文版");
    expect(draftHtml).toContain("https://preview.test/cat-zh.pdf");
    expect(reviewHtml).toContain("撤回提交");
    expect(reviewHtml).toContain("退回草稿");
  });

  test("keeps local form values visible when a conflict is reported", () => {
    const html = renderToStaticMarkup(
      <AdoptionGuideReleaseManagementView
        actorRole="staff"
        releases={[incompleteCatDraft]}
        selected={incompleteCatDraft}
        preview={incompletePreview}
        error="This release changed elsewhere. Reload before saving again."
      />,
    );

    expect(html).toContain("This release changed elsewhere. Reload before saving again.");
    expect(html).toContain('value="貓咪領養後照顧"');
  });
  test("renders every non-draft state read-only", () => {
    for (const state of ["in_review", "published", "archived"] as const) {
      const html = renderToStaticMarkup(
        <AdoptionGuideReleaseManagementView
          actorRole="admin"
          releases={[{ ...readyReview, state }]}
          selected={{ ...readyReview, state }}
          preview={{
            ...incompletePreview,
            release: { ...readyReview, state },
            readiness: { ready: true, issues: [] },
          }}
        />,
      );

      expect(html).toContain("disabled");
      expect(html).not.toContain("儲存草稿");
    }
  });

  test("uses exact bilingual preview action labels", () => {
    const html = renderToStaticMarkup(
      <AdoptionGuideReleaseManagementView
        actorRole="admin"
        releases={[readyReview]}
        selected={readyReview}
        preview={{
          ...incompletePreview,
          release: readyReview,
          readiness: { ready: true, issues: [] },
          adoptionPanel: {
            heading: "Cat guide",
            zhHkUrl: "https://preview.test/zh",
            enUrl: "https://preview.test/en",
          },
        }}
      />,
    );

    expect(html).toContain(">中文版</a>");
    expect(html).toContain(">English</a>");
    expect(html).not.toContain("預覽中文版 PDF");
    expect(html).not.toContain("Preview English PDF");
  });
});
