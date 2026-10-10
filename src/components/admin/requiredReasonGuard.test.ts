import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import {
  REQUIRED_REASON_ACTIONS,
  type RequiredReasonAction,
  type RequiredReasonId,
  type RequiredReasonRoute,
} from "@/lib/admin/requiredReasonActions";

/**
 * Ratchet for SP-5b-2. Every action in the registry is wired, and this guard requires, for each:
 *   (a) the UI marks the dialog (or the inline reason field) with `required-reason: <id>`:
 *       - a dialog marked that way passes `reason={requiredReasonDialog}` or
 *         `reason={{ required: true`, and its `onConfirm` is an inline arrow that declares a
 *         parameter (the reason) and uses it in its body;
 *       - an inline marker is followed, within INLINE_FIELD_LINES lines, by an `<input`, `<Input`,
 *         `<textarea` or `<Textarea` whose `value` or `onChange` names a reason;
 *   (b) some test under `src/` carries `// required-reason: <id>`, and every test file carrying it
 *       exercises the reason: it has the over-long case (`.repeat(501)`), uses
 *       `requiredReasonSchema`, or has an `expect(...)` statement that names `reason` (or the
 *       `reason_required` code);
 *   (d) no non-test file under src/components/admin sends one of the action's routes (names a
 *       string or template literal matching the route's path, and has `method: ... "<METHOD>"`)
 *       unless it is in the action's `ui`, `helpers` or `sentBy`, and some listed file does send it;
 *   (e) a request helper is imported only by the `ui` files of the actions that list it.
 * The self-tests below prove the checking functions work and (c) pins the registry itself.
 */

const ADMIN_UI_ROOT = "src/components/admin";
const THIS_FILE = "requiredReasonGuard.test.ts";

/** How many lines below an inline marker its reason field may open. */
const INLINE_FIELD_LINES = 3;

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
 * Reads JSX/TS from `start` and returns where it ends: for "tag", the text up to the opening
 * tag's own `>` or `/>`; for "brace", the inside of the `{...}` expression whose `{` is at
 * `start`. Braces, string and template literals and comments are tracked, so a `>` or `}` inside
 * a prop value (an arrow, a string, a nested element) does not end it early. An unterminated
 * tag or expression, or a quoted string that runs past a line end, returns null.
 */
function scanJsx(text: string, start: number, until: "tag" | "brace"): string | null {
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
      } else if (braces === 0 && until === "brace") {
        return text.slice(start + 1, i);
      }
    } else if (until === "tag" && braces === 0 && ch === ">") {
      return text.slice(start, i);
    }
  }
  return null;
}

/** The props of the opening tag whose name ends just before `start` (see `scanJsx`). */
export function openingTagProps(text: string, start: number): string | null {
  return scanJsx(text, start, "tag");
}

/** The inside of the `{...}` expression whose `{` is at `open`, or null (see `scanJsx`). */
export function braceExpression(text: string, open: number): string | null {
  return text[open] === "{" ? scanJsx(text, open, "brace") : null;
}

/** The expression of prop `name` in `props` (`name={...}`), or null when it has none. */
function propExpression(props: string, name: string): string | null {
  const match = new RegExp(`(?<![\\w$])${name}=\\{`).exec(props);
  return match ? braceExpression(props, match.index + match[0].length - 1) : null;
}

/**
 * Why a dialog's `onConfirm` does not pass the reason on; empty when it does. It must be an inline
 * arrow (`async (reason) => ...`, `(reason: string | null) => ...` or `reason => ...`) whose body
 * names that parameter as an identifier of its own (not as `x.reason`).
 */
export function onConfirmProblems(props: string): string[] {
  if (!/(?<![\w$])onConfirm=\{/.test(props)) return ["has no onConfirm"];
  const handler = propExpression(props, "onConfirm");
  if (handler === null) return ["onConfirm could not be read"];
  const head =
    /^\s*(?:async\s+)?(?:\(\s*([A-Za-z_$][\w$]*)\s*(?::[^,)]*)?[,)][^=]*|([A-Za-z_$][\w$]*)\s*)=>/.exec(
      handler,
    );
  const param = head?.[1] ?? head?.[2];
  if (!head || !param) return ["onConfirm is not an arrow that takes the reason as a parameter"];
  const body = handler.slice(head[0].length);
  const use = new RegExp(`(?<![\\w$.])${escapeRegExp(param)}(?![\\w$])`);
  return use.test(body) ? [] : [`onConfirm never uses its "${param}" parameter`];
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
    for (const problem of onConfirmProblems(props)) {
      problems.push(`dialog on line ${dialogLine + 1}: ${problem}`);
    }
  }
  return problems;
}

