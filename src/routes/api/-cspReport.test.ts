import { describe, expect, test } from "bun:test";

import { normalizeCspReports } from "./csp-report";

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
});
