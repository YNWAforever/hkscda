import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderAdminInChinese, renderAdminInEnglish } from "../i18n/testing";

/**
 * `useUnsavedVolunteerDraft` hands the router what it needs to hold a page whose policy draft has
 * unsaved changes, and returns the dialog that asks before the page is left. The router is replaced
 * by one that keeps what it was given and answers with a chosen status; the dialog's primitives are
 * replaced by plain elements, because Radix renders into a portal that the server does not have.
 */
type BlockerOptions = {
  disabled: boolean;
  enableBeforeUnload: boolean;
  withResolver: boolean;
  shouldBlockFn: (change: { current: { pathname: string }; next: { pathname: string } }) => boolean;
};
let given: BlockerOptions | null = null;
let status: "idle" | "blocked" = "blocked";
const realRouter = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useBlocker: (options: BlockerOptions) => {
    given = options;
    return { status, reset() {}, proceed() {} };
  },
}));
const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
mock.module("../../ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: { open: boolean; children?: ReactNode }) =>
    open ? <div data-dialog>{children}</div> : null,
  AlertDialogContent: passthrough,
  AlertDialogHeader: passthrough,
  AlertDialogFooter: passthrough,
  AlertDialogTitle: passthrough,
  AlertDialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  AlertDialogCancel: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
  AlertDialogAction: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
}));
const { useUnsavedVolunteerDraft } = await import("./useUnsavedVolunteerDraft");

function Page({ dirty, prompt }: { dirty: boolean; prompt?: string }): ReactElement {
  const dialog = useUnsavedVolunteerDraft(dirty, prompt);
  return <div>{dialog}</div>;
}

const leavingForAnotherPage = {
  current: { pathname: "/admin/volunteers/settings" },
  next: { pathname: "/admin/volunteers/people" },
};

afterEach(() => {
  given = null;
  status = "blocked";
});

describe("leaving an unsaved policy draft", () => {
  test("asks in English for an English admin, and in Chinese for a Chinese one", () => {
    expect(renderAdminInEnglish(<Page dirty />)).toContain(
      "You have unsaved changes. Discard them and leave?",
    );
    expect(renderAdminInChinese(<Page dirty />)).toContain("目前有未儲存修改，確定捨棄並離開？");
  });

  test("asks in Chinese outside the admin language provider, as it always did", () => {
    expect(renderToStaticMarkup(<Page dirty />)).toContain("目前有未儲存修改，確定捨棄並離開？");
  });

  test("uses the prompt the page gives", () => {
    expect(renderAdminInEnglish(<Page dirty prompt="Own words" />)).toContain("Own words");
  });

  test("shows nothing until the router has blocked a change", () => {
    status = "idle";
    expect(renderAdminInEnglish(<Page dirty />)).not.toContain("unsaved");
  });

  test("holds a change of page for the dialog, and never holds the same page", () => {
    renderAdminInEnglish(<Page dirty />);
    expect(given?.withResolver).toBe(true);
    expect(given?.disabled).toBe(false);
    expect(given?.enableBeforeUnload).toBe(true);
    expect(given?.shouldBlockFn(leavingForAnotherPage)).toBe(true);
    expect(
      given?.shouldBlockFn({
        current: { pathname: "/admin/volunteers/settings" },
        next: { pathname: "/admin/volunteers/settings" },
      }),
    ).toBe(false);
  });

  test("blocks nothing while the draft is saved", () => {
    renderAdminInEnglish(<Page dirty={false} />);
    expect(given?.disabled).toBe(true);
    expect(given?.enableBeforeUnload).toBe(false);
  });
});
