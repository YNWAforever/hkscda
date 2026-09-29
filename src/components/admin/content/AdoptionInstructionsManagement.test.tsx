import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { initialAdoptionInstructionContent as content } from "../../../lib/adoptionInstructions/content";
import type { AdoptionInstructionAdminPage } from "../../../lib/adoptionInstructions/repository.server";
import {
  AdoptionInstructionsManagementView,
  buildAdoptionInstructionMutation,
} from "./AdoptionInstructionsManagement";
const published = {
  id: "11111111-1111-4111-8111-111111111111",
  pageKey: "adoption-instructions",
  revisionNumber: 1,
  state: "published" as const,
  content,
  version: 1,
  sourceRevisionId: null,
  createdBy: null,
  updatedBy: null,
  publishedBy: null,
  publishedAt: "2026-09-26T00:00:00Z",
  createdAt: "2026-09-26T00:00:00Z",
  updatedAt: "2026-09-26T00:00:00Z",
};
export const page: AdoptionInstructionAdminPage = {
  page: {
    pageKey: "adoption-instructions",
    publishedRevisionId: published.id,
    draftRevisionId: "22222222-2222-4222-8222-222222222222",
    version: 2,
    createdAt: published.createdAt,
    updatedAt: published.updatedAt,
  },
  published,
  draft: {
    ...published,
    id: "22222222-2222-4222-8222-222222222222",
    state: "draft",
    version: 4,
    revisionNumber: 2,
  },
  history: [published],
};
describe("adoption page editor", () => {
  test("staff can save and preview but cannot publish or restore", () => {
    const html = renderToStaticMarkup(
      <AdoptionInstructionsManagementView data={page} role="staff" />,
    );
    expect(html).toContain("儲存草稿");
    expect(html).toContain("/admin/content/adoption-preview");
    expect(html).toContain("草稿版本 4");
    expect(html).not.toContain("發布頁面");
    expect(html).not.toContain("還原此版本");
    expect(html).not.toContain("封存草稿（不發布）");
    expect(html).toContain('name="hero.title"');
    expect(html).toContain('name="care.cat.title"');
  });
  test("admin can publish valid saved drafts and cannot restore over an active draft", () => {
    const html = renderToStaticMarkup(
      <AdoptionInstructionsManagementView data={page} role="admin" />,
    );
    expect(html).toMatch(/<button[^>]*>發布頁面<\/button>/);
    expect(html).toContain("封存草稿（不發布）");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>還原此版本<\/button>/);
  });
  test("invalid fields announce their path and block publish", () => {
    const invalid = {
      ...page,
      draft: { ...page.draft!, content: { ...content, hero: { ...content.hero, title: "" } } },
    };
    const html = renderToStaticMarkup(
      <AdoptionInstructionsManagementView data={invalid} role="admin" />,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("hero.title");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>發布頁面<\/button>/);
  });
  test("shows paged summaries and loads full content only when selected", () => {
    const html = renderToStaticMarkup(
      <AdoptionInstructionsManagementView
        data={{ ...page, historyNextCursor: "1:" + published.id }}
        role="staff"
        onLoadHistory={async () => ({ items: [], nextCursor: null })}
        onLoadRevision={async () => published}
      />,
    );
    expect(html).toContain("查看更多版本");
    expect(html).toContain("查看內容");
    expect(html).not.toContain("修訂 1 內容");
  });

  test("builds exact mutation bodies without leaking actor fields", () => {
    expect(
      buildAdoptionInstructionMutation({ action: "save", expectedVersion: 4, content }),
    ).toEqual({
      path: "/api/admin/adoption-instructions/draft",
      method: "PUT",
      body: { expectedVersion: 4, content },
    });
    expect(
      buildAdoptionInstructionMutation({
        action: "publish",
        expectedVersion: 4,
        idempotencyKey: "retry-key-123456789",
      }).body,
    ).toEqual({ expectedVersion: 4, idempotencyKey: "retry-key-123456789" });
    expect(
      buildAdoptionInstructionMutation({ action: "restore", revisionId: published.id }).body,
    ).toEqual({ revisionId: published.id });
  });
});
