import { afterEach, describe, expect, setSystemTime, test } from "bun:test";

import { AdminApiError } from "../../../lib/admin/session";
import { BulkInputError } from "../../../lib/volunteers/bulk/service";
import { reviewBulkOperation } from "../../../lib/volunteers/bulk/review";
import {
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../i18n/testing";

// The mocks and the fixtures are in volunteerKit.test.support.tsx; it must load before a screen does.
const kit = await import("./volunteerKit.test.support");
const { VolunteerActivityWorkspace } = await import("./VolunteerActivityWorkspace");
const { ActivitySchedule } = await import("./ActivitySchedule");
const { ActivityOperationForm } = await import("./ActivityOperationForm");
const { ActivityOperationPanel } = await import("./ActivityOperationPanel");
const { ActivityDetailBody } = await import("./ActivityDetailSheet");
const { VolunteerDraftForm } = await import("./VolunteerDraftForm");
const { activityWorkspaceCopy } = await import("./activityWorkspaceCopy");
const { activityOperationCopy } = await import("./activityOperationCopy");
const { volunteerCommonCopy } = await import("./volunteerCommonCopy");

const { FIXTURE } = kit;
const ALLOW = [FIXTURE.activity, FIXTURE.location, FIXTURE.role, FIXTURE.template];
const noop = () => {};

// A test that fixes the clock puts it back, so no other test in the run sees the fixed time.
afterEach(() => setSystemTime());

const workspaceQueries = (over: Record<string, unknown> = {}) => ({
  "volunteer-workspace": kit.ok({ activities: kit.workspaceRows, total: 60 }),
  "volunteer-workspace-templates": kit.ok({ templates: kit.workspaceTemplates }),
  ...over,
});

describe("the activity workspace in English", () => {
  test("shows the filters, the list and the table without Chinese", () => {
    kit.withQueries(workspaceQueries(), () => {
      const markup = renderAdminInEnglish(<VolunteerActivityWorkspace />);
      expectNoChineseText(markup, { allow: ALLOW });
      for (const text of [
        ">Activities and registrations</h1>",
        "Manage sessions, registrations and attendance records in Hong Kong time.",
        "Policy settings and rules awaiting confirmation",
        "Create draft",
        'aria-label="Activity filters"',
        "Search by name or location",
        "Next 30 days from today",
        "Previous period",
        "Past activities",
        "All dates",
        "Calendar view",
        "Date, earliest first",
        "All templates",
        "Group arrangement",
        "Below the policy&#x27;s minimum staffing",
        "More filters",
        "1. Choose the range · Activities (60)",
        "Select this page (5)",
        "Lock the items selected across pages (0)",
        "Lock all matches (60)",
        "Clear selection",
        "0 sessions locked",
        "Page 1 of 3",
        "Previous page",
        "Next page",
        "Hong Kong date and time",
        "Activity and location",
        "Template and policy",
        "Registrations and staffing",
        "Cat shelter",
        "Dog shelter",
        "Shelter not set",
        "Other venue",
        "Needs a template",
        "Policy v3",
        "Policy not set",
        "Confirmed group",
        "No confirmed group",
        "Standard arrangement",
        "Confirmed 8 / 12 · Waitlisted 2",
        FIXTURE.role + " needs 2 more people",
        "Registration closed",
        "10 Oct 2026 (Sat) 09:00",
        "to 10 Oct 2026 (Sat) 12:00",
      ]) {
        expect(markup, text).toContain(text);
      }
      // The table names a template by its name, and a venue key English has no name for is "Other
      // venue": a stored key is never shown as a label.
      expect(markup).toContain(FIXTURE.template + "<p>Policy v3</p>");
      expect(markup).not.toContain(">cat_saturday<");
      expect(markup).not.toContain("mystery_shelter");
      expect(markup).not.toContain("Activity and venue");
      for (const status of ["Published", "Draft", "Ended", "Cancelled", "Unknown"]) {
        expect(markup, status).toContain(status);
      }
      expect(markup).not.toContain("mystery_status");
    });
  });

  test("shows the calendar with English weekday names", () => {
    // The workspace starts its range at today and runs 30 days, and the fixture sessions are on fixed
    // dates (10 and 12 Oct 2026), so the clock is fixed to the day before them.
    setSystemTime(new Date("2026-10-09T04:00:00Z"));
    kit.withQueries(workspaceQueries(), () => {
      const markup = renderAdminInEnglish(<VolunteerActivityWorkspace initialView="calendar" />);
      expectNoChineseText(markup, { allow: ALLOW });
      expect(markup).toContain("List view");
      expect(markup).toContain('aria-label="Hong Kong date calendar"');
      for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
        expect(markup, day).toContain(`>${day}</span>`);
      }
      expect(markup).toContain(
        "The calendar shows up to 25 activities on this page. Use the page controls below for the rest.",
      );
      expect(markup).toContain("Confirmed 8 · Waitlisted 2");
    });
  });

  test("tells the loading, the empty list and the failures in English with a next step", () => {
    kit.withQueries({}, () => {
      const markup = renderAdminInEnglish(<VolunteerActivityWorkspace />);
      expectNoChineseText(markup);
      expect(markup).toContain("Loading activities…");
      expect(markup).toContain("Activities (0)");
    });
    kit.withQueries(
      workspaceQueries({ "volunteer-workspace": kit.ok({ activities: [], total: 0 }) }),
      () => {
        const markup = renderAdminInEnglish(<VolunteerActivityWorkspace />);
        expect(markup).toContain(
          "There are no activities in this period. You can generate new sessions from published templates.",
        );
      },
    );
    const refused = new AdminApiError({ status: 403, message: "你沒有此操作權限，請聯絡管理員。" });
    kit.withQueries(
      workspaceQueries({
        "volunteer-workspace": kit.failed(refused),
        "volunteer-workspace-templates": kit.failed(),
      }),
      () => {
        const markup = renderAdminInEnglish(<VolunteerActivityWorkspace />);
        expectNoChineseText(markup);
        expect(markup).toContain(
          "You do not have permission for this action. Contact an administrator.",
        );
        expect(markup).toContain("The activity list is not available. Reload to try again.");
        expect(markup).toContain("Activities (data not available)");
        // The failure state keeps the screen's own label on its retry control.
        expect(markup).toMatch(/<button[^>]*>Reload<\/button>/);
      },
    );
  });

  test("turns a refused preview into English text, including the dates the screen checks itself", () => {
    kit.withQueries(workspaceQueries(), () => {
      kit.withMutationError(new BulkInputError("range_too_long"), () => {
        const markup = renderAdminInEnglish(<VolunteerActivityWorkspace />);
        expectNoChineseText(markup, { allow: ALLOW });
        expect(markup).toContain(
          "The date range must be within one year, and the end must not be before the start.",
        );
      });
      kit.withMutationError(new BulkInputError("invalid_date"), () => {
        expect(renderAdminInEnglish(<VolunteerActivityWorkspace />)).toContain(
          "Enter a valid date for both the start and the end, then preview again.",
        );
      });
      kit.withMutationError(
        new AdminApiError({ status: 409, message: "預覽後的資料已改變，請重新預覽並確認影響。" }),
        () => {
          expect(renderAdminInEnglish(<VolunteerActivityWorkspace />)).toContain(
            "The data changed after the preview. Preview again and confirm the impact.",
          );
        },
      );
    });
  });

  test("has English text for the draft form, and a notice for every code", () => {
    const draft = renderAdminInEnglish(<VolunteerDraftForm />);
    expectNoChineseText(draft);
    expect(draft).toContain("Create draft");
    const notices = activityWorkspaceCopy.en.notices;
    expect(notices.locked(1)).toBe("1 activity locked. New matching activities are not added.");
    expect(notices.locked(25)).toBe("25 activities locked. New matching activities are not added.");
    expect(notices.sequenceHalted).toContain("Refresh the progress first.");
    expectNoChineseInCopy(activityWorkspaceCopy.en);
    expectNoChineseInCopy(activityOperationCopy.en, { allow: [] });
    expect(activityWorkspaceCopy.en.filters.more(0)).toBe("More filters");
    expect(activityWorkspaceCopy.en.filters.more(2)).toBe("More filters (2 active)");
  });

  test("keeps the Chinese workspace as it was", () => {
    kit.withQueries(workspaceQueries(), () => {
      const markup = renderAdminInChinese(<VolunteerActivityWorkspace />);
      for (const text of [
        "義工活動工作台",
        "按香港時間管理場次、報名及出席紀錄。",
        "政策設定及待確認規則",
        "建立草稿",
        'aria-label="活動篩選"',
        "1. 選範圍 · 活動（60）",
        "選取本頁（5）",
        "鎖定已選跨頁項目（0）",
        "鎖定所有符合條件（60）",
        "已鎖定 0 場",
        "第 1 / 3 頁",
        "香港日期及時間",
        "cat_saturday",
        "待設定收容所",
        "須對應模板",
        "政策 v3",
        "待設定政策",
        "一般安排",
        "尚欠 " + FIXTURE.role + " 2 人",
        "已確認 8 / 12 · 候補 2",
        "已截止報名",
        "已結束",
      ]) {
        expect(markup, text).toContain(text);
      }
    });
  });
});

