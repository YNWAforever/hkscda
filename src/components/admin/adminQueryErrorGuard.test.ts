import { describe, expect, test } from "bun:test";

/**
 * A query that fails must be shown as a failure that names what to do and offers the retry, never
 * as a bare line of text and never beside the screen's empty sentence. `LoadFailure`
 * (`src/components/admin/LoadFailure.tsx`) is that state: it classifies the error from its HTTP
 * status, shows a support reference and a Retry control. `DataTable` renders it for a table that is
 * given `error` and `onRetry`.
 *
 * This guard scans the admin tree (`src/routes/admin` and `src/components/admin`, apart from test
 * files) for three things:
 *
 * 1. A `<LoadFailure>` with no `onRetry`, and a `<DataTable>` that is given `error` but no
 *    `onRetry`.
 * 2. A query's error that gates a block of JSX (`{query.error && (<p>…`, `query.isError ? (<p>…`,
 *    `if (query.isError) return <p>…`) when the block is not a `<LoadFailure>` (or a `<DataTable>`
 *    that takes the error): a failure state has to start within the fourteen lines from the gate.
 *    A read behind `!` gates the success path, so it is not a failure display.
 * 3. A query's error written into a prop or a text node through `adminErrorMessage(…)` and its
 *    siblings, except as the `title`, `heading`, `message` or `loadFailure` of a failure state.
 *
 * "A query's error" is `name.error` or `name.isError` for a name bound to `useQuery(…)`,
 * `useSuspenseQuery(…)`, `useInfiniteQuery(…)` or `useQueries(…)`, and an `error` or `isError`
 * destructured from one of them, under the name it is given. A name counts from where it is bound
 * to the next function that starts at the left margin, so another function's `error` in the same
 * file is not mistaken for it.
 *
 * A read that is not a failure display, or whose failure display is somewhere the scan cannot see,
 * carries `admin-load-failure-ok: <reason>` in a comment, on the same line or on a comment-only
 * line just above. The reason is required, and a marker that covers no flagged read fails the guard
 * too, so markers cannot outlive the code they excuse.
 */

const ADMIN_SOURCE_GLOBS = ["src/routes/admin/**/*.{ts,tsx}", "src/components/admin/**/*.{ts,tsx}"];

