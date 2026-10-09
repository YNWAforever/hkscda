import { defineAdminCopy } from "../i18n/copy";
import { formatAdminNumber } from "../i18n/format";

/** Copy for the screen that manages shared sources, venues and qualification names (`VolunteerPolicySources`). */
export const policySourcesCopy = defineAdminCopy({
  zh: {
    title: "共用來源、場地及資格",
    sections: { registry: "場地與資格", publish: "來源發布" },
    intro: "共用預設 → 場地 → 模板。來源變更只影響之後的政策預覽；已發布場次保留原有完整版本。",
    back: "返回模板設定",
    registry: {
      title: "管理場地及資格名稱",
      kind: "類別",
      kinds: { shelter: "服務場地", credential: "資格／技能" },
      entry: "新增或修改",
      addNew: "新增",
      label: "顯示名稱",
      timezone: "時區",
      location: "地點",
      reason: "更改原因",
      save: "儲存名稱與資料",
      failed: "未能儲存，請核對資料或重新載入版本。",
      saved: "已儲存。",
    },
    publish: {
      title: "發布共用或場地來源",
      intro:
        "先在模板設定編輯並儲存所需完整規則，再選擇草稿作來源。場地來源可用「回復繼承」引用共用設定；模板可逐項引用場地或共用設定。",
      level: "來源層",
      shared: "共用預設",
      draft: "使用已儲存草稿",
      choose: "請選擇",
      draftOption: (name: string, revision: number) => `${name}（草稿 ${revision}）`,
      preview: "預覽來源變更",
      previewFailed: "草稿未完整或版本已改變，請先返回模板設定核對。",
      source: (name: string, capacity: number | undefined) =>
        `來源：${name} · 義工容量 ${capacity ?? ""}`,
      /** What separates the names of the templates. */
      nameSeparator: "、",
      templates: (names: string) => `引用此來源的模板：${names || "目前沒有"}`,
      note: "不會直接改動已發布場次；各模板須再預覽及發布才套用。",
      reason: "發布原因",
      confirm: "確認發布來源",
      failed: "來源已變更或預覽過期，請重新預覽。",
      published: "來源已發布。",
    },
    loadFailed: "未能載入設定。",
  },
  en: {
    title: "Shared sources, venues and qualifications",
    sections: { registry: "Venues and qualifications", publish: "Publish a source" },
    intro:
      "Shared default → venue → template. A source change only affects later policy previews. Sessions that are already published keep their full earlier version.",
    back: "Back to template settings",
    registry: {
      title: "Manage venue and qualification names",
      kind: "Kind",
      kinds: { shelter: "Service venue", credential: "Qualification or skill" },
      entry: "Add or edit",
      addNew: "Add new",
      label: "Display name",
      timezone: "Time zone",
      location: "Location",
      reason: "Reason for the change",
      save: "Save the name and details",
      failed: "Could not save. Check the details or reload the latest version, then try again.",
      saved: "Saved.",
    },
    publish: {
      title: "Publish a shared or venue source",
      intro:
        'First edit and save the complete rules you need in the template settings, then choose that draft as the source. A venue source can refer to the shared settings with "Revert to inherited". A template can refer to venue or shared settings one setting at a time.',
      level: "Source level",
      shared: "Shared default",
      draft: "Use a saved draft",
      choose: "Choose",
      draftOption: (name: string, revision: number) =>
        `${name} (draft ${formatAdminNumber(revision, "en")})`,
      preview: "Preview the source change",
      previewFailed:
        "The draft is not complete or its version has changed. Go back to the template settings and check it.",
      source: (name: string, capacity: number | undefined) =>
        `Source: ${name} · Volunteer capacity ${capacity === undefined ? "not a fixed number" : formatAdminNumber(capacity, "en")}`,
      nameSeparator: ", ",
      templates: (names: string) =>
        `Templates that use this source: ${names || "none at the moment"}`,
      note: "Published sessions are not changed directly. Each template has to be previewed and published again before the change applies.",
      reason: "Reason for publishing",
      confirm: "Confirm and publish the source",
      failed: "The source has changed or the preview has expired. Preview it again.",
      published: "Source published.",
    },
    loadFailed: "Could not load the settings. Reload the page and try again.",
  },
});
