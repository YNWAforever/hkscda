/**
 * Admin Account Seeder  —  scripts/seed-admin.js
 *
 * Creates or updates an admin user in Supabase Auth so you can log in at:
 *   http://localhost:8080/admin/login
 *
 * Auth system: Supabase Auth (signInWithPassword). No custom user table.
 * Password hashing: handled by Supabase internally (bcrypt).
 * Admin creation requires the service_role key (bypasses email confirmation).
 *
 * Requirements:
 *   VITE_SUPABASE_URL=...          (already in .env)
 *   SUPABASE_SERVICE_ROLE_KEY=...  (Supabase Dashboard → Settings → API → service_role)
 *   ADMIN_EMAIL=admin@example.com
 *   ADMIN_PASSWORD=your-password
 *   ADMIN_NAME=Admin               (optional, defaults to "Admin")
 *   ADMIN_ROLE=admin                (optional: staff, treasurer, admin)
 *
 * Run:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=change-this npm run seed:admin
 *   node scripts/seed-admin.js
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── Env loading ──────────────────────────────────────────────────────────────

function readEnv() {
  const merged = {};
  for (const file of [".env", ".env.local"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.trim().match(/^([^#=][^=]*?)\s*=\s*(.*)$/);
      if (m) merged[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return { ...merged, ...process.env };
}

// ── Production guard ─────────────────────────────────────────────────────────
//
// This script is a local development tool only (see docstring above) -- there
// is no legitimate reason to run it against the live production Supabase
// project. These are pure, exported functions with no side effects, so they
// can be unit-tested without reading real env files or making real Supabase
// Auth calls (see scripts/seed-admin.test.ts).

export const PRODUCTION_PROJECT_REF = "iihqjzilgawhfdhdevam";

export function extractProjectRef(supabaseUrl) {
  if (typeof supabaseUrl !== "string") return null;
  const match = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/);
  return match ? match[1] : null;
}

export function isProductionProjectRef(supabaseUrl) {
  return extractProjectRef(supabaseUrl) === PRODUCTION_PROJECT_REF;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const env = readEnv();

  const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const ADMIN_EMAIL = env.ADMIN_EMAIL;
  const ADMIN_PASSWORD = env.ADMIN_PASSWORD;
  const ADMIN_NAME = env.ADMIN_NAME || "Admin";
  const ADMIN_ROLE = env.ADMIN_ROLE || "admin";

  // ── Validation ───────────────────────────────────────────────────────────

  if (!SUPABASE_URL) {
    console.error("✗ VITE_SUPABASE_URL not set.");
    process.exit(1);
  }
  if (isProductionProjectRef(SUPABASE_URL)) {
    console.error("✗ Refusing to run against the production Supabase project.");
    console.error(`  Detected project ref: ${PRODUCTION_PROJECT_REF}`);
    console.error("  This script is a local development tool only. To manage a production");
    console.error("  admin account, use the Supabase Dashboard directly.");
    process.exit(1);
  }
  if (!SERVICE_KEY) {
    console.error("✗ SUPABASE_SERVICE_ROLE_KEY not set.");
    console.error("  Get it: Supabase Dashboard → Project Settings → API → service_role");
    console.error("  Add to .env: SUPABASE_SERVICE_ROLE_KEY=eyJ...");
    process.exit(1);
  }
  if (!ADMIN_EMAIL) {
    console.error("✗ ADMIN_EMAIL not set.");
    console.error("  Example: ADMIN_EMAIL=admin@example.com npm run seed:admin");
    process.exit(1);
  }
  if (!ADMIN_PASSWORD) {
    console.error("✗ ADMIN_PASSWORD not set.");
    process.exit(1);
  }
  if (ADMIN_PASSWORD.length < 8) {
    console.error("✗ ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }
  if (!["staff", "treasurer", "admin"].includes(ADMIN_ROLE)) {
    console.error("✗ ADMIN_ROLE must be one of: staff, treasurer, admin.");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Admin seeder — target: ${ADMIN_EMAIL}\n`);

  const {
    data: { users },
    error: listErr,
  } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    console.error("✗ Cannot list users:", listErr.message);
    console.error("  Verify SUPABASE_SERVICE_ROLE_KEY is the service_role key, not the anon key.");
    process.exit(1);
  }

  const existing = users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  let authUser = existing;

  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { name: ADMIN_NAME, role: ADMIN_ROLE },
      app_metadata: { role: ADMIN_ROLE },
    });
    if (error) {
      console.error("✗ Update failed:", error.message);
      process.exit(1);
    }
    authUser = data.user;
    console.log("✓ Admin updated (existing account)");
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { name: ADMIN_NAME, role: ADMIN_ROLE },
      app_metadata: { role: ADMIN_ROLE },
    });
    if (error) {
      console.error("✗ Create failed:", error.message);
      process.exit(1);
    }
    authUser = data.user;
    console.log("✓ Admin created");
  }

  if (!authUser?.id) {
    console.error("✗ Auth user was not returned by Supabase.");
    process.exit(1);
  }

  const { error: adminUserError } = await supabase.from("admin_user").upsert(
    {
      auth_user_id: authUser.id,
      email: ADMIN_EMAIL.toLowerCase(),
      role: ADMIN_ROLE,
      status: "active",
    },
    { onConflict: "auth_user_id" },
  );

  if (adminUserError) {
    console.error("✗ Admin role sync failed:", adminUserError.message);
    console.error("  Make sure Supabase migrations have been applied before seeding admin users.");
    process.exit(1);
  }
  console.log(`✓ Admin role synced (${ADMIN_ROLE})`);

  console.log("");
  console.log(`  Login URL : http://localhost:8080/admin/login`);
  console.log(`  Email     : ${ADMIN_EMAIL}`);
  console.log(`  Password  : [hidden]`);
  console.log(`  Name      : ${ADMIN_NAME}`);
  console.log(`  Role      : ${ADMIN_ROLE}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  });
}
