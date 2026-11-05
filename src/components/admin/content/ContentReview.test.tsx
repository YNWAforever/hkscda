import { expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderAdminInChinese, renderAdminInEnglish } from "../i18n/testing";

const realReactQuery = await import("@tanstack/react-query");
const realReactRouter = await import("@tanstack/react-router");
let role: "staff" | "admin" = "staff";
mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    if (queryKey[0] === "admin-me") {
      return { data: { admin: { role } }, isFetching: false };
    }
    return {
      data: {
        total: 1,
        items: [
          {
            entity_kind: "animal",
            entity_id: "11111111-1111-4111-8111-111111111111",
            revision_key: "1",
            title: "Synthetic animal",
            publication_state: "draft",
            classification: "needs_review",
            evidence: null,
          },
        ],
      },
      isFetching: false,
      error: null,
      refetch: () => {},
    };
  },
}));
mock.module("@tanstack/react-router", () => ({
  ...realReactRouter,
  Link: ({ children }: { children: ReactNode }) => <a href="/admin/animals">{children}</a>,
}));

const { ContentReviewQueue, ContentReviewPanel, auditPresetEvidence, auditPresetForEvidence } =
  await import("./ContentReview");
const { reviewCopy } = await import("./reviewCopy");

test("animal bulk controls appear only to admins while staff keep the individual review link", () => {
  role = "staff";
  const staff = renderAdminInChinese(<ContentReviewQueue initialKind="animal" />);
  expect(staff).not.toContain("批量送交動物草稿來源審核");
  expect(staff).toContain("開啟及核實來源");
  role = "admin";
  const admin = renderAdminInChinese(<ContentReviewQueue initialKind="animal" />);
  expect(admin).toContain("批量送交動物草稿來源審核");
  expect(admin).toContain("選取全部符合篩選的動物資料（最多 1000 筆）");
  role = "staff";
});

test("CMS bulk controls appear only to admins and do not remove individual review", () => {
  role = "staff";
  const staff = renderAdminInChinese(<ContentReviewQueue initialKind="content" />);
  expect(staff).not.toContain("批量送交 CMS 草稿來源審核");
  expect(staff).toContain("開啟及核實來源");
  role = "admin";
  const admin = renderAdminInChinese(<ContentReviewQueue initialKind="content" />);
  expect(admin).toContain("批量送交 CMS 草稿來源審核");
  expect(admin).toContain("選取全部符合篩選的宣傳內容（最多 1000 筆）");
  role = "staff";
});

test("CMS quality queue can open directly on the expired filter", () => {
  role = "staff";
  const html = renderAdminInChinese(
    <ContentReviewQueue initialKind="content" initialQuality="expired" />,
  );
  expect(html).toContain("品質隊列");
  expect(html).toMatch(/<option value="expired" selected/);
});

test("filtered CMS quality queue cannot apply the draft bulk action", () => {
  role = "admin";
  const html = renderAdminInChinese(
    <ContentReviewQueue initialKind="content" initialQuality="demo" />,
  );
  expect(html).toContain("品質隊列供逐項核實");
  expect(html).not.toContain("批量送交 CMS 草稿來源審核");
  expect(html).not.toContain("選取本頁");
  role = "staff";
});

test("demotes the audit queue to a closed same-page disclosure", () => {
  const markup = renderAdminInChinese(<ContentReviewQueue initialKind="content" />);
  expect(markup).toContain("待審核");
  expect(markup).not.toContain("內容來源審核佇列");
  expect(markup).toContain("<details");
  expect(markup).not.toMatch(/<details[^>]*\bopen\b/);
  expect(renderAdminInEnglish(<ContentReviewQueue initialKind="content" />)).toContain(
    "Pending review",
  );
});

test("audit chips record usable evidence without a blank essay", () => {
  const presets = reviewCopy.zh.panel.presets;
  for (const key of ["staffOnSite", "medicalReport", "volunteerFoster"] as const) {
    expect(auditPresetEvidence(key, presets, "")).toBe(presets[key]);
  }
  expect(auditPresetEvidence("other", presets, "  義工轉介  ")).toBe("義工轉介");
  expect(auditPresetEvidence("other", presets, " ")).toBe("");
  expect(auditPresetForEvidence("醫療報告", presets)).toBe("medicalReport");

  const markup = renderAdminInChinese(<ContentReviewPanel kind="content" id="c" revision="r" />);
  for (const label of Object.values(presets)) expect(markup).toContain(label);
  expect(markup).toContain('aria-pressed="false"');
  expect(markup).not.toContain("請簡述來源");
});

test("a verified review is folded to its summary until expanded", () => {
  const markup = renderAdminInChinese(
    <ContentReviewPanel
      kind="content"
      id="c"
      revision="r"
      savedClassification="approved"
      savedEvidence="職員現場紀錄"
    />,
  );
  expect(markup).toContain("已核實可發布 · 職員現場紀錄");
  expect(markup).toContain("展開來源審核");
  expect(markup).not.toMatch(/<details[^>]*\bopen\b/);

  const english = renderAdminInEnglish(
    <ContentReviewPanel
      kind="content"
      id="c"
      revision="r"
      savedClassification="approved"
      savedEvidence="Medical report"
    />,
  );
  expect(english).toContain("Verified — ready to publish · Medical report");
  expect(english).toContain("Expand source review");
});
