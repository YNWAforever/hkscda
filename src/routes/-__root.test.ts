import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

describe("the root route's public shell bundle boundary", () => {
  test("keeps public-only shell components out of the eager root imports", () => {
    const source = readFileSync(new URL("./__root.tsx", import.meta.url), "utf8");
    const root = ts.createSourceFile(
      "__root.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const publicShellModules = new Set([
      "../components/site/Header",
      "../components/site/Footer",
      "../components/site/help/HelpWidget",
      "../components/site/ShortlistProvider",
      "../components/site/ShortlistTray",
      "../components/site/fixedActions/PublicFixedActions",
      "../components/site/donations/ContextualDonationPrompt",
    ]);
    const eagerPublicShellImports = root.statements
      .filter(ts.isImportDeclaration)
      .map((declaration) => declaration.moduleSpecifier)
      .filter(ts.isStringLiteral)
      .map((specifier) => specifier.text)
      .filter((specifier) => publicShellModules.has(specifier));

    expect(eagerPublicShellImports).toEqual([]);
    expect(source).toContain('import("../components/site/PublicSiteShell")');
  });

  test("loads public CSS in the server head while keeping public shell code lazy", () => {
    const root = readFileSync(new URL("./__root.tsx", import.meta.url), "utf8");
    const globalStyles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const publicShell = readFileSync(
      new URL("../components/site/PublicSiteShell.tsx", import.meta.url),
      "utf8",
    );

    expect(globalStyles).not.toContain('@import "./styles/fonts.css"');
    expect(globalStyles).not.toContain('@import "./styles/public.css"');
    expect(root).toContain('import publicCss from "../styles/public.css?url"');
    expect(root).toContain('import publicFontsCss from "../styles/fonts.css?url"');
    expect(root).toContain(
      "shouldIncludePublicStyles(resolveHeadPathname(matches, match.pathname))",
    );
    expect(publicShell).not.toContain('import "../../styles/fonts.css"');
    expect(publicShell).not.toContain('import "../../styles/public.css"');
  });
});
