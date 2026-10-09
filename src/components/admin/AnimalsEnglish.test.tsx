import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";

import { adminCommonCopy } from "./i18n/adminCommonCopy";
import {
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "./i18n/testing";

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

const realRouter = await import("@tanstack/react-router");
const realQuery = await import("@tanstack/react-query");

mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  Link: ({
    children,
    className,
    to,
    params,
  }: {
    children?: ReactNode;
    className?: string;
    to: string;
    params?: Record<string, string>;
  }) => {
    const href = params
      ? Object.entries(params).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)
      : to;
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  },
  useNavigate: () => async () => {},
  useBlocker: () => {},
}));

type QueryState = Record<string, unknown>;
let repairQueue: QueryState = {};

mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useMutation: () => ({ mutate() {}, mutateAsync: async () => {}, reset() {}, isPending: false }),
  useQuery: () => ({
    isLoading: false,
    isError: false,
    error: null,
    refetch() {},
    ...repairQueue,
  }),
}));

const { AnimalsTable } = await import("./AnimalsTable");
const { AnimalForm, SavedVersionPreview, UploadCheckNotice } = await import("./AnimalForm");
const { AnimalGalleryEditor } = await import("./AnimalGalleryEditor");
const { ContentReviewPanel } = await import("./content/ContentReview");
const { MediaRepairQueue } = await import("./MediaRepairQueue");
const { animalFormCopy } = await import("./animalFormCopy");
const { animalListCopy } = await import("./animalListCopy");

function animal(overrides: Record<string, unknown> = {}) {
  return {
    id: "a-1",
    code: "C3761",
    public_profile: null,
    type: "cat",
    name: "小白",
    name_en: "Snowy",
    gender: "female",
    age: "6歲",
    age_en: "6 years",
    description: null,
    description_en: null,
    notes: null,
    notes_en: null,
    status: "available",
    adoption_eligible: true,
    sponsorship_eligible: false,
    retired_at: null,
    publication_state: "published",
    image_url: null,
    gallery: [],
    created_at: "2026-10-01T02:30:00Z",
    updated_at: "2026-10-01T02:30:00Z",
    ...overrides,
  };
}

const animals = [
  animal(),
  animal({
    id: "a-2",
    code: null,
    name: "阿黑",
    name_en: null,
    age: "3歲",
    age_en: "",
    type: "dog",
    gender: "male",
    status: "adopted",
    publication_state: "draft",
  }),
  animal({
    id: "a-3",
    name: "旺財",
    name_en: "Lucky",
    age: "2歲",
    age_en: null,
    type: "sponsor",
    status: "fostered",
    publication_state: "unpublished",
    retired_at: "2026-09-01T00:00:00Z",
  }),
];

// The names and ages staff typed are data, so they are allowed to stay in Chinese.
const FIXTURE_TEXT = ["小白", "阿黑", "旺財", "6歲", "3歲", "2歲"];

const defaultState = { q: "", archived: false, status: "all" as const, page: 1 };

function table(props: Partial<Parameters<typeof AnimalsTable>[0]> = {}) {
  return (
    <AnimalsTable
      animals={animals as never}
      state={defaultState}
      onStateChange={() => {}}
      onDeleted={() => {}}
      {...props}
    />
  );
}

