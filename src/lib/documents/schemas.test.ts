import { describe, expect, test } from "bun:test";

import {
  annualReportInputSchema,
  documentAssetInputSchema,
  documentListSearchSchema,
  documentSlotInputSchema,
  uploadTargetSchema,
} from "./schemas";

describe("document schemas", () => {
  test("normalizes a PDF asset and rejects unsafe paths", () => {
    expect(
      documentAssetInputSchema.parse({
        kind: "annual_report",
        title: "Annual Report 2025??6",
        language: "bilingual",
        objectPath: "transparency/annual-reports/annual_report_2526.pdf",
        byteSize: 1024,
      }).objectPath,
    ).toBe("transparency/annual-reports/annual_report_2526.pdf");
    expect(() =>
      documentAssetInputSchema.parse({
        kind: "annual_report",
        title: "Bad",
        language: "en",
        objectPath: "../bad.pdf",
        byteSize: 10,
      }),
    ).toThrow();
  });

  test("bounds admin document pagination", () => {
    expect(documentListSearchSchema.parse({ page: "2", pageSize: "500" })).toMatchObject({
      page: 2,
      pageSize: 50,
    });
  });

  test("accepts only site-documents PDF uploads up to 50 MiB", () => {
    expect(
      uploadTargetSchema.parse({
        bucketName: "site-documents",
        objectPath: "forms/wedding-application.pdf",
        byteSize: 50 * 1024 * 1024,
      }),
    ).toMatchObject({ bucketName: "site-documents" });

    for (const invalidTarget of [
      { bucketName: "other-bucket", objectPath: "forms/wedding-application.pdf", byteSize: 1 },
      { bucketName: "site-documents", objectPath: "/forms/wedding-application.pdf", byteSize: 1 },
      { bucketName: "site-documents", objectPath: "forms/../wedding-application.pdf", byteSize: 1 },
      { bucketName: "site-documents", objectPath: "forms/wedding-application.docx", byteSize: 1 },
      { bucketName: "site-documents", objectPath: "forms/wedding-application.pdf", byteSize: 50 * 1024 * 1024 + 1 },
    ]) {
      expect(() => uploadTargetSchema.parse(invalidTarget)).toThrow();
    }
  });

  test("validates annual report metadata", () => {
    expect(
      annualReportInputSchema.parse({
        title: "Annual Report 2025/26",
        yearLabel: "2025/26",
        documentAssetId: "11111111-2222-4333-8444-555555555555",
      }),
    ).toMatchObject({
      title: "Annual Report 2025/26",
      yearLabel: "2025/26",
    });
    expect(annualReportInputSchema.shape).not.toHaveProperty("slotKey");
  });

  test("validates document slot keys and languages", () => {
    expect(
      documentSlotInputSchema.parse({
        slotKey: "annual_report_2025_26",
        language: "zh-HK",
        documentAssetId: "11111111-2222-4333-8444-555555555555",
      }),
    ).toMatchObject({
      slotKey: "annual_report_2025_26",
      language: "zh-HK",
    });

    for (const invalidSlot of [
      {
        slotKey: "annual-report",
        language: "zh-HK",
        documentAssetId: "11111111-2222-4333-8444-555555555555",
      },
      {
        slotKey: "annual_report",
        language: "bilingual",
        documentAssetId: "11111111-2222-4333-8444-555555555555",
      },
    ]) {
      expect(() => documentSlotInputSchema.parse(invalidSlot)).toThrow();
    }
  });
});
