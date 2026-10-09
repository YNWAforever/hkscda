import React, { type ReactNode, type ReactElement } from "react";
import { beforeEach, expect, mock, test } from "bun:test";
// Coupling: this test calls the intake settings form as a plain function and answers `useState` by
// call order, so a new `useState` in the form, or a change to the order of the existing ones,
// needs a matching change in the mock below. The screen text is in InternshipsEnglish.test.tsx,
// which renders the form without this mock.
let hookIndex = 0;
const state: unknown[] = [];
mock.module("react", () => ({
  ...React,
  useState: <T,>(initial: T | (() => T)) => {
    const index = hookIndex++;
    if (!(index in state))
      state[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    return [
      state[index] as T,
      (value: T | ((current: T) => T)) => {
        state[index] =
          typeof value === "function" ? (value as (current: T) => T)(state[index] as T) : value;
      },
    ];
  },
}));
// The form reads the language from React context, which this test does not mount, so the language
// hook answers from `language`, which is Chinese unless a test switches it.
let language: "zh" | "en" = "zh";
const realLanguage = await import("../adminI18n");
mock.module("../adminI18n", () => ({
  ...realLanguage,
  useAdminLanguage: () => ({
    language,
    copy: realLanguage.adminCopy[language],
    setLanguage: () => {},
  }),
}));

const validDraft = {
  enabled: true,
  name: "Vet student internship",
  shelters: ["cat"],
  opens_at: "2026-10-01T00:00:00+08:00",
  closes_at: "2026-12-31T23:59:00+08:00",
  instructions: "Bring your student card",
};
let draft: Record<string, unknown> = validDraft;
const realQuery = await import("@tanstack/react-query");
mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQuery: () => ({
    isLoading: false,
    error: null,
    refetch: async () => ({}),
    data: {
      draft: { body: draft, revision: 2 },
      current: { body: draft },
      history: [],
    },
  }),
}));
// What every request to the API does: fail with this, or answer.
let failWith: unknown = null;
let requests = 0;
mock.module("../../../lib/admin/http", () => ({
  fetchAdminJson: async () => {
    requests++;
    if (failWith !== null) throw failWith;
    return {};
  },
}));
const { IntakeSettings } = await import("./InternshipManagement");

type Props = { children?: ReactNode; role?: string; onClick?: () => Promise<void> };
function walk(node: ReactNode, result: ReactElement<Props>[] = []): ReactElement<Props>[] {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, result);
  } else if (React.isValidElement<Props>(node)) {
    result.push(node);
    walk(node.props.children, result);
  }
  return result;
}
function render() {
  hookIndex = 0;
  return IntakeSettings();
}
async function saveDraft() {
  const label = language === "zh" ? "儲存草稿" : "Save draft";
  await walk(render()).find((n) => n.type === "button" && n.props.children === label)!.props
    .onClick!();
}
const textOf = (role: "alert" | "status") =>
  String(walk(render()).find((n) => n.props.role === role)?.props.children);

beforeEach(() => {
  state.length = 0;
  language = "zh";
  failWith = null;
  requests = 0;
  draft = validDraft;
});

test("a blank title is told to staff in a sentence, in the language it is shown in", async () => {
  draft = { ...validDraft, name: "   " };
  await saveDraft();
  expect(textOf("alert")).toBe("請填寫標題");
  language = "en";
  expect(textOf("alert")).toBe("Enter a title, then save again.");
  // The form is refused in the browser, so nothing is sent.
  expect(requests).toBe(0);
});

test("no venue chosen is told to staff in a sentence, in the language it is shown in", async () => {
  draft = { ...validDraft, shelters: [] };
  await saveDraft();
  expect(textOf("alert")).toBe("請至少選擇一個服務場地");
  language = "en";
  expect(textOf("alert")).toBe("Choose at least one venue, then save again.");
});

test("a closing time before the opening time keeps its zh-HK message and has an English one", async () => {
  draft = {
    ...validDraft,
    opens_at: "2026-12-31T23:59:00+08:00",
    closes_at: "2026-10-01T00:00:00+08:00",
  };
  await saveDraft();
  expect(textOf("alert")).toBe("截止時間必須晚於開放時間");
  language = "en";
  expect(textOf("alert")).toBe(
    "The closing time must be after the opening time. Change one of them and save again.",
  );
});

test("any other failed check is a general sentence, never the raw validation JSON", async () => {
  draft = { ...validDraft, instructions: "x".repeat(3001) };
  await saveDraft();
  const message = textOf("alert");
  expect(message).toBe("請檢查收生設定欄位");
  expect(message).not.toContain("too_big");
  language = "en";
  expect(textOf("alert")).toBe("Check the intake settings fields, then save again.");
});

test("a message the API sends in zh-HK is written in the language it is shown in", async () => {
  failWith = new Error("沒有此操作權限");
  await saveDraft();
  expect(textOf("alert")).toBe("沒有此操作權限");
  language = "en";
  expect(textOf("alert")).toBe(
    "You do not have permission to do this. Ask an administrator to check your role.",
  );
});

test("any other reason the server gives is shown as it came, and no reason falls back to the code", async () => {
  failWith = new Error("Some other server message");
  await saveDraft();
  expect(textOf("alert")).toBe("Some other server message");
  language = "en";
  expect(textOf("alert")).toBe("Some other server message");
  state.length = 0;
  failWith = "no reason";
  language = "zh";
  await saveDraft();
  expect(textOf("alert")).toBe("設定未能儲存");
  language = "en";
  expect(textOf("alert")).toBe("Could not save the settings. Check the form and try again.");
});

test("a saved draft says so in the language it is shown in", async () => {
  await saveDraft();
  expect(requests).toBe(1);
  expect(textOf("status")).toBe("草稿已儲存，未影響目前申請。");
  language = "en";
  expect(textOf("status")).toBe("Draft saved. Current applications are not affected.");
});
