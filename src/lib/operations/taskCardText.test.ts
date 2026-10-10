import { describe, expect, test } from "bun:test";
import { findChineseRuns } from "../../components/admin/i18n/testing";
import { isTaskKey, taskCardText, taskCardTextFor, type TaskKey } from "./taskCardText";
import { readTaskOverview, selectTaskDefinitions } from "./taskOverview.server";

// What the server sent before the cards had English text. The API still sends exactly this.
const ZH_SERVER_TEXT: Record<TaskKey, { label: string; guidance: string; href: string }> = {
  adoption_unassigned: {
    label: "待分派領養個案",
    guidance: "按等候時間檢查未分派個案，先指派跟進人。",
    href: "/admin/coordinator/inbox",
  },
  followup_overdue: {
    label: "逾期待跟進",
    guidance: "檢查到期任務，記錄下一步及跟進日期。",
    href: "/admin/coordinator/tasks",
  },
  volunteer_pending: {
    label: "待核實義工登記",
    guidance: "核對身份、政策同意及資格，再安排審核。",
    href: "/admin/volunteers",
  },
  animal_missing_photo: {
    label: "待補相片動物",
    guidance: "補上已核實的動物相片及資料，再交內容審核。",
    href: "/admin?section=cat",
  },
  sponsorship_proof_pending: {
    label: "待核實助養憑證",
    guidance: "檢查憑證與承諾；上載憑證不等於已收款。",
    href: "/admin/sponsorships?proof=pending",
  },
  sponsorship_followup: {
    label: "助養待跟進",
    guidance: "核對付款及待跟進承諾，交由職員／管理員安排跟進。",
    href: "/admin/sponsorships?status=needs_followup",
  },
  payment_pending: {
    label: "待對帳款項",
    guidance: "核對付款證據及對帳資料，再逐筆確認款項。",
    href: "/admin?section=payments",
  },
  delivery_attention: {
    label: "收條／通知需處理",
    guidance: "核對已收款及收件資料，再逐筆處理失敗工作。",
    href: "/admin?section=payments#delivery-jobs",
  },
  content_drafts: {
    label: "待審內容草稿",
    guidance: "核對資料來源及內容預覽，再安排送審。",
    href: "/admin/content",
  },
  content_expired: {
    label: "已過期內容",
    guidance: "檢查過期內容及公開影響，再安排更新。",
    href: "/admin/content?quality=expired",
  },
  media_failed: {
    label: "公開媒體修復失敗",
    guidance: "查看失敗媒體，修復後再核對公開相片。",
    href: "/admin?section=cat",
  },
};

const KEYS = Object.keys(ZH_SERVER_TEXT) as TaskKey[];
const ROLES = ["staff", "treasurer", "admin"] as const;

describe("taskCardText", () => {
  test("defaults to the zh-HK text", () => {
    for (const key of KEYS) {
      expect(taskCardText(key)).toEqual(taskCardText(key, "zh"));
    }
  });

  test("zh text is the text the server has always sent", () => {
    for (const key of KEYS) {
      const { label, guidance } = ZH_SERVER_TEXT[key];
      expect(taskCardText(key, "zh"), key).toEqual({ label, guidance });
    }
  });

  test("every card has English text without Chinese", () => {
    for (const key of KEYS) {
      const english = taskCardText(key, "en");
      expect(english.label, key).not.toBe("");
      expect(english.guidance, key).not.toBe("");
      expect(findChineseRuns(`${english.label} ${english.guidance}`), key).toEqual([]);
    }
  });

  test("English text is sentence case and tells staff what to do", () => {
    for (const key of KEYS) {
      const { label, guidance } = taskCardText(key, "en");
      expect(label[0], key).toBe(label[0].toUpperCase());
      expect(guidance.endsWith("."), key).toBe(true);
    }
  });
});

describe("a card key this page does not know", () => {
  const unknown = { key: "brand_new_task", label: "新工作", guidance: "新的指引。" };

  test("isTaskKey knows the eleven keys and nothing else", () => {
    for (const key of KEYS) expect(isTaskKey(key), key).toBe(true);
    for (const key of ["brand_new_task", "", "constructor", "__proto__", "toString"]) {
      expect(isTaskKey(key), key).toBe(false);
    }
  });

  test("shows the server's own text in either language instead of failing", () => {
    expect(taskCardTextFor(unknown, "zh")).toEqual({ label: "新工作", guidance: "新的指引。" });
    expect(taskCardTextFor(unknown, "en")).toEqual({ label: "新工作", guidance: "新的指引。" });
    expect(taskCardTextFor(unknown)).toEqual({ label: "新工作", guidance: "新的指引。" });
  });

  test("a known key uses the table and ignores the text the server sent", () => {
    const sent = { key: "content_expired", label: "server label", guidance: "server guidance" };
    expect(taskCardTextFor(sent, "en")).toEqual(taskCardText("content_expired", "en"));
    expect(taskCardTextFor(sent, "zh")).toEqual(taskCardText("content_expired", "zh"));
  });
});

describe("the task overview server", () => {
  test("keeps sending the zh-HK label, guidance and destination for every card", () => {
    const sent = new Map(
      ROLES.flatMap((role) => selectTaskDefinitions(role)).map((card) => [card.key, card]),
    );
    expect([...sent.keys()].sort()).toEqual([...KEYS].sort());
    for (const key of KEYS) {
      expect(sent.get(key), key).toEqual({ key, ...ZH_SERVER_TEXT[key] });
    }
  });

  test("keeps the order of the fields it sends", async () => {
    const cards = await readTaskOverview("treasurer", {
      count: async () => ({ count: 1, oldestAt: null }),
    });
    expect(Object.keys(cards[0])).toEqual(["key", "label", "guidance", "href", "metric"]);
  });
});
