import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import {
  PENDING_REQUIRED_REASON_IDS,
  REQUIRED_REASON_ACTIONS,
  type RequiredReasonAction,
  type RequiredReasonId,
} from "@/lib/admin/requiredReasonActions";

/**
 * Ratchet for SP-5b-2. Each action in the registry starts pending. When a task wires the action
 * it removes the ID from `PENDING_REQUIRED_REASON_IDS`, and from then on this guard requires:
 *   (a) the UI marks the dialog (or the inline reason field) with `required-reason: <id>`, and a
 *       dialog marked that way passes `reason={requiredReasonDialog}` or `reason={{ required: true`;
 *   (b) some test under `src/` carries `// required-reason: <id>`.
 * While every ID is pending, (a) and (b) check nothing; the self-tests below prove the checking
 * functions work and (c) and (d) pin the registry itself.
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
    const props = block.slice(0, block.indexOf("/>") >= 0 ? block.indexOf("/>") : undefined);
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

  test("(d) the pending set is a subset of the registry", () => {
    const ids = new Set(REQUIRED_REASON_ACTIONS.map((action) => action.id));
    for (const pending of PENDING_REQUIRED_REASON_IDS) expect(ids.has(pending)).toBe(true);
  });

  test("every action names at least one UI file", () => {
    for (const action of REQUIRED_REASON_ACTIONS) expect(action.ui.length).toBeGreaterThan(0);
  });
});

describe("wired actions carry a marker and a test", () => {
  const tests = existsSync("src") ? walkTests("src").map((p) => readFileSync(p, "utf8")) : [];
  for (const action of REQUIRED_REASON_ACTIONS) {
    if (PENDING_REQUIRED_REASON_IDS.has(action.id)) continue;
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
