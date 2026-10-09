import { defineAdminCopy } from "../i18n/copy";

/**
 * Copy for the about pages editor: the page title, the two tabs and the name of every field of the
 * "About us" and "TNR" forms. The text staff type into the fields is the public page text, so it is
 * data and is not in here.
 */
export const aboutPagesCopy = defineAdminCopy({
  zh: {
    eyebrow: "宣傳內容",
    title: "關於頁面管理",
    tabs: { about: "關於我們", tnr: "TNR" },
    loading: "載入頁面內容中…",
    loadFailed: "無法載入頁面內容",
    save: "儲存",
    saveFailed: "儲存失敗，請檢查資料後再試一次。",
    /** The name of a field of the page, as the form labels it. */
    fields: {
      eyebrow: "引言",
      title: "標題",
      description: "描述",
      body: "內文",
      sideBadge: "側欄標籤",
      sideBody: "側欄內文",
      linkLabel: "連結文字",
      sideTitle: "側欄標題",
      buttonLabel: "按鈕文字",
      descriptionPrefix: "描述前綴",
    },
    /** The heading of each group of fields. */
    groups: {
      hero: "主視覺",
      mission: "我們的使命",
      impact: "公開資料",
      journey: "四個重要步驟",
      communityBand: "TNR 橫幅",
      tnrCard: "TNR 卡片",
      responsibleAdoption: "負責任領養",
      helpPaths: "四種參與方式",
      closing: "結尾",
      stages: "三個階段",
      chapter: "社區參與",
      cta: "行動呼籲",
    },
    /** The name of the numbered field of a list, such as the second step's title. */
    numbered: {
      stepTitle: (n: number) => `步驟 ${n} 標題`,
      stepDescription: (n: number) => `步驟 ${n} 描述`,
      principle: (n: number) => `原則 ${n}`,
      itemTitle: (n: number) => `項目 ${n} 標題`,
      itemDescription: (n: number) => `項目 ${n} 描述`,
      itemButton: (n: number) => `項目 ${n} 按鈕文字`,
      stageTitle: (n: number) => `階段 ${n} 標題`,
      stageDescription: (n: number) => `階段 ${n} 描述`,
      bullet: (n: number) => `重點 ${n}`,
    },
  },
  en: {
    eyebrow: "Website content",
    title: "About pages management",
    tabs: { about: "About us", tnr: "TNR" },
    loading: "Loading page content…",
    loadFailed: "Could not load the page content",
    save: "Save",
    saveFailed: "Could not save. Check the details and try again.",
    fields: {
      eyebrow: "Lead-in",
      title: "Title",
      description: "Description",
      body: "Body",
      sideBadge: "Side label",
      sideBody: "Side body",
      linkLabel: "Link text",
      sideTitle: "Side title",
      buttonLabel: "Button text",
      descriptionPrefix: "Description prefix",
    },
    groups: {
      hero: "Main banner",
      mission: "Our mission",
      impact: "Public data",
      journey: "Four key steps",
      communityBand: "TNR banner",
      tnrCard: "TNR card",
      responsibleAdoption: "Responsible adoption",
      helpPaths: "Four ways to take part",
      closing: "Closing",
      stages: "Three stages",
      chapter: "Community involvement",
      cta: "Call to action",
    },
    numbered: {
      stepTitle: (n: number) => `Step ${n} title`,
      stepDescription: (n: number) => `Step ${n} description`,
      principle: (n: number) => `Principle ${n}`,
      itemTitle: (n: number) => `Item ${n} title`,
      itemDescription: (n: number) => `Item ${n} description`,
      itemButton: (n: number) => `Item ${n} button text`,
      stageTitle: (n: number) => `Stage ${n} title`,
      stageDescription: (n: number) => `Stage ${n} description`,
      bullet: (n: number) => `Point ${n}`,
    },
  },
});
