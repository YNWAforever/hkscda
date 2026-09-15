import { describe, expect, test } from "bun:test";

import {
  adminContentSearchSchema,
  contentInputSchema,
  contentMediaInputSchema,
  contentMediaUploadTargetSchema,
  linkSearchSchema,
  MAX_CONTENT_MEDIA_BYTES,
  socialCopyUpdateSchema,
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

describe("adminContentSearchSchema", () => {
  test("parses the new admin filters", () => {
    const parsed = adminContentSearchSchema.parse({
      publishedFrom: "2026-01-01",
      publishedTo: "2026-12-31",
      mapVisibility: "on",
      hasUpdate: "yes",
      draftState: "draft",
    });
    expect(parsed.mapVisibility).toBe("on");
    expect(parsed.hasUpdate).toBe("yes");
    expect(parsed.draftState).toBe("draft");
  });
  test("rejects unknown enum values", () => {
    expect(adminContentSearchSchema.safeParse({ mapVisibility: "maybe" }).success).toBe(false);
    expect(adminContentSearchSchema.safeParse({ draftState: "sent" }).success).toBe(false);
  });
});

describe("socialCopyUpdateSchema", () => {
  test("accepts a status-only update (backwards compatible)", () => {
    expect(socialCopyUpdateSchema.parse({ status: "copied" })).toEqual({ status: "copied" });
  });
  test("accepts edited text and hashtags", () => {
    const parsed = socialCopyUpdateSchema.parse({ copyText: "新文案", hashtags: ["領養", "香港"] });
    expect(parsed.copyText).toBe("新文案");
    expect(parsed.hashtags).toEqual(["領養", "香港"]);
  });
  test("rejects an empty update", () => {
    expect(socialCopyUpdateSchema.safeParse({}).success).toBe(false);
  });
});

describe("linkSearchSchema", () => {
  test("trims q, defaults limit, and rejects unknown types", () => {
    expect(linkSearchSchema.parse({ linkedType: "animal", q: "  mi  " }).q).toBe("mi");
    expect(linkSearchSchema.parse({ linkedType: "animal", q: "x" }).limit).toBe(20);
    expect(linkSearchSchema.safeParse({ linkedType: "nope", q: "x" }).success).toBe(false);
  });
});
