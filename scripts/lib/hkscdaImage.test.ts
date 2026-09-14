import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import { downscalePhoto } from "./hkscdaImage.mjs";

async function makeImage(width: number, height: number) {
  return await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .png()
    .toBuffer();
}

describe("downscalePhoto", () => {
  test("shrinks a large image to the long-edge cap and returns jpeg", async () => {
    const input = await makeImage(3000, 2000);
    const { bytes, contentType } = await downscalePhoto(input, { maxEdge: 1600 });
    expect(contentType).toBe("image/jpeg");
    const meta = await sharp(bytes).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1600);
    expect(meta.format).toBe("jpeg");
  });

  test("does not enlarge a small image", async () => {
    const input = await makeImage(100, 80);
    const { bytes } = await downscalePhoto(input, { maxEdge: 1600 });
    const meta = await sharp(bytes).metadata();
    expect(`${meta.width}x${meta.height}`).toBe("100x80");
  });

  test("rejects an empty buffer", async () => {
    await expect(downscalePhoto(Buffer.alloc(0))).rejects.toThrow("empty image");
  });
});