/**
 * Why `text` does not mark the inline reason field for `id`; empty when it does. Each marker must
 * be followed, on its own line or within INLINE_FIELD_LINES lines below, by an `<input`, `<Input`,
 * `<textarea` or `<Textarea` whose `value` or `onChange` expression names a reason (`reason`,
 * `draft.reason`, `setReason`, ...).
 */
export function inlineMarkerProblems(text: string, id: string): string[] {
  const lines = text.split("\n");
  const marker = markerPattern(id);
  const markerLines = lines.flatMap((line, index) => (marker.test(line) ? [index] : []));
  if (markerLines.length === 0) return [`no "required-reason: ${id}" marker`];
  const problems: string[] = [];
  for (const index of markerLines) {
    const from = lines.slice(0, index).join("\n").length + (index > 0 ? 1 : 0);
    const window = lines.slice(index, index + INLINE_FIELD_LINES + 1).join("\n");
    const field = /<(input|Input|textarea|Textarea)(?![\w$.])/.exec(window);
    if (!field) {
      problems.push(
        `marker on line ${index + 1} has no <input or <textarea within ${INLINE_FIELD_LINES} lines below it`,
      );
      continue;
    }
    const props = openingTagProps(text, from + field.index + field[0].length);
    const bound = props
      ? ["value", "onChange"].some((name) => /reason/i.test(propExpression(props, name) ?? ""))
      : false;
    if (!bound) {
      problems.push(
        `the field after the marker on line ${index + 1} has no value or onChange naming a reason`,
      );
    }
  }
  return problems;
}

function testMarkerPattern(id: string): RegExp {
  return new RegExp(`//\\s*required-reason: ${escapeRegExp(id)}(?![\\w.])`);
}

/** Whether some test source carries `// required-reason: <id>`. */
export function hasTestMarker(testSources: readonly string[], id: string): boolean {
  return testSources.some((source) => testMarkerPattern(id).test(source));
}

/**
 * Whether a test source exercises the reason contract: it has the over-long case (`.repeat(501)`),
 * uses `requiredReasonSchema`, or has an `expect(` statement (up to its `;`) naming `reason` or
 * the `reason_required` code.
 */
export function exercisesReason(source: string): boolean {
  if (source.includes(".repeat(501)") || /(?<![\w$])requiredReasonSchema(?![\w$])/.test(source)) {
    return true;
  }
  for (let at = source.indexOf("expect("); at >= 0; at = source.indexOf("expect(", at + 1)) {
    const end = source.indexOf(";", at);
    const statement = source.slice(at, end < 0 ? source.length : end);
    if (/\breason(_required)?\b/.test(statement)) return true;
  }
  return false;
}

/**
 * Why the tests do not cover `id`; empty when they do. Some test must carry the marker, and every
 * test that carries it must exercise the reason, so a gutted test cannot keep a bare marker.
 */
export function testMarkerProblems(
  tests: ReadonlyArray<{ path: string; text: string }>,
  id: string,
): string[] {
  const marked = tests.filter((file) => testMarkerPattern(id).test(file.text));
  if (marked.length === 0) return [`no test carries "// required-reason: ${id}"`];
  return marked
    .filter((file) => !exercisesReason(file.text))
    .map(
      (file) =>
        `${file.path}: carries the marker but has no .repeat(501), requiredReasonSchema or expect(...) naming the reason`,
    );
}

/**
 * The API paths a source names: every string or template literal that starts with `/api/`, with
 * each `${...}` written `:param` and any query string dropped.
 */
