import { describe, expect, test } from "bun:test";

import { normalizeCspReports, Route } from "./csp-report";

describe("normalizeCspReports", () => {
  test("parses the legacy report-uri envelope", () => {
    expect(
      normalizeCspReports({
        "csp-report": {
          "document-uri": "https://hkscda.com/donate",
          "blocked-uri": "https://evil.test/x.js",
          "violated-directive": "script-src 'self'",
          "line-number": 42,
        },
      }),
    ).toEqual([
      {
        documentUri: "https://hkscda.com/donate",
        blockedUri: "https://evil.test/x.js",
        violatedDirective: "script-src 'self'",
        effectiveDirective: undefined,
        disposition: undefined,
        sourceFile: undefined,
        lineNumber: 42,
      },
    ]);
  });

  test("parses the Reporting API batch envelope", () => {
    const reports = normalizeCspReports([
      {
        type: "csp-violation",
        body: {
          documentURL: "https://hkscda.com/",
          blockedURL: "inline",
          effectiveDirective: "style-src-elem",
          disposition: "report",
        },
      },
      { type: "csp-violation", body: { documentURL: "https://hkscda.com/donate" } },
    ]);

    expect(reports).toHaveLength(2);
    expect(reports[0]).toMatchObject({
      documentUri: "https://hkscda.com/",
      blockedUri: "inline",
      effectiveDirective: "style-src-elem",
      disposition: "report",
    });
    expect(reports[1]?.documentUri).toBe("https://hkscda.com/donate");
  });

  test("truncates attacker-controlled strings and drops junk payloads", () => {
    const [report] = normalizeCspReports({
      "csp-report": { "blocked-uri": "x".repeat(5000), "line-number": "not-a-number" },
    });

    expect(report?.blockedUri).toHaveLength(512);
    expect(report?.lineNumber).toBeUndefined();

    expect(normalizeCspReports(null)).toEqual([]);
    expect(normalizeCspReports("nope")).toEqual([]);
    expect(normalizeCspReports([{ type: "csp-violation" }])).toEqual([]);
    expect(normalizeCspReports({})).toEqual([]);
  });

  test("reads lineNumber from the Reporting API's camelCase key too", () => {
    const [report] = normalizeCspReports([
      { type: "csp-violation", body: { documentURL: "https://hkscda.com/", lineNumber: 42 } },
    ]);

    expect(report?.lineNumber).toBe(42);
  });

  test("ignores batch entries whose type isn't csp-violation", () => {
    expect(
      normalizeCspReports([
        { type: "deprecation", body: { documentURL: "https://hkscda.com/" } },
        { body: { documentURL: "https://hkscda.com/no-type" } },
      ]),
    ).toEqual([]);
  });

  test("caps how many violations one request can produce", () => {
    // A minimal entry is ~34 bytes, so the 16 KiB body cap still admits ~468 of
    // them. Without a count cap a single POST turns into hundreds of records in
    // a billed log stream, which is a cheap way to drown the real reports.
    const flood = Array.from({ length: 500 }, () => ({
      type: "csp-violation",
      body: {},
    }));

    expect(normalizeCspReports(flood).length).toBe(20);
  });

  test("does not accept a bare camelCase documentUri/blockedUri key", () => {
    // Neither real wire format ever sends this shape (report-uri uses
    // kebab-case, report-to uses a "URL" suffix) — it must stay unreachable.
    const [report] = normalizeCspReports({
      "csp-report": { documentUri: "https://hkscda.com/", blockedUri: "inline" },
    });

    expect(report?.documentUri).toBeUndefined();
    expect(report?.blockedUri).toBeUndefined();
  });
});

test("CSP report stops reading once the byte cap is crossed", async () => {
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      controller.enqueue(new Uint8Array(8 * 1024));
      if (pulls >= 100) controller.close();
    },
  });
  const request = new Request("https://example.test/api/csp-report", {
    method: "POST",
    headers: { "content-type": "application/csp-report" },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  expect(request.headers.has("content-length")).toBe(false);
  const handler = (
    Route as unknown as {
      options: {
        server?: { handlers?: { POST?: (context: { request: Request }) => Promise<Response> } };
      };
    }
  ).options.server?.handlers?.POST;
  expect(handler).toBeDefined();
  if (!handler) throw new Error("missing CSP report handler");
  const response = await handler({ request });
  expect(response.status).toBe(413);
  expect(pulls).toBeLessThan(10);
});
