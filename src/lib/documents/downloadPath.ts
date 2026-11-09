/**
 * The stable public URL of a published document asset.
 *
 * `site-documents` is a private bucket (migration 20261109104000), so no storage URL may
 * be embedded in a page: this route checks the asset is published and referenced by a
 * published surface, then redirects to a short-lived signed URL. It is a plain module (not
 * `.server.ts`) because server loaders build the link and the browser follows it.
 */
export const PUBLIC_DOCUMENT_PATH_PREFIX = "/api/documents";

export function publicDocumentDownloadPath(assetId: string) {
  return `${PUBLIC_DOCUMENT_PATH_PREFIX}/${encodeURIComponent(assetId)}`;
}
