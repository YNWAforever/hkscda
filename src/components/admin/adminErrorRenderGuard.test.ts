import { describe, expect, test } from "bun:test";

/**
 * A query, a mutation or a caught error can be an `AdminSessionError`, and its `message` is the
 * Chinese text by design. A screen that prints an error's `message` itself therefore shows
 * Chinese in the English admin as soon as a session lapses and a query refetches. Screens write
 * an error with `adminErrorMessage(error, language)` (`src/lib/admin/session.ts`) instead: it
 * translates a session error and shows any other message as it came.
 *
 * This guard fails on a read of an error's `message` anywhere under `src/components/admin` and
 * `src/routes/admin`, apart from test files. A read counts when it is on a query or mutation
 * error (`query.error.message`), or on a variable named like an error: `error`, `err`, `e`,
 * `cause`, `failure`, or a name ending in `Error`, `Failure` or `Cause`.
 *
 * Reads that only test the message (a comparison, `.includes(...)` and the like, the condition
 * of `? :` or `&&`, `typeof`), a React `key`, logging and comment lines are not renders, so the
 * guard leaves them alone. Any other read that is not shown to anyone, or that can never hold a
 * session error, carries `admin-error-render-ok: <reason>` in a comment, on the same line or on
 * a comment-only line just above. The reason is required, and a marker that covers no read fails
 * the guard too, so markers cannot outlive the code they excuse.
 */

const ADMIN_SOURCE_GLOBS = ["src/routes/admin/**/*.{ts,tsx}", "src/components/admin/**/*.{ts,tsx}"];

const RENDER_OK_MARKER = /admin-error-render-ok:\s*\S/;
/** A line that is only a comment, so a marker on it can cover the line below. */
const COMMENT_ONLY_LINE = /^\s*(\/\/|\/\*|\*|\{\/\*)/;

/** A read of an error's `message`, as described above. */
const ERROR_MESSAGE_READ =
  /(?:\.error|\b(?:error|err|e|cause|failure|[A-Za-z_$][\w$]*(?:Error|Failure|Cause)))\??\.message\b/g;
/** What follows a read that only tests the message. */
const TEST_AFTER =
  /^\s*(?:[!=]==?|&&|\?(?![?.])|\.\s*(?:includes|startsWith|endsWith|match|test|indexOf|localeCompare|search|length)\b)/;
/** What comes before a read that `typeof` tests. */
const TYPEOF_BEFORE = /\btypeof\s+[\w$.?]*$/;
/** What comes before a read inside a React `key={...}`, which is never shown. */
const KEY_BEFORE = /\bkey=\{[^}]*$/;
const LOGGING = /\bconsole\.\w+\(/;

export type SourceFile = { path: string; text: string };

function isTestFile(path: string): boolean {
  return path.includes(".test.");
}

/** True when `line` shows an error's raw message, by the rules above. */
export function readsRawErrorMessage(line: string): boolean {
  if (COMMENT_ONLY_LINE.test(line) || LOGGING.test(line)) return false;
  for (const match of line.matchAll(ERROR_MESSAGE_READ)) {
    const before = line.slice(0, match.index);
    const after = line.slice(match.index + match[0].length);
    if (TEST_AFTER.test(after) || TYPEOF_BEFORE.test(before) || KEY_BEFORE.test(before)) continue;
    return true;
  }
  return false;
}

/** Whether the line at `index` carries a marker, or sits under a comment-only line that does. */
function isMarked(lines: string[], index: number): boolean {
  const above = index > 0 ? lines[index - 1] : "";
  return (
    RENDER_OK_MARKER.test(lines[index]) ||
    (COMMENT_ONLY_LINE.test(above) && RENDER_OK_MARKER.test(above))
  );
}

/** `path:line` for every unmarked read of a raw error message in a file that is not a test. */
export function findRawErrorRenders(files: readonly SourceFile[]): string[] {
  const hits: string[] = [];
  for (const file of files) {
    if (isTestFile(file.path)) continue;
    const lines = file.text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (readsRawErrorMessage(line) && !isMarked(lines, index)) {
        hits.push(`${file.path}:${index + 1}`);
      }
    });
  }
  return hits;
}

/**
 * `path:line` of every marker that covers no read: a marker on a comment-only line covers the
 * line below it, and any other marker covers its own line.
 */
export function findUnusedMarkers(files: readonly SourceFile[]): string[] {
  const unused: string[] = [];
  for (const file of files) {
    if (isTestFile(file.path)) continue;
    const lines = file.text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!RENDER_OK_MARKER.test(line)) return;
      const covered = COMMENT_ONLY_LINE.test(line) ? (lines[index + 1] ?? "") : line;
      if (!readsRawErrorMessage(covered)) unused.push(`${file.path}:${index + 1}`);
    });
  }
  return unused;
}

async function adminSourceFiles(): Promise<SourceFile[]> {
  const paths = (
    await Promise.all(
      ADMIN_SOURCE_GLOBS.map((pattern) => Array.fromAsync(new Bun.Glob(pattern).scan("."))),
    )
  )
    .flat()
    .map((path) => path.split("\\").join("/"))
    .sort();
  return Promise.all(paths.map(async (path) => ({ path, text: await Bun.file(path).text() })));
}

