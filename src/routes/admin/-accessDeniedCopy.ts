import { defineAdminCopy } from "../../components/admin/i18n/copy";

/** Copy for the access denied page. */
export const accessDeniedCopy = defineAdminCopy({
  zh: {
    title: "沒有權限",
    reason: "你的管理員角色未能開啟此頁面。",
    back: "返回可用管理頁面",
  },
  en: {
    title: "Access denied",
    reason: "Your admin role does not have access to this page.",
    back: "Back to an available admin area",
  },
});
