import { describe, expect, test } from "bun:test";

import { uploadContentMediaImage } from "./contentMediaUpload";

function fakeFile(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe("uploadContentMediaImage", () => {
  test("rejects a non-image file before requesting an upload target", async () => {
    const calls: string[] = [];
    await expect(
      uploadContentMediaImage({
        file: fakeFile("notes.pdf", "application/pdf", 1024),
        contentId: "content-1",
        requestUploadTarget: async (input) => {
          calls.push("requestUploadTarget");
          return { token: "t", path: input.objectPath };
        },
        uploadToSignedUrl: async () => {
          calls.push("uploadToSignedUrl");
        },
      }),
    ).rejects.toThrow("請選擇 JPG、PNG 或 WEBP 圖片");
    expect(calls).toEqual([]);
  });

  test("rejects a file larger than 8 MiB before requesting an upload target", async () => {
    const calls: string[] = [];
    await expect(
      uploadContentMediaImage({
        file: fakeFile("big.jpg", "image/jpeg", 9 * 1024 * 1024),
        contentId: "content-1",
        requestUploadTarget: async (input) => {
          calls.push("requestUploadTarget");
          return { token: "t", path: input.objectPath };
        },
        uploadToSignedUrl: async () => {
          calls.push("uploadToSignedUrl");
        },
      }),
    ).rejects.toThrow("圖片不可超過 8 MiB");
    expect(calls).toEqual([]);
  });

  test("uploads a valid image under the content item's own folder and returns the resulting path", async () => {
    const calls: Array<{ step: string; arg: unknown }> = [];
    const path = await uploadContentMediaImage({
      file: fakeFile("Checkup Photo.jpg", "image/jpeg", 2048),
      contentId: "content-1",
      requestUploadTarget: async (input) => {
        calls.push({ step: "requestUploadTarget", arg: input });
        return { token: "upload-token", path: input.objectPath };
      },
      uploadToSignedUrl: async (uploadPath, token, file) => {
        calls.push({ step: "uploadToSignedUrl", arg: { uploadPath, token, fileName: file.name } });
      },
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].step).toBe("requestUploadTarget");
    const requestArg = calls[0].arg as { objectPath: string; mimeType: string; byteSize: number };
    expect(requestArg.objectPath.startsWith("content-1/")).toBe(true);
    expect(requestArg.objectPath.endsWith("-Checkup_Photo.jpg")).toBe(true);
    expect(requestArg.mimeType).toBe("image/jpeg");
    expect(requestArg.byteSize).toBe(2048);
    expect(calls[1].step).toBe("uploadToSignedUrl");
    expect(path).toBe(requestArg.objectPath);
  });
});
