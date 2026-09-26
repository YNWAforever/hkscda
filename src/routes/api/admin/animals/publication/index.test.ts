import { afterAll, expect, mock, test } from "bun:test";

const realSupabaseServerModule = {
  ...(await import("../../../../../lib/donations/supabase.server")),
};
let activeClient: unknown;
mock.module("../../../../../lib/donations/supabase.server", () => ({
  ...realSupabaseServerModule,
  createSupabaseServiceClient: () => activeClient,
  requireAdmin: async () => ({ authUserId: "staff-user" }),
}));

const { Route } = await import("./index");

afterAll(() => {
  mock.module("../../../../../lib/donations/supabase.server", () => realSupabaseServerModule);
});

function queryRow(data: unknown) {
  const query = {
    eq: () => query,
    gt: () => query,
    maybeSingle: async () => ({ data, error: null }),
  };
  return { select: () => query };
}

test("does not expose a preview owned by another staff member before the publish RPC rejects it", async () => {
  const download = mock(async () => ({ data: new Blob(["private image"]), error: null }));
  const upload = mock(async () => ({ error: null }));
  activeClient = {
    from: (table: string) => {
      expect(table).toBe("animal_publication_preview");
      const filters = new Map<string, unknown>();
      const query = {
        eq(column: string, value: unknown) {
          filters.set(column, value);
          return query;
        },
        gt() {
          return query;
        },
        async maybeSingle() {
          return {
            data:
              filters.get("created_by") === "staff-user"
                ? null
                : { body: { draft_image_path: "animal-1/private-draft.jpg" } },
            error: null,
          };
        },
      };
      return { select: () => query };
    },
    storage: {
      from: (bucket: string) =>
        bucket === "animal-draft-images"
          ? { download }
          : {
              upload,
              getPublicUrl: () => ({ data: { publicUrl: "https://example.test/leaked.jpg" } }),
            },
    },
    rpc: async () => ({ data: { kind: "conflict" }, error: null }),
  };

  const handlers = Route.options.server?.handlers;
  const handler = handlers && typeof handlers !== "function" ? handlers.POST : undefined;
  if (!handler) throw new Error("Animal publication POST handler missing");
  const response = await handler({
    request: new Request("http://localhost/api/admin/animals/publication/", {
      method: "POST",
      body: JSON.stringify({ kind: "publish", preview_id: "preview-1", animal_id: "animal-1" }),
    }),
  } as never);

  if (!(response instanceof Response)) throw new Error("Expected HTTP response");
  expect(response.status).toBe(409);
  expect(download).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
});

test("does not promote images from a preview of an older draft revision", async () => {
  const download = mock(async () => ({ data: new Blob(["old image"]), error: null }));
  const upload = mock(async () => ({ error: null }));
  activeClient = {
    from: (table: string) => {
      if (table === "animal_publication_preview")
        return queryRow({ body: { draft_image_path: "animal-1/old.jpg" }, draft_revision: 1 });
      if (table === "animal_draft") return queryRow({ revision: 2 });
      throw new Error("Unexpected table: " + table);
    },
    storage: {
      from: (bucket: string) =>
        bucket === "animal-draft-images"
          ? { download }
          : {
              upload,
              getPublicUrl: () => ({ data: { publicUrl: "https://example.test/old.jpg" } }),
            },
    },
    rpc: async () => ({ data: { kind: "conflict" }, error: null }),
  };

  const handlers = Route.options.server?.handlers;
  const handler = handlers && typeof handlers !== "function" ? handlers.POST : undefined;
  if (!handler) throw new Error("Animal publication POST handler missing");
  const response = await handler({
    request: new Request("http://localhost/api/admin/animals/publication/", {
      method: "POST",
      body: JSON.stringify({ kind: "publish", preview_id: "preview-1", animal_id: "animal-1" }),
    }),
  } as never);

  if (!(response instanceof Response)) throw new Error("Expected HTTP response");
  expect(response.status).toBe(409);
  expect(download).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
});

