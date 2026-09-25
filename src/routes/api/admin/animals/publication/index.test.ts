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

test("a failed publish keeps existing public animal images", async () => {
  const remove = mock(async (_paths: string[]) => ({ error: null }));
  const upload = mock(async (_path: string) => ({
    error: { message: "The resource already exists" },
  }));
  activeClient = {
    from: (table: string) => {
      expect(table).toBe("animal_publication_preview");
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { body: { draft_image_path: "draft-cover.jpg" } },
                error: null,
              }),
            }),
          }),
        }),
      };
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
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { body: { image_url: "https://example.test/reviewed.jpg" } },
              error: null,
            }),
          }),
        }),
      }),
    }),
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
