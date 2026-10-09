import { defineAdminCopy } from "../i18n/copy";
import { formatAdminDate } from "../i18n/format";

/** Copy for the team and governance screen. The names and positions staff type are data. */
export const governanceCopy = defineAdminCopy({
  zh: {
    title: "團隊與管治",
    add: "新增成員",
    loading: "載入中…",
    loadFailed: "無法載入團隊名單",
    table: {
      name: "姓名",
      position: "職銜",
      sortOrder: "排序",
      effectiveDate: "生效日期",
      status: "狀態",
      inOffice: "在任",
      steppedDown: "已卸任",
      edit: "編輯",
      stepDown: "卸任",
      /** The effective date: the stored `YYYY-MM-DD` text in Chinese. */
      date: (value: string) => String(value),
    },
    stepDownFailed: "卸任操作失敗，請再試一次。",
    form: {
      name: "姓名",
      position: "職銜",
      sortOrder: "排序",
      effectiveDate: "生效日期",
      saveFailed: "儲存失敗，請檢查資料後再試一次。",
      save: "儲存",
      cancel: "取消",
    },
  },
  en: {
    title: "Team and governance",
    add: "Add member",
    loading: "Loading…",
    loadFailed: "Could not load the team list",
    table: {
      name: "Name",
      position: "Position",
      sortOrder: "Sort order",
      effectiveDate: "Effective date",
      status: "Status",
      inOffice: "In office",
      steppedDown: "Stepped down",
      edit: "Edit",
      stepDown: "Step down",
      date: (value: string) => formatAdminDate(value, "en"),
    },
    stepDownFailed: "Could not mark the member as stepped down. Try again.",
    form: {
      name: "Name",
      position: "Position",
      sortOrder: "Sort order",
      effectiveDate: "Effective date",
      saveFailed: "Could not save. Check the details and try again.",
      save: "Save",
      cancel: "Cancel",
    },
  },
});
