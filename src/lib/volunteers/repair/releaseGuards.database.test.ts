import { afterAll, beforeAll, expect, test } from "bun:test";
import { SQL, type TransactionSQL } from "bun";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { prepareVolunteerDbRepair } from "./prepare.server";

// No connection without both a deliberate flag and a current, exact approval receipt.
const enabled = process.env.HKSCDA_RELEASE_GUARDS_DB_APPROVED === "1";
const oldMode = process.env.HKSCDA_RELEASE_GUARDS_BASELINE === "1";
const folder = ".local-policy-test/volunteer-db-guards-20261019/approved-pg/";
const database = "hkscda_compat_20261019_b7e198982637";
const container = "97347e44e3b09bf042726fd14bcf9951a64b1ef013e5af6f112943bda39be977";
const image = "sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108";
const extraRole = "hkscda_guard_20261019_extra";
const status6 =
  "public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean)";
const status7 = status6.replace("boolean)", "boolean,text)");
const sources = {
  registrationReason: readFileSync(
    "supabase/migrations/20261010130100_sp5b2_volunteer_registration_reason.sql",
    "utf8",
  ),
  singleProjection: readFileSync(
    "supabase/migrations/20261015122315_volunteer_workspace_single_projection.sql",
    "utf8",
  ),
  pageProjection: readFileSync(
    "supabase/migrations/20261015181456_volunteer_workspace_page_projection.sql",
    "utf8",
  ),
};
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
let db: SQL | undefined;
const round = oldMode ? "RED" : "GREEN";
const candidateName = oldMode
  ? "reason-workspace-repair-v2.REVIEW.sql"
  : "reason-workspace-repair-v3.REVIEW.sql";
const manifestName = oldMode ? "candidate-v2.json" : "candidate-v3.json";
const approvalName = oldMode ? "DB-EXECUTION-APPROVED.json" : "GREEN-approval.json";
const readScript = (name: string) =>
  folder + (oldMode ? "" : "GREEN-") + name + ".READONLY.DRAFT.sql";
const budgetSchema = z.object({
  round: z.enum(["RED", "GREEN"]),
  submissions: z.number().int().nonnegative().max(512),
  fixtures: z.number().int().nonnegative().max(12),
  roles: z.number().int().nonnegative().max(2),
  scripts: z.record(z.number().int().nonnegative().max(1)),
  status: z.literal("active"),
});
let initialCatalog: unknown;
const catalogSql = `(select coalesce(jsonb_agg(jsonb_build_object(
 'signature',p.oid::regprocedure::text,'definition_sha256',
 encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
 'body_md5',md5(p.prosrc),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text)
 order by p.oid),'[]'::jsonb) from pg_proc p
 where p.pronamespace='public'::regnamespace and p.proname in(
 'set_volunteer_registration_status_with_audit','set_volunteer_attendance_with_audit',
 'volunteer_bulk_command','volunteer_activity_workspace_rows',
 'volunteer_activity_workspace_candidates','volunteer_activity_workspace_project',
 'volunteer_bulk_admin','volunteer_policy_evaluate','volunteer_bulk_result',
 'volunteer_task_command','volunteer_pending_snapshot','volunteer_pending_work_snapshot',
 'volunteer_roster_attendance_command','volunteer_roster_attendance_fact',
 'volunteer_roster_attendance_reason','volunteer_roster_attendance_result',
 'volunteer_policy_evaluate_before_bulk','volunteer_policy_credentials','volunteer_policy_window'))`;
const rollback = new Error("Owned release guard fixture rollback");

function flattenResults(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenResults);
  return value !== null && typeof value === "object" ? [value as Record<string, unknown>] : [];
}

