import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { generateReceiptPdf } from "../../../../src/lib/donations/receipt-pdf.server";

// Diagnostic only. Application source remains byte-for-byte unchanged.
const mode = process.argv[2];
if (mode !== "full" && mode !== "subset") throw new Error("full or subset required");
const out = resolve(process.argv[3]);
await mkdir(out, { recursive: true });
const bytes = new Uint8Array(await Bun.file("src/assets/fonts/NotoSansHK-Regular.ttf").arrayBuffer());
const face = fontkit.create(bytes);
const originalFetch = globalThis.fetch;
const originalEmbed = PDFDocument.prototype.embedFont;
let fetches = 0;
globalThis.fetch = Object.assign(async () => {
  fetches++;
  return new Response(bytes.slice());
}, { preconnect: () => {} });
if (mode === "subset") {
  PDFDocument.prototype.embedFont = function (font, options) {
    return originalEmbed.call(this, font, typeof font === "string" ? options : { ...options, subset: true });
  };
}
const cases = [
  { id: "common", name: "陳美琪 Ada Chan 王小明" },
  { id: "rare", name: "龘龖靐齉堃喆鄺岑 𠮷𠮟𨳒𠝹" },
  { id: "long", name: "龘" + "王".repeat(120) + " Ada Chan" },
  { id: "mixed", name: "葉黃鄭蘇龘 Ada José Chloë 2026" },
];
const samples = [];
try {
  for (const item of cases) {
    const started = performance.now();
    const cpu = process.cpuUsage();
    const pdf = await generateReceiptPdf({ receiptNo: "SYNTHETIC-NOT-VALID", donorName: item.name, amountCents: 20000, issuedAt: "2026-12-31T16:30:00Z" });
    const usage = process.cpuUsage(cpu);
    const elapsedMs = performance.now() - started;
    const loaded = await PDFDocument.load(pdf);
    await Bun.write(resolve(out, `${mode}-${item.id}.pdf`), pdf);
    samples.push({ ...item, missing: [...new Set([...item.name].filter(c => !face.hasGlyphForCodePoint(c.codePointAt(0)!)))], bytes: pdf.byteLength, elapsedMs, cpuUserMicros: usage.user, cpuSystemMicros: usage.system, pages: loaded.getPageCount(), sha256: createHash("sha256").update(pdf).digest("hex") });
  }
  const receipt = { mode, sourceUnchanged: true, fontSha256: createHash("sha256").update(bytes).digest("hex"), fetches, samples };
  await Bun.write(resolve(out, `${mode}-result.json`), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
} finally {
  globalThis.fetch = originalFetch;
  PDFDocument.prototype.embedFont = originalEmbed;
}
