#!/usr/bin/env node
/**
 * Fails when the built client bundle (.vercel/output/static) contains server-only
 * secrets. Two checks:
 *   1. the *names* of server-only environment variables and well-known secret prefixes,
 *      which would mean server code was bundled for the browser;
 *   2. the *values* of those variables, when the build environment has them set (a real
 *      deployment build), which would mean a secret was inlined.
 *
 * CLAUDE.md: `*.server.ts` never reaches the client bundle; only VITE_* is public.
 *
 *   node scripts/verify-client-bundle.mjs [staticDir]
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Server-only variables. VITE_* are public by design and are not listed. */
export const SERVER_SECRET_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
  "COD_AES_SECRET_BASE64",
  "COD_PRIVATE_KEY_BASE64",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "TURNSTILE_SECRET_KEY",
  "UPSTASH_REDIS_REST_TOKEN",
  "CRON_SECRET",
  "SUPPORTER_RECOVERY_TOKEN_KEY",
  "ADMIN_PASSWORD",
];

const SECRET_PATTERNS = [
  { name: "Stripe secret key", pattern: /\b[sr]k_(live|test)_[0-9A-Za-z]{10,}/ },
  { name: "Stripe webhook secret", pattern: /\bwhsec_[0-9A-Za-z]{10,}/ },
  { name: "PEM private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

/** Values shorter than this are too likely to occur by chance to be meaningful. */
const MIN_VALUE_LENGTH = 12;

/**
 * @param {{ path: string, text: string }[]} files
 * @param {Record<string, string | undefined>} env
 * @returns {string[]} one human-readable finding per problem; empty when clean
 */
export function findClientBundleSecrets(files, env) {
  const findings = [];
  const values = SERVER_SECRET_NAMES.map((name) => [name, env[name]]).filter(
    ([, value]) => typeof value === "string" && value.length >= MIN_VALUE_LENGTH,
  );
  for (const { path, text } of files) {
    for (const name of SERVER_SECRET_NAMES) {
      if (text.includes(name)) findings.push(`${path}: contains the name ${name}`);
    }
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(text)) findings.push(`${path}: contains a ${name}`);
    }
    for (const [name, value] of values) {
      // Never print the value itself.
      if (text.includes(value)) findings.push(`${path}: contains the value of ${name}`);
    }
  }
  return findings;
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
    ),
  );
  return nested.flat();
}

async function main() {
  const root = process.argv[2] ?? join(process.cwd(), ".vercel/output/static");
  let paths;
  try {
    paths = (await listFiles(root)).filter((path) => /\.(m?js|css|html|json|map|txt)$/.test(path));
  } catch {
    console.error(`No client build at ${root}. Run \`bun run build\` first.`);
    process.exit(2);
  }
  const files = await Promise.all(
    paths.map(async (path) => ({ path, text: await readFile(path, "utf8") })),
  );
  const findings = findClientBundleSecrets(files, process.env);
  if (findings.length > 0) {
    console.error("Server-only secrets found in the client bundle:");
    for (const finding of findings) console.error(`  ${finding}`);
    process.exit(1);
  }
  console.log(`Client bundle clean: ${files.length} files checked.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
