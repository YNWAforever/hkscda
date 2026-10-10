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
 *    `{error && !isLoading && (<p>…`, `if (query.isError) return <p>…`) when no failure state that
 *    names the same query follows: a `<LoadFailure>` (or a `<DataTable>` that takes the error)
 *    whose tag mentions the binding has to start within the fourteen lines from the gate, so a
 *    failure state of some other query does not excuse it. A read behind `!` gates the success
 *    path, so it is not a failure display.
 * 3. A query's error written into a prop or a text node through `adminErrorMessage(…)` and its
 *    siblings, except as the `title` of a `<LoadFailure>`, the `failureTitle` of a `<DataTable>`
 *    or inside a `loadFailure` object (its `heading`). A `message=` on any other component does
 *    not count.
 *
 * "A query's error" is `name.error` or `name.isError` for a name bound to `useQuery(…)`,
 * `useSuspenseQuery(…)`, `useInfiniteQuery(…)` or `useQueries(…)`, and an `error` or `isError`
 * destructured from one of them, under the name it is given. A constant declared from one of
 * those reads (`const loadError = query.error ?? other.error;`) is the same error under another
 * name, one level down. A name counts from where it is bound to the next function that starts at
 * the left margin, so another function's `error` in the same file is not mistaken for it.
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
/** How many lines below a gate are searched for the JSX it opens. */
const JSX_LOOKAHEAD = 4;

export type SourceFile = { path: string; text: string };

function isTestFile(path: string): boolean {
  return path.includes(".test.");
}

/**
 * Where a query's error can be read: the pattern for a read, the pattern for any mention of the
 * binding (so a failure state can be tied to it), and the lines it holds for.
 */
export type QueryBinding = { pattern: RegExp; mention: RegExp; first: number; last: number };

const QUERY_HOOK = String.raw`use(?:Suspense|Infinite)?Quer(?:y|ies)`;
/** A declaration at the left margin, which ends the scope of the names before it. */
const SCOPE_END =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b|^(?:export\s+)?const\s+[A-Za-z_$][\w$]*\s*(?::[^=]+)?=\s*(?:\(|async\b|function\b|memo\b|forwardRef\b)/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A bare name that is not a property of something else and not the name of an attribute. */
function bareName(name: string): RegExp {
  return new RegExp(String.raw`(?<![\w$.])${escapeRegExp(name)}\b(?!\s*[=:](?!=))`, "g");
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
      mention: new RegExp(String.raw`(?<![\w$.])${escapeRegExp(match[1])}\b`),
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
        pattern: bareName(name),
        mention: new RegExp(String.raw`(?<![\w$.])${escapeRegExp(name)}\b`),
        first,
        last: lastLine(first),
      });
    }
  }

  // One level of aliases: `const loadError = query.error ?? other.error;`.
  const aliases: QueryBinding[] = [];
  for (const binding of bindings) {
    for (let index = binding.first; index <= binding.last; index += 1) {
      const declaration = /^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=(?!=)/.exec(
        lines[index],
      );
      if (!declaration || COMMENT_ONLY_LINE.test(lines[index])) continue;
      const initializer = lines.slice(index, index + 6);
      const end = initializer.findIndex((line) => /;\s*(?:\/\/.*)?$/.test(line));
      const body = initializer.slice(0, end === -1 ? 1 : end + 1).join("\n");
      binding.pattern.lastIndex = 0;
      if (/=>|\buse[A-Z]/.test(body)) continue;
      binding.pattern.lastIndex = 0;
      const read = binding.pattern.exec(body);
      if (!read) continue;
      // `const rows = query.error ? undefined : data` derives the success path from the error;
      // it is not the error under another name.
      const afterRead = body.slice(read.index + read[0].length);
      if (/^\s*\?(?![?.])/.test(afterRead) || /!\s*$/.test(body.slice(0, read.index))) continue;
      aliases.push({
        pattern: bareName(declaration[1]),
        mention: new RegExp(
          `${binding.mention.source}|${String.raw`(?<![\w$.])${escapeRegExp(declaration[1])}\b`}`,
        ),
        first: index + 1,
        last: binding.last,
      });
    }
    binding.pattern.lastIndex = 0;
  }
  return [...bindings, ...aliases];
}

