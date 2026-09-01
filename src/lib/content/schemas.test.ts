import { describe, expect, test } from "bun:test";

import {
  contentInputSchema,
  contentMediaInputSchema,
  contentMediaUploadTargetSchema,
  MAX_CONTENT_MEDIA_BYTES,
} from "./schemas";

const baseInput = {
  type: "event",
  slug: "adoption-day",
  title: "領養日",
  summary: "歡迎參加領養日。",
};

describe("content schemas", () => {
  test("accepts public-safe CTA URLs", () => {
    expect(contentInputSchema.parse({ ...baseInput, ctaUrl: " /donate " }).ctaUrl).toBe("/donate");
    expect(
      contentInputSchema.parse({
        ...baseInput,
        ctaUrl: "https://www.hkscda.com/stories",
      }).ctaUrl,
    ).toBe("https://www.hkscda.com/stories");
  });

  test("rejects executable or protocol-relative CTA URLs", () => {
    expect(() =>
      contentInputSchema.parse({ ...baseInput, ctaUrl: "javascript:alert(1)" }),
    ).toThrow();
    expect(() =>
      contentInputSchema.parse({ ...baseInput, ctaUrl: "//evil.example/path" }),
    ).toThrow();
    expect(() =>
      contentInputSchema.parse({ ...baseInput, ctaUrl: "data:text/html,<script></script>" }),
    ).toThrow();
  });
});

describe("content media schemas", () => {
  test("accepts a safe image storage path and upload target", () => {
    expect(
      contentMediaInputSchema.parse({
        storagePath: "stories/siu-bak/checkup.jpg",
        altText: "小白覆診照片",
      }).storagePath,
    ).toBe("stories/siu-bak/checkup.jpg");

    expect(
      contentMediaUploadTargetSchema.parse({
        objectPath: "stories/siu-bak/checkup.jpg",
        mimeType: "image/jpeg",
        byteSize: 1024,
      }),
    ).toMatchObject({
      objectPath: "stories/siu-bak/checkup.jpg",
      mimeType: "image/jpeg",
      byteSize: 1024,
    });
  });

  test("rejects unsafe or non-image storage paths", () => {
    for (const invalidPath of [
      "/stories/siu-bak/checkup.jpg",
      "stories/../checkup.jpg",
      "stories/siu-bak/checkup.gif",
      "stories/siu-bak/checkup.pdf",
    ]) {
      expect(() =>
        contentMediaInputSchema.parse({ storagePath: invalidPath, altText: "小白覆診照片" }),
      ).toThrow();
      expect(() =>
        contentMediaUploadTargetSchema.parse({
          objectPath: invalidPath,
          mimeType: "image/jpeg",
          byteSize: 1024,
        }),
      ).toThrow();
    }
  });

  test("accepts only content-media image mime types under the byte size cap", () => {
    for (const invalidTarget of [
      { objectPath: "stories/siu-bak/checkup.jpg", mimeType: "image/gif", byteSize: 1024 },
      {
        objectPath: "stories/siu-bak/checkup.jpg",
        mimeType: "image/jpeg",
        byteSize: 9 * 1024 * 1024,
      },
    ]) {
      expect(() => contentMediaUploadTargetSchema.parse(invalidTarget)).toThrow();
    }

    expect(9 * 1024 * 1024).toBeGreaterThan(MAX_CONTENT_MEDIA_BYTES);
  });
});
