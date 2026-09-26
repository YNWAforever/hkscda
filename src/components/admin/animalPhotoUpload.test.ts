import { expect, test } from "bun:test";

import { uploadAnimalPhoto } from "./animalPhotoUpload";

test("uploads to the bucket bound to the signed URL response", async () => {
  const buckets: string[] = [];
  const file = new File(["photo bytes"], "cici.jpg", { type: "image/jpeg" });
  const result = await uploadAnimalPhoto(
    { animalId: "11111111-2222-4333-8444-555555555555", file },
    {
      requestUploadUrl: async () => ({
        bucket: "animal-images",
        path: "draft/cici.jpg",
        signedUrl: "https://storage.test/upload",
        token: "tok",
      }),
      uploadToSignedUrl: async (bucket) => {
        buckets.push(bucket);
        return { error: null };
      },
    },
  );
  expect(result).toEqual({ ok: true, path: "draft/cici.jpg", publicUrl: "" });
  expect(buckets).toEqual(["animal-images"]);
});

test("returns upload failure when storage rejects the request", async () => {
  const file = new File(["photo bytes"], "cici.jpg", { type: "image/jpeg" });
  await expect(
    uploadAnimalPhoto(
      { animalId: "11111111-2222-4333-8444-555555555555", file },
      {
        requestUploadUrl: async () => ({
          bucket: "animal-draft-images",
          path: "draft/cici.jpg",
          signedUrl: "https://storage.test/upload",
          token: "tok",
        }),
        uploadToSignedUrl: async () => {
          throw new Error("network unavailable");
        },
      },
    ),
  ).resolves.toEqual({ ok: false });
});
