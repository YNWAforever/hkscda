import React, { type ReactNode, type ReactElement } from "react";
import { beforeEach, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
const state: unknown[] = [];
let index = 0;
mock.module("react", () => ({
  ...React,
  useRef: <T,>(initial: T) => {
    const i = index++;
    if (!(i in state)) state[i] = { current: initial };
    return state[i] as { current: T };
  },
  useState: <T,>(initial: T) => {
    const i = index++;
    if (!(i in state)) state[i] = initial;
    return [
      state[i] as T,
      (v: T) => {
        state[i] = v;
      },
    ];
  },
}));
let fetcher: (body: string) => Promise<unknown>;
mock.module("../../../lib/admin/http", () => ({
  fetchAdminJson: (_url: string, options: { body: string }) => fetcher(options.body),
}));
const { BankStatementDryRunPanel, BankStatementDryRunPreview } =
  await import("./BankStatementDryRunPanel");
type Props = {
  children?: ReactNode;
  onClick?: () => Promise<void>;
  onChange?: (e: { target: { files: File[] } }) => void;
  result?: { fileSha256: string };
  id?: string;
};
function walk(n: ReactNode, out: ReactElement<Props>[] = []): ReactElement<Props>[] {
  if (Array.isArray(n)) for (const x of n) walk(x, out);
  else if (React.isValidElement<Props>(n)) {
    out.push(n);
    walk(n.props.children, out);
  }
  return out;
}
function render() {
  index = 0;
  return BankStatementDryRunPanel();
}
function select(file: File) {
  walk(render()).find((n) => n.props.id === "bank-statement-csv")!.props.onChange!({
    target: { files: [file] },
  });
}
function preview() {
  return walk(render()).find((n) => n.props.onClick)!.props.onClick!();
}
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const header = "bank_reference,received_on,currency,amount_hkd,payment_hint";
function result(fileSha256: string) {
  return { fileSha256, rows: [], summary: { total: 0 }, generatedAt: "2026-09-30" };
}
beforeEach(() => {
  state.length = 0;
  fetcher = async (body) =>
    result(createHash("sha256").update(JSON.parse(body).csvText).digest("hex"));
});
test("changing the selected file fences the previous preview response", async () => {
  let finish!: (x: unknown) => void;
  fetcher = () =>
    new Promise((r) => {
      finish = r;
    });
  select(new File([header + "\nA,2026-09-27,HKD,1.00,"], "A.csv"));
  const pending = preview();
  await flush();
  select(new File([header + "\nB,2026-09-27,HKD,1.00,"], "B.csv"));
  finish(result("A-result"));
  await pending;
  expect(walk(render()).some((n) => n.type === BankStatementDryRunPreview)).toBe(false);
});
test("file SHA preserves original UTF-8 BOM bytes", async () => {
  const file = new File(["\uFEFF" + header + "\r\nREF,2026-09-27,HKD,1.00,\r\n"], "BOM.csv");
  const expected = createHash("sha256")
    .update(new Uint8Array(await file.arrayBuffer()))
    .digest("hex");
  select(file);
  await preview();
  expect(
    walk(render()).find((n) => n.type === BankStatementDryRunPreview)!.props.result!.fileSha256,
  ).toBe(expected);
});

test("malformed UTF-8 is refused before requesting a checksum", async () => {
  let calls = 0;
  fetcher = async () => {
    calls++;
    return result("unexpected");
  };
  select(new File([new Uint8Array([0xff, 0xfe])], "invalid.csv"));
  await preview();
  expect(calls).toBe(0);
  expect(walk(render()).some((n) => n.type === BankStatementDryRunPreview)).toBe(false);
});
