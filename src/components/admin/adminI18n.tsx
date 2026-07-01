import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AdminLanguage = "zh" | "en";

const STORAGE_KEY = "hkscda-admin-language";

type AdminSection =
  | "cat"
  | "dog"
  | "sponsor"
  | "applications"
  | "payments"
  | "supporters"
  | "access";
type AnimalType = "cat" | "dog" | "sponsor";
type Gender = "female" | "male";
type AnimalStatus = "available" | "adopted" | "fostered";
type ApplicationStatus = "pending" | "approved" | "rejected";

interface AdminCopy {
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
  navGroups: Record<string, string>;
  navItems: Record<string, string>;
  layout: {
    collapseSidebar: string;
    expandSidebar: string;
    openMenu: string;
  };
  login: {
    subtitle: string;
    email: string;
    password: string;
    submit: string;
    loading: string;
    error: string;
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

export const adminCopy: Record<AdminLanguage, AdminCopy> = {
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
      supporters: "捐款人",
      access: "權限管理",
    },
    navGroups: {
      animals: "動物",
      adoptions: "領養",
      donations: "捐款",
      system: "系統",
    },
    navItems: {
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
      payments: "收款",
      supporters: "捐款人",
      "access-management": "權限管理",
    },
    layout: {
      collapseSidebar: "收合側欄",
      expandSidebar: "展開側欄",
      openMenu: "開啟選單",
    },
    login: {
      subtitle: "管理後台登入",
      email: "電郵",
      password: "密碼",
      submit: "登入",
      loading: "登入中...",
      error: "電郵或密碼錯誤",
    },
    dashboard: {
      title: {
        cat: "貓貓",
        dog: "狗狗",
        sponsor: "助養動物",
        applications: "領養申請",
        payments: "收款紀錄",
        supporters: "捐款人",
        access: "權限管理",
      },
      addNew: "新增",
      applicant: "申請人",
      animal: "動物",
      phone: "電話",
      date: "日期",
      status: "狀態",
      supporters: "捐款人紀錄",
      applicationsMovedTitle: "領養申請已移至協調員工作流程",
      applicationsMovedDescription:
        "請使用協調員個案列表處理申請審核、狀態變更、動物配對、跟進及完成領養。",
      openAdoptionCases: "開啟領養個案",
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
      logout: "Log out",
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
      sponsor: "Sponsors",
      applications: "Applications",
      payments: "Payments",
      supporters: "Supporters",
      access: "Access Management",
    },
    navGroups: {
      animals: "Animals",
      adoptions: "Adoptions",
      donations: "Donations",
      system: "System",
    },
    navItems: {
      cat: "Cats",
      dog: "Dogs",
      sponsor: "Sponsors",
      applications: "Applications",
      "coordinator-inbox": "Inbox",
      "coordinator-intake": "Manual intake",
      "coordinator-tasks": "Tasks",
      "coordinator-adopters": "Adopters",
      "coordinator-reports": "Reports",
      "coordinator-statuses": "Status settings",
      payments: "Payments",
      supporters: "Supporters",
      "access-management": "Access Management",
    },
    layout: {
      collapseSidebar: "Collapse sidebar",
      expandSidebar: "Expand sidebar",
      openMenu: "Open menu",
    },
    login: {
      subtitle: "Admin sign in",
      email: "Email",
      password: "Password",
      submit: "Sign in",
      loading: "Signing in...",
      error: "Email or password is incorrect",
    },
    dashboard: {
      title: {
        cat: "Cats",
        dog: "Dogs",
        sponsor: "Sponsor animals",
        applications: "Adoption applications",
        payments: "Payment records",
        supporters: "Supporters",
        access: "Access Management",
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
};

interface AdminLanguageContextValue {
  copy: AdminCopy;
  language: AdminLanguage;
  setLanguage: (language: AdminLanguage) => void;
}

const AdminLanguageContext = createContext<AdminLanguageContextValue | null>(null);

function isAdminLanguage(value: string | null): value is AdminLanguage {
  return value === "zh" || value === "en";
}

export function AdminLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AdminLanguage>("zh");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isAdminLanguage(stored)) setLanguageState(stored);
  }, []);

  const setLanguage = (nextLanguage: AdminLanguage) => {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(STORAGE_KEY, nextLanguage);
  };

  const value = useMemo(() => ({ copy: adminCopy[language], language, setLanguage }), [language]);

  return <AdminLanguageContext.Provider value={value}>{children}</AdminLanguageContext.Provider>;
}

export function useAdminLanguage() {
  const context = useContext(AdminLanguageContext);
  if (!context) throw new Error("useAdminLanguage must be used within AdminLanguageProvider");
  return context;
}

export function AdminLanguageToggle() {
  const { copy, language, setLanguage } = useAdminLanguage();

  return (
    <div
      className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-xs shadow-sm"
      aria-label="Admin language"
    >
      {(["zh", "en"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLanguage(option)}
          className={`min-h-9 rounded-md px-3 font-medium transition-colors ${
            language === option
              ? "bg-[var(--color-panel)] text-white"
              : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-offset)] hover:text-[var(--color-text)]"
          }`}
          aria-pressed={language === option}
        >
          {option === "zh" ? copy.common.chinese : copy.common.english}
        </button>
      ))}
    </div>
  );
}
