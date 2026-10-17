import { request as httpRequest } from "node:http";
import { performance } from "node:perf_hooks";
import { expect, test } from "bun:test";

const previewOrigin = process.env.NITRO_PREVIEW_ORIGIN;
const mainBundlePath = process.env.NITRO_PREVIEW_MAIN_BUNDLE_PATH;

test.skipIf(!previewOrigin || !mainBundlePath)(
  "Nitro preview completes the main Brotli JavaScript response within 750ms",
  async () => {
    const url = new URL(mainBundlePath!, previewOrigin!);
    const startedAt = performance.now();
    const response = await new Promise<{
      contentEncoding: string;
      responseEndMs: number;
      status: number;
    }>((resolve, reject) => {
      const request = httpRequest(url, { headers: { "accept-encoding": "br" } }, (incoming) => {
        const contentEncoding = String(incoming.headers["content-encoding"] ?? "");
        const status = incoming.statusCode ?? 0;
        incoming.resume();
        incoming.once("end", () =>
          resolve({
            contentEncoding,
            responseEndMs: performance.now() - startedAt,
            status,
          }),
        );
        incoming.once("error", reject);
      });
      request.once("error", reject);
      request.end();
    });

    expect(response.status).toBe(200);
    expect(response.contentEncoding).toBe("br");
    expect(response.responseEndMs).toBeLessThan(750);
  },
);