function reserve(amount = 1, fixtureAttempt = false, roleAttempt = false, script?: string) {
  const path = folder + round + "-budget.json";
  const budget = budgetSchema.parse(JSON.parse(readFileSync(path, "utf8")) as unknown);
  if (budget.round !== round) throw new Error("Wrong execution round");
  budget.submissions += amount;
  if (fixtureAttempt) budget.fixtures++;
  if (roleAttempt) budget.roles++;
  if (script) budget.scripts[script] = (budget.scripts[script] ?? 0) + 1;
  const allowed = budgetSchema.safeParse(budget);
  if (!allowed.success) throw new Error("Release DB approved budget exhausted");
  writeFileSync(path, JSON.stringify(allowed.data, null, 2) + "\n");
  appendFileSync(
    folder + round + "-events.jsonl",
    JSON.stringify({
      at: new Date().toISOString(),
      amount,
      fixtureAttempt,
      roleAttempt,
      script,
      submissions: budget.submissions,
      fixtures: budget.fixtures,
      roles: budget.roles,
    }) + "\n",
  );
}
async function run(tx: SQL | TransactionSQL, sql: string) {
  reserve(1, false, /\bcreate\s+role\s+hkscda_guard_20261019_extra\b/i.test(sql));
  try {
    return await tx.unsafe(sql).simple();
  } catch (error) {
    appendFileSync(
      folder + round + "-sql-errors.jsonl",
      JSON.stringify({
        at: new Date().toISOString(),
        sqlSha256: hash(sql),
        code:
          error && typeof error === "object" && "errno" in error
            ? String(error.errno)
            : "driver_error",
        message:
          error instanceof Error
            ? error.message.replace(/postgresql:\/\/[^@\s]+@/g, "postgresql://[local]@")
            : "unknown",
      }) + "\n",
    );
    throw error;
  }
}
function sourceDefinition(file: string, name: string) {
  const match = readFileSync(file, "utf8")
    .replaceAll("\r\n", "\n")
    .match(
      new RegExp(
        "create(?: or replace)? function public\\." +
          name +
          "\\([\\s\\S]*?\\bas\\s+(\\$\\w*\\$)[\\s\\S]*?\\1\\s*;",
        "i",
      ),
    );
  if (!match) throw new Error("Missing pinned fixture definition");
  return match[0].replace(/^create function/i, "create or replace function");
}
function repair(metadata: unknown = {}) {
  if (!oldMode) return prepareVolunteerDbRepair(sources, metadata).releaseSql;
  const bytes = readFileSync(
    ".local-policy-test/volunteer-migration-compat-20261019/reason-workspace-repair-0a6c9a52.REVIEW.sql",
  );
  if (hash(bytes) !== "6659dc424a20069758d58eb69be8efa68b378c5585bc7bd219342e78e4368ebb")
    throw new Error("Original RED payload changed");
  // Owning test transaction supplies the boundaries; never commit the fixture.
  return bytes
    .toString("utf8")
    .replace(/^begin;\r?\n/m, "")
    .replace(/\ncommit;\s*$/, "");
}
function injectBeforeAssertions(sql: string, command: string) {
  const marker = "-- Release final assertions.";
  return sql.includes(marker)
    ? sql.replace(marker, command + "\n " + marker)
    : sql + "\n" + command;
}
async function state(tx: TransactionSQL) {
  return await run(
    tx,
    `select proname,pg_get_function_identity_arguments(oid) signature,
      md5(pg_get_functiondef(oid)) definition,proowner,proacl::text acl,
      obj_description(oid,'pg_proc') comment,
      to_jsonb(pg_proc)-array['prosrc','proargdefaults','proconfig','prosqlbody'] attributes
     from pg_proc where pronamespace='public'::regnamespace
      and proname in('set_volunteer_registration_status_with_audit','volunteer_bulk_command',
       'volunteer_activity_workspace_rows','volunteer_activity_workspace_candidates','volunteer_activity_workspace_project')
     order by proname,signature`,
  );
}
async function failure(tx: TransactionSQL, sql: string) {
  try {
    reserve(3); // SAVEPOINT / failed statement / rollback-or-release upper bound.
    await tx.savepoint(async (savepoint) => {
      await run(savepoint, sql);
    });
    return "success";
  } catch (error) {
    return error && typeof error === "object" && "errno" in error
      ? String(error.errno)
      : "driver_error";
  }
}
async function fixture(fn: (tx: TransactionSQL) => Promise<void>) {
  if (!db) throw new Error("Approved owned DB required");
  reserve(2, true);
  try {
    await db.begin(async (tx) => {
      await run(
        tx,
        "set local search_path=pg_catalog;set local lock_timeout='2s';set local statement_timeout='15s';",
      );
      await run(
        tx,
        `drop function if exists ${status7};
         drop function if exists public.volunteer_activity_workspace_project(uuid[],jsonb);
         drop function if exists public.volunteer_activity_workspace_candidates(jsonb);`,
      );
      for (const name of ["volunteer_bulk_command", "volunteer_activity_workspace_rows"])
        await run(
          tx,
          sourceDefinition(
            "supabase/migrations/20260914160736_volunteer_bulk_operations.sql",
            name,
          ),
        );
      await run(
        tx,
        sourceDefinition(
          "supabase/migrations/20260913062837_volunteer_versioned_policy.sql",
          "set_volunteer_registration_status_with_audit",
        ),
      );
      await run(
        tx,
        `comment on function ${status6} is null;
         revoke all on function ${status6},public.volunteer_bulk_command(uuid,jsonb),public.volunteer_activity_workspace_rows(jsonb)
          from public,anon,authenticated,service_role;
         grant execute on function ${status6},public.volunteer_bulk_command(uuid,jsonb) to service_role;`,
      );
      await fn(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
beforeAll(async () => {
  if (!enabled) return;
  const approval = z
    .object({
      approved: z.literal(true),
      database: z.literal(database),
      container: z.literal(container),
      image: z.literal(image),
      testSha256: z.string(),
      candidateSha256: z.string(),
      sourceManifestSha256: z.string(),
      scripts: z.record(z.string()),
      maxSubmissionsPerRun: z.literal(512),
      maxAttemptsPerRun: z.literal(12),
    })
    .strict()
    .parse(JSON.parse(readFileSync(folder + approvalName, "utf8")) as unknown);
  expect(approval.testSha256).toBe(
    hash(readFileSync("src/lib/volunteers/repair/releaseGuards.database.test.ts")),
  );
  const budget = budgetSchema.parse(
    JSON.parse(readFileSync(folder + round + "-budget.json", "utf8")) as unknown,
  );
  expect(budget.round).toBe(round);
  expect(approval.candidateSha256).toBe(hash(readFileSync(folder + candidateName)));
  const manifestBytes = readFileSync(folder + manifestName);
  expect(approval.sourceManifestSha256).toBe(hash(manifestBytes));
  const frozen = z
    .object({
      sourceFiles: z.array(z.object({ path: z.string(), sha256: z.string() })),
      releaseEnvelopeSha256: z.string(),
    })
    .passthrough()
    .parse(JSON.parse(manifestBytes.toString("utf8")) as unknown);
  for (const file of frozen.sourceFiles) expect(hash(readFileSync(file.path))).toBe(file.sha256);
  expect(hash(prepareVolunteerDbRepair(sources).releaseSql)).toBe(frozen.releaseEnvelopeSha256);
  for (const name of ["PREFLIGHT", "POSTFLIGHT", "DEPENDENCIES"])
    expect(approval.scripts[name]).toBe(hash(readFileSync(readScript(name))));
  const context = Bun.spawnSync([
    "docker",
    "context",
    "inspect",
    "desktop-linux",
    "--format",
    "{{.Endpoints.docker.Host}}",
  ]);
  expect(context.exitCode).toBe(0);
  expect(new TextDecoder().decode(context.stdout).trim()).toBe(
    "npipe:////./pipe/dockerDesktopLinuxEngine",
  );
  const checked = Bun.spawnSync([
    "docker",
    "--context",
    "desktop-linux",
    "inspect",
    "--format",
    '{{.Id}}|{{.Image}}|{{index .Config.Labels "com.supabase.cli.project"}}|{{.State.Running}}|{{json .NetworkSettings.Ports}}|{{index .Config.Labels "com.supabase.cli.workdir"}}',
    container,
  ]);
  expect(checked.exitCode).toBe(0);
  const fields = new TextDecoder().decode(checked.stdout).trim().split("|");
  expect(fields.slice(0, 4).join("|")).toBe(
    container + "|" + image + "|hkscda-volunteer-perf-20261015|true",
  );
  const ports = z
    .record(
      z
        .array(
          z.object({
            HostPort: z.literal("56322"),
            HostIp: z.enum(["", "0.0.0.0", "::", "127.0.0.1"]),
          }),
        )
        .nullable(),
    )
    .parse(JSON.parse(fields[4]) as unknown);
  expect(ports["5432/tcp"]?.length).toBeGreaterThan(0);
  expect(fields[5]).toBe(resolve("node_modules/.codex-volunteer-perf-20261015"));
  const owned = JSON.parse(
    readFileSync(".local-policy-test/volunteer-migration-compat-20261019/ownership.json", "utf8"),
  ) as Record<string, unknown>;
  expect(owned.database).toBe(database);
  expect(owned.container).toBe(container);
  expect(owned.schemaOnly).toBe(true);
  expect(owned.created).toBe(true);
  expect(owned.worktree).toBe(resolve("."));
  db = new SQL("postgresql://postgres:postgres@127.0.0.1:56322/" + database, {
    max: 1,
    prepare: false,
  });
  const result = await run(
    db,
    `begin read only;set local search_path=pg_catalog;
     select current_database() db,current_user executor,session_user session,
   current_setting('server_version_num')::int version,
   (select count(*)::int from auth.users) users,
   (select count(*)::int from public.volunteer_profile) profiles,
   (select count(*)::int from public.volunteer_registration) registrations,
   (select count(*)::int from public.volunteer_operation_outbox) outbox,
   (select count(*)::int from public.audit_log) audit,
   (select count(*)::int from public.volunteer_runtime_job_run) jobs,
   (select count(*)::int from pg_roles where rolname='${extraRole}') existing_role,
   ${catalogSql} function_catalog;rollback;`,
  );
  const identityRow = flattenResults(result).find((row) => row.db === database);
  expect(identityRow).toBeDefined();
  const { function_catalog, ...identity } = identityRow!;
  initialCatalog = function_catalog;
  expect(identity).toEqual({
    db: database,
    executor: "postgres",
    session: "postgres",
    version: 170011,
    users: 0,
    profiles: 0,
    registrations: 0,
    outbox: 0,
    audit: 0,
    jobs: 0,
    existing_role: 0,
  });
  writeFileSync(folder + round + "-identity.json", JSON.stringify(identityRow, null, 2) + "\n", {
    flag: "wx",
  });
});
afterAll(async () => {
  if (!db) return;
  try {
    const result = await run(
      db,
      `begin read only;set local search_path=pg_catalog;select
     (select count(*)::int from auth.users) users,
     (select count(*)::int from public.volunteer_registration) registrations,
     (select count(*)::int from public.audit_log) audit,
     (select count(*)::int from public.volunteer_operation_outbox) outbox,
     (select count(*)::int from public.volunteer_profile) profiles,
     (select count(*)::int from public.volunteer_runtime_job_run) jobs,
     (select count(*)::int from pg_roles where rolname='${extraRole}') extra_role,
     ${catalogSql} function_catalog;rollback;`,
    );
    const postRow = flattenResults(result).find(
      (row) => "users" in row && "function_catalog" in row,
    );
    expect(postRow).toBeDefined();
    const { function_catalog, ...counts } = postRow!;
    expect(counts).toEqual({
      users: 0,
      registrations: 0,
      audit: 0,
      outbox: 0,
      profiles: 0,
      jobs: 0,
      extra_role: 0,
    });
    expect(function_catalog).toEqual(initialCatalog);
    writeFileSync(
      folder + round + "-postflight.json",
      JSON.stringify(
        {
          counts,
          catalogMatchesBefore: true,
          function_catalog,
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
  } finally {
    await db.close();
  }
});

test.skipIf(!enabled)(
  "release rejects an extra creator default grant and preserves the whole before state",
  async () => {
    await fixture(async (tx) => {
      await run(
        tx,
        `create role ${extraRole} nologin;alter default privileges for role postgres in schema public grant execute on functions to ${extraRole};`,
      );
      const before = await state(tx);
      expect(await failure(tx, repair())).toBe("55000");
      expect(await state(tx)).toEqual(before);
    });
  },
);
test.skipIf(!enabled)(
  "release final assertions reject a custom helper grant added after admission",
  async () => {
    await fixture(async (tx) => {
      await run(tx, `create role ${extraRole} nologin;`);
      const before = await state(tx);
      const sql = injectBeforeAssertions(
        repair(),
        `grant execute on function public.volunteer_activity_workspace_candidates(jsonb) to ${extraRole};`,
      );
      expect(await failure(tx, sql)).toBe("55000");
      expect(await state(tx)).toEqual(before);
    });
  },
);
test.skipIf(!enabled)(
  "release normal final owner and complete ACL sets equal the explicit approved sets",
  async () => {
    await fixture(async (tx) => {
      await run(tx, repair());
      const rows = await run(
        tx,
        `select proname,pg_get_userbyid(proowner) owner,
     (select jsonb_agg(jsonb_build_object('role',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
      'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
      order by a.grantee) from aclexplode(coalesce(proacl,acldefault('f',proowner))) a) acl
     from pg_proc where pronamespace='public'::regnamespace and proname in(
     'set_volunteer_registration_status_with_audit','volunteer_bulk_command',
     'volunteer_activity_workspace_rows','volunteer_activity_workspace_candidates','volunteer_activity_workspace_project')`,
      );
      expect(rows).toHaveLength(5);
      for (const row of rows) {
        expect(row.owner).toBe("postgres");
        const names =
          row.proname === "set_volunteer_registration_status_with_audit" ||
          row.proname === "volunteer_bulk_command"
            ? ["postgres", "service_role"]
            : ["postgres"];
        expect((row.acl as { role: string }[]).map((a) => a.role).sort()).toEqual(names.sort());
        for (const acl of row.acl as { grantor: string; privilege: string; grantable: boolean }[])
          expect({
            grantor: acl.grantor,
            privilege: acl.privilege,
            grantable: acl.grantable,
          }).toEqual({ grantor: "postgres", privilege: "EXECUTE", grantable: false });
      }
    });
  },
);
test.skipIf(!enabled)(
  "release rejects reason attribute drift without replacing the function",
  async () => {
    await fixture(async (tx) => {
      await run(tx, `alter function ${status6} cost 99 parallel safe;`);
      const before = await state(tx);
      expect(await failure(tx, repair())).toBe("55000");
      expect(await state(tx)).toEqual(before);
    });
  },
);
test.skipIf(!enabled)("release refuses an unreviewed reason comment", async () => {
  await fixture(async (tx) => {
    await run(tx, `comment on function ${status6} is 'Another operator comment';`);
    const before = await state(tx);
    expect(await failure(tx, repair())).toBe("55000");
    expect(await state(tx)).toEqual(before);
  });
});
test.skipIf(!enabled)(
  "release rejects a native incoming dependency before attempting DROP",
  async () => {
    await fixture(async (tx) => {
      await run(
        tx,
        `create temp view hkscda_guard_dependency as select public.set_volunteer_registration_status_with_audit(null::uuid,null::uuid,now(),'pending',null,false) as result;`,
      );
      const before = await state(tx);
      expect(await failure(tx, repair())).toBe("55000");
      expect(await state(tx)).toEqual(before);
    });
  },
);
test.skipIf(!enabled)(
  "release restores a reviewed quoted comment and reads it back exactly",
  async () => {
    await fixture(async (tx) => {
      const comment = "HKSCDA operator's reviewed note\\path $volunteer_release_v2$";
      await run(
        tx,
        `comment on function ${status6} is E'HKSCDA operator''s reviewed note\\\\path $volunteer_release_v2$';`,
      );
      await run(tx, repair({ reasonComment: comment }));
      const result = await run(
        tx,
        `select obj_description('${status7}'::regprocedure,'pg_proc') comment`,
      );
      expect(result[0].comment).toBe(comment);
    });
  },
);
test.skipIf(!enabled)(
  "release refuses final reason metadata drift and rolls back every stage",
  async () => {
    await fixture(async (tx) => {
      const before = await state(tx);
      expect(
        await failure(tx, injectBeforeAssertions(repair(), `alter function ${status7} cost 99;`)),
      ).toBe("55000");
      expect(await state(tx)).toEqual(before);
    });
  },
);
test.skipIf(!enabled)(
  "release rolls back reason and M2 when M3 rejects an unknown rows body",
  async () => {
    await fixture(async (tx) => {
      await run(
        tx,
        `create or replace function public.volunteer_activity_workspace_rows(p_filter jsonb)
     returns table(item jsonb) language sql stable security definer set search_path=public,pg_temp as $$select '{}'::jsonb$$;`,
      );
      const before = await state(tx);
      expect(await failure(tx, repair())).toBe("P0001");
      expect(await state(tx)).toEqual(before);
    });
  },
);
test.skipIf(!enabled)(
  "unavailable security-label provider rejects the label without claiming preservation",
  async () => {
    await fixture(async (tx) => {
      const before = await state(tx);
      expect(
        await failure(
          tx,
          `security label for hkscda_unavailable_guard_provider on function ${status6} is 'restricted';`,
        ),
      ).toBe("22023");
      expect(await state(tx)).toEqual(before);
      const labels = await run(
        tx,
        `select count(*)::int n from pg_seclabel where classoid='pg_proc'::regclass and objoid='${status6}'::regprocedure`,
      );
      expect(labels[0].n).toBe(0);
    });
  },
);
for (const name of ["PREFLIGHT", "POSTFLIGHT", "DEPENDENCIES"] as const) {
  test.skipIf(!enabled)(
    `${name} whole read-only script parses on the owned PostgreSQL and leaves no transaction`,
    async () => {
      if (!db) throw new Error("Approved owned DB required");
      reserve(0, false, false, name);
      let results: unknown;
      try {
        results = await run(db, readFileSync(readScript(name), "utf8"));
      } catch (error) {
        await run(db, "rollback");
        throw error;
      }
      const flattened = flattenResults(results);
      writeFileSync(
        folder + round + "-" + name + "-results.json",
        JSON.stringify(flattened, null, 2) + "\n",
        { flag: "wx" },
      );
      expect(
        flattened.some(
          (row) => row.actual_database === database || row.current_database === database,
        ),
      ).toBe(true);
      const catalog = initialCatalog as {
        definition_sha256: string;
        body_md5: string;
        owner: string;
      }[];
      const returned = flattened.filter(
        (row) => typeof row.signature === "string" && "present" in row && "body_md5" in row,
      );
      expect(returned.length).toBeGreaterThanOrEqual(name === "DEPENDENCIES" ? 3 : 17);
      for (const row of returned) {
        if (!row.present) continue;
        const fingerprint = row.full_definition_sha256 ?? row.definition_sha256;
        // Supplement rows expose attributes, while Q2 rows carry the whole-definition hash.
        if (fingerprint === undefined) continue;
        const actual = catalog.find((entry) => entry.definition_sha256 === fingerprint);
        expect(actual).toBeDefined();
        expect(row.body_md5).toBe(actual!.body_md5);
        expect(row.owner_role).toBe(actual!.owner);
      }
      const result = await run(
        db,
        "select current_database() db,current_setting('transaction_read_only') read_only",
      );
      expect(result[0].db).toBe(database);
      expect(result[0].read_only).toBe("off");
    },
  );
}
