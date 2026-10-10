import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import {
  REQUIRED_REASON_ACTIONS,
  type RequiredReasonAction,
  type RequiredReasonId,
} from "@/lib/admin/requiredReasonActions";

/**
 * Ratchet for SP-5b-2. Every action in the registry is wired, and this guard requires, for each:
 *   (a) the UI marks the dialog (or the inline reason field) with `required-reason: <id>`, and a
 *       dialog marked that way passes `reason={requiredReasonDialog}` or `reason={{ required: true`;
 *   (b) some test under `src/` carries `// required-reason: <id>`.
 * The self-tests below prove the checking functions work and (c) pins the registry itself.
 */

const ADMIN_UI_ROOT = "src/components/admin";
const THIS_FILE = "requiredReasonGuard.test.ts";

/** Every ID the registry must carry, written out so adding or dropping one is a deliberate edit. */
const EXPECTED_IDS: readonly RequiredReasonId[] = [
  "receipt.void",
  "volunteer_registration.reject",
  "internship.reject",
  "faq.deactivate",
  "estate.delete",
  "board_member.deactivate",
  "coordinator_status.delete",
  "document.delete",
  "annual_report.delete",
  "sponsorship_pledge.cancel",
  "sponsorship_proof.reject",
  "sponsorship_finance.adjust",
  "adoption_case.close",
  "volunteer_activity.bulk_cancel",
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markerPattern(id: string): RegExp {
  return new RegExp(`required-reason: ${escapeRegExp(id)}(?![\\w.])`);
}

/**
 * The props of the opening tag whose name ends just before `start`: the text up to the tag's own
 * `>` or `/>`. Braces, string and template literals and comments are tracked, so a `>` or `/>`
 * inside a prop value (an arrow, a string, a nested element) does not end the tag early. An
 * unterminated tag, or a quoted string that runs past a line end, returns null.
 */
export function openingTagProps(text: string, start: number): string | null {
  // "code" is the tag itself or a brace expression; "tpl" is the inside of a template literal.
  const modes: Array<"code" | "tpl"> = ["code"];
  const braceStack: number[] = [];
  let braces = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (modes[modes.length - 1] === "tpl") {
      if (ch === "\\") i++;
      else if (ch === "`") modes.pop();
      else if (ch === "$" && text[i + 1] === "{") {
        braceStack.push(braces);
        braces = 1;
        modes.push("code");
        i++;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      i++;
      while (i < text.length && text[i] !== ch) {
        if (text[i] === "\n") return null;
        if (text[i] === "\\") i++;
        i++;
      }
    } else if (ch === "`") {
      modes.push("tpl");
    } else if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 1;
    } else if (ch === "/" && text[i + 1] === "/" && braces > 0) {
      const end = text.indexOf("\n", i);
      i = end < 0 ? text.length : end;
    } else if (ch === "{") {
      braces++;
    } else if (ch === "}") {
      braces--;
      if (braces === 0 && braceStack.length > 0) {
        braces = braceStack.pop() ?? 0;
        modes.pop();
      }
    } else if (braces === 0 && ch === ">") {
      return text.slice(start, i);
    }
  }
  return null;
}

/** Why `text` does not mark the dialog for `id` correctly; empty when it does. */
export function dialogMarkerProblems(text: string, id: string): string[] {
  const lines = text.split("\n");
  const marker = markerPattern(id);
  const markerLines = lines.flatMap((line, index) => (marker.test(line) ? [index] : []));
  if (markerLines.length === 0) return [`no "required-reason: ${id}" marker`];
  const problems: string[] = [];
  for (const index of markerLines) {
    // The dialog opens on the marker's line or the line right below it, never further away.
    const dialogLine = [index, index + 1].find((i) => lines[i]?.includes("<ConfirmActionDialog"));
    if (dialogLine === undefined) {
      problems.push(
        `marker on line ${index + 1} is not on or directly above a <ConfirmActionDialog`,
      );
      continue;
    }
    const block = lines.slice(dialogLine).join("\n");
    const tagName = "<ConfirmActionDialog";
    const props = openingTagProps(block, block.indexOf(tagName) + tagName.length);
    if (props === null) {
      problems.push(`dialog on line ${dialogLine + 1}: could not find the end of its opening tag`);
      continue;
    }
    if (!/reason=\{(requiredReasonDialog\}|\{\s*required:\s*true)/.test(props)) {
      problems.push(`dialog on line ${dialogLine + 1} has no required reason prop`);
    }
  }
  return problems;
}

/** Why `text` does not mark the inline reason field for `id`; empty when it does. */
export function inlineMarkerProblems(text: string, id: string): string[] {
  return markerPattern(id).test(text) ? [] : [`no "required-reason: ${id}" marker`];
}

/** Whether some test source carries `// required-reason: <id>`. */
export function hasTestMarker(testSources: readonly string[], id: string): boolean {
  const pattern = new RegExp(`//\\s*required-reason: ${escapeRegExp(id)}(?![\\w.])`);
  return testSources.some((source) => pattern.test(source));
}

function walkTests(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walkTests(path, found);
    else if (/\.test\.tsx?$/.test(name) && !path.endsWith(`${sep}${THIS_FILE}`)) found.push(path);
  }
  return found;
}

function uiProblems(action: RequiredReasonAction): string[] {
  const problems: string[] = [];
  for (const ui of action.ui) {
    const path = `${ADMIN_UI_ROOT}/${ui}`;
    if (!existsSync(path)) {
      problems.push(`${path}: file does not exist`);
      continue;
    }
    const text = readFileSync(path, "utf8");
    const found =
      action.kind === "dialog"
        ? dialogMarkerProblems(text, action.id)
        : inlineMarkerProblems(text, action.id);
    for (const problem of found) problems.push(`${path}: ${problem}`);
  }
  return problems;
}

