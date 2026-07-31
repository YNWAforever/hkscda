import type { AdoptionInstructionContent } from "./types";

export const ADOPTION_INSTRUCTIONS_PAGE_KEY = "adoption-instructions";

export const initialAdoptionInstructionContent = {
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
    notice: "All prices subject to adjustment; HKSCDA reserves the right to amend.",
  },
  estates: {
    sectionTitle: "可養狗屋苑參考名單",
    introduction: "以下名單僅供參考，請向屋苑管理處查詢最新規定。",
    estateLabel: "屋苑",
    districtLabel: "地區",
    notesLabel: "備註",
    emptyState: "暫時未有屋苑資料。如需最新資訊，請聯絡我們。",
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
    items: [
      { id: "applicant-age", text: "申請人須年滿18歲，並持有香港居留權或工作證。" },
      { id: "accurate-details", text: "申請人須提供真實個人資料及住址，以便協會進行家訪。" },
      { id: "fee-payment", text: "領養前須按本頁最新領養費用表繳付相關費用。" },
      { id: "no-abandonment", text: "領養後不得遺棄、轉讓或出售動物，如無法繼續飼養須通知協會安排。" },
      { id: "safe-home", text: "須確保動物生活在安全、舒適的室內環境。" },
      { id: "health-checks", text: "須定期帶動物進行健康檢查及接種疫苗。" },
      { id: "landlord-consent", text: "如住所為租住單位，須提供業主同意飼養寵物的書面証明。" },
      { id: "follow-up-visit", text: "申請人須同意協會進行跟進家訪，以確保動物受到妥善照顧。" },
      { id: "household-limit", text: "每個家庭最多可領養兩隻動物（特殊情況除外，需協會批准）。" },
      { id: "care-commitment", text: "申請人須了解並接受動物的生理及行為特性，有耐心照顧。" },
      { id: "veterinary-care", text: "領養後如動物出現健康問題，須立即尋求獸醫協助。" },
      { id: "association-discretion", text: "協會保留拒絕不合適申請的權利，並無需解釋原因。" },
    ],
  },
  care: {
    cat: {
      title: "養貓需知",
      topics: [
        { id: "cat-home", value: "home", label: "家居", content: "為貓貓提供安全的室內環境。安裝防護網防止貓咪跌出窗外或逃跑。移除家中有毒植物及危險物品。提供足夠的躲藏空間及高處休息位置。" },
        { id: "cat-collection", value: "collection", label: "領取", content: "領取當日請自備貓籠。建議準備毛巾蓋住貓籠，減少貓咪緊張情緒。回家後讓貓咪在安靜的房間慢慢適應新環境，不要急於介紹給家中其他寵物。" },
        { id: "cat-food", value: "food", label: "糧食", content: "提供高質素的貓糧，可混合乾糧及濕糧。確保隨時有新鮮清水。避免餵食人類食物，特別是洋蔥、大蒜、朱古力及葡萄。" },
        { id: "cat-cleaning", value: "cleaning", label: "清潔", content: "每日清潔貓砂盆，定期更換貓砂。每月為貓咪梳毛，長毛貓需更頻繁。定期修剪指甲。" },
        { id: "cat-health", value: "health", label: "保健", content: "半歲或以上為成貓。每年接種疫苗及進行健康檢查。定期驅蟲（體內及體外）。留意貓咪的飲食及排便習慣，如有異常盡快求醫。" },
        { id: "cat-supplies", value: "supplies", label: "用品", content: "必備用品：貓籠/外出籠、貓砂盆及貓砂、食具及水具、抓板及玩具、梳毛工具。" },
        { id: "cat-window", value: "window", label: "安窗", content: "必須安裝貓網或防護網，防止貓咪從高處墜落或走失。市面上有多款適合不同窗型的貓網，請在貓咪到來前安裝妥當。" },
      ],
    },
    dog: {
      title: "養狗需知",
      topics: [
        { id: "dog-home", value: "home", label: "家居", content: "為狗狗提供安全的空間，移除危險物品。準備舒適的狗床或睡墊。確保門窗關閉防止逃跑。" },
        { id: "dog-collection", value: "collection", label: "領取", content: "領取當日請自備狗籠或牽引繩。讓狗狗有時間適應新家，保持安靜環境。" },
        { id: "dog-food", value: "food", label: "食物", content: "提供適合體型及年齡的優質狗糧。確保隨時有新鮮清水。避免洋蔥、大蒜、朱古力、葡萄及過鹹食物。" },
        { id: "dog-rest", value: "rest", label: "休息", content: "為狗狗提供固定的休息位置。幼犬每日需要較多睡眠，勿過度打擾。" },
        { id: "dog-cleaning", value: "cleaning", label: "清潔", content: "定期洗澡及梳毛。定期清潔耳朵及修剪指甲。訓練狗狗在指定地點排便。" },
        { id: "dog-health", value: "health", label: "保健", content: "每年接種疫苗及驅蟲。定期獸醫檢查。注意狗狗的飲食及行為變化。" },
        { id: "dog-walk", value: "walk", label: "溜狗", content: "每日帶狗狗外出散步，提供適量運動。外出時必須使用牽引繩及佩戴狗牌。在允許的地方才可讓狗狗放開繩子。" },
        { id: "dog-training", value: "training", label: "教育", content: "盡早開始基本服從訓練，如坐下、等待、召回等。使用正向強化方法，避免體罰。如有行為問題，可尋求專業訓練師協助。" },
      ],
    },
  },
} satisfies AdoptionInstructionContent;

export const initialAdoptionInstructionContentJson = JSON.stringify(initialAdoptionInstructionContent);
