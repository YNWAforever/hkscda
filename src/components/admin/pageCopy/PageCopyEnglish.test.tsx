import { describe, expect, test } from "bun:test";

import * as pageCopyModule from "../adminPageCopy";

import {
  adminPageCopy,
  bilingualStatusName,
  formatLegacyAdminDateTime,
  formatAdminNumber,
  statusDisplayName,
  useAdminPageCopy,
} from "../adminPageCopy";
import {
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../i18n/testing";

/** Every page header the page copy holds: a title, and a subtitle where there is one. */
function PageHeaders() {
  const { pageCopy } = useAdminPageCopy();
  const headers = [
    [pageCopy.caseList.title, pageCopy.caseList.subtitle],
    [pageCopy.pledgeReview.title, pageCopy.pledgeReview.detailTitle],
    [pageCopy.intakeInbox.title, pageCopy.intakeInbox.subtitle],
    [pageCopy.manualIntake.title, pageCopy.manualIntake.subtitle],
    [pageCopy.taskCenter.title, pageCopy.taskCenter.subtitle],
    [pageCopy.taskPanel.defaultTitle, ""],
    [pageCopy.adopters.title, pageCopy.adopters.subtitle],
    [pageCopy.reports.title, pageCopy.reports.subtitle],
    [pageCopy.statuses.title, pageCopy.statuses.subtitle(12, 5)],
    [pageCopy.supporters.title, pageCopy.supporters.subtitle],
  ];
  return (
    <div>
      {headers.map(([title, subtitle]) => (
        <section key={title}>
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </section>
      ))}
    </div>
  );
}

function leafPaths(value: unknown, prefix = ""): string[] {
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => leafPaths(child, `${prefix}.${key}`));
  }
  return [prefix];
}

