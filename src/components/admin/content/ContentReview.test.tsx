import { expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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

const { ContentReviewQueue } = await import("./ContentReview");

test("animal bulk controls appear only to admins while staff keep the individual review link", () => {
  role = "staff";
  const staff = renderToStaticMarkup(<ContentReviewQueue initialKind="animal" />);
  expect(staff).not.toContain("批量送交動物草稿來源審核");
  expect(staff).toContain("開啟及核實來源");
  role = "admin";
  const admin = renderToStaticMarkup(<ContentReviewQueue initialKind="animal" />);
  expect(admin).toContain("批量送交動物草稿來源審核");
  expect(admin).toContain("選取全部動物資料（最多 1000 筆）");
  role = "staff";
});
