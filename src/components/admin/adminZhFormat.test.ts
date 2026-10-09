import { describe, expect, test } from "bun:test";
import { accessCopy } from "./access/copy";
import { formatTaskDateTime } from "./adoptions/taskPanelLogic";
import { adoptionFormatCopy } from "./adoptions/formatCopy";
import { animalListCopy } from "./animalListCopy";
import { bulkCopy } from "./bulk/copy";
import { adoptionGuideCopy } from "./content/adoptionGuideCopy";
import { adoptionInstructionsCopy } from "./content/adoptionInstructionsCopy";
import { contentCommonCopy } from "./content/contentCommonCopy";
import { editorPanelsCopy } from "./content/editorPanelsCopy";
import { faqCopy } from "./content/faqCopy";
import { governanceCopy } from "./content/governanceCopy";
import { crmFormatCopy } from "./crm/formatCopy";
import { donationFormatCopy } from "./donations/formatCopy";
import { operationsCopy } from "./operations/copy";
import { pledgeDrawerCopy } from "./sponsorship/drawerCopy";
import { sponsorshipFormatCopy } from "./sponsorship/formatCopy";
import { policyChangeCopy } from "./volunteers/policyChangeCopy";
import { policyFormatCopy } from "./volunteers/policyFormatCopy";
import { policySourceFieldsCopy } from "./volunteers/policySourceFieldsCopy";
import { volunteerFormatCopy } from "./volunteers/volunteerFormatCopy";

/**
 * Every zh date and money format in the admin is the shared one from `i18n/format.ts`, read in
 * Hong Kong time (SP-5b-1 Task 7). Each screen's formatter is pinned at:
 *
 *   NOON      04:00Z on 7 Oct 2026, 12:00 in Hong Kong: an ordinary instant.
 *   BOUNDARY  16:30Z on 6 Oct 2026, 00:30 on 7 Oct in Hong Kong. A UTC day (the old
 *             `slice(0, 10)`) or a browser in a zone west of Hong Kong would show the 6th.
 *   DAY       `2026-10-07`, a calendar day stored as a day: it must stay the 7th.
 *
 * Money is pinned with a cents-bearing amount, so a format that drops the cents fails.
 */
const NOON = "2026-10-07T04:00:00Z";
const BOUNDARY = "2026-10-06T16:30:00Z";
const DAY = "2026-10-07";
const ZH_DATE = "2026年10月7日 (三)";
const ZH_NOON = `${ZH_DATE} 12:00`;
const ZH_BOUNDARY = `${ZH_DATE} 00:30`;

/** A date-only formatter: the instant, the Hong Kong boundary and a stored calendar day. */
function expectZhDate(format: (value: string) => string) {
  expect(format(NOON)).toBe(ZH_DATE);
  expect(format(BOUNDARY)).toBe(ZH_DATE);
  expect(format(DAY)).toBe(ZH_DATE);
}

/** A date-and-time formatter: the instant and the Hong Kong boundary. */
function expectZhDateTime(format: (value: string) => string) {
  expect(format(NOON)).toBe(ZH_NOON);
  expect(format(BOUNDARY)).toBe(ZH_BOUNDARY);
}

describe("adoptions (cases, adopters, finalisation, task panel, reports)", () => {
  const zh = adoptionFormatCopy.zh;

  test("dates are the shared Hong Kong date", () => {
    expectZhDate((value) => zh.date(value));
    expectZhDate((value) => zh.listDay(value));
    expect(zh.dateRange("2026-10-07", "2026-10-08")).toBe(`${ZH_DATE} - 2026年10月8日 (四)`);
  });

  test("an empty or broken date shows the dash", () => {
    for (const value of [null, undefined, "", "  ", "not a date"]) {
      expect(zh.date(value)).toBe("-");
      expect(zh.listDay(value)).toBe("-");
    }
  });

  test("a range keeps text that is not a date as the applicant entered it", () => {
    expect(zh.dateRange("next week", "2026-10-08")).toBe("next week - 2026年10月8日 (四)");
  });

  test("a fee keeps its cents", () => {
    expect(zh.money(123450)).toBe("HK$1,234.50");
    expect(zh.money(12345)).toBe("HK$123.45");
    expect(zh.money(100000)).toBe("HK$1,000.00");
    expect(zh.money(null)).toBe("-");
  });

  test("the task panel and the report history show the shared date and time", () => {
    expectZhDateTime((value) => formatTaskDateTime(value, "zh"));
    expectZhDateTime((value) => zh.reportTime(value));
    expect(formatTaskDateTime(null, "zh")).toBe("-");
    expect(formatTaskDateTime("not a date", "zh")).toBe("-");
    expect(zh.reportTime(null)).toBe("-");
    expect(zh.reportTime("not a date")).toBe("-");
  });
});