const OK_MARKER = /admin-load-failure-ok:\s*\S/;
const COMMENT_ONLY_LINE = /^\s*(\/\/|\/\*|\*|\{\/\*)/;
/** How far below a gate the failure state may start. */
const GATE_WINDOW = 14;
/** How far above a message call its `title`, `message` or `loadFailure` may be. */
const CONTEXT_LINES = 3;

export type SourceFile = { path: string; text: string };

function isTestFile(path: string): boolean {
  return path.includes(".test.");
}

/** Where a query's error can be read: the pattern for a read, and the lines it holds for. */
export type QueryBinding = { pattern: RegExp; first: number; last: number };

const QUERY_HOOK = String.raw`use(?:Suspense|Infinite)?Quer(?:y|ies)`;
/** A declaration at the left margin, which ends the scope of the names before it. */
const SCOPE_END =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b|^(?:export\s+)?const\s+[A-Za-z_$][\w$]*\s*(?::[^=]+)?=\s*(?:\(|async\b|function\b|memo\b|forwardRef\b)/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every query result and every destructured error in `text`, with the lines each one holds for. */
export function queryBindings(text: string): QueryBinding[] {
  const lines = text.split(/\r?\n/);
  const lineOf = (offset: number) => text.slice(0, offset).split("\n").length - 1;
  const lastLine = (first: number) => {
    for (let index = first + 1; index < lines.length; index += 1) {
      if (SCOPE_END.test(lines[index])) return index - 1;
    }
    return lines.length - 1;
  };
  const bindings: QueryBinding[] = [];

  const whole = new RegExp(
    String.raw`\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*${QUERY_HOOK}\b`,
    "g",
  );
  for (const match of text.matchAll(whole)) {
    const first = lineOf(match.index);
    bindings.push({
      pattern: new RegExp(String.raw`\b${escapeRegExp(match[1])}\??\.(?:error|isError)\b`, "g"),
      first,
      last: lastLine(first),
    });
  }

  const destructured = new RegExp(
    String.raw`\b(?:const|let)\s*\{([^}]*)\}\s*=\s*${QUERY_HOOK}\b`,
    "g",
  );
  for (const match of text.matchAll(destructured)) {
    const first = lineOf(match.index);
    for (const part of match[1].split(",")) {
      const [key, alias] = part.split(":").map((value) => value.trim());
      if (key !== "error" && key !== "isError") continue;
      const name = alias ? alias.split("=")[0].trim() : key;
      bindings.push({
        // A bare name is a read; `x.error` and the attribute `error=` are not.
        pattern: new RegExp(String.raw`(?<![\w$.])${escapeRegExp(name)}\b(?!\s*[=:](?!=))`, "g"),
        first,
        last: lastLine(first),
      });
    }
  }
  return bindings;
}

const MESSAGE_CALL =
  /\b(?:adminErrorMessage|volunteerAdminErrorMessage|documentErrorMessage|pipelineReadErrorText|policyErrorMessage)\(\s*$/;
/** What may stand before such a call for it to be the words of a failure state. */
const FAILURE_WORDS = /(?:\btitle|\bheading|\bmessage|\bloadFailure)\s*[=:]\s*\{?[^;]*$/;

/** Whether the JSX that a gate opens starts in `after`, or on the next non-blank line. */
function opensJsx(after: string, nextLines: readonly string[]): boolean {
  const first = after.replace(/^[\s(]+/, "");
  if (first.length > 0) return first.startsWith("<") || first.startsWith("{/*");
  const next = nextLines.find((line) => line.trim().length > 0)?.trim() ?? "";
  return next.startsWith("<") || next.startsWith("{/*");
}

/** The text of the JSX tag that starts at `start` in `text`, up to its closing `>`. */
function tagText(text: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote && text[index - 1] !== "\\") quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth === 0 && text[index - 1] !== "=")
      return text.slice(start, index + 1);
  }
  return text.slice(start);
}

/** 1-based lines of every `<LoadFailure>` without `onRetry`, and `<DataTable error>` without it. */
export function findMissingRetries(file: SourceFile): number[] {
  if (isTestFile(file.path)) return [];
  const lines: number[] = [];
  for (const match of file.text.matchAll(/<(LoadFailure|DataTable)\b/g)) {
    const tag = tagText(file.text, match.index);
    const needsRetry = match[1] === "LoadFailure" || /(?:^|[\s{])error\s*=/.test(tag);
    if (needsRetry && !/(?:^|[\s{])onRetry\s*=/.test(tag) && !/\{\s*\.\.\./.test(tag)) {
      lines.push(file.text.slice(0, match.index).split("\n").length);
    }
  }
  return lines;
}

/** 1-based lines of the reads that break rule 2 or rule 3, marked or not. */
export function flaggedLines(file: SourceFile): number[] {
  if (isTestFile(file.path)) return [];
  const lines = file.text.split(/\r?\n/);
  const flagged = new Set<number>();
  for (const binding of queryBindings(file.text)) {
    for (let index = binding.first; index <= binding.last; index += 1) {
      if (COMMENT_ONLY_LINE.test(lines[index])) continue;
      const code = lines[index].replace(/\s\/\/.*$/, "");
      binding.pattern.lastIndex = 0;
      for (const match of code.matchAll(binding.pattern)) {
        const before = code.slice(0, match.index);
        const after = code.slice(match.index + match[0].length);
        const window = lines.slice(index, index + GATE_WINDOW).join("\n");
        const hasFailureState = /<LoadFailure\b|<DataTable\b[^]*?\berror\s*=/.test(window);

        // Rule 3: the error written as a message.
        if (MESSAGE_CALL.test(before)) {
          const context = `${lines.slice(Math.max(0, index - CONTEXT_LINES), index).join("\n")}\n${before}`;
          if (!FAILURE_WORDS.test(context)) flagged.add(index + 1);
          continue;
        }

        // A read behind `!` gates what shows when the load worked.
        if (/!\s*$/.test(before)) continue;

        // Rule 2: the error gates a block of JSX.
        const operator = /&&|(?<!\?)\?(?![?.])/.exec(after);
        if (operator) {
          const rest = after.slice(operator.index + operator[0].length);
          if (opensJsx(rest, lines.slice(index + 1)) && !hasFailureState) flagged.add(index + 1);
          continue;
        }
        if (/^\s*if\s*\(/.test(code) && /\)\s*(?:\{\s*)?(?:return\b.*)?$/.test(code.trimEnd())) {
          const following = lines.slice(index + 1, index + 4).join("\n");
          const returnsJsx = /\breturn\b\s*\(?\s*<|^\s*<|\breturn\s*\(\s*$/m.test(
            `${code}\n${following}`,
          );
          if (returnsJsx && !hasFailureState) flagged.add(index + 1);
        }
      }
    }
  }
  return [...flagged].sort((left, right) => left - right);
}

function isMarked(lines: string[], index: number): boolean {
  const above = index > 0 ? lines[index - 1] : "";
  return OK_MARKER.test(lines[index]) || (COMMENT_ONLY_LINE.test(above) && OK_MARKER.test(above));
}

/** `path:line` for every unmarked bare query-error display, and every retry that is missing. */
export function findQueryErrorViolations(files: readonly SourceFile[]): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const lines = file.text.split(/\r?\n/);
    for (const line of flaggedLines(file)) {
      if (!isMarked(lines, line - 1)) hits.push(`${file.path}:${line}`);
    }
    for (const line of findMissingRetries(file)) hits.push(`${file.path}:${line} (no onRetry)`);
  }
  return hits;
}

/** `path:line` of every marker that covers no flagged read. */
export function findUnusedMarkers(files: readonly SourceFile[]): string[] {
  const unused: string[] = [];
  for (const file of files) {
    if (isTestFile(file.path)) continue;
    const lines = file.text.split(/\r?\n/);
    const flagged = new Set(flaggedLines(file));
    lines.forEach((line, index) => {
      if (!OK_MARKER.test(line)) return;
      const covered = COMMENT_ONLY_LINE.test(line) ? index + 2 : index + 1;
      if (!flagged.has(covered)) unused.push(`${file.path}:${index + 1}`);
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

describe("admin query error guard", () => {
  test("no admin screen shows a failed query as bare text or without a retry", async () => {
    expect(
      findQueryErrorViolations(await adminSourceFiles()),
      "Render a failed query as <LoadFailure error={query.error} onRetry={() => void query.refetch()} />, " +
        "or give a <DataTable> its error and onRetry. A read that is not a failure display carries " +
        "`// admin-load-failure-ok: <reason>`.",
    ).toEqual([]);
  });

  test("every marker covers a flagged read", async () => {
    expect(
      findUnusedMarkers(await adminSourceFiles()),
      "These admin-load-failure-ok markers cover no flagged read. Delete them.",
    ).toEqual([]);
  });

  test("the scan sees the whole admin tree, the query errors in it and the failure states", async () => {
    const files = (await adminSourceFiles()).filter((file) => !isTestFile(file.path));
    // If the glob returns nothing, or the patterns stop matching real code, the checks above pass
    // vacuously.
    expect(files.length).toBeGreaterThanOrEqual(150);
    expect(files.some((file) => file.path.startsWith("src/routes/admin/"))).toBe(true);
    const withQueries = files.filter((file) => queryBindings(file.text).length > 0);
    expect(withQueries.length).toBeGreaterThanOrEqual(40);
    const failureStates = files.flatMap((file) => [...file.text.matchAll(/<LoadFailure\b/g)]);
    expect(failureStates.length).toBeGreaterThanOrEqual(40);
    const marked = files.flatMap((file) => {
      const lines = file.text.split(/\r?\n/);
      return flaggedLines(file).filter((line) => isMarked(lines, line - 1));
    });
    expect(marked.length).toBeGreaterThanOrEqual(1);
  });
});

describe("queryBindings", () => {
  test("finds a whole result and a destructured error under its alias", () => {
    const text = [
      "function Screen() {",
      "  const listQuery = useQuery({",
      "  const q = useQuery<Foo, Error>({",
      "  const { data, error: statusesError, isError } = useQuery({",
      "  const { error: renamed = null } = useSuspenseQuery(options);",
      "  const other = useState(0);",
      "}",
    ].join("\n");
    const sources = queryBindings(text).map((binding) => binding.pattern.source);
    expect(sources).toHaveLength(5);
    expect(sources[0]).toContain("listQuery");
    expect(sources[1]).toContain("\\bq\\??\\.");
    expect(sources[2]).toContain("statusesError");
    expect(sources[3]).toContain("isError");
    expect(sources[4]).toContain("renamed");
  });

  test("holds a name only until the next function at the left margin", () => {
    const text = [
      "function First() {",
      "  const { error } = useQuery({});",
      "  return <p>{x}</p>;",
      "}",
      "",
      "function Second({ error }) {",
      "  return null;",
      "}",
    ].join("\n");
    const [binding] = queryBindings(text);
    expect([binding.first, binding.last]).toEqual([1, 4]);
  });
});

describe("findQueryErrorViolations", () => {
  const scan = (...lines: string[]) =>
    findQueryErrorViolations([
      {
        path: "src/components/admin/Thing.tsx",
        text: [
          "function Screen() {",
          "  const query = useQuery({ queryKey: [] });",
          "  const { error: statusesError } = useQuery({ queryKey: [] });",
          ...lines,
          "}",
        ].join("\n"),
      },
    ]);
  const first = "src/components/admin/Thing.tsx:4";

  test("reports a bare banner, and a banner that sits beside the empty sentence", () => {
    expect(scan('{query.error && <p role="alert">{copy.failed}</p>}')).toEqual([first]);
    expect(
      scan("{query.isError ? (", '  <div role="alert">{copy.failed}</div>', ") : null}"),
    ).toEqual([first]);
    expect(scan("{statusesError && (", "  <p>{copy.failed}</p>", ")}")).toEqual([first]);
    expect(scan("if (query.isError)", '  return <p role="alert">{copy.failed}</p>;')).toEqual([
      first,
    ]);
    expect(
      scan("if (query.isError) {", "  return (", "    <p>{copy.failed}</p>", "  );", "}"),
    ).toEqual([first]);
    expect(scan("{(query.error || other) && (", "  <p>{copy.failed}</p>", ")}")).toEqual([first]);
  });

  test("reports a query error written as a message outside a failure state", () => {
    expect(scan("<Row note={adminErrorMessage(query.error, language)} />")).toEqual([first]);
    expect(scan("{adminErrorMessage(statusesError, language)}")).toEqual([first]);
    expect(
      scan("<Row", "  note={", "    adminErrorMessage(query.error, language)", "  }", "/>"),
    ).toEqual(["src/components/admin/Thing.tsx:6"]);
  });

  test("accepts a LoadFailure, a DataTable that takes the error and a failure title", () => {
    expect(
      scan(
        "{query.error && (",
        "  <LoadFailure error={query.error} onRetry={() => void query.refetch()} />",
        ")}",
        "{query.isError ? <LoadFailure error={query.error} onRetry={retry} /> : null}",
        "if (query.isError) return <LoadFailure error={query.error} onRetry={retry} />;",
        "<LoadFailure error={query.error} onRetry={retry} title={adminErrorMessage(query.error, language)} />",
        "const view = { heading: adminErrorMessage(statusesError, language) };",
        "<LoadFailure",
        "  error={query.error}",
        "  onRetry={retry}",
        "  title={",
        "    adminErrorMessage(query.error, language)",
        "  }",
        "/>",
        "<DataTable rows={rows} error={query.error} onRetry={retry} />",
      ),
    ).toEqual([]);
  });

  test("leaves alone a read that is not a failure display", () => {
    expect(
      scan(
        "<TablePager failed={query.isError} total={query.isError ? undefined : total} />",
        "{query.isError ? STAT_UNAVAILABLE : summary[item]}",
        "const rows = query.error ? [] : (query.data?.rows ?? []);",
        "const busy = query.isFetching || Boolean(query.error);",
        "disabled={saving || query.isError}",
        "if (query.isPending) return <p>{copy.loading}</p>;",
        "{!query.isLoading && !query.isError ? <ol>{rows}</ol> : null}",
        "{open && !statusesError && (",
        "  <ol>{rows}</ol>",
        ")}",
        "const description = unrelated.error && other.value;",
        "<Table error={statusesError} />",
      ),
    ).toEqual([]);
  });

  test("does not take another function's error for the query's", () => {
    const text = [
      "function Panel() {",
      "  const { error, mutate } = useMutation({});",
      "  return error && <p>{x}</p>;",
      "}",
      "",
      "function Screen() {",
      "  const { data, error } = useQuery({});",
      "  return <LoadFailure error={error} onRetry={retry} />;",
      "}",
    ].join("\n");
    expect(findQueryErrorViolations([{ path: "src/components/admin/Thing.tsx", text }])).toEqual(
      [],
    );
  });

  test("accepts a marker on the same line or on a comment-only line above", () => {
    expect(
      scan("{query.error && <p>{copy.failed}</p>} // admin-load-failure-ok: a hint, not a load"),
    ).toEqual([]);
    expect(
      scan(
        "// admin-load-failure-ok: the dialog wraps this message in a failure state",
        "tasksError={adminErrorMessage(query.error, language)}",
      ),
    ).toEqual([]);
  });

  test("requires a reason after the marker", () => {
    expect(scan("{query.error && <p>{copy.failed}</p>} // admin-load-failure-ok:")).toEqual([
      first,
    ]);
  });

  test("reports a LoadFailure without onRetry, in one line or across several", () => {
    const only = (...lines: string[]) =>
      findQueryErrorViolations([
        { path: "src/components/admin/Thing.tsx", text: lines.join("\n") },
      ]);
    expect(only("<LoadFailure error={error} />")).toEqual([
      "src/components/admin/Thing.tsx:1 (no onRetry)",
    ]);
    expect(
      only("return (", "  <LoadFailure", "    error={error}", "    title={t}", "  />", ");"),
    ).toEqual(["src/components/admin/Thing.tsx:2 (no onRetry)"]);
    expect(
      only("<LoadFailure", "  error={error}", "  onRetry={() => void refetch()}", "/>"),
    ).toEqual([]);
    expect(only("<LoadFailure {...props} />")).toEqual([]);
  });

  test("reports a DataTable that takes an error without a retry", () => {
    const only = (text: string) =>
      findQueryErrorViolations([{ path: "src/components/admin/Thing.tsx", text }]);
    expect(only("<DataTable rows={rows} error={query.error} />")).toEqual([
      "src/components/admin/Thing.tsx:1 (no onRetry)",
    ]);
    expect(only("<DataTable rows={rows} />")).toEqual([]);
  });

  test("skips test files", () => {
    const text =
      "function A() {\n  const query = useQuery({});\n  return query.error && <p>failed</p>;\n}\n<LoadFailure error={e} />";
    expect(
      findQueryErrorViolations([{ path: "src/components/admin/Thing.test.tsx", text }]),
    ).toEqual([]);
  });
});

describe("findUnusedMarkers", () => {
  test("names a marker that covers no flagged read, and accepts one that does", () => {
    const text = [
      "function A() {",
      "  const query = useQuery({});",
      "  // admin-load-failure-ok: left behind after a fix",
      "  const failure = <LoadFailure error={query.error} onRetry={retry} />;",
      "  const x = 1; // admin-load-failure-ok: nothing here",
      "  // admin-load-failure-ok: a hint",
      "  return query.error && <p>{copy.failed}</p>;",
      "}",
    ].join("\n");
    expect(findUnusedMarkers([{ path: "src/components/admin/Thing.tsx", text }])).toEqual([
      "src/components/admin/Thing.tsx:3",
      "src/components/admin/Thing.tsx:5",
    ]);
  });
});
