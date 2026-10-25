import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractFunctionBody, normaliseSql } from "../../operations/sqlFunctionBody";

const sql = readFileSync(
  "supabase/migrations/20261025190000_volunteer_runtime_finish_expired_lease.sql",
  "utf8",
);

test("the owning worker can finish after the lease time without opening the row to someone else", () => {
  const body = normaliseSql(extractFunctionBody(sql, "public.finish_volunteer_runtime_job"));
  expect(body).toContain("status = 'running'");
  expect(body).toContain("lease_owner = p_owner");
  expect(body).toContain("lease_until = null");
  expect(body).not.toMatch(/lease_until\s*>=/);
  expect(body).toContain("errcode = '22023'");
  const normalised = normaliseSql(sql);
  expect(normalised).toContain("security definer");
  expect(normalised).toContain("set search_path = public, pg_temp");
  expect(normalised).toContain(
    "revoke all on function public.finish_volunteer_runtime_job(text, timestamptz, uuid, text, jsonb) from public, anon, authenticated",
  );
  expect(normalised).toContain(
    "grant execute on function public.finish_volunteer_runtime_job(text, timestamptz, uuid, text, jsonb) to service_role",
  );
});