describe("sponsorship (pledge list, drawer, finance, reminders)", () => {
  const zh = sponsorshipFormatCopy.zh;

  test("money keeps its cents, and the monthly rate keeps its suffix", () => {
    expect(zh.money(123450)).toBe("HK$1,234.50");
    expect(zh.money(30000)).toBe("HK$300.00");
    expect(zh.monthly(12345)).toBe("HK$123.45/月");
  });

  test("dates and days are the shared Hong Kong date", () => {
    expectZhDate((value) => zh.date(value));
    expectZhDate((value) => zh.day(value));
    expectZhDate((value) => zh.isoDay(value));
    expectZhDateTime((value) => zh.dateTime(value));
  });

  test("an empty or broken date shows each formatter's existing placeholder", () => {
    expect(zh.date(null)).toBe("-");
    expect(zh.date("not a date")).toBe("-");
    expect(zh.isoDay(null)).toBe("");
    expect(zh.isoDay("not a date")).toBe("");
    expect(zh.day("not a date")).toBe("not a date");
    expect(zh.dateTime("not a date")).toBe("not a date");
  });

  test("a sponsorship month stays a calendar month, never moved by a time zone", () => {
    expect(zh.month("2026-08")).toBe("2026-08");
    expect(zh.month("2026-08-01")).toBe("2026-08");
    expect(zh.periodStart("2026-08-01")).toBe("2026-08-01");
  });

  test("a tier amount is shared money", () => {
    expect(pledgeDrawerCopy.zh.tierAmount("300")).toBe("HK$300.00");
    expect(pledgeDrawerCopy.zh.tierAmount("123.45")).toBe("HK$123.45");
    expect(pledgeDrawerCopy.zh.tierAmount("gold")).toBe("gold");
  });
});

describe("payments (reconciliation, delivery jobs, bank matching)", () => {
  const zh = donationFormatCopy.zh;

  test("money keeps its cents", () => {
    expect(zh.money(123450)).toBe("HK$1,234.50");
    expect(zh.money(10000)).toBe("HK$100.00");
  });

  test("times and days are the shared Hong Kong formats", () => {
    expectZhDateTime((value) => zh.activityTime(value));
    expectZhDateTime((value) => zh.timestamp(value));
    expectZhDate((value) => zh.day(value));
  });

  test("a broken time is shown as stored, never as Invalid Date or a thrown error", () => {
    expect(zh.activityTime("not a date")).toBe("not a date");
    expect(zh.timestamp("not a date")).toBe("not a date");
    expect(zh.day("not a date")).toBe("not a date");
  });
});

describe("supporters (CRM)", () => {
  const zh = crmFormatCopy.zh;

  test("money keeps its cents (it used to round 123.45 to 123)", () => {
    expect(zh.money(12345)).toBe("HK$123.45");
    expect(zh.money(123450)).toBe("HK$1,234.50");
    expect(zh.money(null)).toBe("-");
  });

  test("dates and times are the shared Hong Kong formats", () => {
    expectZhDate((value) => zh.date(value));
    expectZhDateTime((value) => zh.dateTime(value));
  });

  test("an empty or broken date shows the dash", () => {
    for (const value of [null, undefined, "", "not a date"]) {
      expect(zh.date(value)).toBe("-");
      expect(zh.dateTime(value)).toBe("-");
    }
  });
});