describe("the activity table in English", () => {
  test("shows a name for a template, a label for each venue and an unknown status, and the table label", () => {
    const markup = renderAdminInEnglish(
      <ActivitySchedule
        rows={kit.workspaceRows as never}
        view="table"
        ids={[kit.workspaceRows[0].id]}
        onToggle={noop}
        onOpen={noop}
        templateNames={{ cat_saturday: FIXTURE.template }}
      />,
    );
    expectNoChineseText(markup, { allow: ALLOW });
    expect(markup).toContain('aria-label="Activity table, scrolls sideways"');
    expect(markup).toContain(
      'aria-label="Select 10 Oct 2026 (Sat) 09:00 ' + FIXTURE.activity + '"',
    );
    expect(markup).toContain('checked=""');
    expect(markup).toContain(FIXTURE.template);
    // A template with no name is "Template (name not available)", and a venue key English has no
    // name for is "Other venue": English never shows a stored key as a label. Chinese keeps showing
    // both keys.
    const unnamed = renderAdminInEnglish(
      <ActivitySchedule
        rows={[kit.workspaceRows[0], kit.workspaceRows[3]] as never}
        view="table"
        ids={[]}
        onToggle={noop}
        onOpen={noop}
      />,
    );
    expectNoChineseText(unnamed, { allow: ALLOW });
    expect(unnamed).toContain("Template (name not available)");
    expect(unnamed).not.toContain("Unnamed template");
    expect(unnamed).toContain("Cat shelter");
    expect(unnamed).toContain("Other venue");
    expect(unnamed).not.toContain("cat_saturday");
    expect(unnamed).not.toContain("mystery_shelter");
    const unnamedZh = renderAdminInChinese(
      <ActivitySchedule
        rows={[kit.workspaceRows[0], kit.workspaceRows[3]] as never}
        view="table"
        ids={[]}
        onToggle={noop}
        onOpen={noop}
      />,
    );
    expect(unnamedZh).toContain("cat_saturday");
    expect(unnamedZh).toContain("mystery_shelter");
    expect(unnamedZh).not.toContain("Template (name not available)");
  });

  test("shows a calendar for a short period day by day, whatever the date today is", () => {
    // The range is given, so this does not depend on the clock.
    const calendar = (from: string, until: string) =>
      renderAdminInEnglish(
        <ActivitySchedule
          rows={kit.workspaceRows as never}
          view="calendar"
          from={from}
          until={until}
          ids={[]}
          onToggle={noop}
          onOpen={noop}
        />,
      );
    const october = calendar("2026-10-09", "2026-10-15");
    expectNoChineseText(october, { allow: ALLOW });
    expect(october).toContain("Confirmed 8 · Waitlisted 2");
    expect(october).toContain("Cat shelter · Published");
    expect(october).toContain("Dog shelter · Ended");
    // A venue English has no name for is shown on a card by the activity's own location, which the
    // card has no other place for; the table shows the location beside "Other venue".
    const november = calendar("2026-11-28", "2026-12-02");
    expect(november).toContain(FIXTURE.location + " · Cancelled");
    expect(november).not.toContain("Other venue · Cancelled");
    expect(november).not.toContain("mystery_shelter");
  });

  test("keeps the Chinese calendar card showing a venue key as stored", () => {
    const november = renderAdminInChinese(
      <ActivitySchedule
        rows={kit.workspaceRows as never}
        view="calendar"
        from="2026-11-28"
        until="2026-12-02"
        ids={[]}
        onToggle={noop}
        onOpen={noop}
      />,
    );
    expect(november).toContain("mystery_shelter · 已取消");
  });

  test("names an unnamed venue on a calendar card by its location, and by Other venue without one", () => {
    const common = volunteerCommonCopy;
    expect(common.en.shelterKey("mystery_shelter", FIXTURE.location)).toBe(FIXTURE.location);
    expect(common.en.shelterKey("mystery_shelter", "  ")).toBe("Other venue");
    expect(common.en.shelterKey("mystery_shelter")).toBe("Other venue");
    expect(common.en.shelterKey("cat", FIXTURE.location)).toBe("Cat shelter");
    expect(common.zh.shelterKey("mystery_shelter", FIXTURE.location)).toBe("mystery_shelter");
    expect(common.zh.shelterKey("cat", FIXTURE.location)).toBe("cat");
  });

  test("shows a calendar for a long period as a list of the days that have sessions", () => {
    const markup = renderAdminInEnglish(
      <ActivitySchedule
        rows={kit.workspaceRows as never}
        view="calendar"
        from="2026-01-01"
        until="2026-12-31"
        ids={[]}
        onToggle={noop}
        onOpen={noop}
      />,
    );
    expectNoChineseText(markup, { allow: ALLOW });
    expect(markup).toContain("Policy v3");
    expect(markup).toContain("Cat shelter · Published");
    expect(markup).toContain(FIXTURE.location + " · Draft");
  });
});

