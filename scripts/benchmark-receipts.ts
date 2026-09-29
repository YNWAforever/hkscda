import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { generateReceiptPdf } from "../src/lib/donations/receipt-pdf.server";

const outputPath = resolve(process.argv[2] ?? "output/pdf/receipt-sample.pdf");
const count = Number(process.argv[3] ?? 100);
if (!Number.isSafeInteger(count) || count < 1 || count > 100) throw Error("count must be 1..100");
const fontBytes = await Bun.file(
  new URL("../src/assets/fonts/NotoSansHK-Regular.ttf", import.meta.url),
).arrayBuffer();
let fetchCount = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => {
  fetchCount++;
  return new Response(fontBytes.slice(0));
}) as typeof fetch;
try {
  let totalBytes = 0;
  let sampleBytes = 0;
  const started = performance.now();
  for (let index = 0; index < count; index++) {
    const pdf = await generateReceiptPdf({
      receiptNo: `SYNTHETIC-2027-${String(index + 1).padStart(6, "0")}`,
      donorName: "陳美琪 Ada Chan 王小明",
      amountCents: 20000,
      issuedAt: "2026-12-31T16:30:00Z",
    });
    totalBytes += pdf.byteLength;
    if (index === 0) {
      sampleBytes = pdf.byteLength;
      await mkdir(dirname(outputPath), { recursive: true });
      await Bun.write(outputPath, pdf);
    }
  }
  const elapsedMs = performance.now() - started;
  console.log(
    JSON.stringify({
      count,
      elapsedMs: Math.round(elapsedMs),
      meanMs: Math.round(elapsedMs / count),
      fetchCount,
      sampleBytes,
      totalBytes,
      outputPath,
    }),
  );
} finally {
  globalThis.fetch = originalFetch;
}
