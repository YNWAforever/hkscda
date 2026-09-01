import { afterAll, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

import type { ContentDetail } from "../../../lib/content/types";

const realReactRouter = await import("@tanstack/react-router");

type MockLinkProps = {
  children: ReactNode;
  className?: string;
  to: string;
};

mock.module("@tanstack/react-router", () => ({
  ...realReactRouter,
  Link: ({ children, className, to }: MockLinkProps) => (
    <a data-router-link="true" href={to} className={className}>
      {children}
    </a>
  ),
}));

// Shared order-of-operations log plus injectable failure for the
// createContentMediaWithUpload tests below. Registered here, at module load
// time, so these mocks are in effect before any test's dynamic
// `await import("./ContentEditor")` first resolves that module (matching the
// react-router mock above).
//
// `mock.module` mocks are process-global in Bun's test runner and outlive this
// file: they aren't undone by `mock.restore()`, so an unmocked-back specifier
// here would leak into every other test file (in the same `bun test` run)
// that imports these modules after this one. Capture the real modules first
// so `afterAll` can put them back (see
// src/components/site/sponsorship/pledgeProofUpload.test.ts for the same
// pattern).
// Spread into a plain object: `mock.module` mutates the shared
// module-registry exports object in place, so a bare reference captured here
// would be mutated out from under us the moment the mock below is installed.
const realAdminHttpModule = { ...(await import("../../../lib/admin/http")) };
const realSupabaseModule = { ...(await import("../../../lib/supabase")) };

const uploadCalls: string[] = [];
const uploadFromBucketCalls: string[] = [];
let uploadToSignedUrlError: Error | null = null;

const fetchAdminJsonMock = mock(async (path: string, init?: { method?: string; body?: string }) => {
  if (path.endsWith("/media-upload-target")) {
    uploadCalls.push("target");
    return { token: "signed-token", path: "content-1/generated-path.jpg" };
  }
  if (path.endsWith("/media")) {
    uploadCalls.push("metadata");
    return { id: "media-1" };
  }
  throw new Error(`unexpected fetchAdminJson call: ${init?.method ?? "GET"} ${path}`);
});

const uploadToSignedUrlMock = mock(
  async (_path: string, _token: string, _file: File, _options?: { contentType: string }) => {
    uploadCalls.push("upload");
    return { error: uploadToSignedUrlError };
  },
);

mock.module("../../../lib/admin/http", () => ({
  fetchAdminJson: fetchAdminJsonMock,
  getAdminAccessToken: async () => "test-token",
}));

mock.module("../../../lib/supabase", () => ({
  getSupabaseClient: () => ({
    storage: {
      from: (bucket: string) => {
        uploadFromBucketCalls.push(bucket);
        return { uploadToSignedUrl: uploadToSignedUrlMock };
      },
    },
  }),
  supabase: {},
}));

afterAll(() => {
  mock.module("../../../lib/admin/http", () => realAdminHttpModule);
  mock.module("../../../lib/supabase", () => realSupabaseModule);
});

const content: ContentDetail = {
  id: "content-1",
  slug: "siu-bak-recovery",
  type: "rescue_story",
  title: "小白康復中",
  subtitle: null,
  summary: "小白正在康復。",
  body: "救援故事正文",
  coverMediaId: null,
  coverImageUrl: null,
  status: "draft",
  publishedAt: null,
  ctaLabel: null,
  ctaUrl: null,
  seoTitle: null,
  seoDescription: null,
  ogTitle: null,
  ogDescription: null,
  storyProfile: null,
  latestPublicUpdate: null,
  links: [],
  media: [],
  updates: [],
  socialCopies: [],
  notificationDrafts: [],
  createdAt: "2026-07-05T09:00:00.000Z",
  updatedAt: "2026-07-05T09:00:00.000Z",
};

describe("ContentEditor", () => {
  test("renders authoring controls for story profile, updates, media, and links", async () => {
    const { ContentAuthoringPanels } = await import("./ContentEditor");
    const markup = renderToStaticMarkup(
      <ContentAuthoringPanels
        content={content}
        pending={false}
        onCreateLink={async () => undefined}
        onSaveStoryProfile={async () => undefined}
        onCreateStoryUpdate={async () => undefined}
        onCreateMedia={async () => undefined}
      />,
    );

    expect(markup).toContain("儲存故事設定");
    expect(markup).toContain("新增故事更新");
    expect(markup).toContain("新增媒體");
    expect(markup).toContain("新增關聯紀錄");
    // The manual bucket/path text-entry fields must be gone, replaced by a
    // real file picker.
    expect(markup).toContain('type="file"');
    expect(markup).toContain('accept="image/*"');
    expect(markup).not.toContain("Storage bucket");
    expect(markup).not.toContain("Storage path");
  });

  test("uses a router link for returning to the content list", async () => {
    const { ContentEditor } = await import("./ContentEditor");
    const queryClient = new QueryClient();

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <ContentEditor contentId={content.id} initialContent={content} />
      </QueryClientProvider>,
    );

    expect(markup).toContain('data-router-link="true"');
    expect(markup).toContain('href="/admin/content"');
    expect(markup).toContain("返回宣傳內容");
  });
});

