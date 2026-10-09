import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderAdminInChinese, renderAdminInEnglish } from "../i18n/testing";

/**
 * `useUnsavedVolunteerDraft` hands the router a function that asks before leaving a page whose policy
 * draft has unsaved changes. The router is replaced by one that keeps what it was given, so the
 * function can be called the way the router calls it. The test environment has no browser window, so
 * the test gives `window.confirm` for the length of each call.
 */
type BlockerOptions = {
  disabled: boolean;
  enableBeforeUnload: boolean;
  shouldBlockFn: (change: { current: { pathname: string }; next: { pathname: string } }) => boolean;
};
let given: BlockerOptions | null = null;
const realRouter = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useBlocker: (options: BlockerOptions) => {
    given = options;
  },
}));
const { useUnsavedVolunteerDraft } = await import("./useUnsavedVolunteerDraft");

function Page({ dirty, prompt }: { dirty: boolean; prompt?: string }): ReactElement {
  useUnsavedVolunteerDraft(dirty, prompt);
  return <p>page</p>;
}

const leavingForAnotherPage = {
  current: { pathname: "/admin/volunteers/settings" },
  next: { pathname: "/admin/volunteers/people" },
};

/** Asks the router's function whether to block, answering the prompt with `answer`; returns the prompt. */
function ask(answer: boolean, change = leavingForAnotherPage) {
  const original = (globalThis as { window?: unknown }).window;
  let prompt = null as string | null;
  (globalThis as { window?: unknown }).window = {
    confirm: (text: string) => {
      prompt = text;
      return answer;
    },
  };
  try {
    return { blocked: given?.shouldBlockFn(change), prompt };
  } finally {
    (globalThis as { window?: unknown }).window = original;
  }
}

afterEach(() => {
  given = null;
});

describe("leaving an unsaved policy draft", () => {
  test("asks in English for an English admin, and in Chinese for a Chinese one", () => {
    renderAdminInEnglish(<Page dirty />);
    expect(ask(false).prompt).toBe("You have unsaved changes. Discard them and leave?");
    renderAdminInChinese(<Page dirty />);
    expect(ask(false).prompt).toBe("目前有未儲存修改，確定捨棄並離開？");
  });

  test("asks in Chinese outside the admin language provider, as it always did", () => {
    renderToStaticMarkup(<Page dirty />);
    expect(ask(false).prompt).toBe("目前有未儲存修改，確定捨棄並離開？");
  });

  test("uses the prompt the page gives", () => {
    renderAdminInEnglish(<Page dirty prompt="Own words" />);
    expect(ask(false).prompt).toBe("Own words");
  });

  test("blocks a change of page unless the person confirms, and never blocks the same page", () => {
    renderAdminInEnglish(<Page dirty />);
    expect(given?.disabled).toBe(false);
    expect(given?.enableBeforeUnload).toBe(true);
    expect(ask(false).blocked).toBe(true);
    expect(ask(true).blocked).toBe(false);
    const samePage = ask(false, {
      current: { pathname: "/admin/volunteers/settings" },
      next: { pathname: "/admin/volunteers/settings" },
    });
    expect(samePage.blocked).toBe(false);
    expect(samePage.prompt).toBeNull();
  });

  test("blocks nothing while the draft is saved", () => {
    renderAdminInEnglish(<Page dirty={false} />);
    expect(given?.disabled).toBe(true);
    expect(given?.enableBeforeUnload).toBe(false);
  });
});
