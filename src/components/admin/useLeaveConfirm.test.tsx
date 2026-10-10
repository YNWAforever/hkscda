import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ReactElement } from "react";

import { renderAdminInEnglish } from "./i18n/testing";

/**
 * The router's blocker is replaced by one that records `proceed` and `reset`, and the dialog by a
 * component that keeps the props it was given, so the test can press confirm and cancel the way
 * the dialog does.
 */
let status: "idle" | "blocked" = "blocked";
const calls = { proceed: 0, reset: 0 };
const realRouter = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useBlocker: () => ({
    status,
    proceed() {
      calls.proceed += 1;
    },
    reset() {
      calls.reset += 1;
    },
  }),
}));
type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consequence: string;
  reason: string;
  onConfirm: (reason: string | null) => Promise<void>;
};
let props: DialogProps | null = null;
mock.module("./ConfirmActionDialog", () => ({
  ConfirmActionDialog: (given: DialogProps) => {
    props = given;
    return <p>{given.open ? given.consequence : ""}</p>;
  },
}));
const { useLeaveConfirm } = await import("./useLeaveConfirm");

function Page(): ReactElement {
  return <div>{useLeaveConfirm({ dirty: true, consequence: "Leave it?" })}</div>;
}

afterEach(() => {
  status = "blocked";
  calls.proceed = 0;
  calls.reset = 0;
  props = null;
});

describe("useLeaveConfirm", () => {
  test("opens only when the router has blocked a change", () => {
    expect(renderAdminInEnglish(<Page />)).toContain("Leave it?");
    status = "idle";
    expect(renderAdminInEnglish(<Page />)).not.toContain("Leave it?");
  });

  test("confirming lets the router go on, and the close that follows does not cancel it", async () => {
    renderAdminInEnglish(<Page />);
    await props?.onConfirm(null);
    expect(calls.proceed).toBe(1);
    props?.onOpenChange(false);
    expect(calls.reset).toBe(0);
  });

  test("cancelling or pressing Escape resets the blocker", () => {
    renderAdminInEnglish(<Page />);
    props?.onOpenChange(false);
    expect(calls.reset).toBe(1);
    expect(calls.proceed).toBe(0);
  });

  test("opening does not reset anything", () => {
    renderAdminInEnglish(<Page />);
    props?.onOpenChange(true);
    expect(calls.reset).toBe(0);
  });
});
