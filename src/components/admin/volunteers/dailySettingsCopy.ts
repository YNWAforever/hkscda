import { defineAdminCopy } from "../i18n/copy";
import { formatAdminNumber, pluralCount } from "../i18n/format";
import { volunteerCommonCopy } from "./volunteerCommonCopy";

/** What the screen last did, as a code. */
export type DailyNotice = "preview_updated" | "published";

/** The prefix of a quota's scope key: `all`, or the key of one venue. */
function scopeVenue(scopeKey: string): string {
  return scopeKey.split(":")[0];
}

/** Copy for the daily volunteer quota screen (`VolunteerDailySettings`). */
export const dailySettingsCopy = defineAdminCopy({
  zh: {
    title: "全日義工配額",
    intro: "同一範圍及日期的場次共用同一配額。先預覽全日名單影響，再發布；不會自動取消已有報名。",
    back: "返回義工政策設定",
    sections: { quota: "全日配額", release: "晚期補位", publish: "發布核對" },
    loading: "讀取全日設定中…",
    failed: "未能處理設定，請重試。",
    notices: {
      preview_updated: "全日影響預覽已更新；請核對後發布。",
      published: "全日配額已發布；同一天所有場次立即使用同一修訂。",
    },
    choose: "選擇日期及配額",
    pleaseChoose: "請選擇",
    /** The name of the scope of a quota in the list of dates: all venues, or one. */
    scopeName: (scopeKey: string): string => {
      if (scopeKey.startsWith("all:")) return "跨場地";
      if (scopeKey.startsWith("dog:")) return "狗舍";
      return "貓舍";
    },
    /** What separates the tiers a quota applies to. */
    tierSeparator: "／",
    option: (date: string, scope: string, tiers: string) => `${date} · ${scope} · ${tiers}每日配額`,
    none: "尚未生成設有每日配額的場次。請先在義工政策設定發布政策及建立場次。",
    heading: (date: string, revision: number, dirty: boolean) =>
      `${date} · 修訂 ${revision}${dirty ? "（尚未發布）" : ""}`,
    current: (limit: string, sessions: number) =>
      `目前每日上限：${limit}。共有 ${sessions} 場受同一配額影響。`,
    /** A daily maximum as a short phrase. */
    limit: (state: string, value: number | undefined) => {
      if (state === "value") return String(value);
      if (state === "unlimited") return "無上限";
      return "未決定";
    },
    fields: {
      mode: "每日名額模式",
      modeOptions: { value: "指定數量", unlimited: "無上限" },
      places: "每日名額",
      counting: "計數方式",
      countingOptions: {
        undecided: "未決定",
        distinct_people: "同一人全日計一次",
        attendances: "每個確認時段計一次",
      },
      tiers: "受配額限制的級別",
      groupVisitors: "計入團體訪客人次（未有訪客身份時不可按不同人計數）",
    },
    release: {
      title: "每日晚期補位",
      text: "只放寬每日分項；各場總容量、必要資格及報名截止仍然適用。門檻按同一範圍全日已確認人次計算。",
      semantics: "釋放方式",
      semanticsOptions: { notSet: "待設定", dynamic: "動態重新計算", once: "一次釋放後不收回" },
      hours: "開始前小時",
      anchor: "全日時段基準",
      anchorOptions: { unresolved: "未決定", first_session: "當日首場", last_session: "當日末場" },
      operator: "門檻比較",
      operatorOptions: { lt: "少於", lte: "不多於" },
      threshold: "已確認人次門檻",
      thresholdTiers: "門檻計算的級別",
      newMaximum: "補位後每日上限",
      receivingTiers: "可補位級別",
      credentialMode: "補位資格組合",
      credentialModeOptions: { all: "全部所選資格", any: "任何所選資格" },
      credentials: "必要補位資格",
      weekdayMode: "星期限制",
      weekdayModeOptions: { preserve: "保留原有星期限制", override: "按以下補位星期" },
      weekdays: "補位星期",
      remove: "移除此補位規則",
      add: "新增每日補位規則",
    },
    preview: "預覽全日影響",
    discard: "放棄未發布變更",
    publish: {
      title: "發布前核對",
      summary: (before: string, after: string, occupied: number, sessions: number) =>
        `每日名額由 ${before} 改為 ${after}；目前已計 ${occupied}，適用全日 ${sessions} 場。以上補位設定亦會取代當日版本。`,
      reason: "發布原因",
      confirm: "確認發布全日配額",
    },
  },
  en: {
    title: "Daily volunteer quota",
    intro:
      "Sessions in the same scope and on the same date share one quota. Preview the effect on the whole day's list first, then publish. Existing registrations are not cancelled automatically.",
    back: "Back to volunteer policy settings",
    sections: { quota: "Daily quota", release: "Late release", publish: "Check before publishing" },
    loading: "Loading the daily settings…",
    failed: "Could not process the settings. Try again.",
    notices: {
      preview_updated: "The effect on the whole day is updated. Check it, then publish.",
      published:
        "The daily quota is published. Every session on that day uses the same revision straight away.",
    },
    choose: "Choose a date and quota",
    pleaseChoose: "Choose",
    scopeName: (scopeKey: string) => {
      if (scopeKey.startsWith("all:")) return "All venues";
      return volunteerCommonCopy.en.shelterName(scopeVenue(scopeKey));
    },
    tierSeparator: ", ",
    option: (date: string, scope: string, tiers: string) =>
      `${date} · ${scope} · Daily quota for ${tiers}`,
    none: "No sessions with a daily quota have been created yet. Publish a policy and create sessions in the volunteer policy settings first.",
    heading: (date: string, revision: number, dirty: boolean) =>
      `${date} · Revision ${formatAdminNumber(revision, "en")}${dirty ? " (not published yet)" : ""}`,
    current: (limit: string, sessions: number) =>
      `The current daily maximum is ${limit}. ${pluralCount(sessions, "session")} share this quota.`,
    limit: (state: string, value: number | undefined) => {
      if (state === "value") return formatAdminNumber(value, "en");
      if (state === "unlimited") return "Unlimited";
      return "Undecided";
    },
    fields: {
      mode: "Daily places mode",
      modeOptions: { value: "Fixed number", unlimited: "Unlimited" },
      places: "Daily places",
      counting: "Counting method",
      countingOptions: {
        undecided: "Undecided",
        distinct_people: "Count each person once a day",
        attendances: "Count each confirmed time slot once",
      },
      tiers: "Tiers the quota applies to",
      groupVisitors:
        "Count group visitor attendances (without a visitor profile they cannot be counted as different people)",
    },
    release: {
      title: "Daily late release",
      text: "This only relaxes the daily part. Each session's total capacity, required qualifications and registration deadline still apply. The threshold uses the confirmed attendances for the whole day in the same scope.",
      semantics: "Release mode",
      semanticsOptions: {
        notSet: "Not set yet",
        dynamic: "Dynamic: recalculated",
        once: "One-off: not taken back after release",
      },
      hours: "Hours before the start",
      anchor: "Daily time basis",
      anchorOptions: {
        unresolved: "Undecided",
        first_session: "First session of the day",
        last_session: "Last session of the day",
      },
      operator: "Threshold comparison",
      operatorOptions: { lt: "Fewer than", lte: "No more than" },
      threshold: "Threshold of confirmed attendances",
      thresholdTiers: "Tiers counted towards the threshold",
      newMaximum: "Daily maximum after release",
      receivingTiers: "Tiers that can receive places",
      credentialMode: "Qualification combination for release",
      credentialModeOptions: {
        all: "All selected qualifications",
        any: "Any selected qualification",
      },
      credentials: "Qualifications required for release",
      weekdayMode: "Weekday limit",
      weekdayModeOptions: {
        preserve: "Keep the existing weekday limit",
        override: "Use the weekdays below",
      },
      weekdays: "Weekdays for release",
      remove: "Remove this late release rule",
      add: "Add a daily late release rule",
    },
    preview: "Preview the effect on the whole day",
    discard: "Discard unpublished changes",
    publish: {
      title: "Check before publishing",
      summary: (before: string, after: string, occupied: number, sessions: number) =>
        `The daily places change from ${before} to ${after}. ${formatAdminNumber(occupied, "en")} are counted so far, and the change applies to ${pluralCount(sessions, "session")} that day. The late release settings above also replace the settings for that day.`,
      reason: "Reason for publishing",
      confirm: "Confirm and publish the daily quota",
    },
  },
});