describe("admin error render guard", () => {
  test("no admin screen shows an error's raw message", async () => {
    const hits = findRawErrorRenders(await adminSourceFiles());
    expect(
      hits,
      "Show the error with adminErrorMessage(error, language) from src/lib/admin/session.ts, so a " +
        "session error is written in the screen's language. A read that is never shown, or that can " +
        "never hold a session error, carries `// admin-error-render-ok: <reason>`.",
    ).toEqual([]);
  });

  test("every marker covers a read of an error's message", async () => {
    expect(
      findUnusedMarkers(await adminSourceFiles()),
      "These admin-error-render-ok markers cover no read of an error's message. Delete them.",
    ).toEqual([]);
  });

  test("the scan sees the whole admin tree, and the reads the markers excuse", async () => {
    const files = await adminSourceFiles();
    const scanned = files.filter((file) => !isTestFile(file.path));
    // If the glob ever returns nothing, or the pattern stops matching real code, the checks above
    // pass vacuously.
    expect(scanned.length).toBeGreaterThanOrEqual(150);
    expect(scanned.some((file) => file.path.startsWith("src/routes/admin/"))).toBe(true);
    expect(scanned.some((file) => file.path.startsWith("src/components/admin/"))).toBe(true);
    const marked = scanned.flatMap((file) => {
      const lines = file.text.split(/\r?\n/);
      return lines.filter((line, index) => readsRawErrorMessage(line) && isMarked(lines, index));
    });
    expect(marked.length).toBeGreaterThanOrEqual(1);
  });
});

describe("findRawErrorRenders", () => {
  const scan = (...lines: string[]) =>
    findRawErrorRenders([{ path: "src/components/admin/Thing.tsx", text: lines.join("\n") }]);

  test("reports a raw message shown in JSX, in a prop, in a template and through state", () => {
    for (const line of [
      "          {query.error.message}",
      "  <Row message={statusesError.message} />",
      "  message={`${copy.loadError}: ${error.message}`}",
      "      setError(cause instanceof Error ? cause.message : copy.failed);",
      "        saveError={mutation.error?.message ?? null}",
      "          {copy.failed(err.message)}",
      "    detail: e.message,",
      "  const text = failure.message;",
      "  const shown = nextError.message?.trim();",
    ]) {
      expect(scan(line), line).toEqual(["src/components/admin/Thing.tsx:1"]);
    }
  });

  test("leaves alone a read that only tests the message, a React key and logging", () => {
    for (const line of [
      '      if (error instanceof Error && error.message.includes("conflict")) setConflict(true);',
      '        : typeof body.error?.message === "string"',
      "  return { cause: error instanceof Error && error.message ? error : undefined };",
      "        return <p key={error.message}>{text}</p>;",
      '  console.error("Load failed", error.message);',
      "      {error.message && <p>{copy.failed}</p>}",
      "  const same = left.error.message !== right;",
    ]) {
      expect(scan(line), line).toEqual([]);
    }
  });

  test("leaves alone a message that is not an error's, and a comment", () => {
    for (const line of [
      "            : {issue.message}",
      '<p className="text-xs">{errors.name.message}</p>',
      "          <p>{copy.conflict.message}</p>",
      "            <dd>{detail.message}</dd>",
      "                <li key={`${i}:${x.path}`}>{x.message}</li>",
      "  // A screen never prints error.message itself.",
      "   * so {query.error.message} is not used here.",
    ]) {
      expect(scan(line), line).toEqual([]);
    }
  });

  test("accepts a marker on the same line or on a comment-only line above", () => {
    expect(scan("  detail: error.message, // admin-error-render-ok: a clipboard error")).toEqual(
      [],
    );
    expect(
      scan("  // admin-error-render-ok: a clipboard error", "  detail: error.message,"),
    ).toEqual([]);
    expect(
      scan("{/* admin-error-render-ok: shown only in a test fixture */}", "<p>{error.message}</p>"),
    ).toEqual([]);
  });

  test("a marker at the end of a line of code does not cover the next line", () => {
    expect(
      scan(
        "  const a = error.message; // admin-error-render-ok: hashed, never shown",
        "  const b = error.message;",
      ),
    ).toEqual(["src/components/admin/Thing.tsx:2"]);
  });

  test("requires a reason after the marker", () => {
    expect(scan("  detail: error.message, // admin-error-render-ok:")).toEqual([
      "src/components/admin/Thing.tsx:1",
    ]);
  });

  test("skips test files and scans copy modules and routes", () => {
    const text = "  {query.error.message}\n";
    expect(
      findRawErrorRenders([
        { path: "src/components/admin/Thing.test.tsx", text },
        { path: "src/components/admin/thing.test.support.tsx", text },
        { path: "src/components/admin/crm/copy.ts", text },
        { path: "src/routes/admin/x.tsx", text },
      ]),
    ).toEqual(["src/components/admin/crm/copy.ts:1", "src/routes/admin/x.tsx:1"]);
  });
});

describe("findUnusedMarkers", () => {
  test("names a marker that covers no read, and accepts one that does", () => {
    const text = [
      "  // admin-error-render-ok: a clipboard error",
      "  detail: error.message,",
      "  // admin-error-render-ok: left behind after a fix",
      "  detail: adminErrorMessage(error, language),",
      "  const label = copy.title; // admin-error-render-ok: nothing here",
      "  const hash = error.message; // admin-error-render-ok: hashed, never shown",
      "",
    ].join("\n");
    expect(findUnusedMarkers([{ path: "src/components/admin/Thing.tsx", text }])).toEqual([
      "src/components/admin/Thing.tsx:3",
      "src/components/admin/Thing.tsx:5",
    ]);
  });
});
