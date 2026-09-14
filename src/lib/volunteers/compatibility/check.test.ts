import { expect, test } from "bun:test";
import {
  assessVolunteerCompatibility,
  requiredVolunteerCapabilities,
  requiredVolunteerMigrations,
} from "./check";
const good = () => ({
  capabilities: requiredVolunteerCapabilities.map((signature) => ({
    signature,
    exists: true,
    service: true,
    anonymous: false,
    authenticated: false,
  })),
  migrations: [...requiredVolunteerMigrations],
  legacyAliasSafe: true,
});
test("dependency gate rejects old DB and unauthorized public RPC exposure", () => {
  const old = good();
  old.capabilities = old.capabilities.slice(2);
  old.migrations = [];
  old.legacyAliasSafe = false;
  const result = assessVolunteerCompatibility(old);
  expect(result.ready).toBe(false);
  expect(result.blockers.some((b) => b.includes("volunteer_admin_directory_read"))).toBe(true);
  expect(result.blockers.some((b) => b.includes("20260913182552"))).toBe(true);
  const exposed = good();
  exposed.capabilities[0].anonymous = true;
  expect(assessVolunteerCompatibility(exposed).ready).toBe(false);
});
test("only complete capabilities and ledger allow deployment", () => {
  expect(assessVolunteerCompatibility(good())).toEqual({ ready: true, blockers: [] });
  const missing = good();
  missing.migrations.pop();
  expect(assessVolunteerCompatibility(missing).ready).toBe(false);
});