test("does not promote an unreviewed animal image before editorial approval rejects publish", async () => {
  const download = mock(async () => ({ data: new Blob(["unreviewed image"]), error: null }));
  const upload = mock(async () => ({ error: null }));
  const rpc = mock(async () => ({ data: null, error: { code: "22023" } }));
  activeClient = {
    from: (table: string) => {
      if (table === "animal_publication_preview")
        return queryRow({
          body: { publication_state: "published", draft_image_path: "animal-1/unreviewed.jpg" },
          draft_revision: 1,
        });
      if (table === "animal_draft") return queryRow({ revision: 1 });
      if (table === "editorial_content_review") return queryRow(null);
      throw new Error("Unexpected table: " + table);
    },
    storage: {
      from: (bucket: string) =>
        bucket === "animal-draft-images"
          ? { download }
          : {
              upload,
              getPublicUrl: () => ({ data: { publicUrl: "https://example.test/unreviewed.jpg" } }),
            },
    },
    rpc,
  };

  const handlers = Route.options.server?.handlers;
  const handler = handlers && typeof handlers !== "function" ? handlers.POST : undefined;
  if (!handler) throw new Error("Animal publication POST handler missing");
  const response = await handler({
    request: new Request("http://localhost/api/admin/animals/publication/", {
      method: "POST",
      body: JSON.stringify({ kind: "publish", preview_id: "preview-1", animal_id: "animal-1" }),
    }),
  } as never);

  if (!(response instanceof Response)) throw new Error("Expected HTTP response");
  expect(response.status).toBe(422);
  expect(download).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

test("a failed publish keeps existing public animal images", async () => {
  const remove = mock(async (_paths: string[]) => ({ error: null }));
  const upload = mock(async (_path: string) => ({
    error: { message: "The resource already exists" },
  }));
  activeClient = {
    from: (table: string) => {
      if (table === "animal_publication_preview")
        return queryRow({
          body: { publication_state: "published", draft_image_path: "draft-cover.jpg" },
          draft_revision: 1,
        });
      if (table === "animal_draft") return queryRow({ revision: 1 });
      if (table === "editorial_content_review") return queryRow({ classification: "approved" });
      throw new Error("Unexpected table: " + table);
    },
    storage: {
      from: (bucket: string) =>
        bucket === "animal-draft-images"
          ? { download: async () => ({ data: new Blob(["image"]), error: null }) }
          : {
              upload,
              remove,
              getPublicUrl: () => ({ data: { publicUrl: "https://example.test/existing.jpg" } }),
            },
    },
    rpc: async () => ({ data: null, error: { code: "22023" } }),
  };

  const handlers = Route.options.server?.handlers;
  const handler = handlers && typeof handlers !== "function" ? handlers.POST : undefined;
  if (!handler) throw new Error("Animal publication POST handler missing");
  const response = await handler({
    request: new Request("http://localhost/api/admin/animals/publication/", {
      method: "POST",
      body: JSON.stringify({ kind: "publish", preview_id: "preview-1", animal_id: "animal-1" }),
    }),
  } as never);

  if (!(response instanceof Response)) throw new Error("Expected HTTP response");
  expect(response.status).toBe(422);
  expect(upload).toHaveBeenCalledTimes(1);
  expect(remove).not.toHaveBeenCalled();
});

test("publish ignores caller-supplied media that was not in the preview", async () => {
  const rpc = mock(async (_name: string, args: { p_command: Record<string, unknown> }) => ({
    data: { kind: "published" },
    error: null,
  }));
  activeClient = {
    from: (table: string) => {
      if (table === "animal_publication_preview")
        return queryRow({
          body: { publication_state: "published", image_url: "https://example.test/reviewed.jpg" },
          draft_revision: 1,
        });
      if (table === "animal_draft") return queryRow({ revision: 1 });
      if (table === "editorial_content_review") return queryRow({ classification: "approved" });
      throw new Error("Unexpected table: " + table);
    },
    storage: {
      from: () => {
        throw new Error("No upload was reviewed");
      },
    },
    rpc,
  };

  const handlers = Route.options.server?.handlers;
  const handler = handlers && typeof handlers !== "function" ? handlers.POST : undefined;
  if (!handler) throw new Error("Animal publication POST handler missing");
  const response = await handler({
    request: new Request("http://localhost/api/admin/animals/publication/", {
      method: "POST",
      body: JSON.stringify({
        kind: "publish",
        preview_id: "preview-1",
        animal_id: "animal-1",
        published_image_url: "https://evil.test/unreviewed.jpg",
        publication_gallery: [{ url: "https://evil.test/unreviewed.jpg" }],
        published_gallery: [{ url: "https://evil.test/unreviewed.jpg" }],
      }),
    }),
  } as never);

  if (!(response instanceof Response)) throw new Error("Expected HTTP response");
  expect(response.status).toBe(200);
  const command = rpc.mock.calls[0]?.[1].p_command;
  expect(command).not.toHaveProperty("published_image_url");
  expect(command).not.toHaveProperty("publication_gallery");
  expect(command).not.toHaveProperty("published_gallery");
});
test("publication rejects null and oversized JSON before calling the RPC", async () => {
  const rpc = mock(async () => ({ data: null, error: null }));
  activeClient = { rpc };
  const handlers = Route.options.server?.handlers;
  const handler = handlers && typeof handlers !== "function" ? handlers.POST : undefined;
  if (!handler) throw new Error("Animal publication POST handler missing");

  for (const [body, expectedStatus] of [
    ["null", 400],
    [JSON.stringify({ padding: "x".repeat(9 * 1024 * 1024) }), 413],
  ] as const) {
    const response = await handler({
      request: new Request("http://localhost/api/admin/animals/publication/", {
        method: "POST",
        body,
      }),
    } as never);
    if (!(response instanceof Response)) throw new Error("Expected HTTP response");
    expect(response.status).toBe(expectedStatus);
  }
  expect(rpc).not.toHaveBeenCalled();
});

test("promotes distinct gallery images even when a saved draft has duplicate item IDs", async () => {
  const upload = mock(async (_path: string) => ({ error: null }));
  const rpc = mock(async (_name: string, args: { p_command: Record<string, unknown> }) => ({
    data: { kind: "published" },
    error: null,
  }));
  activeClient = {
    from: (table: string) => {
      if (table === "animal_publication_preview")
        return queryRow({
          body: {
            publication_state: "published",
            gallery: [
              {
                id: "duplicate",
                draft_path: "animal-1/first.jpg",
                review_status: "approved",
                sort_order: 0,
              },
              {
                id: "duplicate",
                draft_path: "animal-1/second.jpg",
                review_status: "approved",
                sort_order: 1,
              },
            ],
          },
          draft_revision: 1,
        });
      if (table === "animal_draft") return queryRow({ revision: 1 });
      if (table === "editorial_content_review") return queryRow({ classification: "approved" });
      throw new Error("Unexpected table: " + table);
    },
    storage: {
      from: (bucket: string) =>
        bucket === "animal-draft-images"
          ? { download: async () => ({ data: new Blob(["image"]), error: null }) }
          : {
              upload,
              getPublicUrl: (path: string) => ({
                data: { publicUrl: "https://example.test/" + path },
              }),
            },
    },
    rpc,
  };
  const handlers = Route.options.server?.handlers;
  const handler = handlers && typeof handlers !== "function" ? handlers.POST : undefined;
  if (!handler) throw new Error("Animal publication POST handler missing");
  const response = await handler({
    request: new Request("http://localhost/api/admin/animals/publication/", {
      method: "POST",
      body: JSON.stringify({ kind: "publish", preview_id: "preview-1", animal_id: "animal-1" }),
    }),
  } as never);
  if (!(response instanceof Response)) throw new Error("Expected HTTP response");
  expect(response.status).toBe(200);
  const paths = upload.mock.calls.map(([path]) => path);
  expect(paths).toHaveLength(2);
  expect(paths).toEqual([
    "animal-1/versions/preview-1-gallery-0.jpg",
    "animal-1/versions/preview-1-gallery-1.jpg",
  ]);
});
