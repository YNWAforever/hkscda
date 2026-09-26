import { describe, expect, test } from "bun:test";
import { checkReleaseSchema, type CatalogSnapshot, type SchemaRequirement } from "./releaseSchema";

const manifest: SchemaRequirement[] = [
  {
    kind: "table",
    schema: "public",
    name: "example_intent",
    feature: "uploads",
    required: true,
    columns: { id: "uuid", created_at: "timestamp with time zone" },
    rls: true,
    grants: { service_role: ["SELECT", "INSERT"] },
  },
  {
    kind: "function",
    schema: "public",
    name: "reserve_example",
    feature: "uploads",
    required: true,
    arguments: "p_id uuid, p_path text",
    returns: "void",
    executeRoles: ["service_role"],
  },
  {
    kind: "column",
    schema: "public",
    table: "public_status_token",
    name: "submission_fingerprint",
    feature: "submissions",
    required: true,
    type: "text",
  },
];

function compatibleCatalog(): CatalogSnapshot {
  return {
    tables: [
      {
        schema: "public",
        name: "example_intent",
        rls: true,
        columns: { id: "uuid", created_at: "timestamp with time zone" },
        grants: { service_role: ["SELECT", "INSERT"] },
      },
      {
        schema: "public",
        name: "public_status_token",
        rls: true,
        columns: { submission_fingerprint: "text" },
        grants: {},
      },
    ],
    functions: [
      {
        schema: "public",
        name: "reserve_example",
        arguments: "p_id uuid, p_path text",
        returns: "void",
        executeRoles: ["service_role"],
      },
    ],
    migrationVersions: ["20990101000000"],
  };
}

describe("checkReleaseSchema", () => {
  test("correct catalog is compatible", async () => {
    const report = await checkReleaseSchema({ load: async () => compatibleCatalog() }, manifest);
    expect(report.state).toBe("compatible");
    expect(report.issues).toEqual([]);
  });

  test("wrong column type is incompatible even when table exists", async () => {
    const catalog = compatibleCatalog();
    catalog.tables[0]!.columns.created_at = "timestamp without time zone";
    const report = await checkReleaseSchema({ load: async () => catalog }, manifest);
    expect(report.state).toBe("incompatible");
    expect(report.issues).toContainEqual(
      expect.objectContaining({ kind: "column-type", name: "example_intent.created_at" }),
    );
  });

  test("Postgres canonical type names match migration aliases", async () => {
    const catalog = compatibleCatalog();
    catalog.functions[0]!.arguments = "p_id uuid, p_path timestamptz";
    const expected = manifest.map((requirement) =>
      requirement.kind === "function"
        ? { ...requirement, arguments: "p_id uuid, p_path timestamp with time zone" }
        : requirement,
    );
    const report = await checkReleaseSchema({ load: async () => catalog }, expected);
    expect(report.state).toBe("compatible");
  });

  test("Postgres table return formatting does not create a false incompatibility", async () => {
    const catalog = compatibleCatalog();
    catalog.functions[0]!.returns = "TABLE(receipt_id uuid, pdf_url text)";
    const expected = manifest.map((requirement) =>
      requirement.kind === "function"
        ? { ...requirement, returns: "table ( receipt_id uuid,pdf_url text )" }
        : requirement,
    );
    const report = await checkReleaseSchema({ load: async () => catalog }, expected);
    expect(report.state).toBe("compatible");
  });

  test("Postgres unqualified public composite return matches the migration declaration", async () => {
    const catalog = compatibleCatalog();
    catalog.functions[0]!.returns = "SETOF content_public_asset";
    const expected = manifest.map((requirement) =>
      requirement.kind === "function"
        ? { ...requirement, returns: "setof public.content_public_asset" }
        : requirement,
    );
    const report = await checkReleaseSchema({ load: async () => catalog }, expected);
    expect(report.state).toBe("compatible");
  });

  test("same RPC name with different arguments cannot satisfy requirement", async () => {
    const catalog = compatibleCatalog();
    catalog.functions[0]!.arguments = "p_id uuid";
    const report = await checkReleaseSchema({ load: async () => catalog }, manifest);
    expect(report.state).toBe("incompatible");
    expect(report.issues).toContainEqual(
      expect.objectContaining({ kind: "function-signature", name: "reserve_example" }),
    );
  });

  test("missing execute grant and disabled RLS are incompatible", async () => {
    const catalog = compatibleCatalog();
    catalog.tables[0]!.rls = false;
    catalog.functions[0]!.executeRoles = [];
    const report = await checkReleaseSchema({ load: async () => catalog }, manifest);
    expect(report.issues.map((issue) => issue.kind)).toContain("rls-disabled");
    expect(report.issues.map((issue) => issue.kind)).toContain("execute-grant");
  });

  test("a migration ledger entry cannot stand in for a missing object", async () => {
    const catalog = compatibleCatalog();
    catalog.tables = catalog.tables.filter((table) => table.name !== "example_intent");
    const report = await checkReleaseSchema({ load: async () => catalog }, manifest);
    expect(report.state).toBe("incompatible");
    expect(report.issues).toContainEqual(
      expect.objectContaining({ kind: "missing-table", name: "example_intent" }),
    );
  });

  test("optional missing feature degrades without clearing required checks", async () => {
    const catalog = compatibleCatalog();
    const report = await checkReleaseSchema({ load: async () => catalog }, [
      ...manifest,
      {
        kind: "table",
        schema: "public",
        name: "future_feature",
        feature: "future",
        required: false,
        columns: { id: "uuid" },
        rls: true,
        grants: {},
      },
    ]);
    expect(report.state).toBe("degraded");
    expect(report.issues).toContainEqual(
      expect.objectContaining({ kind: "missing-table", feature: "future" }),
    );
  });
});
