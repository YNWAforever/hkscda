import { describe, expect, mock, test } from "bun:test";

import { FAQ_CTA_OPTIONS } from "../../../lib/faq/schemas";
import type { SearchGap } from "../../../lib/faq/searchGaps";
import type { FaqEntry, HelpFaq } from "../../../lib/faq/types";
import { adminCommonCopy } from "../i18n/adminCommonCopy";
import {
  collectCopyStrings,
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../i18n/testing";

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

const realQuery = await import("@tanstack/react-query");

/**
 * How the screen is rendered here. The FAQ page runs two independent queries, so React Query is
 * replaced for this file only (it runs with `--isolate`, as `bun run test` does, because
 * `mock.module` outlives the file otherwise).
 *
 * - `useQuery` answers by the first part of the query key: the FAQ list or the search-gap report.
 *   `failures` names the queries that fail, `loading` the ones that have not answered yet.
 * - `useMutation` returns `state.mutationError` as the error of every mutation of the page.
 *
 * The question form opens from a button, so it is exported by its module and rendered directly.
 */
const state = {
  failures: new Set<string>(),
  loading: new Set<string>(),
  mutationError: null as Error | null,
  noGaps: false,
};

// The topic visitors searched for, the question and the query staff typed are data: shown as
// stored in both languages. None of them contains a word that is also a label (a test below
// checks that).
const ZH_QUESTION = "幾時可以探訪收容所？";
const ZH_ANSWER = "探訪需預約。";
const ZH_KEYWORDS = ["探訪", "預約"];
const ZH_QUERY = "探訪收容所";
const ZH_ENTRY_QUESTION = "松鼠基金怎樣運作？";
const ZH_ENTRY_ANSWER = "松鼠基金按月運作。";
const GAP_TOPIC = "寵物證書";
const DATA = [
  ZH_QUESTION,
  ZH_ANSWER,
  ...ZH_KEYWORDS,
  ZH_QUERY,
  ZH_ENTRY_QUESTION,
  ZH_ENTRY_ANSWER,
  GAP_TOPIC,
];

const stamp = "2026-07-18T00:00:00.000Z";
const entries: FaqEntry[] = [
  {
    id: "q1",
    category: "sponsorship",
    question: { "zh-HK": ZH_ENTRY_QUESTION, en: "How does the fund work?" },
    answer: { "zh-HK": ZH_ENTRY_ANSWER, en: "It runs monthly." },
    keywords: { "zh-HK": [], en: ["fund"] },
    ctaKey: "view_sponsor_animals",
    sensitive: false,
    sortOrder: 1,
    isActive: true,
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: "q2",
    category: "tax_receipt",
    question: { "zh-HK": ZH_ENTRY_QUESTION, en: "Can I get a tax receipt?" },
    answer: { "zh-HK": ZH_ENTRY_ANSWER, en: "Yes." },
    keywords: { "zh-HK": [], en: ["receipt"] },
    ctaKey: null,
    sensitive: true,
    sortOrder: 2,
    isActive: false,
    createdAt: stamp,
    updatedAt: stamp,
  },
];

const gaps: SearchGap[] = [
  {
    topic: GAP_TOPIC,
    language: "zh-HK",
    confidence: "none",
    searchCount: 12,
    lastSeenDay: "2026-10-07",
  },
  {
    topic: "tax receipt for cheque",
    language: "en",
    confidence: "low",
    searchCount: 1234,
    lastSeenDay: "2026-09-29",
  },
];

const testerFaqs: HelpFaq[] = [
  {
    id: "visit-hours",
    category: "contact",
    question: { "zh-HK": ZH_QUESTION, en: "When can I visit the shelter?" },
    answer: { "zh-HK": ZH_ANSWER, en: "Visits are by appointment. Bring a photo ID." },
    keywords: { "zh-HK": ZH_KEYWORDS, en: ["visit", "appointment"] },
  },
  {
    id: "application-check",
    category: "adoption",
    question: { "zh-HK": "甲乙丙丁？", en: "How do I check on an application?" },
    answer: { "zh-HK": "甲乙丙丁。", en: "Check the application status in your email." },
    keywords: { "zh-HK": ["甲乙"], en: ["application"] },
  },
];
DATA.push("甲乙丙丁？", "甲乙丙丁。", "甲乙");

mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useMutation: () => ({
    mutate() {},
    isPending: false,
    isError: state.mutationError !== null,
    error: state.mutationError,
  }),
  useQuery: (options: { queryKey: readonly unknown[] }) => {
    const key = String(options.queryKey[0]);
    const base = { isFetching: false, refetch() {} };
    if (state.loading.has(key)) {
      return { ...base, data: undefined, isLoading: true, isError: false, error: null };
    }
    if (state.failures.has(key)) {
      return {
        ...base,
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error("boom"),
      };
    }
    const done = { ...base, isLoading: false, isError: false, error: null };
    if (key === "admin-faq") return { ...done, data: entries };
    if (key === "admin-faq-search-gaps") {
      return { ...done, data: { days: 30, gaps: state.noGaps ? [] : gaps } };
    }
    return { ...done, data: undefined };
  },
}));

