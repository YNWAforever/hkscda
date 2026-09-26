import { describe, expect, mock, test } from "bun:test";

import { createAnimalDraftPhotoUploadHandler } from "./draftUpload.server";

const animalId = "11111111-2222-4333-8444-555555555555";
const uploadRequest = () =>
  new Request("http://localhost/api/admin/animals/draft-photo-upload-url/", {
    method: "POST",
    body: JSON.stringify({
      animalId,
      photo: { fileName: "draft.jpg", mimeType: "image/jpeg", sizeBytes: 20 },
    }),
  });

describe("animal draft upload intent", () => {
  test("reserves the draft path before issuing its signed upload URL", async () => {
    let reserved = false;
    const rpc = mock(async () => {
      reserved = true;
      return { error: null };
    });
    const sign = mock(async (path: string) => {
      expect(reserved).toBe(true);
      return {
        data: { path, signedUrl: "https://storage.test/upload", token: "token" },
        error: null,
      };
    });
    const handler = createAnimalDraftPhotoUploadHandler({
      client: {
        rpc,
        storage: { from: () => ({ createSignedUploadUrl: sign }) },
      } as never,
      requireAnimalAdmin: async () => ({ role: "staff" }),
      newVersion: () => "version-1",
    });

    const response = await handler.createUploadUrl({ request: uploadRequest() });

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("reserve_animal_draft_image_upload", {
      p_animal_id: animalId,
      p_storage_path: `${animalId}/version-1/draft.jpg`,
    });
    expect(sign).toHaveBeenCalledTimes(1);
  });

  test("does not issue a signed URL when the intent cannot be reserved", async () => {
    const sign = mock(async () => ({
      data: { path: "unused", signedUrl: "https://storage.test/upload", token: "token" },
      error: null,
    }));
    const handler = createAnimalDraftPhotoUploadHandler({
      client: {
        rpc: mock(async () => ({ error: new Error("intent unavailable") })),
        storage: { from: () => ({ createSignedUploadUrl: sign }) },
      } as never,
      requireAnimalAdmin: async () => ({ role: "staff" }),
      newVersion: () => "version-1",
    });

    await expect(handler.createUploadUrl({ request: uploadRequest() })).rejects.toThrow(
      "intent unavailable",
    );
    expect(sign).not.toHaveBeenCalled();
  });
});
