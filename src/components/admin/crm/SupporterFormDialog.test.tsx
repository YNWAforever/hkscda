import React, { type ReactNode } from "react";
import { beforeEach, describe, expect, mock, test } from "bun:test";

import { AdminSessionError } from "../../../lib/admin/session";
import type { SupporterSummary } from "../../../lib/crm/types";
import { expectNoChineseText } from "../i18n/testing";

/**
 * The supporter form is a dialog that is closed until it is clicked, and its body shows only
 * after the supporter has loaded, so a static render never reaches it. This test calls the
 * component as a function with its state hooks answering from a table, as the recovery tests
 * do, and reads the text out of the elements it returns. The state slots, in the order the
 * component declares them: 0 open, 1 draft, 2 baseline, 3 loadedId, 4 editVersion,
 * 5 loadError, 6 loading, 7 reloadToken, 8 discardPrompt.
 */
const OPEN = 0;
const DRAFT = 1;
const BASELINE = 2;
const LOADED_ID = 3;
const EDIT_VERSION = 4;
const LOAD_ERROR = 5;
const LOADING = 6;
const DISCARD_PROMPT = 8;

const state: unknown[] = [];
let index = 0;
let slots: Record<number, unknown> = {};

mock.module("react", () => ({
  ...React,
  useState: <T,>(start: T | (() => T)) => {
    const i = index++;
    if (!(i in state)) {
      state[i] = i in slots ? slots[i] : typeof start === "function" ? (start as () => T)() : start;
    }
    return [state[i] as T, () => {}];
  },
  useEffect: () => {},
}));

let language: "zh" | "en" = "en";

// The language hooks read React context, which this test does not mount.
const realPageCopy = await import("../adminPageCopy");
mock.module("../adminPageCopy", () => ({
  ...realPageCopy,
  useAdminPageCopy: () => ({
    language,
    pageCopy: realPageCopy.adminPageCopy[language],
  }),
}));
const realCopy = await import("../i18n/copy");
mock.module("../i18n/copy", () => ({
  ...realCopy,
  useAdminCopy: <T,>(copy: { zh: T; en: T }) => copy[language],
}));

const realQuery = await import("@tanstack/react-query");
let mutationError: unknown = null;
mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useMutation: () => ({ mutate() {}, reset() {}, isPending: false, error: mutationError }),
}));

const { SupporterFormDialog } = await import("./SupporterFormDialog");

const chineseDraft = {
  name: "陳大文",
  email: "chan@example.org",
  phone: "9123 4567",
  language: "zh-HK" as const,
  tags: "旺角街站",
  roles: ["donor" as const],
};

const supporter: SupporterSummary = {
  id: "sup-1",
  name: "陳大文",
  email: "chan@example.org",
  phone: "9123 4567",
  language: "zh-HK",
  tags: ["旺角街站"],
  roles: ["donor"],
  deletedAt: null,
  lastGiftAt: null,
  lastGiftAmountCents: null,
  lifetimeAmountCents: 0,
  donationCount: 0,
  receiptNeeded: false,
  emailConsent: null,
  whatsappConsent: null,
};

/** Every piece of text the dialog would show: text nodes, labels, placeholders and titles. */
function textOf(node: ReactNode, out: string[] = []): string[] {
  if (typeof node === "string" || typeof node === "number") out.push(String(node));
  else if (Array.isArray(node)) for (const child of node) textOf(child, out);
  else if (React.isValidElement<Record<string, unknown>>(node)) {
    for (const key of ["aria-label", "placeholder", "title"]) {
      const value = node.props[key];
      if (typeof value === "string") out.push(value);
    }
    textOf(node.props.children as ReactNode, out);
  }
  return out;
}

function show(
  props: Parameters<typeof SupporterFormDialog>[0],
  initial: Record<number, unknown>,
): string[] {
  index = 0;
  state.length = 0;
  slots = initial;
  return textOf(SupporterFormDialog(props));
}

const createLoaded = { [OPEN]: true, [LOADED_ID]: "create" };
const editLoaded = {
  [OPEN]: true,
  [LOADED_ID]: "sup-1",
  [EDIT_VERSION]: 4,
  [DRAFT]: chineseDraft,
  [BASELINE]: chineseDraft,
};
const conflict = Object.assign(new Error("Stale version"), { status: 409 });

