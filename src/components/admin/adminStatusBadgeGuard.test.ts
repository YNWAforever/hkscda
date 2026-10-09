import { describe, expect, test } from "bun:test";

/**
 * Every status the admin shows goes through the shared `StatusBadge` (coordinator statuses)
 * or `StatusPill` (everything else), so a status has one look across the back office. This
 * guard fails when a file brings back a private copy of that look:
 *
 * - a local `function StatusChip` (or `const StatusChip =`), the copy the adoption views had;
 * - a colour-class map keyed by status values: a `Record<...Status..., string>`, a `status...Class/
 *   Tone/Colour` function, or any `const` named for a status, dot or tone (typed or not), whose
 *   body holds Tailwind or token colour classes.
 *
 * A map from a status to text (labels) or to a tone name (`"success"`) is not flagged: only a
 * body that holds colour classes is. `StatusBadge.tsx` owns the palette and is not scanned.
 * Mark a deliberate exception with `// admin-status-ok: <reason>` on the line or the line above.
 */

const EXEMPTION_MARKER = /admin-status-ok:\s*\S/;
const COMMENT_ONLY_LINE = /^\s*(\/\/|\/\*|\*|\{\/\*)/;
const OWNER_FILE = "src/components/admin/StatusBadge.tsx";
const SCANNED_GLOBS = ["src/routes/admin/**/*.{ts,tsx}", "src/components/admin/**/*.{ts,tsx}"];

export type SourceFile = { path: string; text: string };

const COLOUR_CLASS =
  /\b(?:bg|text|border|ring|fill|stroke)-(?:\[var\(--color-|(?:red|green|blue|amber|yellow|orange|emerald|rose|sky|cyan|indigo|purple|violet|pink|teal|lime|slate|gray|zinc|stone|neutral)-\d{2,3})/;

const LOCAL_CHIP = /\b(?:function\s+StatusChip\b|(?:const|let)\s+StatusChip\s*[=:])/;
/** `Record<SomeStatus, string>` style declarations whose key type names a status or urgency. */
const STATUS_RECORD = /\bRecord<\s*[\w.|"' ]*(?:status|urgency)[\w.|"' ]*,/i;
/** `function statusClass(`, `const statusTone = (`, `function groupEnquiryStatusClasses(`... */
const STATUS_CLASS_FN =
  /\b(?:function\s+\w*status\w*(?:class|colou?r|tone)\w*\s*\(|(?:const|let)\s+\w*status\w*(?:class|colou?r|tone)\w*\s*=\s*(?:\([^)]*\)|\w+)\s*(?::[^=]+)?=>)/i;

/**
 * Any `const` named for a status, a dot or a tone (`STATUS_DOT_CLASSES`, `dotClass`,
 * `urgencyTones` ...), typed or not. It is flagged only when its value holds colour classes.
 */
const STATUS_NAMED_CONST = /\b(?:const|let|var)\s+\w*(?:status|dot|tone)\w*\b/i;

function isExempt(lines: readonly string[], index: number): boolean {
  const above = index > 0 ? lines[index - 1] : "";
  return (
    EXEMPTION_MARKER.test(lines[index]) ||
    (COMMENT_ONLY_LINE.test(above) && EXEMPTION_MARKER.test(above))
  );
}

/**
 * The text of the declaration that starts at `start`: lines up to the one where every bracket
 * opened so far is closed, and the statement does not continue on the next line.
 */
function declarationBody(lines: readonly string[], start: number): string {
  const out: string[] = [];
  let depth = 0;
  for (let i = start; i < lines.length && i <= start + 60; i += 1) {
    out.push(lines[i]);
    for (const ch of lines[i]) {
      if ("({[".includes(ch)) depth += 1;
      else if (")}]".includes(ch)) depth -= 1;
    }
    if (depth <= 0 && !/(?:=>|=|\?|:|&&|\|\||\+)\s*$/.test(lines[i])) break;
  }
  return out.join("\n");
}

/** `path:line` of every private status look in the given files. */
export function findPrivateStatusLooks(files: readonly SourceFile[]): string[] {
  const hits: string[] = [];
  for (const file of files) {
    if (file.path === OWNER_FILE || file.path.includes(".test.")) continue;
    const lines = file.text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (isExempt(lines, index)) return;
      if (LOCAL_CHIP.test(line)) {
        hits.push(`${file.path}:${index + 1}`);
        return;
      }
      if (STATUS_RECORD.test(line) || STATUS_CLASS_FN.test(line) || STATUS_NAMED_CONST.test(line)) {
        if (COLOUR_CLASS.test(declarationBody(lines, index)))
          hits.push(`${file.path}:${index + 1}`);
      }
    });
  }
  return hits;
}

async function scannedFiles(): Promise<SourceFile[]> {
  const paths = (
    await Promise.all(
      SCANNED_GLOBS.map((pattern) => Array.fromAsync(new Bun.Glob(pattern).scan("."))),
    )
  )
    .flat()
    .map((path) => path.split("\\").join("/"))
    .sort();
  return Promise.all(paths.map(async (path) => ({ path, text: await Bun.file(path).text() })));
}

describe("admin status badge guard", () => {
  test("no admin file keeps a private status chip or status colour map", async () => {
    expect(
      findPrivateStatusLooks(await scannedFiles()),
      "Render the status with StatusBadge (coordinator status) or StatusPill (tone) from " +
        "components/admin/StatusBadge.tsx, or mark a deliberate exception with " +
        "`// admin-status-ok: <reason>`.",
    ).toEqual([]);
  });

  test("the scan sees the whole admin tree and the shared owner", async () => {
    const files = await scannedFiles();
    // If the glob ever returns nothing, the check above passes vacuously.
    expect(files.length).toBeGreaterThanOrEqual(150);
    expect(files.some((file) => file.path === OWNER_FILE)).toBe(true);
    expect(files.some((file) => file.path.startsWith("src/routes/admin/"))).toBe(true);
    // The owner really does hold a status colour map, so exempting it is what keeps it quiet.
    const owner = files.find((file) => file.path === OWNER_FILE);
    expect(owner && COLOUR_CLASS.test(owner.text)).toBe(true);
  });

  test("the shared components are used by the converted sites", async () => {
    const files = await scannedFiles();
    for (const path of [
      "src/components/admin/adoptions/AdopterDetail.tsx",
      "src/components/admin/adoptions/CaseDetail.tsx",
      "src/components/admin/adoptions/MatchPanel.tsx",
      "src/components/admin/adoptions/TaskPanel.tsx",
    ]) {
      const file = files.find((f) => f.path === path);
      expect(file, path).toBeDefined();
      expect(file?.text.includes("<StatusBadge"), path).toBe(true);
    }
  });
});

describe("findPrivateStatusLooks", () => {
  const at = (text: string, path = "src/components/admin/New.tsx"): SourceFile[] => [
    { path, text },
  ];

  test("flags a local StatusChip", () => {
    expect(
      findPrivateStatusLooks(at("function StatusChip({ status }) {\n  return null;\n}\n")),
    ).toEqual(["src/components/admin/New.tsx:1"]);
    expect(findPrivateStatusLooks(at("const StatusChip = () => null;\n"))).toHaveLength(1);
  });

  test("flags a Record keyed by status that holds colour classes", () => {
    const text = [
      "const STATUS_BADGE_CLASSES: Record<AnimalStatus, string> = {",
      '  available: "border-[var(--color-success)] text-[var(--color-panel)]",',
      "};",
    ].join("\n");
    expect(findPrivateStatusLooks(at(text))).toEqual(["src/components/admin/New.tsx:1"]);
    const tailwind =
      'const m: Record<"open" | "closed", string> = {};\nconst s: Record<Status, string> = {\n  a: "bg-red-500",\n};\n';
    expect(findPrivateStatusLooks(at(tailwind))).toEqual(["src/components/admin/New.tsx:2"]);
  });

  test("flags a status class function that returns colour classes", () => {
    const text = [
      "function statusClass(status: S) {",
      '  if (status === "a") return "bg-[var(--color-success-highlight)] text-[var(--color-success)]";',
      '  return "bg-[var(--color-surface-offset)]";',
      "}",
    ].join("\n");
    expect(findPrivateStatusLooks(at(text))).toEqual(["src/components/admin/New.tsx:1"]);
    const arrow = 'const statusTone = (s: S) => {\n  return "text-[var(--color-error)]";\n};\n';
    expect(findPrivateStatusLooks(at(arrow))).toHaveLength(1);
  });

  test("flags the original shape: an untyped-key Record named for a status or a dot", () => {
    const text = [
      "const STATUS_DOT_CLASSES: Record<string, string> = {",
      '  amber: "bg-[var(--color-warning)]",',
      "};",
    ].join("\n");
    expect(findPrivateStatusLooks(at(text))).toEqual(["src/components/admin/New.tsx:1"]);
  });

  test("flags an untyped object and a one-line const named for a tone or dot", () => {
    const untyped = 'const urgencyTones = {\n  high: "border-[var(--color-warning)]",\n};\n';
    expect(findPrivateStatusLooks(at(untyped))).toHaveLength(1);
    const oneLine = 'const dotClass = "bg-[var(--color-success)]";\nconst other = 1;\n';
    expect(findPrivateStatusLooks(at(oneLine))).toEqual(["src/components/admin/New.tsx:1"]);
    const arrow =
      'const pickDot = (s: S) =>\n  s === "a" ? "bg-[var(--color-error)]" : "bg-[var(--color-border)]";\n';
    expect(findPrivateStatusLooks(at(arrow))).toHaveLength(1);
  });

  test("does not flag a status-named const that holds no colour class", () => {
    const text =
      'const statusKeys = ["a", "b"] as const;\nconst dotSize = "h-2 w-2";\nconst x = "bg-[var(--color-panel)]";\n';
    expect(findPrivateStatusLooks(at(text))).toEqual([]);
  });

  test("does not flag label maps or tone-name maps", () => {
    const labels = [
      "const STATUS_LABELS: Record<AnimalStatus, string> = {",
      '  available: "Available",',
      '  adopted: "Adopted",',
      "};",
    ].join("\n");
    expect(findPrivateStatusLooks(at(labels))).toEqual([]);
    const tones = [
      "const ANIMAL_STATUS_TONE: Record<AnimalStatus, StatusTone> = {",
      '  available: "success",',
      "};",
      "function statusTone(status: S): StatusTone {",
      '  return status === "a" ? "success" : "neutral";',
      "}",
    ].join("\n");
    expect(findPrivateStatusLooks(at(tones))).toEqual([]);
  });

  test("does not flag a Record that is not keyed by a status", () => {
    const text = 'const sizes: Record<Size, string> = {\n  sm: "text-[var(--color-panel)]",\n};\n';
    expect(findPrivateStatusLooks(at(text))).toEqual([]);
  });

  test("honours the exemption marker on the line or the line above, and the owner file", () => {
    const same = "function StatusChip() {} // admin-status-ok: legacy export\n";
    expect(findPrivateStatusLooks(at(same))).toEqual([]);
    const above = [
      "// admin-status-ok: print stylesheet needs fixed colours",
      "const PRINT: Record<Status, string> = {",
      '  a: "text-[var(--color-panel)]",',
      "};",
    ].join("\n");
    expect(findPrivateStatusLooks(at(above))).toEqual([]);
    const bare = "// admin-status-ok:\nfunction StatusChip() {}\n";
    expect(findPrivateStatusLooks(at(bare))).toHaveLength(1);
    const owner = at(
      "const X: Record<string, string> = {};\nfunction StatusChip() {}\n",
      OWNER_FILE,
    );
    expect(findPrivateStatusLooks(owner)).toEqual([]);
  });

  test("ignores test files", () => {
    expect(
      findPrivateStatusLooks(at("function StatusChip() {}\n", "src/components/admin/X.test.tsx")),
    ).toEqual([]);
  });
});