describe("createContentMediaWithUpload", () => {
  function mediaForm(file: File) {
    return {
      file,
      storyUpdateId: "",
      altText: "小白在花園",
      caption: "",
      sortOrder: "0",
      isCover: false,
    };
  }

  test("requests a signed upload target, uploads to it, then posts media metadata, in that order", async () => {
    uploadCalls.length = 0;
    uploadFromBucketCalls.length = 0;
    uploadToSignedUrlError = null;
    fetchAdminJsonMock.mockClear();
    uploadToSignedUrlMock.mockClear();

    const { createContentMediaWithUpload } = await import("./ContentEditor");
    const file = new File([new Uint8Array(8)], "photo.jpg", { type: "image/jpeg" });

    const result = await createContentMediaWithUpload("content-1", mediaForm(file));

    expect(result).toEqual({ id: "media-1" });
    expect(uploadCalls).toEqual(["target", "upload", "metadata"]);
    expect(uploadFromBucketCalls).toEqual(["content-media"]);

    const targetCall = fetchAdminJsonMock.mock.calls[0];
    expect(targetCall[0]).toBe("/api/admin/content/content-1/media-upload-target");
    expect(targetCall[1]).toMatchObject({ method: "POST" });

    expect(uploadToSignedUrlMock.mock.calls[0]).toEqual([
      "content-1/generated-path.jpg",
      "signed-token",
      file,
      { contentType: "image/jpeg" },
    ]);

    const metadataCall = fetchAdminJsonMock.mock.calls[1];
    expect(metadataCall[0]).toBe("/api/admin/content/content-1/media");
    expect(metadataCall[1]).toMatchObject({ method: "POST" });
    const finalBody = JSON.parse(metadataCall[1]?.body ?? "{}");
    expect(finalBody.storagePath).toBe("content-1/generated-path.jpg");
    expect(finalBody.altText).toBe("小白在花園");
  });

  test("never posts media metadata when the signed upload fails", async () => {
    uploadCalls.length = 0;
    uploadToSignedUrlError = new Error("network down");
    fetchAdminJsonMock.mockClear();
    uploadToSignedUrlMock.mockClear();

    const { createContentMediaWithUpload } = await import("./ContentEditor");
    const file = new File([new Uint8Array(8)], "photo.jpg", { type: "image/jpeg" });

    await expect(createContentMediaWithUpload("content-1", mediaForm(file))).rejects.toThrow(
      "network down",
    );

    expect(uploadCalls).toEqual(["target", "upload"]);
    expect(fetchAdminJsonMock).toHaveBeenCalledTimes(1);
  });
});
