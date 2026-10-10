import { describe, expect, test } from "bun:test";

/**
 * Every confirmation in the admin goes through `ConfirmActionDialog`. The browser's own
 * `confirm` and `alert` dialogs show the browser's OK button, cannot be styled or
 * translated, and cannot carry a reason, so they are not allowed in admin code.
 *
 * The pattern matches calls only: `window.confirm(`, `globalThis.confirm?.(`, a bare
 * `confirm(` and `alert(`. It does not match names that merely contain the word, such as
 * `confirmLabel`, `onConfirm(`, `canConfirm(` or `adminAlert(`.
 */

const ADMIN_SOURCE_GLOBS = ["src/routes/admin/**/*.{ts,tsx}", "src/components/admin/**/*.{ts,tsx}"];

const NATIVE_DIALOG_CALL =
  /(?<![\w$.])(?:(?:window|globalThis|self)\s*\.\s*)?(?:confirm|alert)\s*(?:\?\.\s*)?\(/;

function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, "");
}

/** 1-based line numbers in `text` that call a native confirm or alert. */
export function nativeDialogCalls(text: string): number[] {
  return withoutComments(text)
    .split("\n")
    .flatMap((line, index) => (NATIVE_DIALOG_CALL.test(line) ? [index + 1] : []));
}

async function adminSourcePaths(): Promise<string[]> {
  return (
    await Promise.all(
      ADMIN_SOURCE_GLOBS.map((pattern) => Array.fromAsync(new Bun.Glob(pattern).scan("."))),
    )
  )
    .flat()
    .map((path) => path.split("\\").join("/"))
    .filter((path) => !path.includes(".test."))
    .sort();
}

describe("admin native dialog guard", () => {
  test("no admin code calls confirm( or alert(", async () => {
    const paths = await adminSourcePaths();
    const hits: string[] = [];
    for (const path of paths) {
      for (const line of nativeDialogCalls(await Bun.file(path).text()))
        hits.push(`${path}:${line}`);
    }
    expect(
      hits,
      "Open a ConfirmActionDialog (src/components/admin/ConfirmActionDialog.tsx) instead of a native dialog.",
    ).toEqual([]);
  });

  test("scans a real set of files, so the guard is not vacuous", async () => {
    const paths = await adminSourcePaths();
    expect(paths.length).toBeGreaterThan(100);
    expect(paths).toContain("src/components/admin/ConfirmActionDialog.tsx");
  });

  test("flags real calls", () => {
    expect(nativeDialogCalls("if (!window.confirm(copy.x)) return;")).toEqual([1]);
    expect(nativeDialogCalls("a\nif (globalThis.confirm?.(copy.x)) go();")).toEqual([2]);
    expect(nativeDialogCalls("if (confirm('sure')) go();")).toEqual([1]);
    expect(nativeDialogCalls("alert(message);")).toEqual([1]);
    expect(nativeDialogCalls("window.alert (message);")).toEqual([1]);
    expect(nativeDialogCalls("const ok = await Promise.resolve(window.confirm(x));")).toEqual([1]);
  });

  test("ignores names that only contain the word, comments and other receivers", () => {
    expect(nativeDialogCalls("<Dialog confirmLabel={x} />")).toEqual([]);
    expect(nativeDialogCalls("await onConfirm(reason);")).toEqual([]);
    expect(nativeDialogCalls("if (!canConfirm(reason, text, false)) return;")).toEqual([]);
    expect(nativeDialogCalls("const ok = isConfirm(x) || adminAlert(y);")).toEqual([]);
    expect(nativeDialogCalls("dialog.confirm(x);")).toEqual([]);
    expect(nativeDialogCalls("// window.confirm(x) used to be here")).toEqual([]);
    expect(nativeDialogCalls("/* confirm(x)\n alert(y) */")).toEqual([]);
  });
});
