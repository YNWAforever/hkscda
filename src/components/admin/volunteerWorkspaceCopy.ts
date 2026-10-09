import { defineAdminCopy } from "./i18n/copy";

/** The ids of the volunteer workspace pages, in the order the navigation lists them. */
export type VolunteerWorkspacePageId =
  | "overview"
  | "people"
  | "activities"
  | "calendar"
  | "tasks"
  | "group-enquiries"
  | "operations"
  | "qualifications"
  | "settings"
  | "daily-settings"
  | "assessments"
  | "sources"
  | "simulation";

type PageText = { label: string; description: string };

/**
 * Copy for the volunteer workspace shell (`VolunteerAdminShell`): the brand, the skip link, the
 * navigation and its pages, and the headings two routes pass in (`intros`).
 */
export const volunteerWorkspaceCopy = defineAdminCopy({
  zh: {
    brand: "義工營運中心",
    skipLink: "跳至頁面內容",
    roleAdmin: "管理員工作區",
    roleStaff: "職員工作區",
    navigationToggle: (label: string) => `工作區導覽 · ${label}`,
    currentPage: "目前頁面",
    navigationLabel: "義工工作區",
    groups: {
      operations: "日常營運",
      settings: "管理員設定",
    },
    /** The heading and the line under it for the pages whose route asks for them. */
    intros: {
      people: {
        title: "義工名冊",
        description: "查找義工身份、核實資格，並查看報名與服務紀錄。",
      },
      person: {
        title: "義工個人詳情",
        description: "按已記錄的身份、證據與事實處理義工服務。",
      },
    },
    pages: {
      overview: { label: "營運總覽", description: "掌握今日場次、待核實身份與待處理報名。" },
      people: { label: "義工名冊", description: "搜尋所有義工身份，包括尚未報名的義工。" },
      activities: { label: "活動與報名", description: "建立活動、處理報名，並核實出席紀錄。" },
      calendar: { label: "營運月曆", description: "按日期、場地及服務類別查閱場次與名額。" },
      tasks: { label: "今日待辦", description: "跟進審批、補位聯絡與通知結果。" },
      "group-enquiries": {
        label: "團體查詢",
        description: "跟進機構查詢，安排合適的義工場次。",
      },
      operations: {
        label: "團體安排與改期",
        description: "安排團體加入場次，並記錄調整及個人改期原因。",
      },
      qualifications: {
        label: "身份與資格核實",
        description: "核對身份、資格證據及有效期，保留核實紀錄。",
      },
      settings: {
        label: "場次政策",
        description: "編輯政策草稿、檢視差異，並按生效日期發布版本。",
      },
      "daily-settings": {
        label: "全日配額",
        description: "管理全日名額、計數範圍與晚期補位安排。",
      },
      assessments: {
        label: "級別評核",
        description: "管理每月評核、候選核准與通知結果。",
      },
      sources: {
        label: "場地與資格",
        description: "維護場地、資格及共用來源，校驗後發布版本。",
      },
      simulation: {
        label: "政策模擬",
        description: "比較情境與政策結果；模擬不會發布或更改政策。",
      },
    } satisfies Record<VolunteerWorkspacePageId, PageText>,
  },
  en: {
    brand: "Volunteer operations",
    skipLink: "Skip to page content",
    roleAdmin: "Administrator workspace",
    roleStaff: "Staff workspace",
    navigationToggle: (label: string) => `Workspace navigation · ${label}`,
    currentPage: "Current page",
    navigationLabel: "Volunteer workspace",
    groups: {
      operations: "Daily operations",
      settings: "Administrator settings",
    },
    intros: {
      people: {
        title: "Volunteer directory",
        description:
          "Find volunteer profiles, verify qualifications and see registrations and service records.",
      },
      person: {
        title: "Volunteer details",
        description: "Handle volunteer service from the recorded profile, evidence and facts.",
      },
    },
    pages: {
      overview: {
        label: "Operations overview",
        description:
          "Keep track of today's sessions, profiles to verify and registrations to handle.",
      },
      people: {
        label: "Volunteer directory",
        description:
          "Search every volunteer profile, including volunteers who have not registered yet.",
      },
      activities: {
        label: "Activities and registrations",
        description: "Create activities, handle registrations and verify attendance records.",
      },
      calendar: {
        label: "Operations calendar",
        description: "See sessions and places by date, venue and service type.",
      },
      tasks: {
        label: "Today's tasks",
        description: "Follow up approvals, waitlist contacts and notification results.",
      },
      "group-enquiries": {
        label: "Group enquiries",
        description:
          "Follow up enquiries from organisations and arrange suitable volunteer sessions.",
      },
      operations: {
        label: "Group arrangements and rescheduling",
        description:
          "Add groups to sessions, and record the reasons for changes and for individual rescheduling.",
      },
      qualifications: {
        label: "Identity and qualification verification",
        description:
          "Check identity, qualification evidence and expiry dates, and keep the verification record.",
      },
      settings: {
        label: "Session policy",
        description: "Edit policy drafts, review changes and publish versions by effective date.",
      },
      "daily-settings": {
        label: "Daily quota",
        description: "Manage daily places, the counting scope and late release arrangements.",
      },
      assessments: {
        label: "Tier assessment",
        description: "Manage monthly assessments, candidate approvals and notification results.",
      },
      sources: {
        label: "Venues and qualifications",
        description:
          "Maintain venues, qualifications and shared sources, then validate and publish a version.",
      },
      simulation: {
        label: "Policy simulation",
        description:
          "Compare scenarios and policy results. A simulation never publishes or changes a policy.",
      },
    },
  },
});