const { FaqEntryForm, FaqManagement } = await import("./FaqManagement");
const { FaqAnswerTester } = await import("./FaqAnswerTester");
const { FaqSearchGapsReport } = await import("./FaqSearchGapsReport");
const { faqCopy } = await import("./faqCopy");

function expectAll(markup: string, texts: string[]) {
  for (const text of texts) expect(markup, text).toContain(text);
}

/** Visible text only, so assertions do not depend on the element structure. */
function textOf(markup: string) {
  return markup.replace(/<[^>]+>/g, "");
}

function reset() {
  state.failures = new Set();
  state.loading = new Set();
  state.mutationError = null;
  state.noGaps = false;
}

const noop = () => {};

describe("the FAQ page in English", () => {
  test("shows the list, the report and the tester in English, in that order", () => {
    reset();
    const markup = renderAdminInEnglish(<FaqManagement />);
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      ">FAQ</h1>",
      "Add question",
      ">Category</th>",
      ">Question</th>",
      ">Sort order</th>",
      ">Status</th>",
      ">Sponsorship</td>",
      ">Tax receipts</td>",
      // the English column is shown
      ">How does the fund work?</td>",
      ">Can I get a tax receipt?</td>",
      ">Shown</td>",
      ">Disabled</td>",
      ">Edit</button>",
      ">Disable</button>",
    ]);
    const heading = markup.indexOf("FAQ</h1>");
    const report = markup.indexOf("Topics searched with no answer (last 30 days)");
    const tester = markup.indexOf("Test answers");
    const table = markup.indexOf("<table", tester);
    expect(report).toBeGreaterThan(heading);
    expect(tester).toBeGreaterThan(report);
    expect(table).toBeGreaterThan(tester);
  });

  test("says what to do after a failed disable", () => {
    reset();
    state.mutationError = new Error("boom");
    const markup = renderAdminInEnglish(<FaqManagement />);
    expect(markup).toContain("Could not disable the question. Try again.");
    expectNoChineseText(markup, { allow: DATA });
    reset();
  });

  test("shows a failed list with a retry control, and keeps the report", () => {
    reset();
    state.failures.add("admin-faq");
    const markup = renderAdminInEnglish(<FaqManagement />);
    expectAll(markup, [
      "Could not load the FAQ",
      "Retry",
      "Topics searched with no answer (last 30 days)",
    ]);
    expect(markup).not.toContain("Test answers");
    expectNoChineseText(markup, { allow: DATA });
    reset();
  });

  test("keeps the list when the report fails to load", () => {
    reset();
    state.failures.add("admin-faq-search-gaps");
    const markup = renderAdminInEnglish(<FaqManagement />);
    expectAll(markup, ["Could not load the search topics report", "Test answers", "<table"]);
    expect(markup).not.toContain("Could not load the FAQ");
    reset();
  });

  test("shows loading in English", () => {
    reset();
    state.loading.add("admin-faq");
    expect(renderAdminInEnglish(<FaqManagement />)).toContain("Loading…");
    reset();
  });

  test("keeps the Chinese page as it was", () => {
    reset();
    const markup = renderAdminInChinese(<FaqManagement />);
    expectAll(markup, [
      ">常見問題</h1>",
      "新增問題",
      ">分類</th>",
      ">助養</td>",
      ">報稅收據</td>",
      `>${ZH_ENTRY_QUESTION}</td>`,
      ">顯示中</td>",
      ">已停用</td>",
      ">編輯</button>",
      ">停用</button>",
      "搜尋未有答案的主題（過去 30 日）",
      "測試答案",
    ]);
    expect(markup.indexOf("搜尋未有答案的主題")).toBeLessThan(markup.indexOf("測試答案"));
    state.mutationError = new Error("boom");
    expect(renderAdminInChinese(<FaqManagement />)).toContain("停用操作失敗，請再試一次。");
    reset();
  });
});