export function apiPathLiterals(text: string): string[] {
  const paths: string[] = [];
  for (const match of text.matchAll(/(["'])(\/api\/[^"'\n]*)\1/g)) paths.push(match[2]);
  for (let at = text.indexOf("`/api/"); at >= 0; at = text.indexOf("`/api/", at + 1)) {
    let path = "";
    let i = at + 1;
    for (; i < text.length && text[i] !== "`"; i++) {
      if (text[i] === "$" && text[i + 1] === "{") {
        const inside = braceExpression(text, i + 1);
        if (inside === null) break;
        path += ":param";
        i += inside.length + 2;
      } else {
        path += text[i];
      }
    }
    if (text[i] === "`") paths.push(path);
  }
  return paths.map((path) => path.split("?")[0]);
}

/** Whether `literal` (from `apiPathLiterals`) is the path of `pattern` (`:name` is one segment). */
export function pathMatches(pattern: string, literal: string): boolean {
  const want = pattern.split("/");
  const have = literal.split("/");
  return (
    want.length === have.length &&
    want.every((segment, i) => (segment.startsWith(":") ? have[i] !== "" : segment === have[i]))
  );
}

/** Whether `text` sends `route`: it names the path and has a `method:` that can be its method. */
export function sendsRoute(text: string, route: RequiredReasonRoute): boolean {
  const method = new RegExp(`(?<![\\w$])method:[^,}\\n]*["']${route.method}["']`);
  return (
    method.test(text) && apiPathLiterals(text).some((literal) => pathMatches(route.path, literal))
  );
}

/**
 * Why the files that send `action`'s routes do not match the registry; empty when they do.
 * `files` maps a path under src/components/admin to its source.
 */
export function routeSenderProblems(
  files: ReadonlyMap<string, string>,
  action: RequiredReasonAction,
): string[] {
  const allowed = new Set([...action.ui, ...(action.helpers ?? []), ...(action.sentBy ?? [])]);
  const problems: string[] = [];
  for (const route of action.routes) {
    const senders = [...files].filter(([, text]) => sendsRoute(text, route)).map(([path]) => path);
    for (const path of senders) {
      if (!allowed.has(path)) {
        problems.push(
          `${path} sends ${route.method} ${route.path} but is not in ${action.id}'s ui, helpers or sentBy`,
        );
      }
    }
    if (!senders.some((path) => allowed.has(path))) {
      problems.push(`no file listed for ${action.id} sends ${route.method} ${route.path}`);
    }
  }
  return problems;
}

/** The paths under src/components/admin that `text` (at `path`) imports, without extension. */
export function adminImports(path: string, text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (specifier.startsWith("@/components/admin/")) {
      found.push(specifier.slice("@/components/admin/".length));
    } else if (specifier.startsWith(".")) {
      found.push(posix.normalize(posix.join(posix.dirname(path), specifier)));
    }
  }
  return found;
}

/**
 * Why a request helper is imported from outside the UI it serves; empty when it is not. A helper
 * may be imported only by a `ui` file of an action that lists it (or by another listed helper).
 */
export function helperImporterProblems(
  files: ReadonlyMap<string, string>,
  actions: readonly RequiredReasonAction[],
): string[] {
  const problems: string[] = [];
  const helpers = new Set(actions.flatMap((action) => action.helpers ?? []));
  for (const helper of helpers) {
    const listing = actions.filter((action) => action.helpers?.includes(helper));
    const allowed = new Set(listing.flatMap((action) => [...action.ui, ...(action.helpers ?? [])]));
    const module = helper.replace(/\.tsx?$/, "");
    for (const [path, text] of files) {
      if (path !== helper && !allowed.has(path) && adminImports(path, text).includes(module)) {
        problems.push(
          `${path} imports ${helper} but is not a ui file of ${listing.map((a) => a.id).join(", ")}`,
        );
      }
    }
  }
  return problems;
}

function walkTests(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walkTests(path, found);
    else if (/\.test\.tsx?$/.test(name) && !path.endsWith(`${sep}${THIS_FILE}`)) found.push(path);
  }
  return found;
}

/** Every non-test .ts/.tsx under src/components/admin, keyed by its path under that root. */
function adminSources(): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        files.set(relative(ADMIN_UI_ROOT, path).split(sep).join("/"), readFileSync(path, "utf8"));
      }
    }
  };
  if (existsSync(ADMIN_UI_ROOT)) walk(ADMIN_UI_ROOT);
  return files;
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

  test("every action names at least one UI file and one route", () => {
    for (const action of REQUIRED_REASON_ACTIONS) {
      expect(action.ui.length).toBeGreaterThan(0);
      expect(action.routes.length).toBeGreaterThan(0);
    }
  });

  test("every listed helper and sentBy file exists", () => {
    for (const action of REQUIRED_REASON_ACTIONS) {
      for (const path of [...(action.helpers ?? []), ...(action.sentBy ?? [])]) {
        expect(existsSync(`${ADMIN_UI_ROOT}/${path}`)).toBe(true);
      }
    }
  });
});

