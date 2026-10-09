import { defineAdminCopy } from "../../../components/admin/i18n/copy";

/**
 * Copy for the adoption page preview. Only the loading and failure messages are admin text: the
 * preview itself is the public adoption page, shown as visitors will see it.
 */
export const adoptionPreviewCopy = defineAdminCopy({
  zh: {
    loading: "正在載入領養頁面預覽…",
    failed: "未能載入領養頁面預覽。",
  },
  en: {
    loading: "Loading the adoption page preview…",
    failed:
      "Could not load the adoption page preview. Reload the page. If it still fails, check that the page has a saved draft.",
  },
});
