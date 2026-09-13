import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { policyJsonSchema, POLICY_SCHEMA_MIGRATION } from "./jsonSchema";

test("fixed PostgreSQL policy grammar stays synchronized with Zod source", () => {
  const migration = readFileSync(POLICY_SCHEMA_MIGRATION, "utf8");
  const json = migration.split("$policy_schema$")[1];
  expect(JSON.parse(json)).toEqual(policyJsonSchema);
  expect(policyJsonSchema.additionalProperties).toBe(false);
  expect(policyJsonSchema.required).toContain("eligibility");
});
