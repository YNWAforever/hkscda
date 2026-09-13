import { canRoleAccessAdminArea, type AdminRole } from "../../lib/admin/access";

export type VolunteerWorkspacePage = {
  id: string;
  to: string;
  label: string;
  description: string;
  group: "operations" | "settings";
};
const base = "/admin/volunteers";
export const VOLUNTEER_WORKSPACE_PAGES: readonly VolunteerWorkspacePage[] = [
  {
    id: "overview",
    to: base,
    label: "營運總覽",
    description: "掌握今日場次、待核實身份與待處理報名。",
    group: "operations",
  },
  {
    id: "people",
    to: `${base}/people`,
    label: "義工名冊",
    description: "搜尋所有義工身份，包括尚未報名的義工。",
    group: "operations",
  },
  {
    id: "activities",
    to: `${base}/activities`,
    label: "活動與報名",
    description: "建立活動、處理報名，並核實出席紀錄。",
    group: "operations",
  },
  {
    id: "calendar",
    to: `${base}/calendar`,
    label: "營運月曆",
    description: "按日期、場地及服務類別查閱場次與名額。",
    group: "operations",
  },
  {
    id: "tasks",
    to: `${base}/tasks`,
    label: "今日待辦",
    description: "跟進審批、補位聯絡與通知結果。",
    group: "operations",
  },
  {
    id: "group-enquiries",
    to: `${base}/group-enquiries`,
    label: "團體查詢",
    description: "跟進機構查詢，安排合適的義工場次。",
    group: "operations",
  },
  {
    id: "operations",
    to: `${base}/operations`,
    label: "團體安排與改期",
    description: "安排團體加入場次，並記錄調整及個人改期原因。",
    group: "operations",
  },
  {
    id: "qualifications",
    to: `${base}/qualifications`,
    label: "身份與資格核實",
    description: "核對身份、資格證據及有效期，保留核實紀錄。",
    group: "operations",
  },
  {
    id: "settings",
    to: `${base}/settings`,
    label: "場次政策",
    description: "編輯政策草稿、檢視差異，並按生效日期發布版本。",
    group: "settings",
  },
  {
    id: "daily-settings",
    to: `${base}/daily-settings`,
    label: "全日配額",
    description: "管理全日名額、計數範圍與晚期補位安排。",
    group: "settings",
  },
  {
    id: "assessments",
    to: `${base}/assessments`,
    label: "級別評核",
    description: "管理每月評核、候選核准與通知結果。",
    group: "settings",
  },
  {
    id: "sources",
    to: `${base}/sources`,
    label: "場地與資格",
    description: "維護場地、資格及共用來源，校驗後發布版本。",
    group: "settings",
  },
  {
    id: "simulation",
    to: `${base}/simulation`,
    label: "政策模擬",
    description: "比較情境與政策結果；模擬不會發布或更改政策。",
    group: "settings",
  },
];

export function getVolunteerNavigation(role: AdminRole | null) {
  if (!role) return [];
  return VOLUNTEER_WORKSPACE_PAGES.filter((page) =>
    canRoleAccessAdminArea(
      role,
      page.group === "settings" ? "volunteerPolicyManagement" : "volunteerManagement",
    ),
  );
}

export function getVolunteerWorkspacePage(pathname: string) {
  const path = pathname.replace(/\/+$/, "");
  if (path.startsWith(`${base}/registrations/`)) {
    return VOLUNTEER_WORKSPACE_PAGES.find((page) => page.id === "activities");
  }
  return VOLUNTEER_WORKSPACE_PAGES.find(
    (page) => path === page.to || (page.id !== "overview" && path.startsWith(`${page.to}/`)),
  );
}