describe("the FAQ question form in English", () => {
  const draft = {
    category: "donation" as const,
    questionZh: ZH_ENTRY_QUESTION,
    questionEn: "Question",
    answerZh: ZH_ENTRY_ANSWER,
    answerEn: "Answer",
    keywordsZh: ZH_KEYWORDS.join(", "),
    keywordsEn: "a, b",
    ctaKey: "contact_for_receipt",
    sensitive: true,
    sortOrder: 3,
    isActive: false,
  };
  const form = (failed: boolean) => (
    <FaqEntryForm
      draft={draft}
      onDraftChange={noop}
      onSubmit={noop}
      onCancel={noop}
      pending={false}
      failed={failed}
    />
  );

  test("names every field, and lists the action buttons by their English label", () => {
    const markup = renderAdminInEnglish(form(true));
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Category",
      ">Sponsorship</option>",
      ">Adoption</option>",
      ">Tax receipts</option>",
      ">Donations</option>",
      ">Contact staff</option>",
      "Question (Chinese)",
      "Question (English)",
      "Answer (Chinese)",
      "Answer (English)",
      "Keywords (Chinese, comma-separated)",
      "Keywords (English, comma-separated)",
      "Action button",
      ">(No action button)</option>",
      ">View sponsor animals</option>",
      ">Go to sponsorship form</option>",
      ">Go to adoption application</option>",
      ">Browse adoptable animals</option>",
      ">Get donation receipt info</option>",
      ">View donation arrangements</option>",
      ">Support HKSCDA</option>",
      ">View contact details</option>",
      "Involves personal or financial information",
      "Show on the /help page",
      "Sort order",
      "Could not save. Check the details and try again.",
      ">Save</button>",
      ">Cancel</button>",
    ]);
    // Ten options, as before, and the one the draft uses is selected.
    expect(markup.match(/<option value="[a-z_]+"/g)?.length).toBeGreaterThanOrEqual(
      FAQ_CTA_OPTIONS.length,
    );
    expect(markup).toContain(
      '<option value="contact_for_receipt" selected="">Contact staff</option>',
    );
  });

  test("keeps the Chinese form as it was", () => {
    const markup = renderAdminInChinese(form(true));
    expectAll(markup, [
      "分類",
      ">助養</option>",
      ">報稅收據</option>",
      "問題（中文）",
      "答案（中文）",
      "關鍵字（中文，以逗號分隔）",
      "行動按鈕",
      ">（沒有行動按鈕）</option>",
      ">查看可助養動物</option>",
      ">前往助養申請</option>",
      ">支持 HKSCDA</option>",
      "涉及個人資料／財務內容",
      "在 /help 頁面顯示",
      "儲存失敗，請檢查資料後再試一次。",
      ">儲存</button>",
      ">取消</button>",
    ]);
  });
});

