import { resolve } from "node:path";
// This gate has one fixed disposable destination; it never reads DATABASE_URL.
const url = "postgresql://postgres:postgres@127.0.0.1:56322/postgres";
const local = await Bun.file(".local-policy-test/local-credentials.json").json();
if (local.API_URL !== "http://127.0.0.1:56321")
  throw new Error("Start the dedicated hkscda-policy-20260913 stack first");
const env = {
  ...process.env,
  // Any real application composition reached by a test must use the same isolated stack.
  SUPABASE_URL: local.API_URL,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  VITE_SUPABASE_URL: local.API_URL,
  VITE_SUPABASE_ANON_KEY: local.ANON_KEY,
  RESEND_API_KEY: "",
  STRIPE_SECRET_KEY: "",
  PAYPAL_CLIENT_SECRET: "",
  CONTENT_MEDIA_RECONCILIATION_LOCAL_TEST: "1",
  CONTENT_MEDIA_RECONCILIATION_POLICY_STACK: "1",
  VOLUNTEER_TEST_DATABASE_URL: url,
  VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES: "1",
  SPONSORSHIP_TEST_DATABASE_URL: url,
  SPONSORSHIP_TEST_ALLOW_LOCAL_FIXTURES: "1",
  CRM_TEST_DATABASE_URL: url,
  CRM_TEST_ALLOW_LOCAL_FIXTURES: "1",
  CMS_LIFECYCLE_TEST_DATABASE_URL: url,
  CMS_LIFECYCLE_TEST_ALLOW_LOCAL_FIXTURES: "1",
  SUPABASE_LOCAL_URL: local.API_URL,
  SUPABASE_LOCAL_ANON_KEY: local.ANON_KEY,
  SUPABASE_LOCAL_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  QUALITY_TEST_API_URL: local.API_URL,
  QUALITY_TEST_SERVICE_KEY: local.SERVICE_ROLE_KEY,
  CMS_MEDIA_TEST_URL: local.API_URL,
  CMS_MEDIA_TEST_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
};
const files = [...new Bun.Glob("src/**/*.{database,integration}.test.ts").scanSync(".")].sort();
if (!files.length) throw new Error("No database acceptance tests found");
console.log(`Running ${files.length} real database test files against dedicated 56322 only`);
const mode = process.argv[2];
if (mode && !["--all", "--rls"].includes(mode)) throw new Error("Unknown isolated test mode");
const proc = Bun.spawn(
  [
    process.execPath,
    "test",
    ...(mode === "--all" ? [] : mode === "--rls" ? ["supabase/rls-tests"] : files),
  ],
  {
    cwd: resolve("."),
    env,
    stdout: "inherit",
    stderr: "inherit",
  },
);
process.exit(await proc.exited);