describe("content (posts, timelines, governance, FAQ, guides, instructions, links)", () => {
  test("dates are the shared Hong Kong date", () => {
    expectZhDate((value) => contentCommonCopy.zh.date(value));
    expectZhDate((value) => governanceCopy.zh.table.date(value));
    expectZhDate((value) => faqCopy.zh.gaps.day(value));
    expect(editorPanelsCopy.zh.picker.detail("volunteer_activity", BOUNDARY)).toBe(ZH_DATE);
  });

  test("times are the shared Hong Kong date and time", () => {
    const history = adoptionGuideCopy.zh.history;
    expect(history.created(BOUNDARY)).toBe(`建立：${ZH_BOUNDARY}`);
    expect(history.submitted(NOON)).toBe(`提交：${ZH_NOON}`);
    expect(history.published(NOON)).toBe(`發佈：${ZH_NOON}`);
    expect(history.archived(NOON)).toBe(`封存：${ZH_NOON}`);
    expect(adoptionInstructionsCopy.zh.lastUpdated(BOUNDARY, null)).toBe(
      `最後更新：${ZH_BOUNDARY} · 系統`,
    );
    expect(adoptionInstructionsCopy.zh.history.item(3, "published", BOUNDARY)).toBe(
      `修訂 3 · 已發布 · ${ZH_BOUNDARY}`,
    );
    expect(adoptionInstructionsCopy.zh.history.item(3, "archived", null)).toBe(
      "修訂 3 · 已封存 · ",
    );
  });

  test("a broken stored date is shown as stored, never as Invalid Date", () => {
    expect(contentCommonCopy.zh.date("not a date")).toBe("not a date");
    expect(governanceCopy.zh.table.date("not a date")).toBe("not a date");
    expect(faqCopy.zh.gaps.day("not a date")).toBe("not a date");
    expect(editorPanelsCopy.zh.picker.detail("animal", "cat")).toBe("cat");
  });
});

describe("volunteers and their policies", () => {
  const zh = volunteerFormatCopy.zh;
  const policy = policyFormatCopy.zh;

  test("dates are the shared Hong Kong date", () => {
    for (const format of [
      zh.day,
      zh.profileDate,
      zh.managementDate,
      zh.enquiryDate,
      zh.legacyDate,
      policy.day,
      policy.policyVersionDate,
      policy.credentialExpiry,
    ]) {
      expectZhDate(format);
    }
  });

  test("times are the shared Hong Kong date and time", () => {
    for (const format of [
      zh.sessionTime,
      zh.operationsTime,
      zh.coverageDate,
      zh.managementDateTime,
      zh.registrationDateTime,
      policy.simulationDateTime,
      policy.storedMoment,
    ]) {
      expectZhDateTime(format);
    }
  });

  test("a broken date is shown as stored, or as the overview's existing placeholder", () => {
    expect(zh.profileDate("not a date")).toBe("not a date");
    expect(zh.managementDateTime("not a date")).toBe("not a date");
    expect(policy.simulationDateTime("not a date")).toBe("not a date");
    expect(zh.coverageDate("")).toBe("日期待確認");
    expect(zh.coverageDate("not a date")).toBe("日期待確認");
  });

  test("a day inside a policy is the shared date; other values are unchanged", () => {
    expect(policyChangeCopy.zh.leaf(DAY, "effective_from", {})).toBe(ZH_DATE);
    expect(policyChangeCopy.zh.leaf(DAY, "excluded_dates", {})).toBe(ZH_DATE);
    expect(policyChangeCopy.zh.leaf("2026-10-07", "name", {})).toBe("2026-10-07");
    expect(policySourceFieldsCopy.zh.describe(DAY, "schedule.effective_until", {})).toBe(ZH_DATE);
    expect(policySourceFieldsCopy.zh.describe("2026-10-07", "location", {})).toBe("2026-10-07");
  });
});

describe("access, media repair, bulk preview and the task overview", () => {
  test("times are the shared Hong Kong date and time", () => {
    expectZhDateTime((value) => accessCopy.zh.dateTime(value));
    const repair = animalListCopy.zh.mediaRepair;
    expect(repair.created(BOUNDARY)).toBe(`建立：${ZH_BOUNDARY}`);
    expect(repair.nextRetry(NOON)).toBe(`· 下次處理：${ZH_NOON}`);
    expect(bulkCopy.zh.review.expires(BOUNDARY)).toBe(`預覽到期：${ZH_BOUNDARY}`);
    expect(operationsCopy.zh.guidance.oldest(BOUNDARY)).toBe(`最早：${ZH_BOUNDARY}`);
  });

  test("an empty or broken time never shows Invalid Date", () => {
    expect(accessCopy.zh.dateTime(null)).toBe("—");
    expect(accessCopy.zh.dateTime("not a date")).toBe("—");
    expect(animalListCopy.zh.mediaRepair.created("not a date")).toBe("建立：not a date");
    expect(bulkCopy.zh.review.expires("not a date")).not.toContain("Invalid Date");
    expect(operationsCopy.zh.guidance.oldest("not a date")).not.toContain("Invalid Date");
  });
});
