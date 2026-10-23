import { afterAll, beforeAll, expect, test } from "bun:test";
import { SQL, type TransactionSQL } from "bun";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { prepareVolunteerDbRepair } from "./prepare.server";

const enabled = process.env.HKSCDA_COMPAT_TEST_ALLOW_OWNED_DB === "1";
const replayBaseline = process.env.HKSCDA_COMPAT_TEST_BASELINE === "1";
const migrations = "supabase/migrations/";
const sources = {
  registrationReason: readFileSync(
    migrations + "20261010130100_sp5b2_volunteer_registration_reason.sql",
    "utf8",
  ),
  singleProjection: readFileSync(
    migrations + "20261015122315_volunteer_workspace_single_projection.sql",
    "utf8",
  ),
  pageProjection: readFileSync(
    migrations + "20261015181456_volunteer_workspace_page_projection.sql",
    "utf8",
  ),
};
const bulkSource = readFileSync(
  migrations + "20260914160736_volunteer_bulk_operations.sql",
  "utf8",
).replaceAll("\r\n", "\n");
const policySource = readFileSync(
  migrations + "20260913062837_volunteer_versioned_policy.sql",
  "utf8",
).replaceAll("\r\n", "\n");

function repairSql(stage: "all" | "page" = "all"): string {
  // Replays the original release under the same assertions for retained RED evidence.
  if (replayBaseline)
    return stage === "page"
      ? sources.pageProjection
      : sources.singleProjection + "\n" + sources.pageProjection;
  const repaired = prepareVolunteerDbRepair(sources);
  if (stage === "page") return repaired.pageProjection;
  return [repaired.registrationReason, repaired.singleProjection, repaired.pageProjection].join(
    "\n",
  );
}

let db: SQL | undefined;
const ownershipSchema = z
  .object({
    project: z.literal("hkscda-volunteer-perf-20261015"),
    container: z.literal("97347e44e3b09bf042726fd14bcf9951a64b1ef013e5af6f112943bda39be977"),
    worktree: z.string(),
    database: z.string().regex(/^hkscda_compat_20261019_[a-f0-9]{12}$/),
    created: z.literal(true),
    schemaOnly: z.literal(true),
  })
  .passthrough();

beforeAll(async () => {
  if (!enabled) return;
  const ownership = ownershipSchema.parse(
    JSON.parse(
      readFileSync(".local-policy-test/volunteer-migration-compat-20261019/ownership.json", "utf8"),
    ) as unknown,
  );
  expect(resolve(ownership.worktree)).toBe(resolve("."));
  const context = Bun.spawnSync([
    "docker",
    "context",
    "inspect",
    "--format",
    "{{.Endpoints.docker.Host}}",
  ]);
  expect(context.exitCode).toBe(0);
  expect(new TextDecoder().decode(context.stdout).trim()).toBe(
    "npipe:////./pipe/dockerDesktopLinuxEngine",
  );
  const inspected = Bun.spawnSync([
    "docker",
    "inspect",
    "--format",
    '{{.Id}}|{{index .Config.Labels "com.supabase.cli.project"}}|{{index .Config.Labels "com.supabase.cli.workdir"}}|{{.State.Running}}',
    ownership.container,
  ]);
  expect(inspected.exitCode).toBe(0);
  expect(new TextDecoder().decode(inspected.stdout).trim()).toBe(
    [
      ownership.container,
      ownership.project,
      resolve(ownership.worktree, "node_modules/.codex-volunteer-perf-20261015"),
      "true",
    ].join("|"),
  );
  db = new SQL("postgresql://postgres:postgres@127.0.0.1:56322/" + ownership.database, {
    max: 1,
    prepare: false,
  });
  const [state] = await db.unsafe(`
    select current_database() name,
      (select count(*)::int from auth.users) users,
      (select count(*)::int from public.volunteer_profile) profiles,
      (select count(*)::int from public.volunteer_registration) registrations,
      (select count(*)::int from public.volunteer_runtime_job_run) jobs`);
  expect(state).toEqual({
    name: ownership.database,
    users: 0,
    profiles: 0,
    registrations: 0,
    jobs: 0,
  });
});
afterAll(async () => {
  await db?.close();
});