describe("animals table in English", () => {
  test("shows the list with English labels and no Chinese except the animals' own text", () => {
    const markup = renderAdminInEnglish(table());
    expectNoChineseText(markup, { allow: FIXTURE_TEXT });
    for (const text of [
      "Search name or reference number",
      "Include archived records",
      "All statuses",
      ">Photo<",
      ">Name<",
      ">Gender<",
      ">Age<",
      ">Status<",
      ">Publication status<",
      ">Actions<",
      "Workflow",
      ">Edit<",
      ">Archive<",
      "Female",
      "Available",
      "Draft",
      "Published",
      "2 records · Page 1 of 1",
    ]) {
      expect(markup, text).toContain(text);
    }
    // The archived animal is hidden until the toggle is on, so its action is Unarchive only then.
    expect(markup).not.toContain("Unarchive");
  });

  test("shows the English name and age, and the Chinese ones where the English column is empty", () => {
    const markup = renderAdminInEnglish(table({ state: { ...defaultState, archived: true } }));
    // name_en and age_en are shown in English.
    expect(markup).toContain("Snowy");
    expect(markup).toContain("6 years");
    expect(markup).toContain("Lucky");
    // name_en: null falls back to the Chinese name; an empty age_en falls back to the age.
    expect(markup).toContain("阿黑");
    expect(markup).toContain("3歲");
    // The Chinese name is not listed beside an English one.
    expect(markup).not.toContain("小白");
    expect(markup).not.toContain("旺財");
    expect(markup).toContain("Unarchive");
    expectNoChineseText(markup, { allow: FIXTURE_TEXT });
  });

  test("an animal with name_en: null shows its Chinese name", () => {
    const markup = renderAdminInEnglish(
      table({ animals: [animal({ name: "阿黑", name_en: null })] as never }),
    );
    expect(markup).toContain("阿黑");
    expectNoChineseText(markup, { allow: ["阿黑", "6歲"] });
  });

  test("explains the legacy sponsor type in English and says how many records", () => {
    const markup = renderAdminInEnglish(table({ state: { ...defaultState, archived: true } }));
    expect(markup).toContain("Legacy &quot;Sponsor&quot; type to check: 1 record.");
    expect(markup).toContain(
      "Changing the type does not affect the adoption or sponsorship listing.",
    );
  });

  test("shows the filters, the empty states and the pager in English", () => {
    const filtered = renderAdminInEnglish(
      table({ state: { ...defaultState, q: "zzz", status: "adopted" } }),
    );
    expectNoChineseText(filtered);
    expect(filtered).toContain("Clear filters");
    expect(filtered).toContain("No animals match these filters.");

    const empty = renderAdminInEnglish(table({ animals: [] }));
    expectNoChineseText(empty);
    expect(empty).toContain("No animal records in this category yet.");

    const paged = renderAdminInEnglish(
      table({
        animals: animals.slice(0, 2) as never,
        serverTotal: 45,
        state: { ...defaultState, page: 2 },
      }),
    );
    expectNoChineseText(paged, { allow: FIXTURE_TEXT });
    expect(paged).toContain("45 records · Page 2 of 3");
    expect(paged).toContain(">Previous<");
    expect(paged).toContain(">Next<");
    expect(paged).toContain('aria-label="Animal list pagination"');
  });

  test("keeps the Chinese list as it was", () => {
    const markup = renderAdminInChinese(table({ state: { ...defaultState, archived: true } }));
    for (const text of [
      "搜尋名稱或編號",
      "顯示已封存記錄",
      "所有狀態",
      "公開狀態",
      "草稿",
      "已公開",
      "暫停公開",
      "取消封存",
      "封存",
      "3 筆記錄",
      "頁 1 / 1",
    ]) {
      expect(markup, text).toContain(text);
    }
    // Chinese lists the English name beside the Chinese one, as before.
    expect(markup).toMatch(/小白.*Snowy/);
    expect(markup).toContain("6歲");
    expect(markup).not.toContain("6 years");
  });

  test("the animal list copy has no Chinese in English", () => {
    expectNoChineseInCopy(animalListCopy.en);
    expect(animalListCopy.en.summary(1, 1, 1)).toBe("1 record · Page 1 of 1");
    expect(animalListCopy.zh.summary(1234, 2, 3)).toBe("1234 筆記錄 · 頁 2 / 3");
    expect(animalListCopy.zh.needsSpecies(2)).toBe(
      "有 2 筆記錄的品種仍是舊有的「助養」值，需要人手確認為貓或狗。 更改品種不會影響領養／助養刊登範圍。",
    );
  });
});

