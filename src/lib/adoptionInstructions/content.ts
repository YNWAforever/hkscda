import type { AdoptionInstructionContent } from "./types";

export const ADOPTION_INSTRUCTIONS_PAGE_KEY = "adoption-instructions";
export const initialAdoptionInstructionContent: AdoptionInstructionContent = {
  hero: {
    eyebrow: "領養準備",
    title: "領養需知",
    description: "了解申請、家訪和日常照護，為你和動物做好長期準備。",
  },
  fees: {
    sectionTitle: "領養費用",
    dogTitle: "狗隻領養費用",
    catTitle: "貓隻領養費用",
    itemLabel: "項目",
    amountLabel: "費用（HK$）",
    notice: "以上費用如有調整，恕不另行通知；香港拯救貓狗協會保留最終決定權。",
  },
  estates: {
    sectionTitle: "可養狗屋苑參考名單",
    introduction: "以下名單僅供參考，請向屋苑管理處查詢最新規定。",
    estateLabel: "屋苑",
    districtLabel: "地區",
    notesLabel: "備註",
    emptyState: "暫時未有屋苑資料。如需最新資訊，請",
  },
  guides: {
    sectionTitle: "領養後指南",
    catTitle: "貓隻領養後指南",
    dogTitle: "狗隻領養後指南",
    generalTitle: "領養後指南",
    zhHkActionLabel: "中文版",
    enActionLabel: "English",
  },
  rules: {
    title: "領養規則",
  },
  care: {
    cat: {
      title: "養貓需知",
    },
    dog: {
      title: "養狗需知",
    },
  },
};