describe("the FAQ answer tester in English", () => {
  type Props = Parameters<typeof FaqAnswerTester>[0];
  const render = (overrides: Partial<Props> = {}, language: "en" | "zh" = "en") => {
    const element = (
      <FaqAnswerTester
        faqs={testerFaqs}
        draftHidden={false}
        query=""
        language="zh-HK"
        onQueryChange={noop}
        onLanguageChange={noop}
        {...overrides}
      />
    );
    return language === "en" ? renderAdminInEnglish(element) : renderAdminInChinese(element);
  };

  test("names the match level and the outcome of a direct answer in English", () => {
    const markup = render({ query: ZH_QUERY, language: "zh-HK" });
    expectNoChineseText(markup, { allow: DATA });
    const text = textOf(markup);
    expect(text).toContain("Match level: High");
    expect(text).toContain("Visitors will see:");
    expect(text).toContain("Direct answer");
    expect(text).toContain("Matched questions:");
    expect(text).toContain(ZH_QUESTION);
    expect(text).not.toContain("Staff referral");
  });

  test("names a weaker match, its related answers and the staff fallback in English", () => {
    const text = textOf(render({ query: "photo", language: "en" }));
    expect(text).toContain("Match level: Low");
    expect(text).toContain("Related answers");
    expect(text).toContain("Staff referral");
    expect(text).toContain("When can I visit the shelter?");
    expect(textOf(render({ query: "appointments", language: "en" }))).toContain(
      "Match level: Medium",
    );
    expect(textOf(render({ query: "appointments", language: "en" }))).not.toContain(
      "Staff referral",
    );
  });

  test("names a query with no match, and a private-status query, in English", () => {
    const none = textOf(render({ query: "parking discount coupon", language: "en" }));
    expect(none).toContain("Match level: None");
    expect(none).toContain("Staff referral");
    expect(none).not.toContain("Direct answer");
    expect(none).not.toContain("Related answers");
    const privateQuery = textOf(render({ query: "my application status", language: "en" }));
    expect(privateQuery).toContain("Direct answer");
    expect(privateQuery).toContain("Staff referral");
    expect(privateQuery).toContain("Visitors will be advised to contact staff about this question");
  });

  test("shows no result area for an empty query", () => {
    for (const query of ["", "   "]) {
      const text = textOf(render({ query }));
      expect(text).not.toContain("Match level");
      expect(text).not.toContain("Direct answer");
      expect(text).not.toContain("Staff referral");
    }
  });

  test("names the heading, the fields, the languages and the notes in English", () => {
    const markup = render({ draftHidden: true, language: "en" });
    expectNoChineseText(markup, { allow: DATA });
    expectAll(markup, [
      "Test answers",
      "Enter how a visitor might ask, to see what the public search would show. Results include the draft you are editing, even if it is not saved.",
      "How the visitor asks",
      ">Language</legend>",
      "Chinese</label>",
      "English</label>",
      "This draft is set to hidden, so visitors will not see it until it is enabled.",
      "Published changes can take up to 5 minutes to appear on the visitor&#x27;s page.",
    ]);
    const radios = [...markup.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map((match) => ({
      value: /value="([^"]*)"/.exec(match[0])?.[1],
      checked: match[0].includes("checked"),
    }));
    expect(radios).toEqual([
      { value: "zh-HK", checked: false },
      { value: "en", checked: true },
    ]);
    expect(render({ draftHidden: false })).not.toContain("This draft is set to hidden");
  });

  test("keeps the Chinese tester as it was", () => {
    const high = textOf(render({ query: ZH_QUERY }, "zh"));
    expect(high).toContain("配對程度：高");
    expect(high).toContain("訪客會看到：");
    expect(high).toContain("直接答案");
    expect(high).toContain("配對的問題：");
    const low = textOf(render({ query: "photo", language: "en" }, "zh"));
    expect(low).toContain("配對程度：低");
    expect(low).toContain("相關答案");
    expect(low).toContain("轉介職員");
    expect(textOf(render({ query: "appointments", language: "en" }, "zh"))).toContain(
      "配對程度：中",
    );
    expect(textOf(render({ query: "parking discount coupon", language: "en" }, "zh"))).toContain(
      "配對程度：沒有",
    );
    expect(textOf(render({ query: "my application status", language: "en" }, "zh"))).toContain(
      "此問題會建議訪客聯絡職員",
    );
    const chrome = textOf(render({ draftHidden: true }, "zh"));
    expectAll(chrome, [
      "測試答案",
      "輸入訪客的問法，查看公開搜尋會顯示甚麼。結果包括正在編輯、尚未儲存的草稿。",
      "訪客的問法",
      "中文",
      "此草稿目前設為不顯示，訪客在啟用前不會看到。",
      "已發佈的修改最多需要 5 分鐘才會在訪客的頁面上出現。",
    ]);
  });
});

