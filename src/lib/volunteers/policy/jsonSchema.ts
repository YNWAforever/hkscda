import { z } from "zod";
import { policyDraftSchema } from "./schemas";

/** Restricted JSON Schema vocabulary understood by the fixed database matcher. */
export interface PolicyJsonSchema {
  type?: "object" | "array" | "string" | "integer" | "number" | "boolean" | "null";
  properties?: Record<string, PolicyJsonSchema>;
  required?: string[];
  additionalProperties?: false;
  items?: PolicyJsonSchema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  enum?: (string | number | boolean | null)[];
  const?: string | number | boolean | null;
  anyOf?: PolicyJsonSchema[];
}

/**
 * One check as zod 4 stores it. `check`/`format` name the constraint (min_length, max_length,
 * string_format, greater_than, …); the remaining fields carry its values. zod 4 keeps a
 * refinement as `{type: "custom", check: "custom"}`, which is a business rule the fixed SQL
 * matcher does not execute, so it is skipped like the `ZodEffects` wrapper it replaced.
 */
type PolicyCheck = {
  check?: string;
  format?: string;
  pattern?: RegExp;
  minimum?: number;
  maximum?: number;
  value?: number;
  inclusive?: boolean;
};

/**
 * The shape zod 4 exposes through `schema._zod.def` for the node kinds this converter handles.
 * It is read-only introspection of the public schema definitions, kept in one typed place so
 * the rest of the file does not touch zod internals (BUG-19-era code walked the zod 3 `_def`
 * directly and broke on the upgrade).
 */
type ZodNode = {
  _zod?: {
    def?: {
      type?: string;
      options?: readonly ZodNode[];
      innerType?: ZodNode;
      element?: ZodNode;
      shape?: Record<string, ZodNode>;
      catchall?: ZodNode;
      checks?: readonly PolicyCheck[];
      values?: readonly unknown[];
      entries?: Record<string, unknown>;
    };
  };
};

function definition(schema: ZodNode): NonNullable<NonNullable<ZodNode["_zod"]>["def"]> {
  const def = (schema as unknown as ZodNode)._zod?.def;
  if (!def?.type) throw new Error("Unsupported policy schema: zod node has no type");
  return def;
}

const UUID_PATTERN =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

/**
 * Structural JSON Schema for a policy draft, in the restricted vocabulary above.
 * No arbitrary refinements are executed or translated. Cross-field business
 * refinements remain in volunteer_validate_policy, after this structural check.
 */
export function toPolicyJsonSchema(schema: z.ZodType): PolicyJsonSchema {
  return convert(schema as unknown as ZodNode);
}

function convert(schema: ZodNode): PolicyJsonSchema {
  const def = definition(schema);
  switch (def.type) {
    case "optional":
    case "default":
    case "catch":
    case "prefault":
    case "readonly": {
      if (!def.innerType) throw new Error(`Unsupported policy wrapper: ${def.type}`);
      return convert(def.innerType);
    }
    case "nullable":
      if (!def.innerType) throw new Error("Unsupported policy nullable schema");
      return { anyOf: [convert(def.innerType), { type: "null" }] };
    case "object": {
      const shape = def.shape;
      if (!shape) throw new Error("Unsupported policy object schema");
      // zod 4 records strictness as a `never` catch-all; a plain object has none.
      if (definition(def.catchall as ZodNode).type !== "never")
        throw new Error("Policy objects must reject unknown fields");
      return {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(shape).map(([name, value]) => [name, convert(value)]),
        ),
        required: Object.entries(shape)
          .filter(([, value]) => definition(value).type !== "optional")
          .map(([name]) => name),
        additionalProperties: false,
      };
    }
    case "array": {
      if (!def.element) throw new Error("Unsupported policy array schema");
      const result: PolicyJsonSchema = { type: "array", items: convert(def.element) };
      for (const rawCheck of def.checks ?? []) {
        const check = checkDefinition(rawCheck);
        if (check.check === "min_length") result.minItems = check.minimum ?? 0;
        else if (check.check === "max_length") result.maxItems = check.maximum ?? 0;
        else if (check.check === "length_equals")
          result.minItems = result.maxItems = check.value ?? 0;
        else if (!isRefinement(check)) throw new Error("Unsupported policy array constraint");
      }
      return result;
    }
    case "union": {
      if (!def.options) throw new Error("Unsupported policy union schema");
      return { anyOf: def.options.map((option) => convert(option)) };
    }
    case "enum": {
      if (!def.entries) throw new Error("Unsupported policy enum schema");
      return {
        type: "string",
        enum: Object.values(def.entries) as (string | number | boolean | null)[],
      };
    }
    case "literal": {
      const value = def.values?.[0];
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      )
        return { const: value };
      throw new Error("Unsupported policy literal");
    }
    case "boolean":
      return { type: "boolean" };
    case "string":
      return stringSchema(def.checks ?? []);
    case "number":
      return numberSchema(def.checks ?? []);
    default:
      throw new Error(`Unsupported policy schema kind: ${def.type}`);
  }
}

/**
 * zod 4 stores each check on the schema as a check instance; its `_zod.def` is the plain
 * definition with the constraint's name and values. Older zod 3 exposed the plain object
 * directly, which is what the removed walker relied on.
 */
function checkDefinition(check: unknown): PolicyCheck {
  const wrapped = (check as { _zod?: { def?: PolicyCheck } })._zod?.def;
  return wrapped ?? (check as PolicyCheck);
}

/** A refinement adds no structural keyword for the fixed matcher; it runs in SQL later. */
function isRefinement(check: PolicyCheck) {
  return check.check === "custom";
}

function stringSchema(rawChecks: readonly PolicyCheck[]): PolicyJsonSchema {
  const result: PolicyJsonSchema = { type: "string" };
  for (const rawCheck of rawChecks) {
    const check = checkDefinition(rawCheck);
    if (check.check === "min_length") result.minLength = check.minimum ?? 0;
    else if (check.check === "max_length") result.maxLength = check.maximum ?? 0;
    else if (check.check === "string_format" && check.format === "regex") {
      const pattern = check.pattern;
      if (!(pattern instanceof RegExp)) throw new Error("Policy regex constraint has no pattern");
      if (pattern.flags) throw new Error("Policy patterns cannot use JavaScript-only flags");
      result.pattern = pattern.source;
    } else if (check.check === "string_format" && check.format === "uuid") {
      result.pattern = UUID_PATTERN;
    } else if (!isRefinement(check)) {
      throw new Error(
        `Unsupported policy string constraint: ${check.check ?? check.format ?? "?"}`,
      );
    }
  }
  return result;
}

function numberSchema(rawChecks: readonly PolicyCheck[]): PolicyJsonSchema {
  const result: PolicyJsonSchema = { type: "number" };
  for (const rawCheck of rawChecks) {
    const check = checkDefinition(rawCheck);
    if (check.check === "number_format" && check.format === "safeint") result.type = "integer";
    else if (check.check === "greater_than" && check.inclusive) result.minimum = check.value ?? 0;
    else if (check.check === "less_than" && check.inclusive) result.maximum = check.value ?? 0;
    else if (!isRefinement(check)) {
      throw new Error(`Unsupported policy number constraint: ${check.check ?? "?"}`);
    }
  }
  return result;
}

export const policyJsonSchema = toPolicyJsonSchema(policyDraftSchema);
export const POLICY_SCHEMA_MIGRATION = new URL(
  "../../../../supabase/migrations/20260913065257_volunteer_policy_validation.sql",
  import.meta.url,
);
