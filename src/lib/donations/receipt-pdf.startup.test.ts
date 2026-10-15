import { expect, test } from "bun:test";

test("receipt helpers defer PDF engines until concurrent first generation", async () => {
  const helperUrl = new URL("./receipt-pdf.server.ts", import.meta.url).href;
  const fontUrl = new URL("../../assets/fonts/NotoSansHK-Regular.ttf", import.meta.url).href;
  const script = `
    import { readFileSync } from "node:fs";
    process.env.APP_URL = "http://127.0.0.1:1";
    const helper = await import(${JSON.stringify(helperUrl)});
    const loaded = () => ({
      pdf: Object.keys(require.cache).some((key) => /[\\\\/]pdf-lib[\\\\/]/.test(key)),
      fontkit: Object.keys(require.cache).some((key) => /[\\\\/]@pdf-lib[\\\\/]fontkit[\\\\/]/.test(key)),
    });
    const before = loaded();
    const date = helper.formatReceiptDate("2026-12-31T16:30:00Z");
    const font = new Uint8Array(readFileSync(new URL(${JSON.stringify(fontUrl)})));
    globalThis.fetch = async () => new Response(font);
    const receipts = await Promise.all(["A", "B"].map((suffix) =>
      helper.generateReceiptPdf({
        receiptNo: "R-FIXTURE-" + suffix,
        donorName: "Fixture donor " + suffix,
        amountCents: 30000,
        issuedAt: "2026-09-26T00:00:00Z",
      }),
    ));
    const after = loaded();
    const { PDFDocument } = await import("pdf-lib");
    const pages = await Promise.all(receipts.map(async (bytes) =>
      (await PDFDocument.load(bytes)).getPageCount(),
    ));
    console.log(JSON.stringify({ before, after, date, pages }));
  `;
  const child = Bun.spawn([process.execPath, "--eval", script], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  const result = JSON.parse(stdout) as {
    before: { pdf: boolean; fontkit: boolean };
    after: { pdf: boolean; fontkit: boolean };
    date: string;
    pages: number[];
  };
  expect(result.before).toEqual({ pdf: false, fontkit: false });
  expect(result.after).toEqual({ pdf: true, fontkit: true });
  expect(result.date).toBe("1/1/2027");
  expect(result.pages).toEqual([1, 1]);
});
