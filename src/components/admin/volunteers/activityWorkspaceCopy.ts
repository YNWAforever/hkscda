import { defineAdminCopy } from "../i18n/copy";
import { formatAdminNumber, pluralCount } from "../i18n/format";
import { volunteerWorkspaceCopy } from "../volunteerWorkspaceCopy";

/**
 * Copy for the activity workspace's list and filters (`VolunteerActivityWorkspace`), the table and
 * calendar of activities (`ActivitySchedule`) and the draft form (`VolunteerDraftForm`). The bulk
 * operation form, its progress and the activity detail are in `activityOperationCopy`.
 */
export const activityWorkspaceCopy = defineAdminCopy({
  zh: {
    title: "義工活動工作台",
    /** The calendar route's `h1`. Chinese keeps the one heading both routes have always had. */
    calendarTitle: "義工活動工作台",
    intro: "按香港時間管理場次、報名及出席紀錄。",
    policyLink: "政策設定及待確認規則",
    /** The status of an activity or of one step of a bulk operation. */
    states: {
      pending: "待確認執行",
      ready: "可執行",
      applied: "已完成",
      skipped: "已略過",
      conflicted: "資料已變更，須重新預覽",
      failed: "未完成，可重試",
      draft: "草稿",
      published: "已發布",
      cancelled: "已取消",
      completed: "已完成",
      closed: "已結束",
      confirmed_group: "已確認團體",
      no_confirmed_group: "未有已確認團體",
    },
    /** The notice shown under the filters; each is a code the page stores, never a sentence. */
    notices: {
      filterChanged: "篩選已變更，已清除跨頁選取。",
      locked: (count: number) => `已鎖定 ${count} 場活動；新增符合條件的活動不會加入。`,
      sequenceHalted: "順序執行已停止；請先更新進度。失敗組可按原操作重試，衝突組須重新預覽。",
      sequenceDone: "所有已審閱草稿組已順序完成。",
      editSelected: "已選取此活動，請鎖定選取後預覽修改。",
    },
    filters: {
      label: "活動篩選",
      search: "搜尋名稱或地點",
      from: "由",
      until: "至",
      more: (active: number) => `更多篩選${active > 0 ? `（${active} 項已啟用）` : ""}`,
      shelter: "收容所",
      template: "模板",
      allTemplates: "全部模板",
      status: "狀態",
      allStatuses: "全部狀態",
      scenario: "團體安排",
      allScenarios: "全部安排",
      policy: "政策",
      allPolicies: "全部",
      policyReady: "已綁定政策",
      policyMissing: "待綁定政策",
      shortage: "未達政策最低人手",
      next30: "今天起30天",
      previous: "上一期",
      next: "下一期",
      past: "歷史活動",
      allDates: "所有日期",
      listView: "列表檢視",
      calendarView: "月曆檢視",
      sort: "排序",
      earliestFirst: "日期由早至晚",
      latestFirst: "日期由晚至早",
    },
    reload: "重新載入",
    /** What separates an error message from the button after it: nothing in Chinese, a space in English. */
    errorGap: "",
    list: {
      label: "活動列表",
      heading: (total: number | null) => `1. 選範圍 · 活動（${total ?? "資料暫不可用"}）`,
      selectPage: (count: number) => `選取本頁（${count}）`,
      lockSelected: (count: number) => `鎖定已選跨頁項目（${count}）`,
      lockAll: (total: number) => `鎖定所有符合條件（${total}）`,
      clear: "清除選取",
      locked: (count: number) => `已鎖定 ${count} 場`,
      snapshot: (created: string, expires: string) =>
        `快照 ${created} 建立；${expires}前有效。新增符合條件的活動不會加入。`,
      updating: "正在更新活動…",
      loading: "正在載入活動…",
      unavailable: "活動列表暫不可用，請重新載入。",
      noMatch: "沒有符合篩選的活動，請調整條件。",
      empty: "這段日期尚未有活動，可從已發布模板產生新場次。",
      previous: "上一頁",
      next: "下一頁",
      page: (page: number, pages: number) => `第 ${page} / ${pages} 頁`,
    },
    /** The table and calendar of activities. */
    schedule: {
      select: (when: string, title: string) => `選取 ${when} ${title}`,
      tableLabel: "活動表格，可水平捲動",
      columns: {
        select: "選取",
        time: "香港日期及時間",
        activity: "活動／地點",
        policy: "模板／政策",
        staffing: "報名及人手",
        status: "狀態",
      },
      until: (end: string) => `至 ${end}`,
      shelterUnset: "待設定收容所",
      templateUnset: "須對應模板",
      /**
       * A template: Chinese shows its key, as it always has; English shows the name staff gave it, or
       * "Template (name not available)" when the list of templates has none for this key.
       */
      template: (key: string, _name: string | undefined) => key,
      policyVersion: (revision: number) => `政策 v${revision}`,
      policyUnset: "待設定政策",
      scenarios: {
        confirmed_group: "已確認團體",
        no_confirmed_group: "未有已確認團體",
        other: "一般安排",
      },
      staffing: (approved: number, capacity: number, waitlisted: number) =>
        `已確認 ${approved} / ${capacity} · 候補 ${waitlisted}`,
      shortage: (role: string, missing: number) => `尚欠 ${role} ${missing} 人`,
      registrationsClosed: "已截止報名",
      calendarLabel: "香港日期月曆",
      calendarNote: "月曆顯示本頁最多25場活動；使用下方頁碼查看其餘場次。每格可開啟活動詳情。",
      weekday: (index: number) => `星期${["日", "一", "二", "三", "四", "五", "六"][index]}`,
      cardStaffing: (approved: number, waitlisted: number) =>
        `已確認 ${approved} · 候補 ${waitlisted}`,
    },
    /** The form that creates an activity as a draft. */
    draft: {
      open: "建立草稿",
      note: "草稿不接受報名。發布場次前須選定模板、日期及已核准的政策。",
      title: "活動名稱",
      location: "地點",
      startsAt: "開始時間（香港）",
      endsAt: "結束時間（香港）",
      capacity: "預計人數",
      save: "儲存草稿",
    },
  },
  en: {
    title: volunteerWorkspaceCopy.en.pages.activities.label,
    calendarTitle: volunteerWorkspaceCopy.en.pages.calendar.label,
    intro: "Manage sessions, registrations and attendance records in Hong Kong time.",
    policyLink: "Policy settings and rules awaiting confirmation",
    states: {
      pending: "Waiting to run",
      ready: "Ready to run",
      applied: "Completed",
      skipped: "Skipped",
      conflicted: "Data changed. Preview again",
      failed: "Not completed. You can retry",
      draft: "Draft",
      published: "Published",
      cancelled: "Cancelled",
      completed: "Completed",
      closed: "Ended",
      confirmed_group: "Confirmed group",
      no_confirmed_group: "No confirmed group",
    },
    notices: {
      filterChanged: "The filters changed, so the selection across pages was cleared.",
      locked: (count: number) =>
        `${pluralCount(count, "activity", "activities")} locked. New matching activities are not added.`,
      sequenceHalted:
        "Running in order stopped. Refresh the progress first. A failed batch can be retried as the same operation, and a batch with a conflict needs a new preview.",
      sequenceDone: "All reviewed draft batches ran in order.",
      editSelected: "This activity is selected. Lock the selection, then preview the change.",
    },
    filters: {
      label: "Activity filters",
      search: "Search by name or location",
      from: "From",
      until: "To",
      more: (active: number) =>
        `More filters${active > 0 ? ` (${formatAdminNumber(active, "en")} active)` : ""}`,
      shelter: "Shelter",
      template: "Template",
      allTemplates: "All templates",
      status: "Status",
      allStatuses: "All statuses",
      scenario: "Group arrangement",
      allScenarios: "All arrangements",
      policy: "Policy",
      allPolicies: "All",
      policyReady: "Policy linked",
      policyMissing: "Policy not linked yet",
      shortage: "Below the policy's minimum staffing",
      next30: "Next 30 days from today",
      previous: "Previous period",
      next: "Next period",
      past: "Past activities",
      allDates: "All dates",
      listView: "List view",
      calendarView: "Calendar view",
      sort: "Sort",
      earliestFirst: "Date, earliest first",
      latestFirst: "Date, latest first",
    },
    reload: "Reload",
    errorGap: " ",
    list: {
      label: "Activity list",
      heading: (total: number | null) =>
        `1. Choose the range · Activities (${total === null ? "data not available" : formatAdminNumber(total, "en")})`,
      selectPage: (count: number) => `Select this page (${formatAdminNumber(count, "en")})`,
      lockSelected: (count: number) =>
        `Lock the items selected across pages (${formatAdminNumber(count, "en")})`,
      lockAll: (total: number) => `Lock all matches (${formatAdminNumber(total, "en")})`,
      clear: "Clear selection",
      locked: (count: number) => `${pluralCount(count, "session")} locked`,
      snapshot: (created: string, expires: string) =>
        `Snapshot created ${created} and valid until ${expires}. New matching activities are not added.`,
      updating: "Updating activities…",
      loading: "Loading activities…",
      unavailable: "The activity list is not available. Reload to try again.",
      noMatch: "No activities match the filters. Change the filters.",
      empty:
        "There are no activities in this period. You can generate new sessions from published templates.",
      previous: "Previous page",
      next: "Next page",
      page: (page: number, pages: number) =>
        `Page ${formatAdminNumber(page, "en")} of ${formatAdminNumber(pages, "en")}`,
    },
    schedule: {
      select: (when: string, title: string) => `Select ${when} ${title}`,
      tableLabel: "Activity table, scrolls sideways",
      columns: {
        select: "Select",
        time: "Hong Kong date and time",
        activity: "Activity and location",
        policy: "Template and policy",
        staffing: "Registrations and staffing",
        status: "Status",
      },
      until: (end: string) => `to ${end}`,
      shelterUnset: "Shelter not set",
      templateUnset: "Needs a template",
      template: (_key: string, name: string | undefined) =>
        name?.trim() ? name : "Template (name not available)",
      policyVersion: (revision: number) => `Policy v${revision}`,
      policyUnset: "Policy not set",
      scenarios: {
        confirmed_group: "Confirmed group",
        no_confirmed_group: "No confirmed group",
        other: "Standard arrangement",
      },
      staffing: (approved: number, capacity: number, waitlisted: number) =>
        `Confirmed ${formatAdminNumber(approved, "en")} / ${formatAdminNumber(capacity, "en")} · Waitlisted ${formatAdminNumber(waitlisted, "en")}`,
      shortage: (role: string, missing: number) =>
        `${role} needs ${pluralCount(missing, "more person", "more people")}`,
      registrationsClosed: "Registration closed",
      calendarLabel: "Hong Kong date calendar",
      calendarNote:
        "The calendar shows up to 25 activities on this page. Use the page controls below for the rest. Open any entry for activity details.",
      weekday: (index: number) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][index],
      cardStaffing: (approved: number, waitlisted: number) =>
        `Confirmed ${formatAdminNumber(approved, "en")} · Waitlisted ${formatAdminNumber(waitlisted, "en")}`,
    },
    draft: {
      open: "Create draft",
      note: "A draft does not take registrations. Before publishing the session, choose a template, a date and an approved policy.",
      title: "Activity name",
      location: "Location",
      startsAt: "Start time (Hong Kong)",
      endsAt: "End time (Hong Kong)",
      capacity: "Expected number of people",
      save: "Save draft",
    },
  },
});
