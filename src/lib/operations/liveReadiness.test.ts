import { expect, test } from "bun:test";
import { verifyLiveReadiness } from "../../../scripts/verify-live-readiness";

const healthyHtml = [
  "adoption-fees-title",
  "adoption-rules-title",
  "adoption-cat-care-title",
  "adoption-dog-care-title",
  "post-adoption-guides-title",
]
  .map((id) => `<h2 id="${id}">Published copy</h2>`)
  .join("");

function fixture(readiness: Response, page: Response = new Response(healthyHtml, { status: 200 })) {
  const calls: Array<{ url: string; authorization: string | null }> = [];
  const fetcher = async (input: URL, init: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({
      url,
      authorization: new Headers(init?.headers).get("authorization"),
    });
    return url.endsWith("/api/internal/readiness") ? readiness : page;
  };
  return { calls, fetcher };
}

test("live gate requires ready state, expected SHA and actual rendered public content", async () => {
  const { calls, fetcher } = fixture(
    Response.json({ state: "ready", releaseSha: "synthetic-sha" }),
  );
  expect(
    await verifyLiveReadiness({
      baseUrl: "https://synthetic.invalid",
      token: "synthetic-token",
      expectedSha: "synthetic-sha",
      fetcher,
    }),
  ).toEqual({ state: "ready", releaseSha: "synthetic-sha" });
  expect(calls).toEqual([
    {
      url: "https://synthetic.invalid/api/internal/readiness",
      authorization: "Bearer synthetic-token",
    },
    {
      url: "https://synthetic.invalid/adoption/instructions",
      authorization: null,
    },
  ]);
});

test("degraded, wrong SHA and unauthorized readiness fail the live gate", async () => {
  for (const response of [
    Response.json({ state: "degraded", releaseSha: "synthetic-sha" }),
    Response.json({ state: "ready", releaseSha: "wrong-sha" }),
    new Response("secret", { status: 401 }),
  ]) {
    const { fetcher } = fixture(response);
    await expect(
      verifyLiveReadiness({
        baseUrl: "https://synthetic.invalid",
        token: "synthetic-token",
        expectedSha: "synthetic-sha",
        fetcher,
      }),
    ).rejects.toThrow();
  }
});

test("a 200 unavailable shell without public content fails the live gate", async () => {
  const { fetcher } = fixture(
    Response.json({ state: "ready", releaseSha: "synthetic-sha" }),
    new Response("<html>暫時未能載入領養資訊</html>", { status: 200 }),
  );
  await expect(
    verifyLiveReadiness({
      baseUrl: "https://synthetic.invalid",
      token: "synthetic-token",
      fetcher,
    }),
  ).rejects.toThrow("PUBLIC_CONTENT_MISSING");
});

test("serialized headings and comments do not pass a rendered-content gate", async () => {
  for (const html of [
    `<script>${healthyHtml}</script>`,
    `<!--${healthyHtml}-->`,
    healthyHtml.replace('id="adoption-rules-title"', 'id="missing-section"'),
  ]) {
    const { fetcher } = fixture(
      Response.json({ state: "ready", releaseSha: "synthetic-sha" }),
      new Response(html),
    );
    await expect(
      verifyLiveReadiness({ baseUrl: "https://synthetic.invalid", token: "synthetic", fetcher }),
    ).rejects.toThrow("PUBLIC_CONTENT_MISSING");
  }
});
