import assert from "node:assert/strict";
import { SQL } from "bun";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

export type Role = "admin" | "worker" | "staff" | "treasurer" | "volunteer1" | "volunteer2";
export const roles: Role[] = ["admin", "worker", "staff", "treasurer", "volunteer1", "volunteer2"];
export type Account = { id: string; email: string };
export type Fixture = {
  fixtureId: string;
  accounts: Partial<Record<Role, Account>>;
  profileIds: string[];
  versionId: string;
  templateKey: string;
  effectiveFrom: string;
  bucket?: string;
  phase: string;
};
export async function context() {
  const root = process.env.LOCAL_ACCEPTANCE_ROOT;
  assert(root);
  const target = JSON.parse(await readFile(join(root, "target-construction.json"), "utf8")) as {
    projectRef: string;
    fixtureId: string;
    systemIdentifier: string;
    syntheticOnly: boolean;
    productionConnection: boolean;
  };
  assert(
    target.syntheticOnly &&
      !target.productionConnection &&
      target.projectRef.startsWith("hkscda-volunteer-local-"),
  );
  const raw = process.env.LOCAL_TEST_CONTROL_URL;
  assert(raw);
  const url = new URL(raw);
  assert.equal(url.hostname, "db");
  assert.equal(url.port, "5432");
  assert.equal(url.pathname, "/postgres");
  const db = new SQL(raw, { max: 4, prepare: false });
  async function check() {
    const rows =
      await db`select (select system_identifier::text from pg_control_system()) system_identifier,
      fixture_id::text, project_ref from local_acceptance.identity`;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].system_identifier, target.systemIdentifier);
    assert.equal(rows[0].fixture_id, target.fixtureId);
    assert.equal(rows[0].project_ref, target.projectRef);
  }
  await check();
  const origin = process.env.SUPABASE_URL;
  assert.equal(origin, "http://127.0.0.1:59321");
  const identity = (await (await fetch(origin + "/__local_identity")).json()) as {
    systemIdentifier: string;
    fixtureId: string;
  };
  assert.equal(identity.systemIdentifier, target.systemIdentifier);
  assert.equal(identity.fixtureId, target.fixtureId);
  assert(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const service = createClient(origin, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const read = async <T>(file: string): Promise<T> =>
    JSON.parse(await readFile(join(root, file), "utf8")) as T;
  const save = async (file: string, value: unknown) =>
    writeFile(join(root, file), JSON.stringify(value, null, 2) + "\n");
  return { root, target, db, service, check, read, save };
}
