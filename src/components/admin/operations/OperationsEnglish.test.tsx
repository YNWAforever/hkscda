import { describe, expect, mock, test } from "bun:test";

import { selectTaskDefinitions, type TaskCard } from "../../../lib/operations/taskOverview.server";
import {
  expectNoChineseInCopy,
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../i18n/testing";

const realQuery = await import("@tanstack/react-query");

type QueryState = Record<string, unknown>;
let identity: QueryState = {};
let tasks: QueryState = {};

mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQuery: (options: { queryKey: readonly unknown[] }) =>
    options.queryKey[0] === "admin-me" ? identity : tasks,
}));

const { TaskOverview, TaskOverviewPage, TaskOverviewView } = await import("./TaskOverview");
const { operationsCopy } = await import("./copy");

const ACTIVE = { data: { admin: { authUserId: "a", role: "admin", status: "active" } } };
const OLDEST = "2026-10-01T02:30:00Z";

function cardsFor(role: "staff" | "treasurer" | "admin"): TaskCard[] {
  return selectTaskDefinitions(role).map((card, index) => ({
    ...card,
    metric:
      index % 2 === 0
        ? { state: "ready", count: index + 1, oldestAt: OLDEST }
        : { state: "unavailable" },
  }));
}

describe("task overview in English", () => {
  test("shows every role's cards in English, whatever text the server sent", () => {
    for (const role of ["staff", "treasurer", "admin"] as const) {
      const markup = renderAdminInEnglish(<TaskOverviewView cards={cardsFor(role)} />);
      expectNoChineseText(markup);
      expect(markup).toContain("Suggested first steps");
      expect(markup).toContain("Step 1");
      expect(markup).toContain("Open workspace");
      expect(markup).toContain("Could not be read");
      expect(markup).toContain("Oldest: 1 Oct 2026 (Thu) 10:30");
    }
  });

  test("names the cards by key", () => {
    const markup = renderAdminInEnglish(<TaskOverviewView cards={cardsFor("admin")} />);
    expect(markup).toContain("Content drafts to review");
    expect(markup).toContain("Expired content");
    expect(markup).toContain("Public media repairs that failed");
    expect(markup).toContain("Check the expired content");
  });

  test("shows the page heading and introduction in English", () => {
    identity = ACTIVE;
    tasks = { isLoading: true };
    const markup = renderAdminInEnglish(<TaskOverviewPage />);
    expectNoChineseText(markup);
    expect(markup).toMatch(/<h1[^>]*>Task overview<\/h1>/);
    expect(markup).toContain("Shows the workload for your current access.");
  });

  test("shows each loading and failure state in English", () => {
    identity = { isPending: true };
    const checking = renderAdminInEnglish(<TaskOverview />);
    expectNoChineseText(checking);
    expect(checking).toContain("Checking your staff account…");

    identity = { data: { admin: { authUserId: "a", role: "admin", status: "disabled" } } };
    const unconfirmed = renderAdminInEnglish(<TaskOverview />);
    expectNoChineseText(unconfirmed);
    expect(unconfirmed).toContain("Could not confirm an active staff account. Sign in again.");

    identity = ACTIVE;
    tasks = { isLoading: true };
    const loading = renderAdminInEnglish(<TaskOverview />);
    expectNoChineseText(loading);
    expect(loading).toContain("Loading tasks…");

    tasks = { isError: true, error: new Error("boom"), isFetching: false };
    const failed = renderAdminInEnglish(<TaskOverview />);
    expectNoChineseText(failed);
    expect(failed).toContain("Could not load");
    expect(failed).toContain("Retry");

    tasks = { data: { cards: cardsFor("staff") } };
    expectNoChineseText(renderAdminInEnglish(<TaskOverview />));
  });

  test("has no Chinese anywhere in the English copy", () => {
    expectNoChineseInCopy(operationsCopy.en);
  });
});

describe("task overview in Chinese", () => {
  test("is unchanged", () => {
    identity = ACTIVE;
    tasks = { isLoading: true };
    const page = renderAdminInChinese(<TaskOverviewPage />);
    expect(page).toMatch(/<h1[^>]*>待辦總覽<\/h1>/);
    expect(page).toContain(
      "按你目前的職員權限顯示工作量。未能讀取的來源會顯示未知，請到工作區核對及處理。",
    );
    expect(page).toContain("正在載入待辦…");

    identity = { isPending: true };
    expect(renderAdminInChinese(<TaskOverview />)).toContain("正在核對職員身份…");
    identity = { data: { admin: { authUserId: "a", role: "admin", status: "disabled" } } };
    expect(renderAdminInChinese(<TaskOverview />)).toContain("未能確認有效職員身份，請重新登入。");
  });

  test("shows the server's own Chinese text for every card, and the legacy date", () => {
    const cards = cardsFor("treasurer");
    const markup = renderAdminInChinese(<TaskOverviewView cards={cards} />);
    for (const card of cards) {
      expect(markup, card.key).toContain(card.label);
      expect(markup, card.key).toContain(card.guidance);
    }
    expect(markup).toContain(
      `最早：${new Date(OLDEST).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong" })}`,
    );
    expect(markup).toContain("步驟 1");
    expect(markup).toContain("開啟工作區");
    expect(markup).toContain("未能讀取");
  });
});