describe("every action carries a marker and a test", () => {
  const tests = existsSync("src")
    ? walkTests("src").map((path) => ({ path, text: readFileSync(path, "utf8") }))
    : [];
  for (const action of REQUIRED_REASON_ACTIONS) {
    test(`(a) ${action.id} marks its ${action.kind} in the UI`, () => {
      expect(uiProblems(action)).toEqual([]);
    });
    test(`(b) ${action.id} has a test marker in a test that exercises the reason`, () => {
      expect(testMarkerProblems(tests, action.id)).toEqual([]);
    });
  }
});

describe("only the registered files send a reason-required request", () => {
  const files = adminSources();
  for (const action of REQUIRED_REASON_ACTIONS) {
    test(`(d) ${action.id}: every sender of its routes is registered`, () => {
      expect(routeSenderProblems(files, action)).toEqual([]);
    });
  }
  test("(e) request helpers are imported only by the UI they serve", () => {
    expect(helperImporterProblems(files, REQUIRED_REASON_ACTIONS)).toEqual([]);
  });
});

describe("the checks themselves", () => {
  const good = `
    {/* required-reason: x.y */}
    <ConfirmActionDialog
      reason={requiredReasonDialog}
      onConfirm={async (reason) => { await m.mutateAsync({ x, reason }); }}
    />`;

  test("a correct dialog passes, with the marker above or on the same line", () => {
    expect(dialogMarkerProblems(good, "x.y")).toEqual([]);
    const sameLine = `<ConfirmActionDialog /* required-reason: x.y */ reason={{ required: true, minLength: 1 }} onConfirm={(r) => send(r)} />`;
    expect(dialogMarkerProblems(sameLine, "x.y")).toEqual([]);
  });

  test("a missing marker is reported", () => {
    expect(
      dialogMarkerProblems("<ConfirmActionDialog reason={requiredReasonDialog} />", "x.y"),
    ).not.toEqual([]);
    expect(inlineMarkerProblems("<input />", "x.y")).not.toEqual([]);
  });

  test("a marker without a reason prop is reported", () => {
    const bad = `// required-reason: x.y\n<ConfirmActionDialog reason="none" onConfirm={(r) => f(r)} />`;
    expect(dialogMarkerProblems(bad, "x.y")).not.toEqual([]);
    const missing = `// required-reason: x.y\n<ConfirmActionDialog onConfirm={(r) => f(r)} />`;
    expect(dialogMarkerProblems(missing, "x.y")).not.toEqual([]);
  });

  test("a `/>` inside a prop value does not cut the props short", () => {
    const text = [
      "// required-reason: x.y",
      "<ConfirmActionDialog",
      "  consequence={<b>one<br /></b>}",
      '  note="a />"',
      "  onConfirm={async (reason) => { await m(`${'/>'}`, reason); }}",
      "  reason={requiredReasonDialog}",
      "/>",
    ].join("\n");
    expect(dialogMarkerProblems(text, "x.y")).toEqual([]);
  });

  test("a dialog that is not self-closing is read up to its own `>`, not a later `/>`", () => {
    const bad = [
      "// required-reason: x.y",
      "<ConfirmActionDialog onConfirm={(r) => f(r)}>",
      "  child",
      "</ConfirmActionDialog>",
      "<Other reason={requiredReasonDialog} />",
    ].join("\n");
    expect(dialogMarkerProblems(bad, "x.y")).not.toEqual([]);
    const ok = bad.replace(
      "<ConfirmActionDialog ",
      "<ConfirmActionDialog reason={requiredReasonDialog} ",
    );
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

  test("braceExpression reads to the matching brace, past braces in strings and templates", () => {
    const text = "x={a ? { b: '}' } : `${c}}`} rest";
    expect(braceExpression(text, 2)).toBe("a ? { b: '}' } : `${c}}`");
    expect(braceExpression("x={a", 2)).toBeNull();
    expect(braceExpression("x=a", 2)).toBeNull();
  });

  test("a marker two lines above the dialog is rejected", () => {
    const far = `// required-reason: x.y\n\n<ConfirmActionDialog reason={requiredReasonDialog} onConfirm={(r) => f(r)} />`;
    expect(dialogMarkerProblems(far, "x.y")).not.toEqual([]);
  });

  test("a marker for another ID, or one sharing a prefix, does not count", () => {
    expect(dialogMarkerProblems(good, "x.z")).not.toEqual([]);
    const field = "<Input value={reason} />";
    expect(inlineMarkerProblems(`// required-reason: x.yy\n${field}`, "x.y")).not.toEqual([]);
    expect(inlineMarkerProblems(`// required-reason: x.y\n${field}`, "x.y")).toEqual([]);
  });

  test("a test marker must be a line comment for that exact ID", () => {
    expect(hasTestMarker(["// required-reason: x.y\ntest()"], "x.y")).toBe(true);
    expect(hasTestMarker(["// required-reason: x.yy"], "x.y")).toBe(false);
    expect(hasTestMarker(["const s = 'required-reason: x.y'"], "x.y")).toBe(false);
    expect(hasTestMarker([], "x.y")).toBe(false);
  });
});

describe("M12: the dialog's onConfirm must take and use the reason", () => {
  const dialog = (onConfirm: string) =>
    `// required-reason: x.y\n<ConfirmActionDialog reason={requiredReasonDialog} onConfirm={${onConfirm}} />`;

  test("arrows that take the reason and use it pass", () => {
    for (const handler of [
      "async (reason) => { await m.mutateAsync({ id, reason }); }",
      "async (reason: string | null) => { const r = build(id, reason); if (r) await send(r); }",
      "async reason => { await send(reason); }",
      "(text) => send(text)",
    ]) {
      expect(onConfirmProblems(` onConfirm={${handler}}`)).toEqual([]);
      expect(dialogMarkerProblems(dialog(handler), "x.y")).toEqual([]);
    }
  });

  test("an arrow with no parameter is reported", () => {
    expect(dialogMarkerProblems(dialog("async () => { await m.mutateAsync(x); }"), "x.y")).toEqual([
      "dialog on line 2: onConfirm is not an arrow that takes the reason as a parameter",
    ]);
  });

  test("a parameter the body never uses is reported, even when the body names x.reason", () => {
    expect(
      dialogMarkerProblems(
        dialog("async (reason) => { await m.mutateAsync(draft.reason); }"),
        "x.y",
      ),
    ).toEqual(['dialog on line 2: onConfirm never uses its "reason" parameter']);
    expect(onConfirmProblems(" onConfirm={async (_reason) => { await go(); }}")).not.toEqual([]);
  });

  test("a handler passed by name, or no onConfirm at all, is reported", () => {
    expect(onConfirmProblems(" onConfirm={handleConfirm}")).not.toEqual([]);
    expect(onConfirmProblems(" title={t}")).toEqual(["has no onConfirm"]);
  });
});

describe("M12: a test marker counts only in a test that exercises the reason", () => {
  const marker = "// required-reason: x.y\n";

  test("the over-long case, the schema or an expect naming the reason makes a test count", () => {
    for (const body of [
      'expect(schema.safeParse({ reason: "x".repeat(501) }).success).toBe(false);',
      "const parsed = requiredReasonSchema.parse(input);",
      'expect(sent).toEqual({ id, reason: "listed in error" });',
      "expect(\n  calls[0],\n).toMatchObject({ input: { reason: 'r' } });",
      'expect(await response.json()).toEqual({ error: "reason_required" });',
    ]) {
      expect(exercisesReason(body)).toBe(true);
      expect(testMarkerProblems([{ path: "a.test.ts", text: marker + body }], "x.y")).toEqual([]);
    }
  });

  test("a bare marker, or one beside assertions that never name the reason, is reported", () => {
    expect(exercisesReason("test('x', () => { expect(1).toBe(1); });")).toBe(false);
    expect(exercisesReason("const reasonLabel = 1; expect(reasonLabel).toBe(1);")).toBe(false);
    expect(
      testMarkerProblems([{ path: "bare.test.ts", text: `${marker}test("x", () => {});` }], "x.y"),
    ).toEqual([
      "bare.test.ts: carries the marker but has no .repeat(501), requiredReasonSchema or expect(...) naming the reason",
    ]);
  });

  test("every file with the marker must count, not just one of them", () => {
    const tests = [
      { path: "good.test.ts", text: `${marker}expect(x).toEqual({ reason: "r" });` },
      { path: "gutted.test.ts", text: `${marker}expect(true).toBe(true);` },
    ];
    expect(testMarkerProblems(tests, "x.y")).toHaveLength(1);
    expect(testMarkerProblems(tests, "x.y")[0]).toStartWith("gutted.test.ts:");
    expect(testMarkerProblems([], "x.y")).toEqual(['no test carries "// required-reason: x.y"']);
  });
});

describe("M13: only registered files send a reason-required route", () => {
  const voidAction: RequiredReasonAction = {
    id: "receipt.void",
    kind: "dialog",
    ui: ["donations/PaymentsReconcile.tsx"],
    routes: [{ method: "POST", path: "/api/admin/receipts/:id/void" }],
  };
  // The shape SupporterDetail had before Task 2 found it by hand: its own void POST, with a
  // template-literal path, while the registry listed only the payments screen.
  const supporterDetailBefore = `
  const voidReceiptMutation = useMutation({
    mutationFn: (receiptId: string) =>
      fetchAdminJson(\`/api/admin/receipts/\${receiptId}/void\`, {
        method: "POST",
        body: JSON.stringify({ supporterId }),
      }),
  });`;
  const paymentsScreen = `fetchAdminJson(\`/api/admin/receipts/\${receiptId}/void\`, { method: "POST" })`;

  test("the sweep would have caught SupporterDetail", () => {
    const files = new Map([
      ["donations/PaymentsReconcile.tsx", paymentsScreen],
      ["crm/SupporterDetail.tsx", supporterDetailBefore],
    ]);
    expect(routeSenderProblems(files, voidAction)).toEqual([
      "crm/SupporterDetail.tsx sends POST /api/admin/receipts/:id/void but is not in receipt.void's ui, helpers or sentBy",
    ]);
    const registered = { ...voidAction, ui: [...voidAction.ui, "crm/SupporterDetail.tsx"] };
    expect(routeSenderProblems(files, registered)).toEqual([]);
  });

  test("template-literal paths match, including nested calls and query strings", () => {
    expect(
      apiPathLiterals("x(`/api/admin/adoptions/statuses/${encodeURIComponent(request.id)}`)"),
    ).toEqual(["/api/admin/adoptions/statuses/:param"]);
    expect(apiPathLiterals("f(\"/api/admin/faq?x=1\"); g('/api/admin/governance')")).toEqual([
      "/api/admin/faq",
      "/api/admin/governance",
    ]);
    expect(apiPathLiterals("`/api/admin/a/${b ? `${c}` : d}/void?x=${y}`")).toEqual([
      "/api/admin/a/:param/void",
    ]);
    expect(pathMatches("/api/admin/receipts/:id/void", "/api/admin/receipts/:param/void")).toBe(
      true,
    );
    expect(pathMatches("/api/admin/documents/:id", "/api/admin/documents/:param/publish")).toBe(
      false,
    );
    expect(pathMatches("/api/admin/documents/:id", "/api/admin/documents/")).toBe(false);
  });

  test("a GET of the same path, or another method, does not count as sending the route", () => {
    const route = { method: "DELETE", path: "/api/admin/faq" } as const;
    expect(sendsRoute('fetchAdminJson("/api/admin/faq")', route)).toBe(false);
    expect(sendsRoute('fetchAdminJson("/api/admin/faq", { method: "POST" })', route)).toBe(false);
    expect(sendsRoute('fetchAdminJson("/api/admin/faq", { method: "DELETE" })', route)).toBe(true);
    const publish = 'f(`/api/admin/documents/${id}/publish`, { method: a ? "POST" : "DELETE" })';
    expect(sendsRoute(publish, { method: "DELETE", path: "/api/admin/documents/:id" })).toBe(false);
    const endpoint = [
      "const endpoint = `/api/admin/sponsorships/pledges/${p.id}/finance`;",
      'await f(endpoint, { method: "POST" });',
    ].join("\n");
    const finance = {
      method: "POST",
      path: "/api/admin/sponsorships/pledges/:id/finance",
    } as const;
    expect(sendsRoute(endpoint, finance)).toBe(true);
  });

  test("a route that no listed file sends is reported, so a stale entry cannot pass", () => {
    const files = new Map([["donations/PaymentsReconcile.tsx", "nothing here"]]);
    expect(routeSenderProblems(files, voidAction)).toEqual([
      "no file listed for receipt.void sends POST /api/admin/receipts/:id/void",
    ]);
  });

  test("a helper and a sentBy screen may send the route; a new importer of the helper may not", () => {
    const action: RequiredReasonAction = {
      ...voidAction,
      ui: ["donations/PaymentsReconcile.tsx", "crm/SupporterDetail.tsx"],
      helpers: ["donations/receiptVoid.ts"],
      sentBy: ["donations/Workspace.tsx"],
    };
    const files = new Map([
      ["donations/receiptVoid.ts", paymentsScreen],
      ["donations/Workspace.tsx", paymentsScreen],
      ["donations/PaymentsReconcile.tsx", 'import { sendReceiptVoid } from "./receiptVoid";'],
      ["crm/SupporterDetail.tsx", 'import { sendReceiptVoid } from "../donations/receiptVoid";'],
    ]);
    expect(routeSenderProblems(files, action)).toEqual([]);
    expect(helperImporterProblems(files, [action])).toEqual([]);
    files.set(
      "crm/NewScreen.tsx",
      'import { sendReceiptVoid } from "@/components/admin/donations/receiptVoid";',
    );
    expect(helperImporterProblems(files, [action])).toEqual([
      "crm/NewScreen.tsx imports donations/receiptVoid.ts but is not a ui file of receipt.void",
    ]);
  });

  test("a helper shared by two actions may be imported by either action's UI", () => {
    const helper = "content/documentDelete.ts";
    const actions: RequiredReasonAction[] = [
      { ...voidAction, id: "document.delete", ui: ["content/Docs.tsx"], helpers: [helper] },
      { ...voidAction, id: "annual_report.delete", ui: ["content/Reports.tsx"], helpers: [helper] },
    ];
    const files = new Map([
      ["content/Docs.tsx", 'import { sendDocumentDelete } from "./documentDelete";'],
      ["content/Reports.tsx", 'import { sendDocumentDelete } from "./documentDelete";'],
    ]);
    expect(helperImporterProblems(files, actions)).toEqual([]);
  });
});

describe("M14: an inline marker must sit at its reason field", () => {
  test("a field bound to a reason within the window passes", () => {
    for (const text of [
      "{/* required-reason: x.y */}\n<textarea\n  value={reason}\n  onChange={(e) => setReason(e.target.value)}\n/>",
      "{/* required-reason: x.y */}\n<label>\n  {copy.reason}\n  <Input value={reason} onChange={(e) => setReason(e.target.value)} />",
      "{/* required-reason: x.y */}\n{text.reason}\n<input\n  value={draft.reason}\n/>",
      "<Textarea /* required-reason: x.y */ onChange={(e) => onChange({ reason: e.target.value })} />",
    ]) {
      expect(inlineMarkerProblems(text, "x.y")).toEqual([]);
    }
  });

  test("a marker left behind after its field was removed is reported", () => {
    expect(inlineMarkerProblems("{/* required-reason: x.y */}\n<p>gone</p>", "x.y")).toEqual([
      "marker on line 1 has no <input or <textarea within 3 lines below it",
    ]);
  });

  test("a field further than the window is reported", () => {
    const text = "{/* required-reason: x.y */}\n<a />\n<b />\n<c />\n<Input value={reason} />";
    expect(inlineMarkerProblems(text, "x.y")).not.toEqual([]);
  });

  test("a field whose value and onChange name no reason is reported", () => {
    const text =
      "{/* required-reason: x.y */}\n<Input value={amount} onChange={(e) => setAmount(e.target.value)} />";
    expect(inlineMarkerProblems(text, "x.y")).toEqual([
      "the field after the marker on line 1 has no value or onChange naming a reason",
    ]);
    const group = "// required-reason: x.y\n<InputGroup reason={r} />";
    expect(inlineMarkerProblems(group, "x.y")).not.toEqual([]);
  });
});

describe("guard is not vacuous", () => {
  test("the registry has the 14 IDs and the tests directory is readable", () => {
    expect(REQUIRED_REASON_ACTIONS).toHaveLength(14);
    expect(walkTests("src").length).toBeGreaterThan(100);
  });

  test("the admin source sweep reads the admin tree", () => {
    const files = adminSources();
    expect(files.size).toBeGreaterThan(100);
    expect(files.has("crm/SupporterDetail.tsx")).toBe(true);
  });
});