beforeEach(() => {
  language = "en";
  mutationError = null;
});

describe("supporter form dialog in English", () => {
  test("shows the fields, the language options and the buttons of a new supporter", () => {
    const texts = show({ mode: "create" }, createLoaded);
    expectNoChineseText(texts.join("\n"));
    for (const text of [
      "New supporter",
      "Name",
      "Email",
      "Phone",
      "Language",
      "Tags",
      "Roles",
      "Traditional Chinese",
      "English",
      "Donor",
      "Adopter",
      "Volunteer",
      "Foster",
      "Cancel",
      "Save supporter",
    ]) {
      expect(texts, text).toContain(text);
    }
    expect(texts).not.toContain("Discard your unsaved changes?");
  });

  test("shows an edited supporter in English, with the data kept out of the text", () => {
    const texts = show({ mode: "edit", supporter }, editLoaded);
    expectNoChineseText(texts.join("\n"));
    expect(texts).toContain("Edit supporter");
    expect(texts).toContain("Save supporter");
    expect(texts).toContain("Cancel");
  });

  test("shows the loading state and the load failure with a retry", () => {
    const loading = show({ mode: "edit", supporter }, { [OPEN]: true, [LOADING]: true });
    expectNoChineseText(loading.join("\n"));
    expect(loading).toContain("Loading the latest supporter details…");
    expect(loading).not.toContain("Save supporter");
    const failed = show({ mode: "edit", supporter }, { [OPEN]: true, [LOAD_ERROR]: true });
    expectNoChineseText(failed.join("\n"));
    expect(failed).toContain("Could not load supporters");
    expect(failed).toContain("Retry");
  });

  test("shows the conflict and the discard prompt, and what to do next", () => {
    mutationError = conflict;
    const texts = show({ mode: "edit", supporter }, { ...editLoaded, [DISCARD_PROMPT]: true });
    expectNoChineseText(texts.join("\n"));
    for (const text of [
      "Another staff member changed this supporter, so your edits were not saved. Reload the latest version, then edit again.",
      "Discard my edits and reload",
      "Discard your unsaved changes?",
      "Keep editing",
      "Discard changes",
    ]) {
      expect(texts, text).toContain(text);
    }
  });

  test("shows any other save error as it came, and a missing session in English", () => {
    mutationError = new Error("Email already in use");
    const failed = show({ mode: "create" }, createLoaded);
    expect(failed).toContain("Email already in use");
    expect(failed).not.toContain("Discard my edits and reload");
    mutationError = new AdminSessionError("not_signed_in");
    const signedOut = show({ mode: "create" }, createLoaded);
    expect(signedOut).toContain("Not signed in. Sign in again.");
    expectNoChineseText(signedOut.join("\n"));
  });
});

describe("supporter form dialog in Chinese", () => {
  test("keeps the Chinese fields, options and buttons as they were", () => {
    language = "zh";
    const texts = show({ mode: "create" }, createLoaded);
    for (const text of [
      "新增支持者",
      "姓名",
      "電郵",
      "電話",
      "語言",
      "標籤",
      "身份",
      "繁體中文",
      "English",
      "取消",
      "儲存支持者",
    ]) {
      expect(texts, text).toContain(text);
    }
  });

  test("keeps the Chinese loading, conflict and discard messages as they were", () => {
    language = "zh";
    expect(show({ mode: "edit", supporter }, { [OPEN]: true, [LOADING]: true })).toContain(
      "正在載入最新支持者資料…",
    );
    expect(show({ mode: "edit", supporter }, { [OPEN]: true, [LOAD_ERROR]: true })).toContain(
      "重試",
    );
    mutationError = conflict;
    const texts = show({ mode: "edit", supporter }, { ...editLoaded, [DISCARD_PROMPT]: true });
    for (const text of [
      "資料已由其他職員更新。你的修改尚未儲存；請重新載入最新版本再編輯。",
      "放棄本次修改並重新載入",
      "尚有未儲存更改，確定要放棄？",
      "繼續編輯",
      "放棄更改",
    ]) {
      expect(texts, text).toContain(text);
    }
  });
});
