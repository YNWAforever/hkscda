import fontUrl from "../../assets/fonts/NotoSansHK-Regular.ttf?url";
import { getAppUrl } from "../appUrl.server";

export function createReceiptFontLoader(read: () => Promise<Uint8Array>) {
  let cached: Promise<Uint8Array> | undefined;
  return () => {
    cached ??= read().catch((error: unknown) => {
      cached = undefined;
      throw error;
    });
    return cached;
  };
}

export const loadReceiptFont = createReceiptFontLoader(async () => {
  const url = new URL(fontUrl, getAppUrl()).toString();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load receipt font: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
});
