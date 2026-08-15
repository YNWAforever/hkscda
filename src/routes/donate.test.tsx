import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DocumentSlot } from "@/lib/documents/types";

const realReactRouter = await import("@tanstack/react-router");

mock.module("@tanstack/react-router", () => ({
  ...realReactRouter,
  createFileRoute: () => (options: unknown) => options,
}));

function weddingSlot(language: "zh-HK" | "en", fileUrl: string): DocumentSlot {
  return {
    id:
      language === "zh-HK"
        ? "11111111-1111-4111-8111-111111111111"
        : "22222222-2222-4222-8222-222222222222",
    slotKey: "wedding_gift_return_plan",
    language,
    isPublished: true,
    document: {
      id:
        language === "zh-HK"
          ? "33333333-3333-4333-8333-333333333333"
          : "44444444-4444-4444-8444-444444444444",
      kind: "wedding_form",
      title: language === "zh-HK" ? "婚宴回禮計劃表格" : "Wedding donation form",
      language,
      bucketName: "site-documents",
      objectPath: `wedding-forms/${language}.pdf`,
      fileUrl,
      mimeType: "application/pdf",
      byteSize: 1000,
      checksumSha256: null,
      isPublished: true,
      sortOrder: 0,
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
    },
  };
}

test("renders the optional purpose note and language-aware wedding forms", async () => {
  const { DonatePage } = await import("./donate");
  const zhWedding = weddingSlot("zh-HK", "https://documents.example/wedding-zh.pdf");
  const enWedding = weddingSlot("en", "https://documents.example/wedding-en.pdf");

  const html = renderToStaticMarkup(
    <DonatePage initialSlots={[zhWedding, enWedding]} initialSearch={{ purpose: "medical" }} />,
  );

  expect(html).toContain("其他捐款用途（婚宴／活動／粉絲籌款 等）");
  expect(html).toContain('name="customPurpose"');
  expect(html).toMatch(/aria-pressed="true"[^>]*>醫療基金/);
  expect(html).toContain("💍 Share the Love – 婚宴回禮計劃");
  expect(html).toContain(
    "以婚禮分享愛心，賓客祝福化作救援能量。填寫表格，我們會與您聯絡安排感謝證書及小卡。",
  );
  expect(html).toContain('href="https://documents.example/wedding-zh.pdf"');
  expect(html).toContain("下載表格 / Download Form");
  expect(html).toContain('href="https://documents.example/wedding-en.pdf"');
  expect(html).toContain("English form");
  expect(html.match(/target="_blank"/g)).toHaveLength(2);
  expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(2);

  const singleLanguageHtml = renderToStaticMarkup(
    <DonatePage initialSlots={[enWedding]} initialSearch={{}} />,
  );
  expect(singleLanguageHtml).toContain('href="https://documents.example/wedding-en.pdf"');
  expect(singleLanguageHtml).not.toContain("表格暫時未能提供。");
});

test("keeps the donation page available when optional documents fail to load", async () => {
  const { loadDonationDocumentSlots } = await import("../lib/documents/donation.server");
  let requestedSlotKeys: string[] = [];

  const slots = await loadDonationDocumentSlots(async (slotKeys) => {
    requestedSlotKeys = slotKeys;
    throw new Error("document store unavailable");
  });

  expect(requestedSlotKeys).toEqual(["wedding_gift_return_plan"]);
  expect(slots).toEqual([]);
});

describe("AlipayHK donation checkout", () => {
  test("renders Card and AlipayHK as separate payment methods", async () => {
    const { DonatePage } = await import("./donate");

    const html = renderToStaticMarkup(<DonatePage initialSlots={[]} initialSearch={{}} />);

    expect(html).toContain(">信用卡<");
    expect(html).not.toContain("信用卡 / Alipay");
    expect(html).toContain("AlipayHK");
    expect(html).toContain("轉數快 FPS");
    expect(html).toContain("PayMe");
    expect(html).toContain("PayPal");
  });

  test("builds an AlipayHK request with the checkout experience", async () => {
    const { createDonationRequest } = await import("./donate");

    expect(
      createDonationRequest({
        amountCents: 30_000,
        purpose: "general",
        customPurpose: "",
        method: "alipayhk",
        checkoutExperience: "wap",
        receiptRequested: true,
        donor: {
          name: "Test Donor",
          email: "donor@example.com",
          phone: "",
          language: "zh-HK",
        },
        consents: { email: true, whatsapp: false },
        turnstileToken: null,
      }),
    ).toMatchObject({ method: "alipayhk", checkoutExperience: "wap" });
  });

  test("treats a COD pending return as waiting, not as a confirmed donation", async () => {
    const { DonatePage, donationStatusMessage } = await import("./donate");

    expect(donationStatusMessage("pending", "zh-HK")).toContain("確認");
    expect(donationStatusMessage("pending", "zh-HK")).not.toContain("多謝您的支持");

    const html = renderToStaticMarkup(
      <DonatePage
        initialSlots={[]}
        initialSearch={{ donation: "11111111-1111-4111-8111-111111111111", status: "pending" }}
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("正在等待付款確認");
  });
});
