import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("CSP nonce propagation wiring", () => {
  test("the server generates one nonce per request and scopes the Start handler in it", () => {
    const server = read("src/server.ts");
    expect(server).toContain("const nonce = createCspNonce();");
    expect(server).toContain("runWithCspNonce(nonce,");
    expect(server).toContain("withNonceStampedScripts");
    // Both the normal response and the 500 fallback carry the same request nonce.
    expect(server.match(/applySecurityHeaders\(/g)?.length).toBe(2);
    expect(server.match(/applySecurityHeaders\([\s\S]*?nonce[),]/g)?.length).toBe(2);
  });

  test("getRouter reads the request nonce when scripts are stamped, not when the router is first created", () => {
    const router = read("src/router.tsx");
    expect(router).toContain('import { currentCspNonce } from "./lib/csp-nonce";');
    expect(router).toContain("get nonce()");
    expect(router).toContain("return currentCspNonce();");
    expect(router).not.toContain("ssr: { nonce }");
  });

  test("the document head publishes the request nonce for the client hydrator", () => {
    const rootRoute = read("src/routes/__root.tsx");
    expect(rootRoute).toContain('import { currentCspNonce } from "../lib/csp-nonce";');
    expect(rootRoute).toContain('property: "csp-nonce"');
    expect(rootRoute).toContain("currentCspNonce()");
  });

  test("the request store is server-only and backs the nonce on AsyncLocalStorage", () => {
    const store = read("src/lib/csp-nonce.server.ts");
    expect(store).toContain('from "node:async_hooks"');
    expect(store).toContain("AsyncLocalStorage");
    expect(store).toContain("installCspNonceStore");
    // The isomorphic module the router imports must import no node built-in.
    const shared = read("src/lib/csp-nonce.ts");
    expect(shared).not.toMatch(/from\s+["']node:/);
    expect(shared).not.toMatch(/require\(["']node:/);
  });

  test("the static error page carries no inline script or event handler", () => {
    const errorPage = read("src/lib/error-page.ts");
    expect(errorPage).not.toContain("<script");
    expect(errorPage).not.toContain("onclick=");
    expect(errorPage).not.toContain("onload=");
    // "Try again" is a plain same-URL link, which needs no script.
    expect(errorPage).toContain('<a class="primary" href="">Try again</a>');
  });

  test("no component renders an inline <script> outside the router's nonced head scripts", () => {
    const tsxFiles = [...new Bun.Glob("**/*.tsx").scanSync({ cwd: join(root, "src") })].filter(
      (path) => !path.includes(".test."),
    );
    const inlineScriptFiles = tsxFiles.filter((path) =>
      readFileSync(join(root, "src", path), "utf8").includes("<script"),
    );
    // JSON-LD blocks go through a route `head.scripts` entry, which TanStack Router renders with
    // the request nonce. Nothing else emits a raw script element.
    expect(inlineScriptFiles).toEqual([]);
  });

  test("the JSON-LD report pages put their data block in nonce-stamped head scripts", () => {
    for (const route of ["src/routes/report/audit.tsx", "src/routes/report/adoption.tsx"]) {
      const source = read(route);
      expect(source).toContain("jsonLdScript(");
      expect(source).toContain("scripts: [");
      expect(source).not.toContain("<script");
      expect(source).not.toContain("renderJsonLd");
    }
    const schema = read("src/lib/schema.tsx");
    expect(schema).toContain("export function jsonLdScript");
    expect(schema).not.toContain("<script");
  });
});
