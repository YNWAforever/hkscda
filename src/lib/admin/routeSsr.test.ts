import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const directory = fileURLToPath(new URL("../../routes/admin/", import.meta.url));
function sources(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const file = join(path, entry.name);
    return entry.isDirectory()
      ? sources(file)
      : entry.name.endsWith(".tsx") && !entry.name.includes(".test.")
        ? [file]
        : [];
  });
}
function routeOptions(file: string) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let options: ts.ObjectLiteralExpression | undefined;
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isCallExpression(node.expression) &&
      node.expression.expression.getText(source) === "createFileRoute" &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    )
      options = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(source);
  return options;
}

test("every protected admin page defers its browser-session guard and rendering to the client", () => {
  const protectedRoutes = sources(directory)
    .map((file) => ({ file, options: routeOptions(file) }))
    .filter(({ options }) =>
      options?.properties.some((property) => property.name?.getText() === "beforeLoad"),
    );
  expect(protectedRoutes.length).toBeGreaterThan(20);
  const unsafe = protectedRoutes
    .filter(
      ({ options }) =>
        !options?.properties.some(
          (property) =>
            ts.isPropertyAssignment(property) &&
            property.name.getText() === "ssr" &&
            property.initializer.kind === ts.SyntaxKind.FalseKeyword,
        ),
    )
    .map(({ file }) => relative(directory, file));
  expect(unsafe).toEqual([]);
});

test("login and password recovery retain server-rendered entry forms", () => {
  for (const file of ["login.tsx", "reset-password.tsx"]) {
    const options = routeOptions(join(directory, file));
    expect(options).toBeDefined();
    expect(options?.properties.some((property) => property.name?.getText() === "ssr")).toBe(false);
  }
});
