export type HelpLanguage = "zh-HK" | "en";

export type HelpCategory = "sponsorship" | "adoption" | "tax_receipt" | "donation" | "contact";

export type BilingualText = Record<HelpLanguage, string>;

export type HelpCta = {
  href: string;
  label: BilingualText;
  analyticsAction: string;
  external?: boolean;
};

export type HelpFaq = {
  id: string;
  category: HelpCategory;
  question: BilingualText;
  answer: BilingualText;
  keywords: Record<HelpLanguage, string[]>;
  cta?: HelpCta;
  sensitive?: boolean;
};

export const helpCategoryLabels: Record<HelpCategory, BilingualText> = {
  sponsorship: { "zh-HK": "助養", en: "Sponsorship" },
  adoption: { "zh-HK": "領養", en: "Adoption" },
  tax_receipt: { "zh-HK": "報稅收據", en: "Tax receipts" },
  donation: { "zh-HK": "捐款", en: "Donations" },
  contact: { "zh-HK": "聯絡職員", en: "Contact staff" },
};

export const helpFaqs: HelpFaq[] = [
  {
    id: "sponsorship-how-it-works",
    category: "sponsorship",
    question: {
      "zh-HK": "助養運作方式是什麼？",
      en: "How does sponsorship work?",
    },
    answer: {
      "zh-HK":
        "助養是每月為指定動物提供食物、醫療和日常照顧的長期支持。你可選擇要支持的動物以及每月金額，工作人員會在提交後跟進付款及確認。",
      en: "Sponsorship is monthly support for an animal's food, medical care, and daily needs. You can choose preferred sponsor animals and a monthly amount, then staff will follow up on payment and confirmation.",
    },
    keywords: {
      "zh-HK": ["助養", "動物", "月費", "食物", "醫療", "照顧"],
      en: ["sponsor", "sponsorship", "monthly", "support", "animal", "pledge"],
    },
    cta: {
      href: "/sponsors",
      label: { "zh-HK": "查看可助養動物", en: "View sponsor animals" },
      analyticsAction: "view_sponsor_animals",
    },
  },
  {
    id: "sponsorship-start",
    category: "sponsorship",
    question: {
      "zh-HK": "我想開始助養，下一步要怎麼做？",
      en: "I want to start sponsoring. What should I do next?",
    },
    answer: {
      "zh-HK":
        "先選擇你想支持的動物，然後前往助養表格完成申請。你可以選擇每月 HK$100、HK$300、HK$500 或自訂金額，提交後會收到繳費資料和參考編號。",
      en: "Choose your preferred sponsor animals first, then continue to the sponsorship form. You can select HK$100, HK$300, HK$500, or a custom monthly amount. After submission, you will receive a reference and payment instructions.",
    },
    keywords: {
      "zh-HK": ["助養", "開始", "申請", "動物", "每月", "繳費"],
      en: ["start sponsorship", "pledge form", "payment proof", "reference", "HK$100", "HK$300", "HK$500"],
    },
    cta: {
      href: "/sponsors/pledge",
      label: { "zh-HK": "前往助養申請", en: "Go to sponsorship form" },
      analyticsAction: "start_sponsorship_pledge",
    },
  },
  {
    id: "adoption-apply",
    category: "adoption",
    question: {
      "zh-HK": "我要怎樣申請領養？",
      en: "How do I apply to adopt a cat or dog?",
    },
    answer: {
      "zh-HK":
        "你可先查看可領養動物並加入預備名單，接著提交領養申請。表格會詢問住家環境、家庭狀況、照顧經驗、探訪安排及照片，讓義工判斷合適配對。",
      en: "Browse adoptable animals, add them to your adoption shortlist, then submit an adoption application. The form asks about your home, household, care experience, visit preferences, and photos so volunteers can assess a suitable match.",
    },
    keywords: {
      "zh-HK": ["領養", "申請", "動物", "家庭", "照顧", "申請表"],
      en: ["adopt", "adoption", "apply", "cat", "dog", "shortlist", "application"],
    },
    cta: {
      href: "/adoption/apply",
      label: { "zh-HK": "前往領養申請", en: "Go to adoption application" },
      analyticsAction: "start_adoption_application",
    },
  },
  {
    id: "adoption-preparation",
    category: "adoption",
    question: {
      "zh-HK": "領養前我需要準備什麼？",
      en: "What should I prepare before adopting?",
    },
    answer: {
      "zh-HK":
        "請先準備住家安全資料，例如窗戶、門鎖狀況，居家照片，是否有其他寵物，家庭同意書，日常照顧安排及照顧預算。工作人員會按每隻動物需求作進一步跟進。",
      en: "Prepare information about home safety, such as windows and doors, photos of the living environment, current pets, household agreement, daily care arrangements, and care budget. Staff will follow up based on each animal's needs.",
    },
    keywords: {
      "zh-HK": ["準備", "領養", "住家", "安全", "照片", "照顧"],
      en: ["prepare", "home safety", "windows", "photos", "visit", "care"],
    },
    cta: {
      href: "/animals/cat",
      label: { "zh-HK": "瀏覽可領養動物", en: "Browse adoptable animals" },
      analyticsAction: "browse_adoption_animals",
    },
  },
  {
    id: "tax-receipt-eligibility",
    category: "tax_receipt",
    question: {
      "zh-HK": "我可以為捐款申請報稅收據嗎？",
      en: "Can I request a tax receipt for my donation?",
    },
    answer: {
      "zh-HK":
        "HKSCDA 是持牌慈善機構。一般來說，捐款金額在 HK$100 或以上即可申請報稅收據。此助理只會提供收據流程，不能提供個人稅務意見。",
      en: "HKSCDA is an approved charitable institution. In general, donations of HK$100 or above can request an IRD Section 88 charitable donation receipt through the receipt process. This help assistant only explains the receipt process and cannot provide personal tax advice.",
    },
    keywords: {
      "zh-HK": ["報稅", "捐款", "收據", "IRD", "88條", "申請", "條件"],
      en: ["tax", "receipt", "IRD", "Section 88", "charity", "HK$100", "deduction"],
    },
    cta: {
      href: "/donate",
      label: { "zh-HK": "查看捐款收據", en: "Get donation receipt info" },
      analyticsAction: "open_donation_for_receipt",
    },
    sensitive: true,
  },
  {
    id: "tax-receipt-request",
    category: "tax_receipt",
    question: {
      "zh-HK": "我已完成捐款，如何申請收據？",
      en: "I already donated. How can I request a receipt?",
    },
    answer: {
      "zh-HK":
        "如果你已完成捐款並需要收據，請使用捐款頁面或直接聯絡職員並提供相關資料。請勿在助理中輸入付款編號、電話、地址或個人資料；請透過官方表單或職員渠道處理。",
      en: "If you have completed a donation and need a receipt, use the donation page or contact staff with the required details. Please do not enter payment references, phone numbers, addresses, or personal details into this help assistant; use the official form or staff-provided channel instead.",
    },
    keywords: {
      "zh-HK": ["申請", "已捐款", "付款", "參考編號", "聯絡職員", "收據"],
      en: ["request receipt", "already donated", "payment", "reference", "staff", "receipt"],
    },
    cta: {
      href: "#contact",
      label: { "zh-HK": "聯絡職員", en: "Contact staff" },
      analyticsAction: "contact_for_receipt",
    },
    sensitive: true,
  },
  {
    id: "donation-methods",
    category: "donation",
    question: {
      "zh-HK": "有哪些捐款方式？",
      en: "What donation methods are available?",
    },
    answer: {
      "zh-HK":
        "捐款頁面會列出可用方式，包括刷卡、FPS、PayMe、PayPal 或其他指定方法。請以捐款頁面最新顯示為準。",
      en: "The donation page lists available options such as card or online payment, plus manual methods like FPS, PayMe, PayPal, or other listed methods. Please follow the latest details shown on the donation page.",
    },
    keywords: {
      "zh-HK": ["捐款", "FPS", "PayMe", "PayPal", "刷卡", "支付"],
      en: ["donate", "FPS", "PayMe", "PayPal", "card", "Alipay", "method"],
    },
    cta: {
      href: "/donate",
      label: { "zh-HK": "查看捐款方法", en: "View donation methods" },
      analyticsAction: "view_donation_methods",
    },
  },
  {
    id: "donation-purpose",
    category: "donation",
    question: {
      "zh-HK": "捐款會用在那些地方？",
      en: "What will my donation support?",
    },
    answer: {
      "zh-HK":
        "捐款可用於動物食品、醫療、絕育、救援、安置及日常照顧。有些捐款可指定用途，例如一般支持、醫療照顧或助養相關支持。",
      en: "Donations support food, medical care, desexing, rescue, adoption matching, and daily care. You can choose a purpose such as general support, medical care, or sponsorship-related support when donating.",
    },
    keywords: {
      "zh-HK": ["捐款", "用途", "醫療", "食物", "絕育", "救援", "照顧"],
      en: ["purpose", "medical", "food", "desexing", "rescue", "sponsor"],
    },
    cta: {
      href: "/donate",
      label: { "zh-HK": "支持 HKSCDA", en: "Support HKSCDA" },
      analyticsAction: "donation_purpose_cta",
    },
  },
  {
    id: "contact-staff",
    category: "contact",
    question: {
      "zh-HK": "如何聯絡職員？",
      en: "How can I contact staff?",
    },
    answer: {
      "zh-HK":
        "可透過 WhatsApp／電話 9864 1089 或電郵 info@hkscda.com 聯絡。若涉及個人資料、付款、收據或申請進度，請直接聯絡職員。",
      en: "You can contact HKSCDA by WhatsApp / phone at 9864 1089 or email info@hkscda.com. For personal data, payment, receipt, or application-status questions, please contact staff directly.",
    },
    keywords: {
      "zh-HK": ["聯絡職員", "WhatsApp", "電話", "電郵", "查詢", "支援"],
      en: ["contact", "WhatsApp", "phone", "email", "staff", "enquiry"],
    },
    cta: {
      href: "#contact",
      label: { "zh-HK": "查看聯絡資料", en: "View contact details" },
      analyticsAction: "open_contact_section",
    },
  },
  {
    id: "privacy-do-not-enter-personal-data",
    category: "contact",
    question: {
      "zh-HK": "可以在助理裡輸入個人資料嗎？",
      en: "Can I enter personal details in the help assistant?",
    },
    answer: {
      "zh-HK":
        "請勿在這個助理輸入姓名、電話、地址、付款參考、申請答案或上傳檔案明細。此服務只用作查詢常見問題與下一步連結，個人案件請使用官方表單或直接聯絡職員。",
      en: "Please do not enter names, phone numbers, addresses, payment references, application answers, or uploaded-file details into this help assistant. It is only for finding FAQs and next-step links; use official forms or contact staff for personal cases.",
    },
    keywords: {
      "zh-HK": ["個人資料", "隱私", "電話", "地址", "付款", "申請"],
      en: ["privacy", "personal data", "phone", "address", "payment reference", "application"],
    },
    cta: {
      href: "#contact",
      label: { "zh-HK": "聯絡職員", en: "Contact staff" },
      analyticsAction: "contact_for_private_case",
    },
    sensitive: true,
  },
];

export function getFaqById(id: string): HelpFaq | undefined {
  return helpFaqs.find((faq) => faq.id === id);
}

export function getFaqsByCategory(category: HelpCategory): HelpFaq[] {
  return helpFaqs.filter((faq) => faq.category === category);
}

export function getFaqText(faq: HelpFaq, language: HelpLanguage) {
  return {
    question: faq.question[language],
    answer: faq.answer[language],
    keywords: faq.keywords[language],
    cta: faq.cta
      ? {
          ...faq.cta,
          label: faq.cta.label[language],
        }
      : undefined,
    categoryLabel: helpCategoryLabels[faq.category][language],
  };
}
