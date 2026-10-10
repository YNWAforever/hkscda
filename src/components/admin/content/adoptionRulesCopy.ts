import { adminCommonCopy } from "../i18n/adminCommonCopy";
import { defineAdminCopy } from "../i18n/copy";

/**
 * Copy for the adoption rules and the animal care guidelines, the two tabs of the adoption
 * information screen that keep Chinese and English text side by side.
 */
export const adoptionRulesCopy = defineAdminCopy({
  zh: {
    eyebrow: "領養",
    /** Shared by the two forms. */
    form: {
      sortOrder: "排序",
      showOnPage: "在領養須知頁面顯示",
      saveFailed: "儲存失敗，請檢查資料後再試一次。",
      save: "儲存",
      cancel: "取消",
    },
    list: {
      edit: "編輯",
      /** Added after the name of a rule or topic that is not shown on the page. */
      disabledSuffix: "（已停用）",
      pager: "資料",
    },
    rules: {
      title: "領養規則管理",
      heading: "領養規則",
      add: "新增規則",
      loading: "載入領養規則中…",
      loadFailed: "無法載入領養規則",
      empty: "沒有領養規則資料",
      contentZh: "規則內容（中文）",
      contentEn: "Rule content (English)",
    },
    careTopics: {
      title: "動物照顧須知管理",
      speciesLabel: "物種",
      cats: "貓隻",
      dogs: "狗隻",
      catHeading: "養貓需知",
      dogHeading: "養狗需知",
      add: "新增主題",
      loading: "載入照顧須知中…",
      loadFailed: "無法載入照顧須知",
      empty: "沒有照顧須知資料",
      species: "物種",
      catOption: "貓隻",
      dogOption: "狗隻",
      labelZh: "主題名稱（中文）",
      labelEn: "Topic label (English)",
      contentZh: "內容（中文）",
      contentEn: "Content (English)",
    },
  },
  en: {
    eyebrow: "Adoption",
    form: {
      sortOrder: "Sort order",
      showOnPage: "Show on the adoption instructions page",
      saveFailed: "Could not save. Check the details and try again.",
      save: "Save",
      cancel: "Cancel",
    },
    list: {
      edit: "Edit",
      disabledSuffix: " (disabled)",
      pager: "Records",
    },
    rules: {
      title: adminCommonCopy.en.navItems["adoption-information"],
      heading: "Adoption rules",
      add: "Add rule",
      loading: "Loading adoption rules…",
      loadFailed: "Could not load adoption rules",
      empty: "No adoption rules",
      contentZh: "Rule content (Chinese)",
      contentEn: "Rule content (English)",
    },
    careTopics: {
      title: adminCommonCopy.en.navItems["adoption-information"],
      speciesLabel: "Species",
      cats: "Cats",
      dogs: "Dogs",
      catHeading: "Cat care guidelines",
      dogHeading: "Dog care guidelines",
      add: "Add topic",
      loading: "Loading care guidelines…",
      loadFailed: "Could not load care guidelines",
      empty: "No care guidelines",
      species: "Species",
      catOption: "Cat",
      dogOption: "Dog",
      labelZh: "Topic label (Chinese)",
      labelEn: "Topic label (English)",
      contentZh: "Content (Chinese)",
      contentEn: "Content (English)",
    },
  },
});
