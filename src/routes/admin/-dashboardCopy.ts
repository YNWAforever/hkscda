import { defineAdminCopy } from "../../components/admin/i18n/copy";

/** Copy for the admin dashboard route (`/admin`): the animal sections and the missing-photo filter. */
export const dashboardCopy = defineAdminCopy({
  zh: {
    breadcrumbLabel: "麵包屑導覽",
    breadcrumbRoot: "後台",
    animalManagement: "動物管理",
    animalCategories: "動物分類",
    animalTabs: { cat: "貓貓", dog: "狗狗", sponsor: "助養" },
    animalDescriptions: {
      sponsor: "列出可供助養的貓狗；助養資格並非品種。",
      cat: "搜尋及管理貓貓記錄、照顧狀態與公開資料。",
      dog: "搜尋及管理狗狗記錄、照顧狀態與公開資料。",
    },
    missingPhoto: "待補相片",
    missingPhotoNotice: (total: number) =>
      `待補相片：${total} 筆。按編號核對動物，再進入「編輯」上載到草稿；儲存、預覽及批准發布前，原公開相片不會被替換。`,
  },
  en: {
    breadcrumbLabel: "Breadcrumb",
    breadcrumbRoot: "Admin",
    animalManagement: "Animal management",
    animalCategories: "Animal categories",
    animalTabs: { cat: "Cats", dog: "Dogs", sponsor: "Sponsorship" },
    animalDescriptions: {
      sponsor: "Cats and dogs eligible for sponsorship; eligibility is independent of species.",
      cat: "Find and manage cat records, care status, and public information.",
      dog: "Find and manage dog records, care status, and public information.",
    },
    missingPhoto: "Needs photo",
    missingPhotoNotice: (total: number) =>
      `Needs photo: ${total} records. Check each animal by its number, then open Edit and upload the photo to the draft. The current public photo is not replaced until you save, preview and approve publishing.`,
  },
});
