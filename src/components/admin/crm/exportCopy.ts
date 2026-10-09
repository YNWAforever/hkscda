import { defineAdminCopy } from "../i18n/copy";
import { formatAdminNumber, pluralCount } from "../i18n/format";
import type { ExportFailure } from "./exportFailure";

/**
 * Copy for the supporter and donation CSV export bar, including the message for each
 * `ExportFailure`. The button labels shared with other screens (`Supporters CSV`, `Exporting...`)
 * come from `pageCopy/sharedCopy.ts`.
 */
export const exportCopy = defineAdminCopy({
  zh: {
    retry: "重試相同條件",
    downloaded: "下載已開始。",
    backgroundExport: "建立背景匯出",
    creatingBackground: "正在建立背景匯出…",
    downloadComplete: "下載完整 CSV",
    cancel: "取消",
    progress: (processed: number, total: number, ready: boolean) =>
      `背景匯出：${processed}/${total} 筆；${ready ? "可下載" : "處理中"}`,
    failure: (failure: ExportFailure): string => {
      switch (failure.code) {
        case "session_expired":
          return "登入已過期，請重新登入後再試。";
        case "forbidden":
          return "你沒有權限匯出這些資料。";
        case "background_limit":
          return "背景匯出最多 20,000 筆。請縮小篩選後重試。";
        case "immediate_limit":
          return `符合${
            failure.total === null ? "的" : ` ${formatAdminNumber(failure.total, "zh")} 筆`
          }資料超過 5,000 筆即時匯出上限。請縮小篩選後重試；或建立背景匯出。`;
        case "server_error":
          return "伺服器未能完成匯出，請稍後重試。";
        case "incomplete":
          return "匯出未完成，請重試。";
        case "sign_in_required":
          return "請登入後再試。";
        case "network":
          return "網絡或下載失敗，請檢查連線後重試。";
        case "background_failed":
          return "背景匯出未能完成，請重新建立。";
        case "progress_failed":
          return "無法更新匯出進度，請重新整理後再試。";
        case "create_failed":
          return failure.detail ?? "無法建立背景匯出。";
        case "not_signed_in":
          return "未登入";
        case "cancel_failed":
          return "取消失敗，請重新整理後再試。";
        case "download_failed":
          return "下載失敗，請確認權限後再試。";
      }
    },
  },
  en: {
    retry: "Retry with the same filters",
    downloaded: "Download started.",
    backgroundExport: "Create background export",
    creatingBackground: "Creating the background export…",
    downloadComplete: "Download full CSV",
    cancel: "Cancel",
    progress: (processed: number, total: number, ready: boolean) =>
      `Background export: ${processed} of ${pluralCount(total, "row")}. ${
        ready ? "Ready to download." : "Processing."
      }`,
    failure: (failure: ExportFailure): string => {
      switch (failure.code) {
        case "session_expired":
          return "Your sign-in has expired. Sign in again, then retry the export.";
        case "forbidden":
          return "You do not have permission to export this data.";
        case "background_limit":
          return "A background export can hold up to 20,000 rows. Narrow the filters and try again.";
        case "immediate_limit":
          return `${
            failure.total === null
              ? "The matching rows exceed"
              : `${pluralCount(failure.total, "matching row")} exceed`
          } the immediate export limit of 5,000. Narrow the filters and try again, or create a background export.`;
        case "server_error":
          return "The server could not finish the export. Try again later.";
        case "incomplete":
          return "The export did not finish. Try again.";
        case "sign_in_required":
          return "Sign in before exporting.";
        case "network":
          return "The network or download failed. Check your connection and try again.";
        case "background_failed":
          return "The background export failed. Create it again.";
        case "progress_failed":
          return "Could not refresh the export progress. Reload the page and try again.";
        case "create_failed":
          return failure.detail ?? "Could not create the background export. Try again.";
        case "not_signed_in":
          return "Not signed in. Sign in again.";
        case "cancel_failed":
          return "Could not cancel the export. Reload the page and try again.";
        case "download_failed":
          return "The download failed. Check your access and try again.";
      }
    },
  },
});
