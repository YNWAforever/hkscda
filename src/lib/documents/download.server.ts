import { z } from "zod";

/** How long the storage redirect target stays valid. The browser follows it at once. */
export const PUBLIC_DOCUMENT_SIGNED_URL_TTL_SECONDS = 60;

/** Only this bucket holds PDFs that pages may link. */
export const PUBLIC_DOCUMENT_BUCKET = "site-documents";

export type PublicDocumentAsset = {
  bucketName: string;
  objectPath: string;
  mimeType: string;
};

/**
 * What the public document route needs from the database and Storage. Both are
 * dependency-injected so the eligibility and redirect behaviour is testable without a
 * database or a Storage service.
 */
export type PublicDocumentDeps = {
  /**
   * The asset only when it is published *and* referenced by a published annual report,
   * document slot or knowledge post; `null` otherwise. The SQL function
   * `public.read_public_document_asset` implements this so one snapshot decides it.
   */
  findEligibleAsset(assetId: string): Promise<PublicDocumentAsset | null>;
  sign(bucketName: string, objectPath: string): Promise<string>;
};

const uuidSchema = z.string().uuid();
const objectPathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((path) => !path.startsWith("/"), "no leading slash")
  .refine((path) => !path.includes(".."), "no parent traversal")
  .refine((path) => !path.includes("\\"), "no backslashes")
  .refine((path) => path.toLowerCase().endsWith(".pdf"), "PDFs only");

/**
 * Defence in depth for what the SQL eligibility function already guarantees: never sign an
 * object outside the document bucket or a path a page could not have linked.
 */
function servableAsset(asset: PublicDocumentAsset | null): PublicDocumentAsset | null {
  if (!asset) return null;
  if (asset.bucketName !== PUBLIC_DOCUMENT_BUCKET) return null;
  if (asset.mimeType !== "application/pdf") return null;
  if (!objectPathSchema.safeParse(asset.objectPath).success) return null;
  return asset;
}

/**
 * Public GET `/api/documents/:assetId`.
 *
 * Anchors cannot point at a private Storage object, and an unpublished PDF must not be
 * readable from its UUID URL (the practice gap the 2026-11-09 audit recorded), so the
 * stable, crawlable link is this route: it re-checks eligibility on every request and
 * redirects to a 60-second signed URL. The redirect is `no-store` so a cached response can
 * never hand out an expired signature.
 */
export function createPublicDocumentDownloadHandler(deps: PublicDocumentDeps) {
  return async ({
    request,
    params,
  }: {
    request: Request;
    params: { assetId: string };
  }): Promise<Response> => {
    const headers = { "cache-control": "no-store" };
    if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed" }, { status: 405, headers });
    }
    if (!uuidSchema.safeParse(params.assetId).success) {
      return Response.json({ error: "Document not found" }, { status: 404, headers });
    }
    try {
      const asset = servableAsset(await deps.findEligibleAsset(params.assetId));
      if (!asset) return Response.json({ error: "Document not found" }, { status: 404, headers });
      const signedUrl = await deps.sign(asset.bucketName, asset.objectPath);
      return new Response(null, { status: 302, headers: { ...headers, location: signedUrl } });
    } catch (error) {
      console.error("Public document download failed", error);
      return Response.json({ error: "Document temporarily unavailable" }, { status: 503, headers });
    }
  };
}
