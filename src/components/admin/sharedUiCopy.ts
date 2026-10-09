import { defineAdminCopy } from "./i18n/copy";

/** Copy for the shared admin building blocks: the load failure state, the table and the pager. */
export const sharedUiCopy = defineAdminCopy({
  zh: {
    loadFailure: {
      title: "無法載入",
      guidance: "請重試。若問題持續，請提供錯誤編號",
      retrying: "重試中…",
      retry: "重試",
      // The Chinese half adds no line by design; wording for it is drafted for the owner in
      // docs/superpowers/plans/sp5b-owner-drafts.md.
      classLines: {
        session: null as string | null,
        sessionAction: null as string | null,
        forbidden: null as string | null,
        forbiddenAction: null as string | null,
        notFound: null as string | null,
        server: null as string | null,
        network: null as string | null,
      },
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
      classLines: {
        session: "Your session has ended.",
        sessionAction: "Sign in again.",
        forbidden: "You don't have access to this.",
        forbiddenAction: "Go to a page your role can open.",
        notFound: "This record could not be found. Go back to the list and check it still exists.",
        server: "The server had a problem. Try again in a moment.",
        network: "Could not reach the server. Check your connection and try again.",
      },
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
