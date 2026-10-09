import { defineAdminCopy } from "../i18n/copy";
import { formatAdminNumber, pluralCount } from "../i18n/format";

/**
 * Copy for the volunteer directory (`VolunteerDirectory`, `DirectoryResults`), the profile search on
 * the verification page (`QualificationProfileSearch`) and the reviewer bulk assignment panel
 * (`VolunteerReviewBulkPanel`).
 */
export const volunteerDirectoryCopy = defineAdminCopy({
  zh: {
    /** A profile's status in the directory. */
    statuses: {
      pending: "待核實",
      active: "已啟用",
      suspended: "已暫停",
    },
    /** A volunteer's tier. */
    tiers: {
      newcomer: "新手義工",
      regular: "恆常義工",
      senior: "資深義工",
    },
    form: {
      nameOrEmail: "姓名或帳戶電郵",
      nameOrEmailPlaceholder: "搜尋完整或部分姓名／電郵",
      status: "身份狀態",
      allStatuses: "全部身份",
      tier: "義工級別",
      allTiers: "全部級別",
      search: "搜尋",
      clear: "清除篩選",
    },
    note: "電郵驗證只代表帳戶電郵已確認；義工身份及資格須由職員按證據核實。",
    loading: "正在載入義工名冊…",
    loadFailed: "未能載入義工名冊。搜尋條件已保留。",
    reload: "重新載入",
    results: {
      summary: (total: number, page: number, pages: number) =>
        `共 ${total} 位義工 · 第 ${page} / ${pages} 頁 · 包括未曾報名的身份`,
      noMatchTitle: "找不到符合條件的義工",
      noMatchHint: "請調整搜尋字詞或清除篩選後再試。",
      emptyTitle: "尚未有義工身份",
      emptyHint: "已建立的義工身份會在這裏顯示，包括尚未報名的人士。",
      unnamed: "未填姓名",
      select: (name: string) => `選取 ${name}`,
      noEmail: "未提供電郵",
      notLinked: "帳戶未連結",
      emailVerified: "電郵已驗證",
      emailNotVerified: "電郵未驗證",
      noLinkedEmail: "沒有已連結的帳戶電郵",
      staffVerification: (verified: boolean) => `職員身份核實：${verified ? "已核實" : "待核實"}`,
      profileId: (id: string) => `身份編號：${id}`,
      viewDetails: "查看個人詳情",
      viewDetailsFor: (name: string) => `查看 ${name} 的個人詳情`,
      pagesLabel: "義工名冊分頁",
      previous: "上一頁",
      next: "下一頁",
    },
    selection: {
      selectPage: "選取本頁",
      selectAll: "選取全部符合條件（最多 1000 筆）",
      clear: "清除選取",
      locking: "正在固定選取範圍…",
      /** What to say when a selection failed for a reason the error does not give. */
      errors: {
        select_failed: "無法選取",
        pin_failed: "無法固定選取範圍",
      },
    },
    /** The profile search on the verification page. */
    search: {
      title: "尋找需要核實的義工",
      hint: "按姓名或電郵搜尋，沒有場次報名也能找到。",
      label: "搜尋義工姓名或電郵",
      placeholder: "姓名或電郵",
      submit: "搜尋",
      searching: "搜尋中…",
      failed: "搜尋未能完成。",
      retry: "重試",
      found: (total: number) =>
        `找到 ${total} 位義工${total > 10 ? "，以下顯示首 10 位；請輸入更完整的姓名或電郵。" : ""}`,
      noEmail: "未有連結電郵",
      /** A result's status, then the action on it. */
      choose: {
        pending: "待核實 · 選擇",
        active: "已核實 · 選擇",
        suspended: "暫停 · 選擇",
      },
    },
    /** The panel that assigns a reviewer to many profiles. */
    reviewPanel: {
      label: "義工審核者批量分派",
      title: "批量分派義工身份審核者",
      hint: "只分派審核工作，不會核實身份、升級資格、發送通知或改變義工狀態。預覽有效 15 分鐘，套用時逐筆重新核對身份版本及職員權限。",
      reviewer: "審核者",
      chooseReviewer: "選擇已啟用的職員",
      listFailed: "無法載入審核者名單，請重試。",
      selected: (count: number) => `已選 ${count} 筆（上限 1000）`,
      busy: "處理中…",
      preview: "建立分派預覽",
      reload: "重新讀取結果",
      unassigned: "未分派",
      reviewTitle: (reviewer: string, count: number) => `審核者：${reviewer} · ${count} 筆`,
      /** What went wrong, when the error itself does not say. */
      errors: {
        load_saved: "未能讀取已保存的操作，請重新讀取結果。",
        reload_saved: "未能讀取已保存的操作，請稍後重新讀取結果。",
        preview_failed: "無法建立預覽",
        apply_failed: "無法套用；請重新讀取結果",
      },
    },
  },
  en: {
    statuses: {
      pending: "Awaiting verification",
      active: "Enabled",
      suspended: "Paused",
    },
    tiers: {
      newcomer: "Newcomer",
      regular: "Regular",
      senior: "Senior",
    },
    form: {
      nameOrEmail: "Name or account email",
      nameOrEmailPlaceholder: "Search a full or partial name or email",
      status: "Profile status",
      allStatuses: "All profiles",
      tier: "Volunteer tier",
      allTiers: "All tiers",
      search: "Search",
      clear: "Clear filters",
    },
    note: "Email verification only means the account email is confirmed. Staff must verify volunteer profiles and qualifications against evidence.",
    loading: "Loading the volunteer directory…",
    loadFailed:
      "Could not load the volunteer directory. Your search terms are kept. Reload to try again.",
    reload: "Reload",
    results: {
      summary: (total: number, page: number, pages: number) =>
        `${pluralCount(total, "volunteer")} · Page ${formatAdminNumber(page, "en")} of ${formatAdminNumber(pages, "en")} · Includes profiles with no registration`,
      noMatchTitle: "No volunteers match your filters",
      noMatchHint: "Change the search terms or clear the filters, then try again.",
      emptyTitle: "There are no volunteer profiles yet",
      emptyHint:
        "Volunteer profiles you create appear here, including people who have not registered.",
      unnamed: "No name entered",
      select: (name: string) => `Select ${name}`,
      noEmail: "No email provided",
      notLinked: "Account not linked",
      emailVerified: "Email verified",
      emailNotVerified: "Email not verified",
      noLinkedEmail: "No linked account email",
      staffVerification: (verified: boolean) =>
        `Staff identity verification: ${verified ? "Verified" : "Awaiting verification"}`,
      profileId: (id: string) => `Profile reference: ${id}`,
      viewDetails: "View details",
      viewDetailsFor: (name: string) => `View details for ${name}`,
      pagesLabel: "Volunteer directory pages",
      previous: "Previous page",
      next: "Next page",
    },
    selection: {
      selectPage: "Select this page",
      selectAll: "Select all matches (up to 1,000)",
      clear: "Clear selection",
      locking: "Locking the selection…",
      errors: {
        select_failed: "Could not select the profile. Try again.",
        pin_failed: "Could not lock the selection. Try again.",
      },
    },
    search: {
      title: "Find a volunteer to verify",
      hint: "Search by name or email. Volunteers with no session registration can be found too.",
      label: "Search volunteers by name or email",
      placeholder: "Name or email",
      submit: "Search",
      searching: "Searching…",
      failed: "The search did not finish. ",
      retry: "Retry",
      found: (total: number) =>
        `Found ${pluralCount(total, "volunteer")}${total > 10 ? ". The first 10 are shown below. Enter a fuller name or email." : ""}`,
      noEmail: "No linked email",
      choose: {
        pending: "Awaiting verification · Choose",
        active: "Verified · Choose",
        suspended: "Paused · Choose",
      },
    },
    reviewPanel: {
      label: "Bulk assignment of volunteer profile reviewers",
      title: "Bulk assign volunteer profile reviewers",
      hint: "This only assigns the review work. It does not verify identities, upgrade qualifications, send notifications or change volunteer status. The preview is valid for 15 minutes, and applying checks each profile version and staff permission again.",
      reviewer: "Reviewer",
      chooseReviewer: "Choose an active staff member",
      listFailed: "Could not load the reviewer list. Reload the page and try again.",
      selected: (count: number) => `${formatAdminNumber(count, "en")} selected (up to 1,000)`,
      busy: "Working…",
      preview: "Create assignment preview",
      reload: "Reload result",
      unassigned: "Not assigned",
      reviewTitle: (reviewer: string, count: number) =>
        `Reviewer: ${reviewer} · ${pluralCount(count, "item")}`,
      errors: {
        load_saved: "Could not load the saved operation. Use Reload result to try again.",
        reload_saved: "Could not load the saved operation. Try Reload result again later.",
        preview_failed: "Could not create the preview. Try again.",
        apply_failed: "Could not apply the assignment. Use Reload result to check what happened.",
      },
    },
  },
});