describe("the bulk operation form in English", () => {
  const draft = (over: Record<string, unknown> = {}) => ({
    mode: "generate",
    template: "",
    templateKeys: ["cat_saturday"],
    from: "2026-10-10",
    until: "2026-11-06",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    excluded: "",
    reason: "",
    title: "",
    description: "",
    attendance: "attended",
    correction: false,
    ...over,
  });
  const render = (over: Record<string, unknown> = {}, previewDisabled = false) =>
    renderAdminInEnglish(
      <ActivityOperationForm
        draft={draft(over) as never}
        onChange={noop}
        templates={kit.workspaceTemplates}
        previewDisabled={previewDisabled}
        onPreview={noop}
      />,
    );

  test("shows each kind of operation with its own fields and no Chinese", () => {
    const generate = render();
    expectNoChineseText(generate, { allow: ALLOW });
    for (const text of [
      "2. Preview the changes and exceptions",
      "Generate activities in bulk",
      "Copy to chosen dates",
      "Edit description",
      "Apply a published policy",
      "Close registration",
      "Cancel activities",
      "Attendance records",
      "Choose published templates (you can choose several)",
      FIXTURE.template + " · Cat shelter · 09:00–12:00",
      "Each date gets a new reference under the policy in effect.",
      "Four weeks",
      "Eight weeks",
      "Sunday",
      "Saturday",
      "Excluded dates (YYYY-MM-DD, separated by commas)",
      "Preview impact",
      "Operating rules that are still undecided cannot be published.",
    ]) {
      expect(generate, text).toContain(text);
    }
    expect(render({}, true)).toContain("disabled");

    const copy = render({ mode: "copy" });
    expect(copy).toContain("Published template or policy");
    expect(copy).toContain("Choose (or keep the source template)");
    expect(copy).toContain("Excluded dates");
    const rebind = render({ mode: "rebind" });
    expectNoChineseText(rebind, { allow: ALLOW });
    expect(rebind).toContain(">Choose</option>");
    expect(rebind).toContain("Reason for the action");
    const edit = render({ mode: "edit", title: FIXTURE.activity });
    expectNoChineseText(edit, { allow: ALLOW });
    expect(edit).toContain("choose Apply a published policy");
    expect(edit).toContain("New title");
    expect(edit).toContain("New description");
    expect(edit).not.toContain("Reason for the action");
    const attendance = render({ mode: "attendance" });
    expectNoChineseText(attendance, { allow: ALLOW });
    for (const text of [
      "Attendance status",
      "Service completed",
      "Did not attend",
      "Not recorded (needs a correction)",
      "Correct an existing record (the reason and history are kept)",
      "Reason for the action",
    ]) {
      expect(attendance, text).toContain(text);
    }
    for (const mode of ["close", "cancel"]) {
      expect(render({ mode })).toContain("Reason for the action");
    }
  });

  test("calls a venue English has no name for 'Other venue' in the template lines", () => {
    const strangers = kit.workspaceTemplates.map((t) => ({ ...t, shelter: "mystery_shelter" }));
    const markup = renderAdminInEnglish(
      <ActivityOperationForm
        draft={draft({ mode: "copy" }) as never}
        onChange={noop}
        templates={strangers}
        previewDisabled={false}
        onPreview={noop}
      />,
    );
    expect(markup).toContain(FIXTURE.template + " · Other venue · 09:00–12:00");
    expect(markup).not.toContain("mystery_shelter");
    const zh = renderAdminInChinese(
      <ActivityOperationForm
        draft={draft({ mode: "copy" }) as never}
        onChange={noop}
        templates={strangers}
        previewDisabled={false}
        onPreview={noop}
      />,
    );
    expect(zh).toContain(FIXTURE.template + " · mystery_shelter · 09:00–12:00");
  });

  test("keeps the Chinese form as it was", () => {
    const markup = renderAdminInChinese(
      <ActivityOperationForm
        draft={draft({ mode: "copy" }) as never}
        onChange={noop}
        templates={kit.workspaceTemplates}
        previewDisabled={false}
        onPreview={noop}
      />,
    );
    for (const text of [
      "2. 預覽差異及例外",
      "批量產生活動",
      "複製至指定日期",
      "已發布模板／政策",
      "請選擇（可沿用來源模板）",
      FIXTURE.template + " · cat · 09:00–12:00",
      "每個日期按有效政策產生新編號",
      "四星期",
      "星期日",
      "排除日期（YYYY-MM-DD，以逗號分隔）",
      "預覽影響",
    ]) {
      expect(markup, text).toContain(text);
    }
  });
});

