import { SQL } from "bun";
import { expect, test } from "bun:test";

const databaseUrl = process.env.READONLY_EVIDENCE_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "52322" ||
    url.pathname !== "/audit_r01_readonly_privileges_20261001" ||
    url.username !== "postgres" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Read-only evidence tests require the dedicated disposable loopback database");
  }
}
const enabled =
  Boolean(databaseUrl) && process.env.READONLY_EVIDENCE_TEST_ALLOW_LOCAL_FIXTURES === "1";

for (const [table, column] of [
  ["crm_export_job", "filters"],
  ["sponsorship_payment_instruction_snapshot", "snapshot"],
] as const) {
  test.skipIf(!enabled)(
    `read-only evidence ${table} rejects residual service column UPDATE`,
    async () => {
      const db = new SQL(databaseUrl!, { max: 1, prepare: false });
      try {
        const outcome = await db
          .begin(async (tx) => {
            await tx.unsafe("set local statement_timeout='5s'");
            await tx.unsafe("set local role service_role");
            await tx.unsafe(`update public.${table} set ${column}=${column} where false`);
          })
          .then(() => null, postgresErrorCode);
        expect(outcome).toBe("42501");
      } finally {
        await db.close();
      }
    },
  );
}
const tables = [
  "recipient_notification_draft_duplicate_archive",
  "crm_export_job",
  "sponsorship_payment_instruction_snapshot",
] as const;
const mutations = ["INSERT", "UPDATE", "DELETE", "TRUNCATE"] as const;
const forbiddenPrivileges = [...mutations, "REFERENCES", "TRIGGER", "MAINTAIN"] as const;

function postgresErrorCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "errno" in error
    ? String(error.errno)
    : null;
}

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

for (const table of tables) {
  test.skipIf(!enabled)(
    `read-only evidence ${table} has only service SELECT privileges`,
    async () => {
      const db = new SQL(databaseUrl!, { max: 1, prepare: false });
      try {
        const rows = (await db.unsafe(
          "select c.relrowsecurity rls,has_table_privilege('service_role',c.oid,'SELECT') service_select from pg_class c where c.oid=$1::regclass",
          [`public.${table}`],
        )) as { rls: boolean; service_select: boolean }[];
        expect(rows).toEqual([{ rls: true, service_select: true }]);
        for (const role of ["anon", "authenticated", "service_role"] as const) {
          for (const privilege of forbiddenPrivileges) {
            const grant = (await db.unsafe(
              "select has_table_privilege($1,$2::regclass,$3) allowed",
              [role, `public.${table}`, privilege],
            )) as { allowed: boolean }[];
            expect(grant[0].allowed).toBe(false);
          }
          if (role !== "service_role") {
            const grant = (await db.unsafe(
              "select has_any_column_privilege($1,$2::regclass,'SELECT,INSERT,UPDATE,REFERENCES') allowed",
              [role, `public.${table}`],
            )) as { allowed: boolean }[];
            expect(grant[0].allowed).toBe(false);
          } else {
            const grant = (await db.unsafe(
              "select has_any_column_privilege($1,$2::regclass,'INSERT,UPDATE,REFERENCES') allowed",
              [role, `public.${table}`],
            )) as { allowed: boolean }[];
            expect(grant[0].allowed).toBe(false);
          }
        }
        const readable = await db.begin(async (tx) => {
          await tx.unsafe("set local statement_timeout='5s'");
          await tx.unsafe("set local role service_role");
          return tx.unsafe(`select count(*)::int n from public.${table}`);
        });
        expect(typeof readable[0].n).toBe("number");
      } finally {
        await db.close();
      }
    },
  );

  test.skipIf(!enabled)(
    `read-only evidence ${table} rejects anonymous and authenticated reads`,
    async () => {
      const db = new SQL(databaseUrl!, { max: 1, prepare: false });
      try {
        for (const role of ["anon", "authenticated"] as const) {
          const outcome = await db
            .begin(async (tx) => {
              await tx.unsafe("set local statement_timeout='5s'");
              await tx.unsafe(`set local role ${role}`);
              await tx.unsafe(`select count(*) from public.${table}`);
            })
            .then(() => null, postgresErrorCode);
          expect(outcome).toBe("42501");
        }
      } finally {
        await db.close();
      }
    },
  );

  for (const mutation of mutations) {
    test.skipIf(!enabled)(
      `read-only evidence ${table} rejects direct service ${mutation} without losing data`,
      async () => {
        const db = new SQL(databaseUrl!, { max: 1, prepare: false });
        try {
          const outcome = await db.begin(async (tx) => {
            await tx.unsafe("set local lock_timeout='2s'");
            await tx.unsafe("set local statement_timeout='5s'");
            const columns = (await tx.unsafe(
              "select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped and attgenerated='' and attidentity='' order by attnum",
              [`public.${table}`],
            )) as { attname: string }[];
            const names = columns.map((column) => identifier(column.attname));
            if (!names.length) throw new Error("Readonly fixture has no writable columns");
            const snapshotSql = `select count(*)::int n,coalesce(md5(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text)),'empty') hash from public.${table} t`;
            const before = await tx.unsafe(snapshotSql);
            const query = {
              INSERT: `insert into public.${table} (${names.join(",")}) select ${names.join(",")} from public.${table} where false`,
              UPDATE: `update public.${table} set ${names[0]}=${names[0]} where false`,
              DELETE: `delete from public.${table} where false`,
              TRUNCATE: `truncate public.${table}`,
            }[mutation];
            await tx.unsafe("set local role service_role");
            await tx.unsafe("savepoint denied_mutation");
            let code: string | null = null;
            try {
              await tx.unsafe(query);
            } catch (error: unknown) {
              code = postgresErrorCode(error);
            } finally {
              // Even the original vulnerable TRUNCATE must never persist its result.
              await tx.unsafe("rollback to savepoint denied_mutation");
              await tx.unsafe("reset role");
            }
            const after = await tx.unsafe(snapshotSql);
            return { code, before: Array.from(before), after: Array.from(after) };
          });
          expect(outcome.after).toEqual(outcome.before);
          expect(outcome.code).toBe("42501");
        } finally {
          await db.close();
        }
      },
    );
  }
}