const MESSAGE_CALL =
  /\b(?:adminErrorMessage|volunteerAdminErrorMessage|documentErrorMessage|pipelineReadErrorText|policyErrorMessage)\(\s*$/;

/** The text of the JSX tag that starts at `start` in `text`, up to its closing `>`. */
function tagText(text: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  let index = start + 1;
  // Skip the name, and the type arguments after it (`<DataTable<Row> …>`).
  while (/[\w.]/.test(text[index] ?? "")) index += 1;
  if (text[index] === "<") {
    let angle = 0;
    for (; index < text.length; index += 1) {
      if (text[index] === "<") angle += 1;
      else if (text[index] === ">" && --angle === 0) {
        index += 1;
        break;
      }
    }
  }
  for (; index < text.length; index += 1) {
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

/** The text of the `{ … }` block that opens at `start` in `text`. */
function braceText(text: string, start: number): string {
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
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
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

type WordRegion = { start: number; end: number; keys: string[] };

/** The text regions in which an error message is the words of a failure state. */
function failureWordRegions(text: string): WordRegion[] {
  const regions: WordRegion[] = [];
  for (const match of text.matchAll(/<(LoadFailure|DataTable)\b/g)) {
    const tag = tagText(text, match.index);
    regions.push({
      start: match.index,
      end: match.index + tag.length,
      keys: match[1] === "LoadFailure" ? ["title", "heading"] : ["failureTitle"],
    });
  }
  const objects = /\bloadFailure\s*[=:]\s*(?=\{)|\bViewLoadFailure\b[^=;]*=\s*(?=\{)/g;
  for (const match of text.matchAll(objects)) {
    const start = match.index + match[0].length;
    regions.push({ start, end: start + braceText(text, start).length, keys: [] });
  }
  return regions;
}

/** Whether the message call that ends at `offset` is a failure state's own words. */
function isFailureWords(regions: WordRegion[], text: string, offset: number): boolean {
  const region = regions.find((candidate) => offset >= candidate.start && offset < candidate.end);
  if (!region) return false;
  // Inside a `loadFailure` object any field is the failure's own; in a tag only its heading is.
  if (region.keys.length === 0) return true;
  const props = [...text.slice(region.start, offset).matchAll(/\b([A-Za-z]+)=\{/g)];
  const key = props.at(-1)?.[1];
  return key !== undefined && region.keys.includes(key);
}

/** Whether a failure state that names the binding starts in `window`. */
function hasFailureState(window: string, mention: RegExp): boolean {
  for (const match of window.matchAll(/<(LoadFailure|DataTable)\b/g)) {
    const tag = tagText(window, match.index);
    if (match[1] === "DataTable" && !/(?:^|[\s{])error\s*=/.test(tag)) continue;
    if (mention.test(tag)) return true;
  }
  return false;
}

/**
 * Whether JSX follows a gate: the text after the operator, up to the first `<` (on the line or
 * the few below), holds only more of the condition, never a value, an object or a function.
 */
function opensJsx(after: string, nextLines: readonly string[]): boolean {
  const tail = [after, ...nextLines.slice(0, JSX_LOOKAHEAD)].join("\n");
  const open = tail.search(/<[A-Za-z>]|\{\/\*/);
  if (open === -1) return false;
  return !/[{};,[\]]|=>/.test(tail.slice(0, open));
}

/** 1-based lines of the reads that break rule 2 or rule 3, marked or not. */
export function flaggedLines(file: SourceFile): number[] {
  if (isTestFile(file.path)) return [];
  const lines = file.text.split(/\r?\n/);
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  const regions = failureWordRegions(file.text);
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

        // Rule 3: the error written as a message.
        if (MESSAGE_CALL.test(before)) {
          if (!isFailureWords(regions, file.text, lineStarts[index] + match.index)) {
            flagged.add(index + 1);
          }
          continue;
        }

        // A read behind `!` gates what shows when the load worked.
        if (/!\s*$/.test(before)) continue;

        // Rule 2: the error gates a block of JSX.
        const operator = /&&|(?<!\?)\?(?![?.])/.exec(after);
        if (operator) {
          const rest = after.slice(operator.index + operator[0].length);
          if (opensJsx(rest, lines.slice(index + 1)) && !hasFailureState(window, binding.mention)) {
            flagged.add(index + 1);
          }
          continue;
        }
        if (/^\s*if\s*\(/.test(code) && /\)\s*(?:\{\s*)?(?:return\b.*)?$/.test(code.trimEnd())) {
          const following = lines.slice(index + 1, index + 4).join("\n");
          const returnsJsx = /\breturn\b\s*\(?\s*<|^\s*<|\breturn\s*\(\s*$/m.test(
            `${code}\n${following}`,
          );
          if (returnsJsx && !hasFailureState(window, binding.mention)) flagged.add(index + 1);
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

  test("follows a constant declared from a query error, one level down", () => {
    const text = [
      "function Screen() {",
      "  const q = useQuery({});",
      "  const loadError = q.error ?? other.error;",
      "  const failure = [",
      "    q.error,",
      "    mutation.error,",
      "  ].find(Boolean);",
      "  const onClick = () => q.error;",
      "  const unrelated = other.error;",
      "}",
    ].join("\n");
    const sources = queryBindings(text).map((binding) => binding.pattern.source);
    expect(sources).toHaveLength(3);
    expect(sources[1]).toContain("loadError");
    expect(sources[2]).toContain("failure");
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
          "  const { error: statusesError, isLoading } = useQuery({ queryKey: [] });",
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

  test("reports a gate that is followed by more of the condition before the JSX", () => {
    expect(scan("{statusesError && !isLoading && (", "  <p>{copy.failed}</p>", ")}")).toEqual([
      first,
    ]);
    expect(scan("{query.error && open && other ? <p>{copy.failed}</p> : null}")).toEqual([first]);
  });

  test("reports a banner whose only failure state is some other query's", () => {
    expect(
      scan(
        '{query.error && <p role="alert">{copy.failed}</p>}',
        "<LoadFailure error={statusesError} onRetry={retry} />",
      ),
    ).toEqual([first]);
    expect(
      scan(
        "{query.error && (",
        '  <p role="alert">{copy.failed}</p>',
        ")}",
        "<LoadFailure error={query.error} onRetry={retry} />",
      ),
    ).toEqual([]);
  });

  test("reports a banner gated on a constant declared from the query error", () => {
    expect(
      scan("const loadError = query.error;", '{loadError && <p role="alert">{copy.failed}</p>}'),
    ).toEqual(["src/components/admin/Thing.tsx:5"]);
    expect(
      scan(
        "const loadError = query.error ?? statusesError;",
        "{loadError ? <LoadFailure error={loadError} onRetry={retry} /> : null}",
      ),
    ).toEqual([]);
  });

  test("reports a query error written as a message outside a failure state", () => {
    expect(scan("<Row note={adminErrorMessage(query.error, language)} />")).toEqual([first]);
    expect(scan("{adminErrorMessage(statusesError, language)}")).toEqual([first]);
    expect(
      scan("<Row", "  note={", "    adminErrorMessage(query.error, language)", "  }", "/>"),
    ).toEqual(["src/components/admin/Thing.tsx:6"]);
  });

  test("does not take a message= prop of any component for a failure state's words", () => {
    expect(scan("<AsyncError message={adminErrorMessage(statusesError, language)} />")).toEqual([
      first,
    ]);
    expect(
      scan(
        "<AsyncError",
        "  message={",
        '    adminErrorMessage(query.error, language) ?? ""',
        "  }",
        "/>",
      ),
    ).toEqual(["src/components/admin/Thing.tsx:6"]);
    // Nor a title on a component that is not the failure state.
    expect(scan("<Card title={adminErrorMessage(query.error, language)} />")).toEqual([first]);
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
        "const loadFailure = { error: query.error, onRetry: retry, heading: adminErrorMessage(statusesError, language) };",
        "<LoadFailure",
        "  error={query.error}",
        "  onRetry={retry}",
        "  title={",
        "    adminErrorMessage(query.error, language)",
        "  }",
        "/>",
        "<DataTable rows={rows} error={query.error} onRetry={retry} failureTitle={adminErrorMessage(query.error, language)} />",
        "<View",
        "  loadFailure={{",
        "    error: query.error,",
        "    heading: adminErrorMessage(query.error, language),",
        "    onRetry: retry,",
        "  }}",
        "/>",
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
        "const state = query.error ? { failed: true } : { failed: false };",
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
