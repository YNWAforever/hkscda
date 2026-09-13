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

/** No arbitrary refinements are executed or translated. Cross-field business
 * refinements remain in volunteer_validate_policy, after this structural check. */
export function toPolicyJsonSchema(schema: z.ZodTypeAny): PolicyJsonSchema {
  if (schema instanceof z.ZodEffects) return toPolicyJsonSchema(schema.innerType());
  if (schema instanceof z.ZodOptional) return toPolicyJsonSchema(schema.unwrap());
  if (schema instanceof z.ZodNullable)
    return { anyOf: [toPolicyJsonSchema(schema.unwrap()), { type: "null" }] };
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    if (schema._def.unknownKeys !== "strict")
      throw new Error("Policy objects must reject unknown fields");
    return {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(shape).map(([name, value]) => [name, toPolicyJsonSchema(value)]),
      ),
      required: Object.entries(shape)
        .filter(([, value]) => !(value instanceof z.ZodOptional))
        .map(([name]) => name),
      additionalProperties: false,
    };
  }
  if (schema instanceof z.ZodArray) {
    const result: PolicyJsonSchema = { type: "array", items: toPolicyJsonSchema(schema.element) };
    if (schema._def.minLength) result.minItems = schema._def.minLength.value;
    if (schema._def.maxLength) result.maxItems = schema._def.maxLength.value;
    if (schema._def.exactLength) result.minItems = result.maxItems = schema._def.exactLength.value;
    return result;
  }
  if (schema instanceof z.ZodUnion)
    return { anyOf: schema.options.map((item: z.ZodTypeAny) => toPolicyJsonSchema(item)) };
  if (schema instanceof z.ZodDiscriminatedUnion)
    return { anyOf: schema.options.map((item: z.ZodTypeAny) => toPolicyJsonSchema(item)) };
  if (schema instanceof z.ZodEnum) return { type: "string", enum: schema.options };
  if (schema instanceof z.ZodLiteral) {
    const value: unknown = schema.value;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    )
      return { const: value };
    throw new Error("Unsupported policy literal");
  }
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodString) {
    const result: PolicyJsonSchema = { type: "string" };
    for (const check of schema._def.checks) {
      if (check.kind === "min") result.minLength = check.value;
      else if (check.kind === "max") result.maxLength = check.value;
      else if (check.kind === "regex") {
        if (check.regex.flags) throw new Error("Policy patterns cannot use JavaScript-only flags");
        result.pattern = check.regex.source;
      } else if (check.kind === "uuid")
        result.pattern =
          "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
      else throw new Error(`Unsupported policy string constraint: ${check.kind}`);
    }
    return result;
  }
  if (schema instanceof z.ZodNumber) {
    const result: PolicyJsonSchema = { type: "number" };
    for (const check of schema._def.checks) {
      if (check.kind === "int") result.type = "integer";
      else if (check.kind === "min" && check.inclusive) result.minimum = check.value;
      else if (check.kind === "max" && check.inclusive) result.maximum = check.value;
      else throw new Error(`Unsupported policy number constraint: ${check.kind}`);
    }
    return result;
  }
  throw new Error(`Unsupported policy schema kind: ${schema._def.typeName as string}`);
}
export const policyJsonSchema = toPolicyJsonSchema(policyDraftSchema);
export const POLICY_SCHEMA_MIGRATION = new URL(
  "../../../../supabase/migrations/20260913065257_volunteer_policy_validation.sql",
  import.meta.url,
);
