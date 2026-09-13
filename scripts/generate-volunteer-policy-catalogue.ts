import { initialPolicyCatalogue } from "../src/lib/volunteers/policy/catalogue";
import { readFile, writeFile } from "node:fs/promises";
const target = new URL(
  "../supabase/migrations/20260913070057_volunteer_initial_policy_catalogue.sql",
  import.meta.url,
);
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const output =
  "-- Generated from the versioned client catalogue. Drafts only; no sessions or people are seeded.\n" +
  initialPolicyCatalogue
    .map(
      (policy) =>
        `insert into public.volunteer_policy_draft(template_key,body,revision) values(${quote(policy.template_key)},${quote(JSON.stringify(policy))}::jsonb,1) on conflict(template_key) do nothing;`,
    )
    .join("\n") +
  "\n";
if (Bun.argv.includes("--check")) {
  if ((await readFile(target, "utf8")).replaceAll("\r\n", "\n") !== output)
    throw new Error("Initial catalogue migration is out of sync");
} else await writeFile(target, output);
