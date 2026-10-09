import { defineAdminCopy } from "../i18n/copy";

/**
 * Copy for the panels of a supporter's page: the profile sidebar, the consent editor and the
 * retry control on a donation. These screens take their language as a prop or from the
 * provider, and share the amount and date formats in `formatCopy.ts`.
 */

/** The profile sidebar. */
export const supporterProfileCopy = defineAdminCopy({
  zh: {
    profile: "支持者資料",
    contact: "聯絡",
    noPhone: "沒有電話",
    emailConsent: "電郵",
    whatsappConsent: "WhatsApp",
    source: "來源",
    created: "建立",
    updated: "更新",
    tags: "標籤",
    noTags: "沒有標籤",
    adoption: "領養連結",
    primaryProfile: "主要領養人檔案",
    otherProfiles: "其他檔案",
    noAdoption: "尚未連結領養紀錄。",
    noContact: "沒有聯絡資料",
    consentStatuses: {
      opt_in: "同意",
      opt_out: "不同意",
      none: "未設定",
    },
    languages: {
      "zh-HK": "繁體中文",
      en: "English",
    },
  },
  en: {
    profile: "Supporter profile",
    contact: "Contact",
    noPhone: "No phone",
    emailConsent: "Email",
    whatsappConsent: "WhatsApp",
    source: "Source",
    created: "Created",
    updated: "Updated",
    tags: "Tags",
    noTags: "No tags",
    adoption: "Adoption links",
    primaryProfile: "Primary adopter profile",
    otherProfiles: "Other profiles",
    noAdoption: "No linked adoption history.",
    noContact: "No contact details",
    consentStatuses: {
      opt_in: "Opted in",
      opt_out: "Opted out",
      none: "Not set",
    },
    languages: {
      "zh-HK": "Traditional Chinese",
      en: "English",
    },
  },
});

/** The consent editor on a supporter's page. */
export const consentEditorCopy = defineAdminCopy({
  zh: {
    title: "通訊同意",
    subtitle: "更新捐款人通訊的同意狀態。",
    save: "儲存",
    saveAria: "儲存通訊同意設定",
    email: "電郵",
    emailDescription: "收據更新",
    emailAria: "電郵通訊同意",
    whatsapp: "WhatsApp",
    whatsappDescription: "付款更新",
    whatsappAria: "WhatsApp 通訊同意",
    notSet: "未有記錄",
    optIn: "同意",
    optOut: "不同意",
  },
  en: {
    title: "Consent",
    subtitle: "Update whether this supporter agrees to be contacted.",
    save: "Save",
    saveAria: "Save consent settings",
    email: "Email",
    emailDescription: "Receipt updates",
    emailAria: "Email consent",
    whatsapp: "WhatsApp",
    whatsappDescription: "Payment updates",
    whatsappAria: "WhatsApp consent",
    notSet: "Not set",
    optIn: "Opted in",
    optOut: "Opted out",
  },
});

/** The retry control beside a donation whose receipt or acknowledgement email is not done. */
export const donationDeliveryActionCopy = defineAdminCopy({
  zh: {
    complete: "電郵服務已接納確認電郵",
    retry: "重試收據及確認電郵",
    checkFirst: "請先檢查電郵或服務設定",
  },
  en: {
    complete: "The email provider accepted the acknowledgement email",
    retry: "Retry receipt and acknowledgement email",
    checkFirst: "Check the email and service settings first",
  },
});
