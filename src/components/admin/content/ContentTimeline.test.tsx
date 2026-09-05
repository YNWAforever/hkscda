import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ContentTimeline } from "./ContentTimeline";
import type { StoryUpdate } from "../../../lib/content/types";
test("unloaded history body is read-only and requires explicit expansion", () => {
  const update = {
    id: "update",
    contentItemId: "content",
    kind: "general",
    title: "Saved update",
    body: null,
    bodyLoaded: false,
    occurredAt: "2026-09-01T00:00:00Z",
    visibility: "public",
    shouldGenerateAdopterDrafts: false,
    media: [],
    createdAt: "2026-09-01",
    updatedAt: "2026-09-01",
  } as StoryUpdate;
  const html = renderToStaticMarkup(<ContentTimeline updates={[update]} />);
  expect(html).toContain("閱讀更新正文");
  expect(html).not.toContain("沒有正文");
  expect(html).not.toContain("<textarea");
  expect(html).not.toContain("<form");
});
