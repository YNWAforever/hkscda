import { defineAdminCopy } from "../i18n/copy";
import { formatAdminDateTime } from "../i18n/format";

/**
 * Copy for the task overview page. The text of each card (its label and guidance) is not
 * here: it is looked up by the card's key in `src/lib/operations/taskCardText.ts`, which
 * the server also reads.
 */
export const operationsCopy = defineAdminCopy({
  zh: {
    page: {
      title: "待辦總覽",
      description: "按你目前的職員權限顯示工作量。未能讀取的來源會顯示未知，請到工作區核對及處理。",
    },
    guidance: {
      heading: "工作起步建議",
      intro: "依目前職員權限列出常用步驟；按個案情況核對資料後再處理。",
      step: (position: number) => `步驟 ${position}`,
      unavailable: "未能讀取",
      // Kept as the legacy zh-HK date and time, so the Chinese screen is unchanged.
      oldest: (oldestAt: string) =>
        `最早：${new Date(oldestAt).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong" })}`,
      openWorkspace: "開啟工作區",
    },
    states: {
      checkingIdentity: "正在核對職員身份…",
      identityUnconfirmed: "未能確認有效職員身份，請重新登入。",
      loading: "正在載入待辦…",
    },
  },
  en: {
    page: {
      title: "Task overview",
      description:
        "Shows the workload for your current access. A source that could not be read is shown as unknown: open its workspace to check and handle it.",
    },
    guidance: {
      heading: "Suggested first steps",
      intro:
        "Common steps for your current staff access. Check the details of each case before you act.",
      step: (position: number) => `Step ${position}`,
      unavailable: "Could not be read",
      oldest: (oldestAt: string) => `Oldest: ${formatAdminDateTime(oldestAt, "en")}`,
      openWorkspace: "Open workspace",
    },
    states: {
      checkingIdentity: "Checking your staff account…",
      identityUnconfirmed: "Could not confirm an active staff account. Sign in again.",
      loading: "Loading tasks…",
    },
  },
});
