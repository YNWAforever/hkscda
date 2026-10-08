import type { AdminNavGroup, AdminNavItemId } from "../adminNav";
import { defineAdminCopy } from "./copyModule";

/**
 * The shared admin copy: the shell, navigation, login and the animal forms and tables.
 * `adminI18n.tsx` serves the active half to the 28 screens that read `copy` from
 * `useAdminLanguage()`, and still exports the whole object as `adminCopy`.
 */

type AdminSection =
  | "cat"
  | "dog"
  | "sponsor"
  | "applications"
  | "payments"
  | "supporters"
  | "volunteers"
  | "content"
  | "access";
type AnimalType = "cat" | "dog" | "sponsor";
type Gender = "female" | "male";
type AnimalStatus = "available" | "adopted" | "fostered";
type ApplicationStatus = "pending" | "approved" | "rejected";

export interface AdminCopy {
  common: {
    appTitle: string;
    chinese: string;
    english: string;
    loading: string;
    save: string;
    saving: string;
    cancel: string;
    logout: string;
    edit: string;
    delete: string;
    confirm: string;
    noResults: string;
    add: string;
    workflow: string;
  };
  nav: Record<AdminSection, string>;
  // Keyed by the unions in adminNav.ts, so a nav label missing in either language fails tsc.
  navGroups: Record<AdminNavGroup, string>;
  navItems: Record<AdminNavItemId, string>;
  navDescriptions: Record<AdminNavGroup, string>;
  layout: {
    taskOverview: string;
    collapseSidebar: string;
    expandSidebar: string;
    openMenu: string;
    primaryNavigation: string;
    workspaceNavigation: string;
    breadcrumb: string;
  };
  login: {
    subtitle: string;
    email: string;
    password: string;
    submit: string;
    loading: string;
    error: string;
    forgotPassword: string;
    resetTitle: string;
    resetInstructions: string;
    sendResetLink: string;
    sendingResetLink: string;
    resetSent: string;
    backToLogin: string;
    resetError: string;
    updateError: string;
    newPassword: string;
    confirmPassword: string;
    updatePassword: string;
    updatingPassword: string;
    passwordTooShort: string;
    passwordMismatch: string;
    invalidRecoveryLink: string;
    passwordUpdated: string;
  };
  dashboard: {
    title: Record<AdminSection, string>;
    addNew: string;
    applicant: string;
    animal: string;
    phone: string;
    date: string;
    status: string;
    supporters: string;
    applicationsMovedTitle: string;
    applicationsMovedDescription: string;
    openAdoptionCases: string;
    sponsorViewAnimals: string;
    sponsorViewPledges: string;
  };
  table: {
    search: string;
    photo: string;
    name: string;
    gender: string;
    age: string;
    status: string;
    actions: string;
  };
  form: {
    addTitle: string;
    editTitle: string;
    notFound: string;
    chineseGroup: string;
    englishGroup: string;
    adminGroup: string;
    chineseName: string;
    englishName: string;
    type: string;
    gender: string;
    status: string;
    chineseAge: string;
    englishAge: string;
    chineseNotes: string;
    englishNotes: string;
    chineseDescription: string;
    englishDescription: string;
    photo: string;
    imageAlt: string;
    saveError: string;
    uploadError: string;
    namePlaceholder: string;
    agePlaceholder: string;
    notesPlaceholder: string;
    descriptionPlaceholder: string;
    englishNamePlaceholder: string;
    englishAgePlaceholder: string;
    englishNotesPlaceholder: string;
    englishDescriptionPlaceholder: string;
    errors: {
      name: string;
      age: string;
    };
  };
  animalType: Record<AnimalType, string>;
  gender: Record<Gender, string>;
  animalStatus: Record<AnimalStatus, string>;
  applicationStatus: Record<ApplicationStatus, string>;
}

