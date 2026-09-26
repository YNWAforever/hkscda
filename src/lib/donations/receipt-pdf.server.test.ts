import { readFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { expect, test } from "bun:test";

import { generateReceiptPdf, wrapReceiptDonorText } from "./receipt-pdf.server";

test("receipt donor lines fit the printable page width without losing a long Chinese name", async () => {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    readFileSync(new URL("../../assets/fonts/NotoSansHK-Regular.ttf", import.meta.url)),
    { subset: false },
  );
  const name = "王".repeat(120);
  const maxWidth = 595.28 - 144;
  const lines = wrapReceiptDonorText(name, font, maxWidth);

  expect(lines.length).toBeGreaterThan(1);
  expect(lines.join("")).toBe("Donor: " + name);
  expect(lines.every((line) => font.widthOfTextAtSize(line, 12) <= maxWidth)).toBe(true);
});

test("generates a one-page receipt with Chinese donor and signatory names", async () => {
  const originalFetch = globalThis.fetch;
  const originalSignatory = process.env.RECEIPT_SIGNATORY_NAME;
  try {
    process.env.RECEIPT_SIGNATORY_NAME = "陳先生";
    globalThis.fetch = (async () =>
      new Response(
        new Uint8Array(
          readFileSync(new URL("../../assets/fonts/NotoSansHK-Regular.ttf", import.meta.url)),
        ),
      )) as unknown as typeof fetch;

    const bytes = await generateReceiptPdf({
      receiptNo: "R-2026-001",
      donorName: "王".repeat(120),
      amountCents: 30000,
      issuedAt: "2026-09-26T00:00:00.000Z",
    });
    expect(bytes.byteLength).toBeLessThanOrEqual(5 * 1024 * 1024);
    const receipt = await PDFDocument.load(bytes);
    expect(receipt.getPageCount()).toBe(1);
    expect(receipt.getPage(0).getWidth()).toBe(595.28);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSignatory === undefined) delete process.env.RECEIPT_SIGNATORY_NAME;
    else process.env.RECEIPT_SIGNATORY_NAME = originalSignatory;
  }
});
