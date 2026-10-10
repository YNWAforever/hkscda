import { describe, expect, test } from "bun:test";

import { expectNoChineseText } from "../i18n/testing";
import { policyFormatCopy } from "./policyFormatCopy";

describe("how the policy screens write dates and times", () => {
  test("English writes Hong Kong dates and 24-hour times, whatever zone the browser is in", () => {
    const en = policyFormatCopy.en;
    expect(en.day("2026-10-10")).toBe("10 Oct 2026 (Sat)");
    expect(en.policyVersionDate("2026-10-01T00:00:00Z")).toBe("1 Oct 2026 (Thu)");
    // 20:00 UTC on the 1st is already the 2nd in Hong Kong.
    expect(en.policyVersionDate("2026-10-01T20:00:00Z")).toBe("2 Oct 2026 (Fri)");
    expect(en.simulationDateTime("2026-10-10T01:00:00Z")).toBe("10 Oct 2026 (Sat) 09:00");
    expect(en.credentialExpiry("2027-01-01T00:00:00Z")).toBe("1 Jan 2027 (Fri)");
    expect(en.storedMoment("2026-10-09T02:00:00Z")).toBe("9 Oct 2026 (Fri) 10:00");
    expect(en.dailyClock("2026-10-10T07:30:00Z", "Asia/Hong_Kong")).toBe("15:30");
    expect(en.dailyClock("2026-10-10T07:30:00Z", "UTC")).toBe("07:30");
    // Midnight is 00:00 on the 24-hour clock, never 24:00.
    expect(en.dailyClock("2026-10-10T16:00:00Z", "Asia/Hong_Kong")).toBe("00:00");
    for (const text of [
      en.day("2026-10-10"),
      en.policyVersionDate("2026-10-01T00:00:00Z"),
      en.simulationDateTime("2026-10-10T01:00:00Z"),
      en.storedMoment("2026-10-09T02:00:00Z"),
    ]) {
      expectNoChineseText(text);
    }
  });

  test("Chinese writes the shared Hong Kong dates, and keeps its time of day", () => {
    const zh = policyFormatCopy.zh;
    expect(zh.day("2026-10-10")).toBe("2026年10月10日 (六)");
    expect(zh.storedMoment("2026-10-09T02:00:00Z")).toBe("2026年10月9日 (五) 10:00");
    const moment = "2026-10-10T07:30:00Z";
    expect(zh.policyVersionDate(moment)).toBe("2026年10月10日 (六)");
    // 20:00 UTC on the 1st is already the 2nd in Hong Kong, whatever zone the browser is in.
    expect(zh.policyVersionDate("2026-10-01T20:00:00Z")).toBe("2026年10月2日 (五)");
    expect(zh.simulationDateTime(moment)).toBe("2026年10月10日 (六) 15:30");
    expect(zh.credentialExpiry(moment)).toBe("2026年10月10日 (六)");
    expect(zh.dailyClock(moment, "Asia/Hong_Kong")).toBe(
      new Date(moment).toLocaleTimeString("zh-HK", {
        timeZone: "Asia/Hong_Kong",
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  });
});
