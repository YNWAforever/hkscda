import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

import fontUrl from "../../assets/fonts/NotoSansHK-Regular.ttf?url";
import { getAppUrl, getReceiptConfig } from "./config.server";
import { centsToHkd } from "./domain";

type ReceiptPdfInput = {
  receiptNo: string;
  donorName: string;
  amountCents: number;
  issuedAt: string;
};

async function loadFontBytes() {
  const url = new URL(fontUrl, getAppUrl()).toString();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load receipt font: ${response.status}`);
  return response.arrayBuffer();
}

export async function generateReceiptPdf(input: ReceiptPdfInput) {
  const config = getReceiptConfig();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await loadFontBytes(), { subset: true });
  const page = pdf.addPage([595.28, 841.89]);
  const black = rgb(0.12, 0.14, 0.28);
  const rose = rgb(0.88, 0.36, 0.47);

  page.drawText(config.charityName, { x: 72, y: 760, size: 20, font, color: black });
  page.drawText("Donation Receipt", { x: 72, y: 730, size: 16, font, color: rose });
  page.drawText(`File No.: ${config.fileNo}`, { x: 72, y: 700, size: 11, font, color: black });
  page.drawText(`Receipt No.: ${input.receiptNo}`, { x: 72, y: 660, size: 12, font, color: black });
  page.drawText(`Donor: ${input.donorName}`, { x: 72, y: 630, size: 12, font, color: black });
  page.drawText(`Amount: ${centsToHkd(input.amountCents)}`, {
    x: 72,
    y: 600,
    size: 12,
    font,
    color: black,
  });
  page.drawText(`Date: ${new Date(input.issuedAt).toLocaleDateString("zh-HK")}`, {
    x: 72,
    y: 570,
    size: 12,
    font,
    color: black,
  });
  page.drawText("This receipt is issued for a donation to HKSCDA.", {
    x: 72,
    y: 525,
    size: 11,
    font,
    color: black,
  });
  page.drawText("HK$100 or above may be tax deductible under IRD Section 88.", {
    x: 72,
    y: 505,
    size: 11,
    font,
    color: black,
  });
  page.drawText(`Signature / Seal: ${config.signatoryName}`, {
    x: 72,
    y: 420,
    size: 12,
    font,
    color: black,
  });

  return pdf.save();
}