describe("required-reason registry", () => {
  test("(c) the registry holds exactly the expected IDs, once each", () => {
    const ids = REQUIRED_REASON_ACTIONS.map((action) => action.id);
    expect(ids).toHaveLength(14);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...EXPECTED_IDS].sort());
  });

  test("every action names at least one UI file", () => {
    for (const action of REQUIRED_REASON_ACTIONS) expect(action.ui.length).toBeGreaterThan(0);
  });
});

describe("every action carries a marker and a test", () => {
  const tests = existsSync("src") ? walkTests("src").map((p) => readFileSync(p, "utf8")) : [];
  for (const action of REQUIRED_REASON_ACTIONS) {
    test(`(a) ${action.id} marks its ${action.kind} in the UI`, () => {
      expect(uiProblems(action)).toEqual([]);
    });
    test(`(b) ${action.id} has a test marker`, () => {
      expect(hasTestMarker(tests, action.id)).toBe(true);
    });
  }
});

describe("the checks themselves", () => {
  const good = `
    {/* required-reason: x.y */}
    <ConfirmActionDialog
      reason={requiredReasonDialog}
      onConfirm={async () => { await m.mutateAsync(x); }}
    />`;

  test("a correct dialog passes, with the marker above or on the same line", () => {
    expect(dialogMarkerProblems(good, "x.y")).toEqual([]);
    const sameLine = `<ConfirmActionDialog /* required-reason: x.y */ reason={{ required: true, minLength: 1 }} />`;
    expect(dialogMarkerProblems(sameLine, "x.y")).toEqual([]);
  });

  test("a missing marker is reported", () => {
    expect(
      dialogMarkerProblems("<ConfirmActionDialog reason={requiredReasonDialog} />", "x.y"),
    ).not.toEqual([]);
    expect(inlineMarkerProblems("<input />", "x.y")).not.toEqual([]);
  });

  test("a marker without a reason prop is reported", () => {
    const bad = `// required-reason: x.y\n<ConfirmActionDialog reason="none" onConfirm={f} />`;
    expect(dialogMarkerProblems(bad, "x.y")).not.toEqual([]);
    const missing = `// required-reason: x.y\n<ConfirmActionDialog onConfirm={f} />`;
    expect(dialogMarkerProblems(missing, "x.y")).not.toEqual([]);
  });

  test("a `/>` inside a prop value does not cut the props short", () => {
    const text = [
      "// required-reason: x.y",
      "<ConfirmActionDialog",
      "  consequence={<b>one<br /></b>}",
      '  note="a />"',
      "  onConfirm={async () => { await m(`${'/>'}`); }}",
      "  reason={requiredReasonDialog}",
      "/>",
    ].join("\n");
    expect(dialogMarkerProblems(text, "x.y")).toEqual([]);
  });

  test("a dialog that is not self-closing is read up to its own `>`, not a later `/>`", () => {
    const bad = [
      "// required-reason: x.y",
      "<ConfirmActionDialog onConfirm={f}>",
      "  child",
      "</ConfirmActionDialog>",
      "<Other reason={requiredReasonDialog} />",
    ].join("\n");
    expect(dialogMarkerProblems(bad, "x.y")).not.toEqual([]);
    const ok = bad.replace("onConfirm={f}", "reason={requiredReasonDialog}");
    expect(dialogMarkerProblems(ok, "x.y")).toEqual([]);
  });

  test("a tag the scan cannot close is flagged, not read to the end of the file", () => {
    const text = [
      "// required-reason: x.y",
      "<ConfirmActionDialog consequence={<span>Don't</span>} />",
      "<X reason={requiredReasonDialog} />",
    ].join("\n");
    expect(dialogMarkerProblems(text, "x.y")).not.toEqual([]);
    expect(openingTagProps("<ConfirmActionDialog a={1", 20)).toBeNull();
  });

  test("openingTagProps stops at the tag's own end", () => {
    const text = "<ConfirmActionDialog a={() => 1} b='>' c={`${x}>`} /> <Next />";
    expect(openingTagProps(text, 20)).toBe(" a={() => 1} b='>' c={`${x}>`} /");
  });

  test("a marker two lines above the dialog is rejected", () => {
    const far = `// required-reason: x.y\n\n<ConfirmActionDialog reason={requiredReasonDialog} />`;
    expect(dialogMarkerProblems(far, "x.y")).not.toEqual([]);
  });

  test("a marker for another ID, or one sharing a prefix, does not count", () => {
    expect(dialogMarkerProblems(good, "x.z")).not.toEqual([]);
    expect(inlineMarkerProblems("// required-reason: x.yy", "x.y")).not.toEqual([]);
    expect(inlineMarkerProblems("// required-reason: x.y", "x.y")).toEqual([]);
  });

  test("a test marker must be a line comment for that exact ID", () => {
    expect(hasTestMarker(["// required-reason: x.y\ntest()"], "x.y")).toBe(true);
    expect(hasTestMarker(["// required-reason: x.yy"], "x.y")).toBe(false);
    expect(hasTestMarker(["const s = 'required-reason: x.y'"], "x.y")).toBe(false);
    expect(hasTestMarker([], "x.y")).toBe(false);
  });
});

describe("guard is not vacuous", () => {
  test("the registry has the 14 IDs and the tests directory is readable", () => {
    expect(REQUIRED_REASON_ACTIONS).toHaveLength(14);
    expect(walkTests("src").length).toBeGreaterThan(100);
  });
});