describe("the search-gap report in English", () => {
  const render = (overrides: { loading?: boolean; failed?: boolean; empty?: boolean } = {}) => {
    reset();
    if (overrides.loading) state.loading.add("admin-faq-search-gaps");
    if (overrides.failed) state.failures.add("admin-faq-search-gaps");
    state.noGaps = Boolean(overrides.empty);
    const element = <FaqSearchGapsReport onTest={noop} onCreate={noop} />;
    const english = renderAdminInEnglish(element);
    const chinese = renderAdminInChinese(element);
    reset();
    return { english, chinese };
  };

  test("names the result of each topic, its language, count and day in English", () => {
    const { english } = render();
    expectNoChineseText(english, { allow: DATA });
    expectAll(english, [
      "Topics searched with no answer (last 30 days)",
      ">Topic</th>",
      ">Language</th>",
      ">Result</th>",
      ">Searches</th>",
      ">Last seen</th>",
      '<span class="sr-only">Actions</span>',
      // the two labels the brief names
      ">No answer</td>",
      ">Weak match</td>",
      ">Chinese</td>",
      ">English</td>",
      ">12</td>",
      ">1,234</td>",
      "7 Oct 2026 (Wed)",
      "29 Sep 2026 (Tue)",
      ">Test</button>",
      ">Add question from this</button>",
      `aria-label="Test &quot;${GAP_TOPIC}&quot;"`,
      `aria-label="Add a question from &quot;${GAP_TOPIC}&quot;"`,
    ]);
  });

  test("shows loading, a failure with a retry control and the empty message in English", () => {
    expect(render({ loading: true }).english).toContain("Loading…");
    const failed = render({ failed: true }).english;
    expectAll(failed, ["Could not load the search topics report", "Retry"]);
    expect(failed).not.toContain("No searches went unanswered");
    const empty = render({ empty: true }).english;
    expect(empty).toContain("No searches went unanswered in the last 30 days.");
    expect(empty).not.toContain("<table");
  });

  test("keeps the Chinese report as it was", () => {
    const { chinese } = render();
    expectAll(chinese, [
      "搜尋未有答案的主題（過去 30 日）",
      ">主題</th>",
      ">結果</th>",
      ">沒有答案</td>",
      ">配對較弱</td>",
      ">中文</td>",
      ">English</td>",
      ">12</td>",
      ">1234</td>",
      "2026年10月7日 (三)",
      "2026年9月29日 (二)",
      ">測試</button>",
      ">以此新增問題</button>",
      `aria-label="測試「${GAP_TOPIC}」"`,
      `aria-label="以此新增問題「${GAP_TOPIC}」"`,
    ]);
    expect(render({ empty: true }).chinese).toContain("過去 30 日未有訪客搜尋找不到答案。");
  });
});

describe("the copy module", () => {
  test("has no Chinese in English and as many texts in English as in Chinese", () => {
    expectNoChineseInCopy(faqCopy.en);
    expect(collectCopyStrings(faqCopy.en).length).toBeGreaterThan(0);
    expect(collectCopyStrings(faqCopy.zh).length).toBe(collectCopyStrings(faqCopy.en).length);
  });

  test("writes the report's labels, the tester's outcomes and the categories in English", () => {
    expect(faqCopy.en.gaps.confidence).toEqual({ none: "No answer", low: "Weak match" });
    expect(faqCopy.zh.gaps.confidence).toEqual({ none: "沒有答案", low: "配對較弱" });
    expect(faqCopy.en.tester.confidence).toEqual({
      high: "High",
      medium: "Medium",
      low: "Low",
      none: "None",
    });
    expect(faqCopy.zh.tester.confidence).toEqual({
      high: "高",
      medium: "中",
      low: "低",
      none: "沒有",
    });
    expect([
      faqCopy.en.tester.direct,
      faqCopy.en.tester.related,
      faqCopy.en.tester.referToStaff,
    ]).toEqual(["Direct answer", "Related answers", "Staff referral"]);
    expect([
      faqCopy.zh.tester.direct,
      faqCopy.zh.tester.related,
      faqCopy.zh.tester.referToStaff,
    ]).toEqual(["直接答案", "相關答案", "轉介職員"]);
    expect(faqCopy.en.categories).toEqual({
      sponsorship: "Sponsorship",
      adoption: "Adoption",
      tax_receipt: "Tax receipts",
      donation: "Donations",
      contact: "Contact staff",
    });
  });

  test("shows the report's counts as Chinese always has, and the day in the shared format", () => {
    expect(faqCopy.zh.gaps.count(1234)).toBe("1234");
    expect(faqCopy.zh.gaps.day("2026-10-07")).toBe("2026年10月7日 (三)");
    expect(faqCopy.en.gaps.count(1234)).toBe("1,234");
    expect(faqCopy.en.gaps.day("2026-10-07")).toBe("7 Oct 2026 (Wed)");
  });

  test("fixture values are not labels, so allowing them cannot hide an untranslated label", () => {
    const labels = [faqCopy, adminCommonCopy]
      .flatMap((module) => collectCopyStrings(module.zh))
      .filter((text) => text.length >= 2 && /\p{Script=Han}/u.test(text));
    const clashes = DATA.flatMap((data) =>
      labels
        .filter((label) => data.includes(label) || label.includes(data))
        .map((label) => `${data} / ${label}`),
    );
    expect(clashes).toEqual([]);
  });
});
