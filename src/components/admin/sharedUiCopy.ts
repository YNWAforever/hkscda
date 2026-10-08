import { defineAdminCopy } from "./i18n/copy";

/** Copy for the shared admin building blocks: the load failure state, the table and the pager. */
export const sharedUiCopy = defineAdminCopy({
  zh: {
    loadFailure: {
      title: "無法載入",
      guidance: "請重試。若問題持續，請提供錯誤編號",
      retrying: "重試中…",
      retry: "重試",
    },
    dataTable: {
      empty: "沒有結果",
    },
    tablePager: {
      defaultLabel: "資料",
      navLabel: (label: string) => `${label}分頁`,
      range: (first: number, last: number, total: number) =>
        `顯示第 ${first}–${last} 項，共 ${total} 項`,
      rangeOfUnknownTotal: (page: number, first: number, last: number) =>
        `第 ${page} 頁（第 ${first}–${last} 項）`,
      previous: "上一頁",
      next: "下一頁",
    },
  },
  en: {
    loadFailure: {
      title: "Could not load",
      guidance: "Try again. If the problem continues, quote this error reference:",
      retrying: "Retrying…",
      retry: "Retry",
    },
    dataTable: {
      empty: "No results",
    },
    tablePager: {
      defaultLabel: "Records",
      navLabel: (label: string) => `${label} pagination`,
      range: (first: number, last: number, total: number) => `Showing ${first}–${last} of ${total}`,
      rangeOfUnknownTotal: (page: number, first: number, last: number) =>
        `Page ${page} (showing ${first}–${last})`,
      previous: "Previous",
      next: "Next",
    },
  },
});
