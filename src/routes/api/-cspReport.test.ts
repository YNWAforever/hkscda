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
