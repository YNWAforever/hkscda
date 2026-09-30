/**
 * Private release gate: checks the authenticated readiness probe and the rendered
 * adoption page. The public loader can return HTTP 200 with an unavailable shell,
 * so a status-only synthetic would miss a content outage.
 */
type ReadinessFetch = (input: URL, init: RequestInit) => Promise<Response>;

export async function verifyLiveReadiness(input: {
  baseUrl: string;
  token: string;
  expectedSha?: string;
  fetcher?: ReadinessFetch;
}): Promise<{ state: "ready"; releaseSha: string }> {
  const baseUrl = new URL(input.baseUrl);
  if (
    baseUrl.protocol !== "https:" &&
    !(baseUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(baseUrl.hostname))
  ) {
    throw new Error("READINESS_URL_UNSAFE");
  }
  const fetcher = input.fetcher ?? fetch;
  const readiness = await fetcher(new URL("/api/internal/readiness", baseUrl), {
    headers: { authorization: `Bearer ${input.token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!readiness.ok) throw new Error("READINESS_ENDPOINT_FAILED");
  const report = (await readiness.json()) as { state?: unknown; releaseSha?: unknown };
  if (report.state !== "ready") throw new Error("READINESS_NOT_READY");
  if (typeof report.releaseSha !== "string" || !report.releaseSha) {
    throw new Error("READINESS_SHA_MISSING");
  }
  if (input.expectedSha && report.releaseSha !== input.expectedSha) {
    throw new Error("READINESS_SHA_MISMATCH");
  }

  const page = await fetcher(new URL("/adoption/instructions", baseUrl), {
    headers: { accept: "text/html" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!page.ok) throw new Error("PUBLIC_PAGE_FAILED");
  // Stable rendered headings remain valid when staff edit CMS copy. Ignore script
  // payloads/comments: serialized content alone does not prove the page rendered.
  const html = (await page.text())
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const requiredSections = [
    "adoption-fees-title",
    "adoption-rules-title",
    "adoption-cat-care-title",
    "adoption-dog-care-title",
    "post-adoption-guides-title",
  ];
  if (
    requiredSections.some((id) => !new RegExp(`<h2\\b[^>]*\\bid=["']${id}["']`, "i").test(html))
  ) {
    throw new Error("PUBLIC_CONTENT_MISSING");
  }
  return { state: "ready", releaseSha: report.releaseSha };
}

if (import.meta.main) {
  const baseUrl = process.env.READINESS_BASE_URL;
  const token = process.env.READINESS_TOKEN;
  if (!baseUrl || !token) {
    console.error("READINESS_BASE_URL and READINESS_TOKEN are required");
    process.exitCode = 2;
  } else {
    try {
      const result = await verifyLiveReadiness({
        baseUrl,
        token,
        expectedSha: process.env.READINESS_EXPECT_SHA,
      });
      console.info("Readiness gate passed", result);
    } catch (error) {
      console.error(
        "Readiness gate failed",
        error instanceof Error && /^[A-Z_]+$/.test(error.message)
          ? error.message
          : "READINESS_REQUEST_FAILED",
      );
      process.exitCode = 1;
    }
  }
}
