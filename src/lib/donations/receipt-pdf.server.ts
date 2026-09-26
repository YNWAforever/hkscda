import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

import { getReceiptConfig } from "./config.server";
import { loadReceiptFont } from "./receiptFont.server";
import { centsToHkd } from "./domain";

type ReceiptPdfInput = {
  receiptNo: string;
  donorName: string;
  amountCents: number;
  issuedAt: string;
};

export function wrapReceiptDonorText(name: string, font: PDFFont, maxWidth: number): string[] {
  const text = "Donor: " + name.replace(/\s+/gu, " ").trim();
  const lines: string[] = [];
  let line = "";
  for (const character of text) {
    if (line && font.widthOfTextAtSize(line + character, 12) > maxWidth) {
      lines.push(line);
      line = character;
    } else {
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const hongKongDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Hong_Kong",
  day: "numeric",
  month: "numeric",
  year: "numeric",
});

export function formatReceiptDate(issuedAt: string): string {
  const parts = hongKongDateFormatter.formatToParts(new Date(issuedAt));
  const part = (type: "day" | "month" | "year") =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return `${part("day")}/${part("month")}/${part("year")}`;
}

export async function generateReceiptPdf(input: ReceiptPdfInput) {
  const config = getReceiptConfig();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // This CJK font loses glyphs when pdf-lib/fontkit embeds it as a subset.
  const font = await pdf.embedFont(await loadReceiptFont(), { subset: false });
  const latinFont = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595.28, 841.89]);
  const donorLines = wrapReceiptDonorText(input.donorName, font, page.getWidth() - 144);
  const donorOffset = (donorLines.length - 1) * 20;
  const signatoryFont = [...config.signatoryName].every(
    (character) => character.charCodeAt(0) < 128,
  )
    ? latinFont
    : font;
  const black = rgb(0.12, 0.14, 0.28);
  const rose = rgb(0.88, 0.36, 0.47);

  page.drawText(config.charityName, { x: 72, y: 760, size: 20, font, color: black });
  page.drawText("Donation Receipt", { x: 72, y: 730, size: 16, font: latinFont, color: rose });
  page.drawText(`File No.: ${config.fileNo}`, {
    x: 72,
    y: 700,
    size: 11,
    font: latinFont,
    color: black,
  });
  page.drawText(`Receipt No.: ${input.receiptNo}`, {
    x: 72,
    y: 660,
    size: 12,
    font: latinFont,
    color: black,
  });
  donorLines.forEach((line, index) => {
    page.drawText(line, { x: 72, y: 630 - index * 20, size: 12, font, color: black });
  });
  page.drawText(`Amount: ${centsToHkd(input.amountCents)}`, {
    x: 72,
    y: 600 - donorOffset,
    size: 12,
    font: latinFont,
    color: black,
  });
  page.drawText(`Date: ${formatReceiptDate(input.issuedAt)}`, {
    x: 72,
    y: 570 - donorOffset,
    size: 12,
    font: latinFont,
    color: black,
  });
  page.drawText("This receipt is issued for a donation to HKSCDA.", {
    x: 72,
    y: 525 - donorOffset,
    size: 11,
    font: latinFont,
    color: black,
  });
  page.drawText("HK$100 or above may be tax deductible under IRD Section 88.", {
    x: 72,
    y: 505 - donorOffset,
    size: 11,
    font: latinFont,
    color: black,
  });
  page.drawText(`Signature / Seal: ${config.signatoryName}`, {
    x: 72,
    y: 420 - donorOffset,
    size: 12,
    font: signatoryFont,
    color: black,
  });

  return pdf.save();
}