describe("adminPageCopy page headers", () => {
  test("every page header renders in English", () => {
    const markup = renderAdminInEnglish(<PageHeaders />);
    expectNoChineseText(markup);
    for (const text of [
      ">Applications</h1>",
      "Coordinator queue, matching, follow-up and finalisation.",
      "Pledge review",
      "Pledge details",
      ">Inbox</h1>",
      "Manual intake",
      ">Tasks</h1>",
      "Follow-ups",
      "Adopters",
      ">Reports</h1>",
      ">Status settings</h1>",
      "12 statuses across 5 categories",
      "Supporters",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("every page header renders in Chinese, as before", () => {
    const markup = renderAdminInChinese(<PageHeaders />);
    for (const text of [
      "領養個案",
      "協調員個案隊列、配對、跟進及完成領養。",
      "承諾審核",
      "承諾詳情",
      "申請收件箱",
      "手動建案",
      "協調員工作中心",
      "跟進工作",
      "領養人",
      "協調員報表",
      "協調員狀態",
      "12 個狀態，分布於 5 個分類",
      "支持者",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("the English copy has no Chinese anywhere, apart from the Chinese language name", () => {
    // manualIntake.fields.chinese names the language in that language, like the toggle.
    expectNoChineseInCopy(adminPageCopy.en, { allow: ["繁體中文"] });
  });

  test("the two languages have the same entries", () => {
    expect(leafPaths(adminPageCopy.en)).toEqual(leafPaths(adminPageCopy.zh));
    expect(Object.keys(adminPageCopy.zh).sort()).toEqual([
      "adopters",
      "animalTypes",
      "caseList",
      "common",
      "contactChannel",
      "identityModes",
      "intakeInbox",
      "manualIntake",
      "pledgeReview",
      "priority",
      "reports",
      "statuses",
      "supporters",
      "taskCenter",
      "taskPanel",
    ]);
  });

  test("the not-signed-in message says what to do next, and the zh text is unchanged", () => {
    // The export buttons throw this as an error message that staff see in an alert.
    expect(adminPageCopy.en.common.notSignedIn).toBe("Not signed in. Sign in again.");
    expect(adminPageCopy.zh.common.notSignedIn).toBe("未登入");
  });

  test("uses the glossary's one English word for each zh term", () => {
    const en = adminPageCopy.en;
    const zh = adminPageCopy.zh;
    // 家庭人數 is "household size", in both of the manual intake's sections.
    expect(en.manualIntake.fields.householdSize).toBe("Household size");
    expect(en.manualIntake.fields.familySize).toBe("Household size");
    expect(zh.manualIntake.fields.householdSize).toBe("家庭人數");
    expect(zh.manualIntake.fields.familySize).toBe("家庭人數");
    // 備註 is "note".
    expect(en.taskPanel.labels.remarks).toBe("Note");
    expect(en.taskPanel.display.remarks).toBe("Note");
    expect(en.manualIntake.remarks).toBe("Note");
    expect(zh.taskPanel.labels.remarks).toBe("備註");
    // 排序 is "sort order", as a column and as a field.
    expect(en.statuses.columns.order).toBe("Sort order");
    expect(en.statuses.fields.sortOrder).toBe("Sort order");
    // 待審核 is "pending review" wherever a record waits for a review.
    expect(en.pledgeReview.proofReviewStatuses.pending).toBe("Pending review");
    expect(en.pledgeReview.statuses.provisional).toBe("Pending review");
    expect(zh.pledgeReview.proofReviewStatuses.pending).toBe("待審核");
    // The supporter list and the supporter form each say what failed, and what to do next.
    expect(en.supporters.loadError).toBe(
      "Could not load supporters. Refresh the page or try again.",
    );
    expect(en.supporters.loadSupporterError).toBe(
      "Could not load the supporter. Refresh the page or try again.",
    );
    expect(zh.supporters.loadError).toBe("無法載入支持者");
    expect(zh.supporters.loadSupporterError).toBe("無法載入支持者");
  });

  test("counts read the same way in each language", () => {
    expect(adminPageCopy.zh.common.searchMatches(1234)).toBe("1,234 個結果");
    expect(adminPageCopy.en.common.searchMatches(1234)).toBe("1,234 matches");
    expect(adminPageCopy.zh.common.pageOf(2, 5)).toBe("第 2 頁，共 5 頁");
    expect(adminPageCopy.en.common.searchMatches(1)).toBe("1 match");
    expect(adminPageCopy.en.common.searchMatches(3)).toBe("3 matches");
    expect(adminPageCopy.en.common.totalRecords(1)).toBe("1 record");
    expect(adminPageCopy.en.common.totalRecords(3)).toBe("3 records");
    expect(adminPageCopy.en.common.totalSupporters(1)).toBe("1 supporter");
    expect(adminPageCopy.en.common.totalSupporters(3)).toBe("3 supporters");
    expect(adminPageCopy.en.common.rowsCount(1)).toBe("1 row");
    expect(adminPageCopy.en.common.rowsCount(3)).toBe("3 rows");
    expect(adminPageCopy.en.statuses.subtitle(1, 1)).toBe("1 status across 1 category");
    expect(adminPageCopy.en.statuses.subtitle(3, 2)).toBe("3 statuses across 2 categories");
    // Chinese has no plural, so one and many read the same.
    expect(adminPageCopy.zh.common.searchMatches(1)).toBe("1 個結果");
    expect(adminPageCopy.zh.statuses.subtitle(1, 1)).toBe("1 個狀態，分布於 1 個分類");
    expect(adminPageCopy.en.common.pageOf(2, 5)).toBe("Page 2 of 5");
    expect(adminPageCopy.zh.pledgeReview.totalCount(12)).toBe("共 12 項");
    // English names the status by its English label, or its Chinese one when that is empty.
    expect(adminPageCopy.en.statuses.deleteConfirm("待處理", "Pending")).toBe("Delete Pending?");
    expect(adminPageCopy.en.statuses.deleteConfirm("待處理", "  ")).toBe("Delete 待處理?");
    expect(adminPageCopy.zh.statuses.deleteConfirm("待處理", "Pending")).toBe(
      "刪除 待處理 / Pending？",
    );
  });
});

describe("page copy helpers", () => {
  test("formatAdminNumber groups thousands and shows nothing as 0", () => {
    expect(formatAdminNumber(1234567, "zh")).toBe("1,234,567");
    expect(formatAdminNumber(1234567, "en")).toBe("1,234,567");
    expect(formatAdminNumber(null, "en")).toBe("0");
    expect(formatAdminNumber(undefined, "zh")).toBe("0");
  });

  test("does not export a second formatAdminDateTime beside the Task 1 formatter", () => {
    // New code imports formatAdminDateTime from i18n/format; the old format has its own name.
    expect("formatAdminDateTime" in pageCopyModule).toBe(false);
    expect("formatLegacyAdminDateTime" in pageCopyModule).toBe(true);
  });

  test("formatLegacyAdminDateTime keeps its Hong Kong time output", () => {
    expect(formatLegacyAdminDateTime(null, "zh")).toBe("-");
    expect(formatLegacyAdminDateTime("not a date", "en")).toBe("not a date");
    const value = "2026-10-01T02:30:00Z";
    const expected = (locale: string) =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        hour12: false,
        timeZone: "Asia/Hong_Kong",
      }).format(new Date(value));
    expect(formatLegacyAdminDateTime(value, "zh")).toBe(expected("zh-HK"));
    expect(formatLegacyAdminDateTime(value, "en")).toBe(expected("en-HK"));
  });

  test("statusDisplayName shows the language's own label, then the other, then the key", () => {
    const status = { labelZh: "待處理", labelEn: "Pending", key: "pending" };
    expect(statusDisplayName(status, "zh")).toBe("待處理");
    expect(statusDisplayName(status, "en")).toBe("Pending");
    expect(statusDisplayName({ labelZh: "待處理", labelEn: "" }, "en")).toBe("待處理");
    expect(statusDisplayName({ labelZh: null, labelEn: "Pending" }, "zh")).toBe("Pending");
    expect(statusDisplayName({ key: "pending" }, "en")).toBe("pending");
    expect(statusDisplayName({}, "zh")).toBe("-");
  });

  test("bilingualStatusName lists both labels in Chinese and only the English label in English", () => {
    const status = { labelZh: "待處理", labelEn: "Pending" };
    expect(bilingualStatusName(status, "zh")).toBe("待處理 / Pending");
    // English shows no Chinese beside the English label.
    expect(bilingualStatusName(status, "en")).toBe("Pending");
    // An empty, null or missing English label falls back to the Chinese one.
    expect(bilingualStatusName({ labelZh: "待處理", labelEn: "" }, "en")).toBe("待處理");
    expect(bilingualStatusName({ labelZh: "待處理", labelEn: null }, "en")).toBe("待處理");
    expect(bilingualStatusName({ labelZh: "待處理" }, "en")).toBe("待處理");
    expect(bilingualStatusName({ labelZh: "完成", labelEn: "完成" }, "en")).toBe("完成");
    expect(bilingualStatusName({ key: "pending" }, "en")).toBe("pending");
    // Chinese is unchanged: no second label when it is missing or the same.
    expect(bilingualStatusName({ labelZh: "完成", labelEn: "完成" }, "zh")).toBe("完成");
    expect(bilingualStatusName({ labelZh: "待處理" }, "zh")).toBe("待處理");
    expect(bilingualStatusName({ labelZh: "待處理", labelEn: "" }, "zh")).toBe("待處理");
    expect(bilingualStatusName({ labelEn: "Pending" }, "zh")).toBe("Pending");
  });
});
