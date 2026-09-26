import { afterAll, expect, mock, test } from "bun:test";

const realSupabaseServerModule = {
  ...(await import("../../../../lib/donations/supabase.server")),
};
const animalId = "11111111-2222-4333-8444-555555555555";
let activeClient: unknown;
mock.module("../../../../lib/donations/supabase.server", () => ({
  ...realSupabaseServerModule,
  createSupabaseServiceClient: () => activeClient,
  requireAdmin: async () => ({ authUserId: "staff-user" }),
}));

const { createHandlers } = await import("./-handlers");

afterAll(() => {
  mock.module("../../../../lib/donations/supabase.server", () => realSupabaseServerModule);
});

test("legacy animal upload URL uses private draft storage and reserves its path", async () => {
  const buckets: string[] = [];
  const rpc = mock(async () => ({ error: null }));
  activeClient = {
    rpc,
    storage: {
      from(bucket: string) {
        buckets.push(bucket);
        return {
          createSignedUploadUrl: async (path: string) => ({
            data: { path, signedUrl: "https://storage.test/upload", token: "token" },
            error: null,
          }),
        };
      },
    },
  };
  const response = await createHandlers().createUploadUrl({
    request: new Request("http://localhost/api/admin/animals/photo-upload-url", {
      method: "POST",
      body: JSON.stringify({
        animalId,
        photo: { fileName: "draft.jpg", mimeType: "image/jpeg", sizeBytes: 20 },
      }),
    }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { bucket: string; path: string };
  expect(body.bucket).toBe("animal-draft-images");
  expect(buckets).toEqual(["animal-draft-images"]);
  expect(rpc).toHaveBeenCalledWith("reserve_animal_draft_image_upload", {
    p_animal_id: animalId,
    p_storage_path: body.path,
  });
});
