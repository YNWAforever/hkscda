import { readFile, writeFile } from "node:fs/promises";
import { policyJsonSchema, POLICY_SCHEMA_MIGRATION } from "../src/lib/volunteers/policy/jsonSchema";
const sql = await readFile(POLICY_SCHEMA_MIGRATION, "utf8");
const parts = sql.split("$policy_schema$");
if (parts.length !== 3) throw new Error("Expected exactly one fixed policy schema SQL literal");
const generated = [parts[0], JSON.stringify(policyJsonSchema), parts[2]].join("$policy_schema$");
if (process.argv.includes("--check")) {
  if (generated !== sql)
    throw new Error("Policy SQL grammar differs from Zod; regenerate before review");
  console.log("Policy SQL grammar matches Zod source");
} else {
  await writeFile(POLICY_SCHEMA_MIGRATION, generated, "utf8");
  console.log("Updated fixed policy SQL grammar");
}
