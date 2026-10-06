export type SchemaRequirement =
  | {
      kind: "table";
      schema: string;
      name: string;
      feature: string;
      required: boolean;
      columns: Record<string, string>;
      rls: boolean;
      grants: Record<string, string[]>;
    }
  | {
      kind: "function";
      schema: string;
      name: string;
      feature: string;
      required: boolean;
      arguments: string;
      returns: string;
      executeRoles: string[];
    }
  | {
      kind: "column";
      schema: string;
      table: string;
      name: string;
      feature: string;
      required: boolean;
      type: string;
    };

export type CatalogSnapshot = {
  tables: {
    schema: string;
    name: string;
    rls: boolean;
    columns: Record<string, string>;
    grants: Record<string, string[]>;
  }[];
  functions: {
    schema: string;
    name: string;
    arguments: string;
    returns: string;
    executeRoles: string[];
  }[];
  migrationVersions: string[];
};

export type SchemaCompatibilityReport = {
  state: "compatible" | "degraded" | "incompatible";
  issues: { kind: string; name: string; feature: string; required: boolean }[];
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\btimestamptz\b/g, "timestamp with time zone")
    .replace(/\bint4\b/g, "integer")
    .replace(/\bint8\b/g, "bigint")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)\s*/g, ")")
    .trim();
}

function normalizePublicReturn(value: string): string {
  // pg_get_function_result omits public when it is on the active search_path.
  return normalize(value).replace(/\bpublic\./g, "");
}

function normalizeType(value: string): string {
  const normalized = normalize(value);
  if (normalized === "timestamptz") return "timestamp with time zone";
  if (normalized === "int4") return "integer";
  if (normalized === "int8") return "bigint";
  return normalized;
}

export async function checkReleaseSchema(
  port: { load(): Promise<CatalogSnapshot> },
  manifest: SchemaRequirement[],
): Promise<SchemaCompatibilityReport> {
  const catalog = await port.load();
  const issues: SchemaCompatibilityReport["issues"] = [];
  const add = (requirement: SchemaRequirement, kind: string, name: string) => {
    issues.push({ kind, name, feature: requirement.feature, required: requirement.required });
  };

  for (const requirement of manifest) {
    if (requirement.kind === "table") {
      const table = catalog.tables.find(
        (item) => item.schema === requirement.schema && item.name === requirement.name,
      );
      if (!table) {
        add(requirement, "missing-table", requirement.name);
        continue;
      }
      if (requirement.rls && !table.rls) add(requirement, "rls-disabled", requirement.name);
      for (const [column, expectedType] of Object.entries(requirement.columns)) {
        const actualType = table.columns[column];
        if (!actualType) add(requirement, "missing-column", `${requirement.name}.${column}`);
        else if (normalizeType(actualType) !== normalizeType(expectedType)) {
          add(requirement, "column-type", `${requirement.name}.${column}`);
        }
      }
      for (const [role, expectedGrants] of Object.entries(requirement.grants)) {
        const actualGrants = new Set(
          (table.grants[role] ?? []).map((grant) => grant.toUpperCase()),
        );
        for (const grant of expectedGrants) {
          if (!actualGrants.has(grant.toUpperCase()))
            add(requirement, "table-grant", `${requirement.name}:${role}:${grant}`);
        }
      }
    } else if (requirement.kind === "column") {
      const table = catalog.tables.find(
        (item) => item.schema === requirement.schema && item.name === requirement.table,
      );
      const actualType = table?.columns[requirement.name];
      const label = `${requirement.table}.${requirement.name}`;
      if (!actualType) add(requirement, "missing-column", label);
      else if (normalizeType(actualType) !== normalizeType(requirement.type))
        add(requirement, "column-type", label);
    } else {
      const sameName = catalog.functions.filter(
        (item) => item.schema === requirement.schema && item.name === requirement.name,
      );
      const fn = sameName.find(
        (item) => normalize(item.arguments) === normalize(requirement.arguments),
      );
      if (!fn) {
        add(
          requirement,
          sameName.length ? "function-signature" : "missing-function",
          requirement.name,
        );
        continue;
      }
      if (normalizePublicReturn(fn.returns) !== normalizePublicReturn(requirement.returns))
        add(requirement, "function-return", requirement.name);
      for (const role of requirement.executeRoles) {
        if (!fn.executeRoles.includes(role))
          add(requirement, "execute-grant", `${requirement.name}:${role}`);
      }
    }
  }

  return {
    state: issues.some((issue) => issue.required)
      ? "incompatible"
      : issues.length
        ? "degraded"
        : "compatible",
    issues,
  };
}