describe("animal form in English", () => {
  test("labels every field in English, including the Chinese-language fields", () => {
    const markup = renderAdminInEnglish(<AnimalForm />);
    expectNoChineseText(markup);
    for (const text of [
      "Chinese content",
      "Chinese name *",
      "Chinese age *",
      "Chinese notes tag",
      "Chinese description",
      "English content",
      "English name",
      "Admin details",
      "Type *",
      "Gender *",
      "Status *",
      "Publication status",
      "Draft (never published)",
      "Published",
      "Unpublished",
      "Listed on",
      "Available for adoption (shown on the adoption page)",
      "Available for sponsorship (shown in the sponsorship area)",
      "Public information",
      "Reference number",
      "Date of birth",
      "Neutered status",
      "Not recorded",
      "Suitable adopter",
      "Suits first-time adopters",
      "Record date",
      "Personality (up to 1,000 characters)",
      "Care and health needs (up to 2,000 characters)",
      "Story (up to 8,000 characters)",
      "Photo gallery and review details",
      ">Save<",
      ">Cancel<",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).toContain('placeholder="The animal&#x27;s name in Chinese"');
    expect(markup).toContain('placeholder="e.g. C3761"');
  });

  test("shows the saved draft message in English while an existing animal loads", () => {
    const markup = renderAdminInEnglish(<AnimalForm existing={animal() as never} />);
    expectNoChineseText(markup);
    expect(markup).toContain("Loading the saved draft...");
  });

  test("the source review panel the form shows for a saved draft is in English too", () => {
    // The form shows this panel only after a saved draft has loaded, which a static render of
    // the form does not reach, so the panel is rendered as the form renders it.
    const markup = renderAdminInEnglish(
      <ContentReviewPanel kind="animal" id="a-1" revision="3" disabled />,
    );
    expectNoChineseText(markup);
    for (const text of [
      "Source review of this saved version",
      ">Awaiting verification</option>",
      "Verified source and reason",
      ">Record review of this version</button>",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("keeps the Chinese form as it was", () => {
    const markup = renderAdminInChinese(<AnimalForm />);
    for (const text of [
      "中文內容",
      "公開狀態",
      "草稿（未曾公開）",
      "刊登範圍",
      "可供領養（顯示於領養頁面）",
      "公開資料",
      "性格（最多 1000 字）",
      "牠的故事（最多 8000 字）",
      "相片集及審核資料",
      "儲存",
    ]) {
      expect(markup, text).toContain(text);
    }
    const loading = renderAdminInChinese(<AnimalForm existing={animal() as never} />);
    expect(loading).toContain("正在載入已儲存草稿…");
  });

  test("the form copy has no Chinese in English, and the zh messages are unchanged", () => {
    expectNoChineseInCopy(animalFormCopy.en);
    expect(animalFormCopy.zh.leaveConfirm).toBe("離開會捨棄未儲存的內容，確定離開？");
    expect(animalFormCopy.zh.draft.saved).toBe("草稿已儲存。請在發布前先預覽；公開資料尚未改動。");
    expect(animalFormCopy.zh.publish.unconfirmed).toBe(
      "未能確認發布結果。請重試發布；不會建立重複版本。",
    );
    expect(animalFormCopy.zh.profileRejected("編號", "性格")).toBe(
      "以下欄位不符合公開資料規則（不可包含網址、電郵、電話或 < > 符號）：編號、性格",
    );
    expect(animalFormCopy.en.profileRejected("Reference number", "Personality")).toBe(
      "These fields break the public information rules (no web addresses, email addresses, phone numbers or < > symbols): Reference number, Personality. Remove the rejected text and save again.",
    );
  });

  test("English form errors say what to do next", () => {
    const { form } = adminCommonCopy.en;
    expect(form.saveError).toBe("Could not save. Check the form and try again.");
    expect(form.uploadError).toBe("Could not upload the image. Try again.");
    expect(form.notFound).toBe(
      "Animal not found. Go back to the animal list and choose another animal.",
    );
    expect(animalFormCopy.en.publish.conflict).toContain("Preview the draft again");
    expect(animalFormCopy.en.versions.copyFailed).toContain("Try again");
  });
});

describe("saved version preview", () => {
  const body = {
    name: "小白",
    name_en: "Snowy",
    age: "6歲",
    age_en: "6 years",
    description: "親人",
    description_en: "",
    notes: "BB一對",
    notes_en: "Bonded pair",
    preview_image_url: "https://example.org/p.jpg",
    public_profile: { story: "街頭獲救", code: "C3761", other: "x", blank: "" },
    gallery: [
      {
        id: "g1",
        preview_url: "https://example.org/1.jpg",
        alt_zh: "白貓",
        alt_en: "White cat",
        review_status: "approved",
      },
      {
        id: "g2",
        preview_url: "https://example.org/2.jpg",
        alt_zh: "黑狗",
        alt_en: null,
        review_status: "pending",
      },
      { id: "g3", alt_zh: "沒有預覽" },
    ],
  };
  const allowed = ["親人", "街頭獲救", "黑狗"];

  test("shows English texts with Chinese stand-ins where the English column is empty", () => {
    const markup = renderAdminInEnglish(<SavedVersionPreview body={body} revision={3} />);
    expectNoChineseText(markup, { allow: allowed });
    for (const text of [
      'aria-label="Saved version preview"',
      "Saved version 3",
      ">Snowy<",
      "6 years",
      "Bonded pair",
      "Reference number: C3761",
      "Story: 街頭獲救",
      "White cat",
      // other is not a known field, so its key is shown as it was stored.
      "other: x",
      "黑狗 (not approved, so it will not be public)",
    ]) {
      expect(markup, text).toContain(text);
    }
    // An empty description_en falls back to the Chinese description.
    expect(markup).toContain("親人");
    // A gallery photo without a preview is left out.
    expect(markup).not.toContain("沒有預覽");
  });

  test("keeps the Chinese preview as it was", () => {
    const markup = renderAdminInChinese(<SavedVersionPreview body={body} revision={3} />);
    for (const text of [
      'aria-label="已儲存版本預覽"',
      "已儲存版本 3",
      ">小白<",
      "6歲",
      "BB一對",
      "編號：C3761",
      "牠的故事：街頭獲救",
      "白貓",
      "黑狗（未核准，不會公開）",
    ]) {
      expect(markup, text).toContain(text);
    }
  });
});

describe("upload check notice", () => {
  const files = [{ id: "g1", name: "front.jpg" }];

  test("names the animal by its English name and the files in English", () => {
    const markup = renderAdminInEnglish(
      <UploadCheckNotice
        existing={animal({ public_profile: { code: "C3761" } }) as never}
        animalId="id-1"
        imageFileName="main.jpg"
        galleryFiles={files}
      />,
    );
    expectNoChineseText(markup);
    for (const text of [
      "Check the files before uploading → animal",
      "#C3761 · Snowy · ID id-1",
      "main.jpg → main photo",
      "front.jpg → gallery",
      "Save the draft and preview it first. Only approved photos become public after publishing.",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("names a new animal draft in English, and in Chinese as before", () => {
    const english = renderAdminInEnglish(
      <UploadCheckNotice animalId="id-1" imageFileName={null} galleryFiles={files} />,
    );
    expectNoChineseText(english);
    expect(english).toContain("New animal draft · ID id-1");
    expect(english).not.toContain("main photo");

    const chinese = renderAdminInChinese(
      <UploadCheckNotice
        existing={animal({ public_profile: { code: "C3761" } }) as never}
        animalId="id-1"
        imageFileName="main.jpg"
        galleryFiles={files}
      />,
    );
    for (const text of [
      "上載前核對檔案 → 動物",
      "#C3761 · 小白 · ID id-1",
      "main.jpg → 主相片",
      "front.jpg → 相片集",
      "先儲存草稿及預覽；只有已批准的相片在發布完成後公開。",
    ]) {
      expect(chinese, text).toContain(text);
    }
    expect(
      renderAdminInChinese(
        <UploadCheckNotice animalId="id-1" imageFileName={null} galleryFiles={[]} />,
      ),
    ).toContain("新動物草稿 · ID id-1");
  });
});

describe("gallery editor", () => {
  const items = [
    {
      id: "g1",
      url: null,
      draft_path: null,
      alt_zh: "白貓",
      alt_en: "White cat",
      source: "HKSCDA",
      focal_x: 30,
      focal_y: 70,
      review_status: "pending",
      sort_order: 0,
    },
    {
      id: "g2",
      url: null,
      draft_path: null,
      alt_zh: "黑狗",
      alt_en: null,
      source: "",
      focal_x: 50,
      focal_y: 50,
      review_status: "approved",
      sort_order: 1,
    },
  ];

  test("labels the photos and their review fields in English", () => {
    const markup = renderAdminInEnglish(
      <AnimalGalleryEditor items={items as never} onChange={() => {}} />,
    );
    expectNoChineseText(markup, { allow: ["白貓", "黑狗"] });
    for (const text of [
      "Photo gallery and review details",
      'aria-label="Add gallery photos"',
      "Photo 1",
      "Photo 2",
      ">Move up<",
      ">Move down<",
      ">Remove<",
      "Chinese alt text",
      "English alt text",
      "Photo source",
      "Horizontal focal point 30%",
      "Vertical focal point 70%",
      "Review status",
      ">Pending review<",
      ">Approved<",
      ">Not used<",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("keeps the Chinese gallery editor as it was", () => {
    const markup = renderAdminInChinese(
      <AnimalGalleryEditor items={items as never} onChange={() => {}} />,
    );
    for (const text of [
      "相片集及審核資料",
      "相片 1",
      "上移",
      "下移",
      "移除",
      "中文替代文字",
      "水平焦點 30%",
      "垂直焦點 70%",
      "待審核",
      "不採用",
    ]) {
      expect(markup, text).toContain(text);
    }
  });
});

describe("public photo repair queue", () => {
  const backlog = {
    pending: 2,
    claimed: 1,
    failed: 1,
    oldestAgeSeconds: 600,
    items: [
      {
        kind: "animal",
        itemId: "i1",
        entityId: "e1",
        status: "failed",
        attempts: 3,
        nextRetryAt: "2026-10-09T02:30:00Z",
        lastErrorCode: "E_TIMEOUT",
        createdAt: "2026-10-01T02:30:00Z",
      },
      {
        kind: "content",
        itemId: "i2",
        entityId: "e2",
        status: "pending",
        attempts: 0,
        nextRetryAt: null,
        lastErrorCode: null,
        createdAt: "2026-10-02T02:30:00Z",
      },
    ],
  };

  test("shows the queue, its counts and Hong Kong dates in English", () => {
    repairQueue = { data: backlog };
    const markup = renderAdminInEnglish(<MediaRepairQueue />);
    expectNoChineseText(markup);
    for (const text of [
      "Public photo repair queue",
      "Pending 2 · In progress 1 · Needs manual review 1 · Oldest waiting 10 minutes",
      "Animal · e1",
      "Content · e2",
      "Needs manual review · Attempt 3 · Reason code: E_TIMEOUT",
      "Pending · Attempt 0 · Reason code: Not recorded",
      "Created: 1 Oct 2026 (Thu) 10:30",
      "· Next attempt: 9 Oct 2026 (Fri) 10:30",
      ">Review and retry<",
    ]) {
      expect(markup, text).toContain(text);
    }
  });

  test("shows the loading, empty and failed states in English", () => {
    repairQueue = { isLoading: true };
    const loading = renderAdminInEnglish(<MediaRepairQueue />);
    expectNoChineseText(loading);
    expect(loading).toContain("Loading the queue...");

    repairQueue = { data: { ...backlog, items: [] } };
    const empty = renderAdminInEnglish(<MediaRepairQueue />);
    expectNoChineseText(empty);
    expect(empty).toContain("No photos need repair.");

    repairQueue = { isError: true, error: new Error("x") };
    const failed = renderAdminInEnglish(<MediaRepairQueue />);
    expectNoChineseText(failed);
    expect(failed).toContain("Could not load the repair queue. Try again.");
    expect(failed).toContain(">Retry<");
  });

  test("says one minute and one item in the singular", () => {
    repairQueue = { data: { ...backlog, oldestAgeSeconds: 60, items: [] } };
    expect(renderAdminInEnglish(<MediaRepairQueue />)).toContain("Oldest waiting 1 minute<");
  });

  test("keeps the Chinese queue and its Hong Kong date format as they were", () => {
    repairQueue = { data: backlog };
    const markup = renderAdminInChinese(<MediaRepairQueue />);
    const created = new Date("2026-10-01T02:30:00Z").toLocaleString("zh-HK", {
      timeZone: "Asia/Hong_Kong",
    });
    for (const text of [
      "公開相片修復佇列",
      "待處理 2 · 處理中 1 · 需人工覆核 1 · 最早等待 10 分鐘",
      "動物 · e1",
      "需人工覆核 · 第 3 次 · 原因碼：E_TIMEOUT",
      "待處理 · 第 0 次 · 原因碼：未記錄",
      `建立：${created}`,
      "· 下次處理：",
      "覆核並重試",
    ]) {
      expect(markup, text).toContain(text);
    }
  });
});
