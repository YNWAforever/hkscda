import { defineAdminCopy } from "../i18n/copy";

/**
 * Copy for the adoption information screen: its five tabs, the adoption fees and the dog-friendly
 * estates, and the dialog that asks what to do with an unsaved page. The adoption rules and the
 * care guidelines are in `adoptionRulesCopy`, the page editor in `adoptionInstructionsCopy`.
 */
export const adoptionInformationCopy = defineAdminCopy({
  zh: {
    eyebrow: "領養",
    title: "領養資料管理",
    intro: "管理公開領養費用及可養狗屋苑參考名單。",
    guideReleases: "領養後指南版本",
    tabs: {
      fees: "領養費用",
      page: "頁面內容",
      estates: "可養狗屋苑",
      rules: "領養規則",
      careTopics: "動物照顧須知",
    },
    searchEstates: "搜尋屋苑",
    searchPlaceholder: "屋苑或地區",
    loading: "載入領養資料中…",
    fees: {
      section: "領養費用",
      dogs: "狗隻",
      cats: "貓隻",
      empty: "沒有領養費用資料",
      conflict: "領養費用已由其他人更新。請檢查最新版本後重新輸入。",
      staleHint: "最新資料暫未載入，請重新整理頁面。",
      /** Put between the conflict sentence and the stale-data hint, which follows it directly. */
      hintSeparator: "",
      loadLatest: "載入最新費用",
      itemLabel: "費用項目",
      priceLabel: "價格",
      moveUp: "上移",
      moveDown: "下移",
      save: "儲存",
    },
    estates: {
      section: "可養狗屋苑",
      empty: "沒有可養狗屋苑資料",
      pager: "可養狗屋苑",
      editHeading: "編輯屋苑",
      addHeading: "新增屋苑",
      conflict: "此屋苑已由其他人更新。請先檢查最新版本，再重新輸入你的修改。",
      staleHint: "最新資料暫未載入，請重新整理頁面。",
      /** Put between the conflict sentence and the stale-data hint, which follows it directly. */
      hintSeparator: "",
      loadLatest: "載入最新版本",
      nameLabel: "屋苑名稱",
      districtLabel: "地區",
      notesLabel: "備註",
      notesPlaceholder: "備註（選填）",
      save: "編輯",
      add: "新增屋苑",
      unpublish: "取消發佈",
      publish: "發佈",
      delete: "刪除",
      thisEstate: "此屋苑",
      confirmDelete: (name: string) => `確定刪除「${name}」？此操作無法復原。`,
    },
    leave: {
      title: "尚有未儲存的頁面內容",
      description: "你可以先儲存草稿、捨棄本機修改，或取消並繼續編輯。",
      cancel: "取消",
      discard: "捨棄並離開",
      save: "儲存並離開",
      /** Why the leave dialog stays open, by its code. */
      problems: {
        not_saved_check_draft: "儲存未成功，仍留在原頁。請關閉此對話框檢查草稿錯誤。",
        not_saved: "儲存未成功，仍留在原頁。",
      },
    },
  },
  en: {
    eyebrow: "Adoption",
    title: "Adoption information management",
    intro: "Manage the public adoption fees and the reference list of dog-friendly estates.",
    guideReleases: "Post-adoption guide releases",
    tabs: {
      fees: "Adoption fees",
      page: "Page content",
      estates: "Dog-friendly estates",
      rules: "Adoption rules",
      careTopics: "Animal care guidelines",
    },
    searchEstates: "Search estates",
    searchPlaceholder: "Estate or district",
    loading: "Loading adoption information…",
    fees: {
      section: "Adoption fees",
      dogs: "Dogs",
      cats: "Cats",
      empty: "No adoption fees",
      conflict:
        "Someone else has updated this adoption fee. Check the latest version, then enter your changes again.",
      staleHint: "The latest data has not loaded yet. Refresh the page.",
      hintSeparator: " ",
      loadLatest: "Load latest fee",
      itemLabel: "Fee item",
      priceLabel: "Price",
      moveUp: "Move up",
      moveDown: "Move down",
      save: "Save",
    },
    estates: {
      section: "Dog-friendly estates",
      empty: "No dog-friendly estates",
      pager: "Dog-friendly estates",
      editHeading: "Edit estate",
      addHeading: "Add estate",
      conflict:
        "Someone else has updated this estate. Check the latest version, then enter your changes again.",
      staleHint: "The latest data has not loaded yet. Refresh the page.",
      hintSeparator: " ",
      loadLatest: "Load latest version",
      nameLabel: "Estate name",
      districtLabel: "District",
      notesLabel: "Note",
      notesPlaceholder: "Note (optional)",
      save: "Save changes",
      add: "Add estate",
      unpublish: "Unpublish",
      publish: "Publish",
      delete: "Delete",
      thisEstate: "this estate",
      confirmDelete: (name: string) => `Delete "${name}"? This cannot be undone.`,
    },
    leave: {
      title: "Unsaved page content",
      description:
        "You can save the draft, discard your changes on this device or cancel and keep editing.",
      cancel: "Cancel",
      discard: "Discard and leave",
      save: "Save and leave",
      problems: {
        not_saved_check_draft:
          "The draft was not saved, so you are still on this page. Close this dialog and check the draft for errors.",
        not_saved: "The draft was not saved, so you are still on this page. Try saving again.",
      },
    },
  },
});
