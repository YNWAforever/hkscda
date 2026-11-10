import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * Repository-wide security posture guards (2026-11-11).
 *
 * These lock in the supply-chain settings and keep live credentials out of the code paths that ship
 * or run, so a future change cannot silently undo them:
 * - CI must keep its read-only token and SHA-pinned actions (a mutable tag is a supply-chain hole);
 * - app code, scripts, migrations and workflows must not embed Supabase secret keys or PATs. The
 *   audit evidence under `docs/evidence/` is intentionally out of scope: it captures provider
 *   source defaults (the Supabase CLI local-development constants), which are not credentials.
 */

const CODE_ROOTS = ["src", "scripts", "supabase", ".github"] as const;
const SECRET_PATTERNS = [
  /sb_secret_[A-Za-z0-9_-]{16,}/, // Supabase secret API key
  /sbp_[A-Za-z0-9]{20,}/, // Supabase personal access token
] as const;

function filesUnder(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(path));
    else if (statSync(path).isFile()) files.push(path);
  }
  return files;
}

describe("repository security posture", () => {
  test("CI runs with a read-only token and every action pinned to a commit SHA", () => {
    const workflow = readFileSync(join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");

    // Least privilege: no job in this workflow needs to write to the repository.
    expect(workflow).toMatch(/^permissions:\n {2}contents: read$/m);

    const refs = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      // A moving `vN` tag can be re-pointed at unreviewed code; only a full SHA is immutable.
      expect(ref).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    }
  });

  test("code paths do not contain live Supabase secret keys or access tokens", () => {
    const offenders: string[] = [];
    for (const root of CODE_ROOTS) {
      for (const file of filesUnder(join(process.cwd(), root))) {
        const content = readFileSync(file, "utf8");
        for (const pattern of SECRET_PATTERNS) {
          const match = pattern.exec(content);
          if (match) offenders.push(`${relative(process.cwd(), file)}: ${match[0].slice(0, 12)}…`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("SECURITY.md documents private reporting and the accepted residual gaps", () => {
    const policy = readFileSync(join(process.cwd(), "SECURITY.md"), "utf8");
    expect(policy).toContain("Report a vulnerability");
    expect(policy).toContain("style-src 'unsafe-inline'");
  });
});
