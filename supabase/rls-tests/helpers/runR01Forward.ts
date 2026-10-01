/** Explicit opt-in rehearsal; import has no top-level side effects. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, basename } from "node:path";
import {
  captureProductionSchema,
  captureModernLocalSchema,
  createProductionClone,
  snapshot,
  assertSafeFixtureTables,
  hash,
  localSourceState,
} from "./productionSchemaClone";

async function assertOriginalModernPreserved(url: string, before: string) {
  if ((await localSourceState(url)) !== before)
    throw new Error("Existing modern synthetic source state changed");
}

async function run() {
  if (process.env.R01_FORWARD_ALLOW_LOCAL_FIXTURES !== "1")
    throw new Error("R01_FORWARD_ALLOW_LOCAL_FIXTURES=1 is required");
  const mode = process.argv[2];
  if (!["red", "red-modern", "actor-red-modern", "green", "green-modern"].includes(mode))
    throw new Error("Use red, red-modern, actor-red-modern, green, or green-modern");
  const modern = mode.endsWith("modern"),
    green = mode.startsWith("green");
  const receipt: Record<string, unknown> = {
    mode,
    startedAt: new Date().toISOString(),
    productionActions: "schema/catalog reads only; no production rows or mutation",
    environment: "new guarded DB at loopback52322; managed synthetic Auth/Storage retained",
  };
  const root = resolve(import.meta.dir, "../../..");
  const output = resolve(root, ".superpowers/sdd/r01-forward-schema-plan-20261001");
  await mkdir(output, { recursive: true });
  const modernUrl = "postgresql://postgres:postgres@127.0.0.1:57322/postgres";
  const modernBefore = await localSourceState(modernUrl);
  const capture = modern ? await captureModernLocalSchema() : await captureProductionSchema();
  receipt.sourceCatalogHash = hash(capture.catalog);
  receipt.catalogCounts = Object.fromEntries(
    Object.entries(capture.catalog).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.length : value,
    ]),
  );
  const clone = await createProductionClone(capture);
  receipt.clone = clone.name;
  receipt.schemaParity = true;
  receipt.zeroApplicationTables = clone.tableCount;
  receipt.managedPrerequisitesHash = clone.prerequisites;
  try {
    const db = clone.sql;
    await assertSafeFixtureTables(db, ["supporter", "donation", "payment", "checkout_policy"]);
    const supporter = crypto.randomUUID(),
      donation = crypto.randomUUID(),
      payment = crypto.randomUUID();
    await db`insert into public.supporter(id,name,email) values(${supporter}::uuid,'R01 pre-migration legacy donor',${`r01-legacy-${supporter}@example.invalid`})`;
    await db`insert into public.donation(id,supporter_id,amount_cents,currency,purpose,type,status,method,refunded_cents) values(${donation}::uuid,${supporter}::uuid,32100,'HKD','medical','one_time','succeeded','stripe',500)`;
    await db`insert into public.payment(id,donation_id,provider,provider_ref,amount_cents,status,refunded_cents) values(${payment}::uuid,${donation}::uuid,'stripe','r01-before-ddl-committed',32100,'succeeded',500)`;
    await db`insert into public.checkout_policy(singleton,enabled,version) values(true,false,1)`;
    const facts = async () => {
      const [d] =
        await db`select to_jsonb(d)-'idempotency_key'-'idempotency_fingerprint' facts from public.donation d where id=${donation}::uuid`;
      const [p] =
        await db`select to_jsonb(p)-'idempotency_key'-'checkout_url'-'checkout_attempted_at' facts from public.payment p where id=${payment}::uuid`;
      return hash([d.facts, p.facts]);
    };
    const beforeFacts = await facts(),
      before = await snapshot(db);
    receipt.legacyFactsBeforeHash = beforeFacts;
    if (green) {
      const file = basename(process.argv[3] ?? "");
      if (!/^\d{14}_r01_payment_idempotency_forward\.sql$/.test(file))
        throw new Error("Exact focused forward migration filename required");
      const text = await readFile(resolve(root, "supabase/migrations", file), "utf8");
      if (
        /\b(?:CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|CREATE\s+TRIGGER|DROP\s+(?:TABLE|SCHEMA)|ALTER\s+(?:ROLE|DATABASE|SYSTEM|DEFAULT)|net\.|http_|dblink|cron\.)/i.test(
          text,
        )
      )
        throw new Error("Forward migration exceeds five-column scope");
      await db.begin((tx) => tx.unsafe(text));
      const first = await snapshot(db);
      await db.unsafe(
        "create temporary table donation(idempotency_key text,idempotency_fingerprint integer);create temporary table payment(idempotency_key text,checkout_url integer,checkout_attempted_at text);insert into pg_temp.donation values('synthetic shadow',42);set search_path=pg_temp,public",
      );
      await db.begin((tx) => tx.unsafe(text));
      const second = await snapshot(db);
      if (hash(first) !== hash(second)) throw new Error("Second apply metadata drift");
      if ((await facts()) !== beforeFacts)
        throw new Error("Forward migration changed pre-existing legacy money/provider facts");
      for (const facet of [
        "schemas",
        "functions",
        "defaults",
        "roles",
        "memberships",
        "extensions",
        "extensionMembers",
        "policies",
        "triggers",
        "types",
        "views",
        "databaseOwner",
      ])
        if (hash(before[facet]) !== hash(first[facet]))
          throw new Error("Unintended metadata drift: " + facet);
      const relationInvariant = (catalog: typeof before) =>
        (catalog.relations as { name: string; kind: string }[]).filter(
          (r) => !["donation_idempotency_key_idx", "payment_idempotency_key_idx"].includes(r.name),
        );
      if (hash(relationInvariant(before)) !== hash(relationInvariant(first)))
        throw new Error("Original relation metadata drift");
      const [shadow] = await db.unsafe(
        "select idempotency_key,idempotency_fingerprint from pg_temp.donation",
      );
      if (shadow.idempotency_key !== "synthetic shadow" || shadow.idempotency_fingerprint !== 42)
        throw new Error("Migration touched temporary shadow tables");
      await db.unsafe("drop table pg_temp.donation;drop table pg_temp.payment;set search_path=''");
      const rejected: { case: string; sqlState: string; restored: boolean }[] = [];
      const cases = [
        [
          "wrong-column-type",
          "alter table public.donation alter column idempotency_key type text using idempotency_key::text",
          "55000",
        ],
        [
          "unexpected-column-default",
          "alter table public.payment alter column checkout_url set default 'https://sandbox.example.invalid/default'",
          "55000",
        ],
        [
          "nonunique-index",
          "drop index public.donation_idempotency_key_idx;create index donation_idempotency_key_idx on public.donation(idempotency_key)",
          "55000",
        ],
        [
          "unexpected-fingerprint-constraint",
          "alter table public.donation drop constraint donation_idempotency_fingerprint_check;alter table public.donation add constraint donation_idempotency_fingerprint_check check(true)",
          "55000",
        ],
        [
          "invalid-existing-keyed-null",
          `alter table public.donation drop constraint donation_idempotency_fingerprint_check;alter table public.donation add constraint donation_idempotency_fingerprint_check check((idempotency_key is null and idempotency_fingerprint is null) or (idempotency_key is not null and idempotency_fingerprint ~ '^[0-9a-f]{64}$'));insert into public.donation(supporter_id,amount_cents,currency,purpose,type,status,method,idempotency_key) values('${supporter}'::uuid,10000,'HKD','general','one_time','pending','stripe','${crypto.randomUUID()}'::uuid)`,
          "23514",
        ],
      ] as const;
      for (const [label, mutation, expected] of cases) {
        let actual = "success";
        try {
          await db.begin(async (tx) => {
            await tx.unsafe(mutation);
            await tx.unsafe(text);
          });
        } catch (error) {
          actual = (error as { errno?: string }).errno ?? "unexpected";
        }
        const restored =
          hash(await snapshot(db)) === hash(second) && (await facts()) === beforeFacts;
        if (actual !== expected || !restored)
          throw new Error("Preflight negative case failed: " + label + " " + actual);
        rejected.push({ case: label, sqlState: actual, restored });
      }
      receipt.migration = {
        file,
        canonicalSha256: hash(text.replaceAll("\r\n", "\n")),
        firstApply: 0,
        secondApply: 0,
        secondApplyCatalogHash: hash(second),
        legacyFactsPreserved: true,
        metadataPreserved: true,
        tempShadowPreserved: true,
        rejected,
      };
    }
    const args = [
      "bun",
      "test",
      "src/lib/donations/idempotency.database.test.ts",
      "--timeout",
      "30000",
    ];
    if (!green)
      args.push(
        "--test-name-pattern",
        mode === "actor-red-modern"
          ? "JWT finance actors"
          : modern
            ? "NULL, malformed"
            : "current repository projection",
      );
    const p = Bun.spawn(args, {
      cwd: root,
      env: { ...process.env, R01_FORWARD_TEST_DATABASE_URL: clone.url },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exit] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
    const log = stdout + stderr;
    await writeFile(resolve(output, `task-1-${mode}-db.log`), log);
    receipt.testCommand = args.join(" ");
    receipt.testExit = exit;
    receipt.testSummary = log.match(/^\s*\d+ (?:pass|fail|skip|expect\(\) calls)\s*$/gm);
    if (
      !green &&
      exit !== 0 &&
      (mode === "actor-red-modern"
        ? log.includes("42501")
        : modern
          ? log.includes("23514")
          : log.includes("42703"))
    )
      receipt.watchedRed = true;
    else if (!green) throw new Error("RED was not the expected real database failure");
    if (green && exit !== 0)
      throw new Error("Focused database regression failed; inspect synthetic-only log");
    receipt.legacyFactsAfterHash = await facts();
    if (receipt.legacyFactsAfterHash !== beforeFacts)
      throw new Error("Database tests mutated original legacy facts");
    receipt.result = green ? "GREEN" : "watched RED";
    process.exitCode = green ? 0 : 1;
  } finally {
    await clone.close();
    receipt.cleanup = "only exact newly-created clone dropped without FORCE/session termination";
    await assertOriginalModernPreserved(modernUrl, modernBefore);
    receipt.originalSources = {
      templateBeforeHash: clone.templateBefore,
      templatePreserved: clone.templatePreserved,
      modernBeforeHash: modernBefore,
      modernPreserved: true,
      scope:
        "public/private schema metadata + retained managed prerequisites + all synthetic table row hashes (including ledger) + sequences; no original DDL/DML/session termination",
    };
    receipt.completedAt = new Date().toISOString();
    await writeFile(
      resolve(output, `task-1-${mode}-db.json`),
      JSON.stringify(receipt, null, 2) + "\n",
    );
    console.log(JSON.stringify(receipt));
  }
}

if (import.meta.main) await run();