function definition(source: string, name: string): string {
  const match = source.match(
    new RegExp(
      "create(?: or replace)? function public\\." +
        name +
        "\\([\\s\\S]*?\\bas\\s+(\\$\\w*\\$)[\\s\\S]*?\\1\\s*;",
      "i",
    ),
  );
  if (!match) throw new Error("Missing canonical fixture definition: " + name);
  return match[0].replace(/^create function/i, "create or replace function");
}

const rollback = new Error("Owned compatibility fixture rollback");
async function fixture(
  ending: "lf" | "crlf",
  run: (tx: TransactionSQL) => Promise<void>,
  sentinel = false,
) {
  if (!db) throw new Error("Verified owned fixture database required");
  try {
    await db.begin(async (tx) => {
      let command = definition(bulkSource, "volunteer_bulk_command");
      if (sentinel) {
        command = command.replace(
          "elsif action='templates' then",
          "elsif action='compat_sentinel' then return jsonb_build_object('kind','preserved','revision',9);\n elsif action='templates' then",
        );
      }
      for (let sql of [
        definition(bulkSource, "volunteer_activity_workspace_rows"),
        definition(bulkSource, "volunteer_bulk_admin"),
        command,
      ]) {
        if (ending === "crlf") sql = sql.replaceAll("\n", "\r\n");
        await tx.unsafe(sql).simple();
      }
      await tx
        .unsafe(
          `
          drop function if exists public.volunteer_activity_workspace_project(uuid[],jsonb);
          drop function if exists public.volunteer_activity_workspace_candidates(jsonb);
          drop function if exists public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean,text);
          drop function if exists public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean);`,
        )
        .simple();
      await tx
        .unsafe(definition(policySource, "set_volunteer_registration_status_with_audit"))
        .simple();
      await tx
        .unsafe(
          `
          revoke all on function public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean)
            from public,anon,authenticated;
          grant execute on function public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean)
            to service_role;`,
        )
        .simple();
      const [hash] = await tx`
        select md5(prosrc) value from pg_proc
        where oid='public.volunteer_activity_workspace_rows(jsonb)'::regprocedure`;
      expect(hash.value).toBe(
        ending === "lf" ? "ab48504596026f742c062cab50c2ca00" : "8d70bdb192b27066ed63034323db9a8f",
      );
      await run(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

async function actor(tx: SQL, role = "staff") {
  const id = randomUUID();
  await tx`insert into auth.users(id,email,email_confirmed_at)
    values(${id}::uuid,${id + "@example.invalid"},now())`;
  await tx`insert into public.admin_user(auth_user_id,email,role,status)
    values(${id}::uuid,${id + "@example.invalid"},${role},'active')`;
  return id;
}

async function command(tx: SQL, actorId: string, value: Record<string, unknown>): Promise<unknown> {
  return (
    await tx`select public.volunteer_bulk_command(${actorId}::uuid,${JSON.stringify(value)}::jsonb) value`
  )[0].value;
}

const listingSchema = z.object({
  kind: z.literal("listed"),
  total: z.number().int(),
  activities: z.array(z.object({ title: z.string() })),
});

async function sqlstate(tx: TransactionSQL, run: () => Promise<unknown>): Promise<string> {
  try {
    await tx.savepoint(async () => {
      await run();
    });
    return "success";
  } catch (error) {
    return error && typeof error === "object" && "errno" in error
      ? String(error.errno)
      : "unexpected_driver_error";
  }
}

for (const ending of ["lf", "crlf"] as const) {
  test.skipIf(!enabled)(
    `repair accepts the observed ${ending} baseline and preserves 0/1/25/27 pagination`,
    async () => {
      await fixture(ending, async (tx) => {
        await tx.unsafe(repairSql()).simple();
        const id = await actor(tx);
        const prefix = "AUDIT-COMPAT-" + randomUUID();
        const read = async (page: number, sort = "asc") =>
          listingSchema.parse(
            await command(tx, id, { action: "list", page, filter: { q: prefix, sort } }),
          );
        for (let count = 0; count <= 27; count++) {
          if (count > 0)
            await tx`insert into public.volunteer_activity(type,title,starts_at,location,capacity,status)
              values('volunteer_shift',${prefix + "-" + String(count).padStart(2, "0")},
                '2000-01-01'::timestamptz + ${count}*interval '1 day','Synthetic compatibility',5,'draft')`;
          if (![0, 1, 25, 27].includes(count)) continue;
          const first = await read(1);
          expect(first.total).toBe(count);
          expect(first.activities).toHaveLength(Math.min(count, 25));
          const second = await read(2);
          expect(second.total).toBe(count);
          expect(second.activities.map((a) => a.title)).toEqual(
            count === 27 ? [prefix + "-26", prefix + "-27"] : [],
          );
        }
        const descending = await read(1, "desc");
        expect(descending.activities[0].title).toBe(prefix + "-27");
        expect((await read(99)).activities).toEqual([]);
      });
    },
  );
}

test.skipIf(!enabled)(
  "page stage accepts the observed CRLF projection after the prior M2 stage",
  async () => {
    await fixture("crlf", async (tx) => {
      await tx.unsafe(sources.singleProjection.replaceAll("\n", "\r\n")).simple();
      await tx.unsafe(repairSql("page")).simple();
      expect(
        listingSchema.parse(await command(tx, await actor(tx), { action: "list", filter: {} }))
          .total,
      ).toBe(0);
    });
  },
);

test.skipIf(!enabled)(
  "repair restores the named p_reason call, audit reason and stale-version refusal",
  async () => {
    await fixture("lf", async (tx) => {
      await tx.unsafe(repairSql()).simple();
      const id = await actor(tx);
      const activity = randomUUID();
      const registration = randomUUID();
      await tx`insert into public.volunteer_activity(id,type,title,starts_at,location,capacity,status)
        values(${activity}::uuid,'volunteer_shift','AUDIT-COMPAT reason','2000-01-01','Synthetic',1,'published')`;
      await tx`insert into public.volunteer_registration(id,activity_id,registration_type,status,
        participant_count,contact_name,contact_email,contact_phone,status_token_hash,status_token_expires_at)
        values(${registration}::uuid,${activity}::uuid,'individual','pending',1,'Synthetic',
          ${registration + "@example.invalid"},'00000000',${randomUUID()},now()+interval '1 day')`;
      const [before] = await tx`select updated_at::text version from public.volunteer_registration
        where id=${registration}::uuid`;
      await tx.unsafe("set local role service_role");
      const [result] = await tx`
        select public.set_volunteer_registration_status_with_audit(
          p_registration_id=>${registration}::uuid,p_actor_user_id=>${id}::uuid,
          p_expected_updated_at=>${before.version}::timestamptz,p_status=>'rejected',
          p_internal_notes=>null,p_update_internal_notes=>false,
          p_reason=>'  Synthetic reviewed reason  ') value`;
      expect(result.value.kind).toBe("updated");
      const [stale] = await tx`
        select public.set_volunteer_registration_status_with_audit(
          p_registration_id=>${registration}::uuid,p_actor_user_id=>${id}::uuid,
          p_expected_updated_at=>${before.version}::timestamptz,p_status=>'approved',
          p_reason=>'stale attempt') value`;
      expect(stale.value.kind).toBe("conflict");
      await tx.unsafe("reset role");
      const audit = await tx`select detail from public.audit_log
        where entity_id=${registration} and action='volunteer_registration.status_update'`;
      expect(audit).toHaveLength(1);
      expect(audit[0].detail).toEqual({
        status: "rejected",
        reason: "Synthetic reviewed reason",
      });
      const [current] = await tx`select updated_at::text version from public.volunteer_registration
        where id=${registration}::uuid`;
      await tx.unsafe("set local role service_role");
      const [legacy] = await tx`
        select public.set_volunteer_registration_status_with_audit(
          ${registration}::uuid,${id}::uuid,${current.version}::timestamptz,
          'cancelled',null,false) value`;
      expect(legacy.value.kind).toBe("updated");
      await tx.unsafe("reset role");
      const details: { detail: { status: string; reason?: string } }[] =
        await tx`select detail from public.audit_log
        where entity_id=${registration} and action='volunteer_registration.status_update'`;
      expect(details).toHaveLength(2);
      expect(details.find((row) => row.detail.status === "cancelled")?.detail).toEqual({
        status: "cancelled",
      });
    });
  },
);

test.skipIf(!enabled)(
  "repair refuses an unknown workspace body and rolls back the whole package",
  async () => {
    await fixture("lf", async (tx) => {
      const drift = definition(bulkSource, "volunteer_activity_workspace_rows").replace(
        "'capacity',a.capacity",
        "'capacity',a.capacity+1",
      );
      await tx.unsafe(drift).simple();
      expect(await sqlstate(tx, () => tx.unsafe(repairSql()).simple())).toBe("P0001");
      const [state] = await tx`
      select to_regprocedure('public.volunteer_activity_workspace_candidates(jsonb)') is null absent,
        to_regprocedure('public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean,text)') is null old_signature`;
      expect(state).toEqual({ absent: true, old_signature: true });
    });
  },
);

test.skipIf(!enabled)("repair rejects duplicate equivalent LF and CRLF list anchors", async () => {
  await fixture("lf", async (tx) => {
    const anchor = sources.singleProjection.match(
      /old_branch text\s*:=\s*\$old\$([\s\S]*?)\$old\$/,
    )?.[1];
    if (!anchor) throw new Error("Missing canonical list fixture anchor");
    const duplicate = definition(bulkSource, "volunteer_bulk_command").replace(
      "if action='list' then",
      "/*\n" + anchor.replaceAll("\n", "\r\n") + "\n*/\n if action='list' then",
    );
    await tx.unsafe(duplicate).simple();
    expect(await sqlstate(tx, () => tx.unsafe(repairSql()).simple())).toBe("P0001");
  });
});

test.skipIf(!enabled)("repair accepts canonical migrations transported with CRLF", async () => {
  await fixture("lf", async (tx) => {
    const transported = prepareVolunteerDbRepair({
      registrationReason: sources.registrationReason.replaceAll("\n", "\r\n"),
      singleProjection: sources.singleProjection.replaceAll("\n", "\r\n"),
      pageProjection: sources.pageProjection.replaceAll("\n", "\r\n"),
    });
    await tx
      .unsafe(
        [
          transported.registrationReason,
          transported.singleProjection,
          transported.pageProjection,
        ].join("\n"),
      )
      .simple();
    expect(
      listingSchema.parse(await command(tx, await actor(tx), { action: "list", filter: {} })).total,
    ).toBe(0);
  });
});

test.skipIf(!enabled)("repair refuses an unreviewed registration-status body", async () => {
  await fixture("lf", async (tx) => {
    const drift = definition(policySource, "set_volunteer_registration_status_with_audit").replace(
      "v_activity.capacity",
      "v_activity.capacity+1",
    );
    await tx.unsafe(drift).simple();
    expect(await sqlstate(tx, () => tx.unsafe(repairSql()).simple())).toBe("55000");
  });
});

test.skipIf(!enabled)("repair refuses a broadened legacy status grant", async () => {
  await fixture("lf", async (tx) => {
    await tx.unsafe(
      "grant execute on function public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean) to authenticated",
    );
    expect(await sqlstate(tx, () => tx.unsafe(repairSql()).simple())).toBe("55000");
  });
});

test.skipIf(!enabled)(
  "repair refuses changed legacy defaults without overwriting them",
  async () => {
    await fixture("lf", async (tx) => {
      await tx
        .unsafe(
          definition(policySource, "set_volunteer_registration_status_with_audit").replace(
            "p_update_internal_notes boolean default true",
            "p_update_internal_notes boolean default false",
          ),
        )
        .simple();
      const [defaults] = await tx`
      select pg_get_expr(proargdefaults,0) value from pg_proc
      where oid='public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean)'::regprocedure`;
      expect(defaults.value).toBe("NULL::text, false");
      expect(await sqlstate(tx, () => tx.unsafe(repairSql()).simple())).toBe("55000");
    });
  },
);

test.skipIf(!enabled)(
  "repair refuses blind replay and preserves the applied signature",
  async () => {
    await fixture("lf", async (tx) => {
      await tx.unsafe(repairSql()).simple();
      const [before] = await tx`select md5(prosrc) body,proacl::text acl,proconfig settings
      from pg_proc where oid=to_regprocedure(
        'public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean,text)')`;
      expect(await sqlstate(tx, () => tx.unsafe(repairSql()).simple())).toBe("55000");
      const [after] = await tx`select md5(prosrc) body,proacl::text acl,proconfig settings
      from pg_proc where oid=to_regprocedure(
        'public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean,text)')`;
      expect(after).toEqual(before);
    });
  },
);

test.skipIf(!enabled)("repair refuses a weakened workspace definer configuration", async () => {
  await fixture("lf", async (tx) => {
    await tx.unsafe(
      "alter function public.volunteer_activity_workspace_rows(jsonb) security invoker",
    );
    expect(await sqlstate(tx, () => tx.unsafe(repairSql()).simple())).toBe("P0001");
  });
});

test.skipIf(!enabled)(
  "repair preserves later non-list branches and active-actor authorization",
  async () => {
    await fixture(
      "crlf",
      async (tx) => {
        await tx.unsafe(repairSql()).simple();
        const reader = await actor(tx, "treasurer");
        for (const role of ["admin", "staff"])
          expect(await command(tx, await actor(tx, role), { action: "compat_sentinel" })).toEqual({
            kind: "preserved",
            revision: 9,
          });
        expect(await sqlstate(tx, () => command(tx, reader, { action: "list", filter: {} }))).toBe(
          "42501",
        );
      },
      true,
    );
  },
);

test.skipIf(!enabled)(
  "repair preserves helper grants and denies direct browser RPC execution",
  async () => {
    await fixture("lf", async (tx) => {
      const [before] = await tx`
      select proowner owner,proacl::text acl,proconfig settings from pg_proc
      where oid='public.volunteer_bulk_command(uuid,jsonb)'::regprocedure`;
      await tx.unsafe(repairSql()).simple();
      const [after] = await tx`
      select proowner owner,proacl::text acl,proconfig settings from pg_proc
      where oid='public.volunteer_bulk_command(uuid,jsonb)'::regprocedure`;
      expect(after).toEqual(before);
      for (const role of ["anon", "authenticated", "service_role"]) {
        const [grants] = await tx`
        select has_function_privilege(${role},
          'public.volunteer_activity_workspace_candidates(jsonb)','execute') candidates,
          has_function_privilege(${role},
          'public.volunteer_activity_workspace_project(uuid[],jsonb)','execute') projection`;
        expect(grants).toEqual({ candidates: false, projection: false });
      }
      const [rpc] = await tx`
      select has_function_privilege('anon',
        'public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean,text)',
        'execute') anon,
      has_function_privilege('authenticated',
        'public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean,text)',
        'execute') authenticated,
      has_function_privilege('service_role',
        'public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean,text)',
        'execute') service`;
      expect(rpc).toEqual({ anon: false, authenticated: false, service: true });
    });
  },
);