describe("the bulk operation progress in English", () => {
  const panel = (operation: ReturnType<typeof kit.bulkOperation>, show = true, language = "en") => {
    const element = (
      <ActivityOperationPanel
        operation={operation as never}
        review={reviewBulkOperation(operation as never)}
        templates={kit.workspaceTemplates}
        showOperation={show}
        onToggleShow={noop}
        onRefresh={noop}
        reviewAll={false}
        onReviewAll={noop}
        reviewed={[1]}
        onReview={noop}
        sequencePending={false}
        applyPending={false}
        onSequence={noop}
        onApply={noop}
      />
    );
    return language === "en" ? renderAdminInEnglish(element) : renderAdminInChinese(element);
  };

  test("shows the summary, the notifications and every batch without Chinese", () => {
    const markup = panel(kit.bulkOperation());
    expectNoChineseText(markup, { allow: ALLOW });
    for (const text of [
      "3. Result · Generate activities in bulk",
      "Hide preview",
      "Refresh progress",
      "Snapshot saved 9 Oct 2026 (Fri) 09:00 and valid until 9 Oct 2026 (Fri) 10:00.",
      "Items that can run",
      "Skipped items",
      "Version conflicts",
      "Failed items or batches",
      "Batches that cancel or close, affect policy or capacity, correct attendance or have exceptions must be reviewed one by one.",
      "A batch has changed. Lock the range again and preview; do not reuse the old preview.",
      "Operation technical details",
      "Up to 100 sessions. Items on the same day are in the same batch.",
      "Staff follow-up: Delivered · 9 Oct 2026 (Fri) 09:30",
      "Notification: Failed",
      "Notification: Follow-up completed",
      "Notification: Accepted by the provider (not the same as delivered)",
      "Notification: Queued",
      "Notification: Awaiting follow-up",
      "Batch 1 · 10 Oct 2026 (Sat) · 1 session · Waiting to run",
      "Batch 2 · 11 Oct 2026 (Sun) · 1 session · Not completed. You can retry",
      "Batch 3 · 12 Oct 2026 (Mon) · 1 session · Data changed. Preview again",
      "This batch could not be completed and its data was restored. Check the progress, then retry.",
      "10 Oct 2026 (Sat) · " + FIXTURE.activity,
      "Policy: " + FIXTURE.template + " · Ready to run · Affected registrations to check",
      "Capacity: no current value → no preview value",
      "Capacity: 8 → 10",
      "Confirmed registrations affected: 3",
      "After: " + FIXTURE.activity + " · 11 Oct 2026 (Sun) 09:00 · Dog shelter · Capacity 10",
      "The data changed after the preview. Preview again and confirm the impact.",
      "The chosen date is not open for service. Check the weekdays and excluded dates. The session is full.",
      "Attendance can be updated for 1 and is skipped for 1",
      "Item technical details",
      "Item item-b · Template mystery_template · Policy version version-9",
      "Item item-c · Template unknown_template · Policy version not linked",
      "Policy: Policy version to check · Not completed. You can retry · Confirmed registrations affected: 3",
      "Transaction result: Not completed. You can retry",
      "Policy: No policy linked · Skipped · Affected registrations to check",
      "I have checked every date and effect in this batch",
      "Retry as the same operation",
      "Run this batch",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).not.toContain("undefined");
  });

  test("hides the batches until they are opened, and offers the ordered run when every batch is ready", () => {
    const hidden = panel(kit.bulkOperation(), false);
    expect(hidden).toContain("Show preview");
    expect(hidden).not.toContain("Batch 1");
    const readyOnly = kit.bulkOperation({
      groups: [kit.bulkOperation().groups[0], { ...kit.bulkOperation().groups[0], index: 1 }],
      notifications: [],
    });
    const markup = panel(readyOnly);
    expectNoChineseText(markup, { allow: ALLOW });
    expect(markup).toContain(
      "I have checked the dates, policies, capacity and exceptions of the remaining 2 new draft batches",
    );
    expect(markup).toContain("Run the reviewed batches in order");
    expect(markup).toContain("Each batch still runs its existing transaction one at a time.");
    expect(markup).toContain("No notification or follow-up records for this operation yet.");
  });

  test("calls a venue English has no name for 'Other venue' in the line after the change", () => {
    const text = JSON.stringify(kit.bulkOperation());
    expect(text).toContain('"shelter_key":"dog"');
    const strange = JSON.parse(
      text.replaceAll('"shelter_key":"dog"', '"shelter_key":"mystery_shelter"'),
    ) as ReturnType<typeof kit.bulkOperation>;
    const markup = panel(strange);
    expect(markup).toContain("· Other venue · Capacity 10");
    expect(markup).not.toContain("mystery_shelter");
    expect(panel(strange, true, "zh")).toContain("· mystery_shelter · 容量 10");
  });

  test("keeps the Chinese progress as it was", () => {
    const markup = panel(kit.bulkOperation(), true, "zh");
    for (const text of [
      "3. 執行結果 · 批量產生活動",
      "收起預覽",
      "更新進度",
      "前有效。每組獨立交易，同一天不拆組；執行時會重新檢查權限、政策與版本。 關閉頁面後可用本頁網址返回；先更新進度再重試。",
      "取消、關閉、政策或容量影響、出席更正及有例外的組須逐組審閱。",
      "有組別已變更，請重新鎖定範圍並預覽；不要重用舊預覽。",
      "職員跟進：已送達 · ",
      "通知：處理失敗",
      "第 1 組 · 2026-10-10 · 1 場 · 待確認執行",
      "第 2 組 · 2026-10-11 · 1 場 · 未完成，可重試",
      "這個分組未能完成，資料已回復；請查看進度後重試。",
      "政策：" + FIXTURE.template + " · 可執行 · 受影響報名人數待核對",
      "容量：未有現值 → 未有預覽值",
      "容量：8 → 10",
      "受影響已確認報名 3 人",
      FIXTURE.activity + " · ",
      "· dog · 容量 10",
      "出席可更新 1、略過 1",
      "項目 item-b · 模板 mystery_template · 政策版本 version-9",
      "項目 item-c · 模板 unknown_template · 政策版本 未綁定",
      "政策：政策版本待核對 · 未完成，可重試 · 受影響已確認報名 3 人",
      "政策：未綁定政策 · 已略過 · 受影響報名人數待核對",
      "交易結果：未完成，可重試",
      "預覽後的資料已改變，請重新預覽並確認影響。",
      "已檢查本組每個日期及影響",
      "以原操作重試",
      "執行此組",
    ]) {
      expect(markup, text).toContain(text);
    }
  });
});

describe("the activity panel in English", () => {
  const detail = {
    activity: { ...kit.workspaceRow(), description: FIXTURE.note },
    registrations: [
      {
        id: "r1",
        contact_name: FIXTURE.volunteer,
        status: "approved",
        attendance_status: "completed",
      },
      {
        id: "r2",
        contact_name: FIXTURE.volunteer,
        status: "mystery",
        attendance_status: "mystery",
      },
    ],
    total: 30,
    history_total: 40,
    history: [
      "volunteer_activity.create",
      "volunteer_activity.update",
      "volunteer_activity.clone",
      "volunteer_activity.generated",
      "volunteer_bulk.generate",
      "volunteer_bulk.attendance",
      "mystery.action",
    ].map((action, index) => ({ id: `h${index}`, action, created_at: "2026-10-09T01:00:00Z" })),
  };
  const body = (query: Record<string, unknown>, language: "en" | "zh" = "en") => {
    const element = (
      <ActivityDetailBody
        detail={{
          isPending: false,
          isError: false,
          error: null,
          data: undefined,
          refetch: noop,
          ...query,
        }}
        detailPage={2}
        historyPage={1}
        onDetailPage={noop}
        onHistoryPage={noop}
        onEdit={noop}
      />
    );
    return language === "en" ? renderAdminInEnglish(element) : renderAdminInChinese(element);
  };

  test("shows the registrations and the history with a label for each action", () => {
    const markup = body({ data: detail });
    expectNoChineseText(markup, { allow: [...ALLOW, FIXTURE.volunteer, FIXTURE.note] });
    for (const text of [
      "10 Oct 2026 (Sat) 09:00 · " + FIXTURE.location,
      "Edit this activity",
      "Registrations and attendance (30)",
      FIXTURE.volunteer + " · Approved · Completed",
      FIXTURE.volunteer + " · Unknown · Unknown",
      "Previous registrations",
      "Next registrations",
      "Operation history (40)",
      "9 Oct 2026 (Fri) 09:00 · Activity created",
      "Activity updated",
      "Activity duplicated",
      "Activity generated from a template",
      "Bulk operation: activities generated",
      "Bulk operation: attendance recorded",
      "Other action",
      "Previous history",
      "Page 1",
      "Next history",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).not.toContain("mystery");
  });

  test("tells the loading and the failure in English", () => {
    expect(body({ isPending: true })).toContain("Loading details…");
    const failure = body({
      isError: true,
      error: new AdminApiError({ status: 404, message: "找不到這筆記錄，請返回名單重新選擇。" }),
    });
    expectNoChineseText(failure);
    expect(failure).toContain("This record was not found. Go back to the list and choose again.");
    expect(failure).toContain(">Retry</button>");
  });

  test("keeps the Chinese panel as it was", () => {
    const markup = body({ data: detail }, "zh");
    for (const text of [
      "編輯此活動",
      "報名及出席（30）",
      FIXTURE.volunteer + " · approved · completed",
      FIXTURE.volunteer + " · mystery · mystery",
      "上一頁報名",
      "操作紀錄（40）",
      " · volunteer_activity.create",
      " · mystery.action",
      "第1頁",
    ]) {
      expect(markup, text).toContain(text);
    }
  });
});