export const adminCommonCopy = defineAdminCopy<AdminCopy>({
  zh: {
    common: {
      appTitle: "HKSCDA Admin",
      chinese: "中文",
      english: "English",
      loading: "載入中...",
      save: "儲存",
      saving: "儲存中...",
      cancel: "取消",
      logout: "登出",
      edit: "編輯",
      delete: "刪除",
      confirm: "確認",
      noResults: "沒有結果",
      add: "新增",
      workflow: "流程",
    },
    nav: {
      cat: "貓貓",
      dog: "狗狗",
      sponsor: "助養",
      applications: "申請",
      payments: "收款",
      supporters: "支持者",
      volunteers: "義工",
      content: "宣傳內容",
      access: "權限管理",
    },
    navGroups: {
      animals: "動物管理",
      adoptions: "領養管理",
      volunteers: "義工與實習",
      donations: "捐款與助養",
      promotion: "網站內容",
      system: "系統設定",
    },
    navDescriptions: {
      animals: "管理動物資料、領養狀態與助養動物名單。",
      adoptions: "處理申請個案、領養配對與工作跟進。",
      volunteers: "安排義工活動、團體查詢與實習申請。",
      donations: "管理收款、助養承諾配對與支持者紀錄。",
      promotion: "維護網站內容、領養資訊與團隊資料。",
      system: "管理帳戶權限、付款方式與領養狀態設定。",
    },
    navItems: {
      "sponsorship-pledges": "助養收款及配對",
      internships: "實習計劃",
      cat: "貓貓",
      dog: "狗狗",
      sponsor: "助養",
      applications: "申請",
      "coordinator-inbox": "收件箱",
      "coordinator-intake": "手動建案",
      "coordinator-tasks": "工作跟進",
      "coordinator-adopters": "領養人",
      "coordinator-reports": "報表紀錄",
      "coordinator-statuses": "狀態設定",
      volunteers: "義工營運中心",
      "volunteer-settings": "義工政策設定",
      "volunteer-group-enquiries": "團體查詢",
      payments: "收款",
      "payment-methods": "付款方式設定",
      supporters: "支持者",
      content: "宣傳內容",
      "adoption-information": "領養資訊",
      knowledge: "知識庫",
      governance: "團隊與管治",
      "access-management": "權限管理",
      faq: "常見問題",
      "about-pages": "關於頁面",
    },
    layout: {
      taskOverview: "待辦總覽",
      collapseSidebar: "收合側欄",
      expandSidebar: "展開側欄",
      openMenu: "開啟選單",
      primaryNavigation: "後台主要導覽",
      workspaceNavigation: "工作區導覽",
      breadcrumb: "導覽路徑",
    },
    login: {
      subtitle: "管理後台登入",
      email: "電郵",
      password: "密碼",
      submit: "登入",
      loading: "登入中...",
      error: "電郵或密碼錯誤",
      forgotPassword: "忘記密碼？",
      resetTitle: "重設密碼",
      resetInstructions: "輸入管理員帳戶的電郵，我們會發送重設連結。",
      sendResetLink: "發送重設連結",
      sendingResetLink: "正在發送...",
      resetSent: "如該電郵已登記，你將會收到重設密碼連結。",
      backToLogin: "返回登入",
      resetError: "暫時未能發送重設連結，請稍後再試。",
      updateError: "暫時未能更新密碼，請稍後再試。",
      newPassword: "新密碼",
      confirmPassword: "確認新密碼",
      updatePassword: "更新密碼",
      updatingPassword: "正在更新...",
      passwordTooShort: "密碼至少需要 8 個字元。",
      passwordMismatch: "兩次輸入的密碼不相符。",
      invalidRecoveryLink: "重設連結無效或已過期，請重新申請。",
      passwordUpdated: "密碼已更新，請使用新密碼登入。",
    },
    dashboard: {
      title: {
        cat: "貓貓",
        dog: "狗狗",
        sponsor: "助養動物",
        applications: "領養申請",
        payments: "收款紀錄",
        supporters: "支持者",
        volunteers: "義工活動",
        content: "宣傳內容",
        access: "權限管理",
      },
      addNew: "新增",
      applicant: "申請人",
      animal: "動物",
      phone: "電話",
      date: "日期",
      status: "狀態",
      supporters: "支持者紀錄",
      applicationsMovedTitle: "領養申請已移至協調員工作流程",
      applicationsMovedDescription:
        "請使用協調員個案列表處理申請審核、狀態變更、動物配對、跟進及完成領養。",
      openAdoptionCases: "開啟領養個案",
      sponsorViewAnimals: "動物列表",
      sponsorViewPledges: "承諾審核",
    },
    table: {
      search: "搜尋名字...",
      photo: "照片",
      name: "名字",
      gender: "性別",
      age: "年齡",
      status: "狀態",
      actions: "操作",
    },
    form: {
      addTitle: "新增動物",
      editTitle: "編輯：",
      notFound: "找不到此動物",
      chineseGroup: "中文內容",
      englishGroup: "English content",
      adminGroup: "管理資料",
      chineseName: "名字 *",
      englishName: "English name",
      type: "類別 *",
      gender: "性別 *",
      status: "狀態 *",
      chineseAge: "年齡 *",
      englishAge: "Age",
      chineseNotes: "備注標籤",
      englishNotes: "Notes tag",
      chineseDescription: "描述",
      englishDescription: "Description",
      photo: "照片",
      imageAlt: "現有動物照片",
      saveError: "儲存失敗",
      uploadError: "圖片上載失敗",
      namePlaceholder: "如：蝦米",
      agePlaceholder: "如：6歲 / 4個月",
      notesPlaceholder: "如：親人、BB一對",
      descriptionPlaceholder: "寫下性格、健康情況或領養注意事項",
      englishNamePlaceholder: "e.g. Hami",
      englishAgePlaceholder: "e.g. 6 years / 4 months",
      englishNotesPlaceholder: "e.g. Friendly, bonded pair",
      englishDescriptionPlaceholder: "Write temperament, health notes, or adoption details",
      errors: {
        name: "請填寫名字",
        age: "請填寫年齡",
      },
    },
    animalType: {
      cat: "貓",
      dog: "狗",
      sponsor: "助養",
    },
    gender: {
      female: "母",
      male: "公",
    },
    animalStatus: {
      available: "可領養",
      adopted: "已領養",
      fostered: "暫托中",
    },
    applicationStatus: {
      pending: "待處理",
      approved: "已批准",
      rejected: "已拒絕",
    },
  },
  en: {
    common: {
      appTitle: "HKSCDA Admin",
      chinese: "中文",
      english: "English",
      loading: "Loading...",
      save: "Save",
      saving: "Saving...",
      cancel: "Cancel",
      logout: "Sign out",
      edit: "Edit",
      delete: "Delete",
      confirm: "Confirm",
      noResults: "No results",
      add: "Add",
      workflow: "Workflow",
    },
    nav: {
      cat: "Cats",
      dog: "Dogs",
      sponsor: "Sponsorship",
      applications: "Applications",
      payments: "Payments",
      supporters: "Supporters",
      volunteers: "Volunteers",
      content: "Content",
      access: "Access management",
    },
    navGroups: {
      animals: "Animal management",
      adoptions: "Adoption management",
      volunteers: "Volunteers and internships",
      donations: "Donations and sponsorship",
      promotion: "Website content",
      system: "System settings",
    },
    navDescriptions: {
      animals: "Manage animal profiles, adoption status and animals eligible for sponsorship.",
      adoptions: "Review applications, adoption matches and follow-up tasks.",
      volunteers: "Coordinate volunteer activities, group enquiries and internships.",
      donations: "Manage payments, sponsorship matching and supporter records.",
      promotion: "Maintain website content, adoption information and team profiles.",
      system: "Manage account access, payment methods and adoption status settings.",
    },
    navItems: {
      "sponsorship-pledges": "Sponsorship payments and matching",
      internships: "Internships",
      cat: "Cats",
      dog: "Dogs",
      sponsor: "Sponsorship",
      applications: "Applications",
      "coordinator-inbox": "Inbox",
      "coordinator-intake": "Manual intake",
      "coordinator-tasks": "Tasks",
      "coordinator-adopters": "Adopters",
      "coordinator-reports": "Reports",
      "coordinator-statuses": "Status settings",
      volunteers: "Volunteer operations",
      "volunteer-settings": "Volunteer policy settings",
      "volunteer-group-enquiries": "Group enquiries",
      payments: "Payments",
      "payment-methods": "Payment method settings",
      supporters: "Supporters",
      content: "Content",
      "adoption-information": "Adoption information",
      knowledge: "Knowledge base",
      governance: "Team and governance",
      "access-management": "Access management",
      faq: "FAQ",
      "about-pages": "About pages",
    },
    layout: {
      taskOverview: "Task overview",
      collapseSidebar: "Collapse sidebar",
      expandSidebar: "Expand sidebar",
      openMenu: "Open menu",
      primaryNavigation: "Admin primary navigation",
      workspaceNavigation: "Workspace navigation",
      breadcrumb: "Breadcrumb",
    },
    login: {
      subtitle: "Admin sign in",
      email: "Email",
      password: "Password",
      submit: "Sign in",
      loading: "Signing in...",
      error: "Email or password is incorrect",
      forgotPassword: "Forgot password?",
      resetTitle: "Reset password",
      resetInstructions: "Enter your admin email and we will send you a reset link.",
      sendResetLink: "Send reset link",
      sendingResetLink: "Sending...",
      resetSent: "If an account exists for that email, you will receive a password reset link.",
      backToLogin: "Back to sign in",
      resetError: "We could not send a reset link. Please try again later.",
      updateError: "We could not update your password. Please try again later.",
      newPassword: "New password",
      confirmPassword: "Confirm new password",
      updatePassword: "Update password",
      updatingPassword: "Updating...",
      passwordTooShort: "Password must be at least 8 characters.",
      passwordMismatch: "The passwords do not match.",
      invalidRecoveryLink: "This reset link is invalid or has expired. Please request a new one.",
      passwordUpdated: "Your password has been updated. Sign in with your new password.",
    },
    dashboard: {
      title: {
        cat: "Cats",
        dog: "Dogs",
        sponsor: "Sponsorship animals",
        applications: "Adoption applications",
        payments: "Payment records",
        supporters: "Supporters",
        volunteers: "Volunteer activities",
        content: "Content",
        access: "Access management",
      },
      addNew: "Add new",
      applicant: "Applicant",
      animal: "Animal",
      phone: "Phone",
      date: "Date",
      status: "Status",
      supporters: "Supporter records",
      applicationsMovedTitle: "Adoption applications moved to coordinator workflow",
      applicationsMovedDescription:
        "Use the coordinator case list for application review, status changes, animal matches, follow-ups, and finalization.",
      openAdoptionCases: "Open adoption cases",
      sponsorViewAnimals: "Animal list",
      sponsorViewPledges: "Pledge review",
    },
    table: {
      search: "Search by name...",
      photo: "Photo",
      name: "Name",
      gender: "Gender",
      age: "Age",
      status: "Status",
      actions: "Actions",
    },
    form: {
      addTitle: "Add animal",
      editTitle: "Edit: ",
      notFound: "Animal not found",
      chineseGroup: "中文內容",
      englishGroup: "English content",
      adminGroup: "Admin details",
      chineseName: "名字 *",
      englishName: "English name",
      type: "Type *",
      gender: "Gender *",
      status: "Status *",
      chineseAge: "年齡 *",
      englishAge: "Age",
      chineseNotes: "備注標籤",
      englishNotes: "Notes tag",
      chineseDescription: "描述",
      englishDescription: "Description",
      photo: "Photo",
      imageAlt: "Current animal photo",
      saveError: "Unable to save",
      uploadError: "Image upload failed",
      namePlaceholder: "如：蝦米",
      agePlaceholder: "如：6歲 / 4個月",
      notesPlaceholder: "如：親人、BB一對",
      descriptionPlaceholder: "寫下性格、健康情況或領養注意事項",
      englishNamePlaceholder: "e.g. Hami",
      englishAgePlaceholder: "e.g. 6 years / 4 months",
      englishNotesPlaceholder: "e.g. Friendly, bonded pair",
      englishDescriptionPlaceholder: "Write temperament, health notes, or adoption details",
      errors: {
        name: "Chinese name is required",
        age: "Chinese age is required",
      },
    },
    animalType: {
      cat: "Cat",
      dog: "Dog",
      sponsor: "Sponsor",
    },
    gender: {
      female: "Female",
      male: "Male",
    },
    animalStatus: {
      available: "Available",
      adopted: "Adopted",
      fostered: "Fostered",
    },
    applicationStatus: {
      pending: "Pending",
      approved: "Approved",
      rejected: "Rejected",
    },
  },
});
