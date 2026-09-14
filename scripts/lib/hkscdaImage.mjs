/**
 * Pure image downscaling for the hkscda.com photo backfill.
 * `sharp` is a dev-only dependency used by scripts; it is never imported by app code.
 */
import sharp from "sharp";

export const DEFAULT_MAX_EDGE = 1600;
export const DEFAULT_QUALITY = 80;

export async function downscalePhoto(input, { maxEdge = DEFAULT_MAX_EDGE, quality = DEFAULT_QUALITY } = {}) {
  if (!input || input.byteLength === 0) throw new Error("empty image buffer");
  const bytes = await sharp(input)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
  return { bytes, contentType: "image/jpeg" };
}
