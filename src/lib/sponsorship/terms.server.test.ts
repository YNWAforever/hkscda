import { describe, expect, test } from "bun:test";
import type { DocumentSlot } from "../documents/types";
import { selectPublishedSponsorshipTerms } from "./terms.server";

const document = {
  id: "11111111-2222-4333-8444-555555555555",
  kind: "sponsorship_terms" as const,
  title: "核准助養條款",
  language: "zh-HK" as const,
  bucketName: "site-documents",
  objectPath: "sponsorship/terms-v1.pdf",
  fileUrl: "https://example.test/terms.pdf",
  mimeType: "application/pdf" as const,
  byteSize: 1000,
  checksumSha256: "a".repeat(64),
  isPublished: true,
  sortOrder: 0,
  createdAt: "2026-09-27T00:00:00Z",
  updatedAt: "2026-09-27T00:00:00Z",
};
const slot: DocumentSlot = {
  id: "22222222-3333-4333-8444-555555555555",
  slotKey: "sponsorship_terms",
  language: "zh-HK",
  document,
  isPublished: true,
};

describe("sponsorship published terms", () => {
  test("uses only the requested published terms slot and its PDF checksum as version", () => {
    expect(selectPublishedSponsorshipTerms([slot], "zh-HK")).toEqual({
      version: document.checksumSha256,
      title: document.title,
      documentUrl: document.fileUrl,
      documentDate: document.updatedAt,
    });
    expect(selectPublishedSponsorshipTerms([slot], "en")).toBeNull();
  });
  test("rejects a wrong kind, unpublished asset, or missing public file", () => {
    expect(
      selectPublishedSponsorshipTerms(
        [{ ...slot, document: { ...document, kind: "adoption_guide" } }],
        "zh-HK",
      ),
    ).toBeNull();
    expect(
      selectPublishedSponsorshipTerms(
        [{ ...slot, document: { ...document, isPublished: false } }],
        "zh-HK",
      ),
    ).toBeNull();
    expect(
      selectPublishedSponsorshipTerms(
        [{ ...slot, document: { ...document, fileUrl: null } }],
        "zh-HK",
      ),
    ).toBeNull();
  });
});
