/** Test-only SQL-backed Supabase boundary. Auth/Storage never call a provider. */
import type { SQL } from "bun";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export async function inSavepoint<T>(tx: SQL, body: (tx: SQL) => Promise<T>): Promise<T> {
  const name = "r01_sp_" + randomUUID().replaceAll("-", "");
  await tx.unsafe(`savepoint ${name}`);
  try {
    const result = await body(tx);
    await tx.unsafe(`release savepoint ${name}`);
    return result;
  } catch (error) {
    await tx.unsafe(`rollback to savepoint ${name}`);
    await tx.unsafe(`release savepoint ${name}`);
    throw error;
  }
}

export async function seedInternship(tx: SQL) {
  const actor = randomUUID(),
    other = randomUUID(),
    application = randomUUID(),
    intake = randomUUID();
  for (const id of [actor, other])
    await tx`insert into auth.users(id,email,email_confirmed_at) values(${id}::uuid,${id + "@example.invalid"},now())`;
  await tx`insert into public.internship_intake_version(id,body,reason) values(${intake}::uuid,'{"enabled":true}'::jsonb,'Synthetic Task4 intake')`;
  await tx`insert into public.internship_intake_draft(id,body) values(true,'{}') on conflict(id) do nothing`;
  await tx`insert into public.internship_application(id,applicant_id,intake_version_id,contact_snapshot,student_snapshot,shelter) values(${application}::uuid,${actor}::uuid,${intake}::uuid,'{"name":"Synthetic preserved contact"}','{"veterinary_student":true}','cat')`;
  await tx`insert into storage.buckets(id,name,public) values('internship-private','internship-private',false) on conflict(id) do nothing`;
  return { actor, other, application, intake };
}
export async function seedIntent(
  tx: SQL,
  actor: string,
  application: string,
  suffix: string = randomUUID(),
) {
  const path = `${actor}/${application}/${suffix}`;
  await tx`insert into public.internship_attachment_upload_intent(storage_path,application_id,actor,created_at,expires_at) values(${path},${application}::uuid,${actor}::uuid,clock_timestamp()-interval '3 days',clock_timestamp()-interval '2 days')`;
  return path;
}
export function attachCommand(application: string, path: string, key = randomUUID()) {
  return {
    action: "attach",
    application_id: application,
    expected_revision: 1,
    idempotency_key: key,
    object_path: path,
    content_hash: "a".repeat(64),
    label: "synthetic.pdf",
    mime_type: "application/pdf",
    byte_size: 10,
  };
}
export async function command(tx: SQL, actor: string, body: object) {
  return inSavepoint(tx, async (s) => {
    await s`set local role service_role`;
    const [row] =
      await s`select public.internship_command(${actor}::uuid,${JSON.stringify(body)}::jsonb) result`;
    await s`set local role postgres`;
    return row.result;
  });
}

type Row = Record<string, unknown>;
const tables = new Set([
  "internship_application",
  "internship_attachment",
  "internship_command_result",
  "internship_attachment_upload_intent",
  "admin_user",
]);
const columns = new Set([
  "id",
  "applicant_id",
  "status",
  "revision",
  "object_path",
  "storage_path",
  "application_id",
  "actor",
  "key",
  "cleanup_claimed_at",
  "attached_at",
  "cleaned_at",
  "auth_user_id",
  "role",
  "email",
]);
export type Faults = {
  reference?: Set<string>;
  preserve?: Set<string>;
  finish?: Set<string>;
  release?: Set<string>;
  remove?: Set<string>;
  beforeCommand?: () => Promise<void>;
};
export function sqlInternshipClient(tx: SQL, actor: string, faults: Faults = {}) {
  const objects = new Map<string, Uint8Array>();
  let intentBeforeUpload = false;
  let uploadCount = 0,
    removalCount = 0,
    signedSeconds = 0;
  const failures = new Error("inert dependency failure");
  const execute = async (sql: string, values: unknown[] = [], role = "service_role") => {
    try {
      const data = await inSavepoint(tx, async (s) => {
        await s.unsafe(`set local role ${role}`);
        const selecting = /^select\b/i.test(sql);
        // Match PostgREST JSON, preserving bigint numbers and timestamp microseconds.
        const rows = await s.unsafe(
          selecting ? `select to_jsonb(q) row from (${sql}) q` : sql,
          values,
        );
        await s`set local role postgres`;
        return selecting ? rows.map((r: { row: Row }) => r.row) : (rows as Row[]);
      });
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };
  const client = {
    auth: {
      async getUser(token: string) {
        if (token !== "synthetic") throw new Error("Only inert Auth token allowed");
        const [user] =
          await tx`select id,email,email_confirmed_at,banned_until from auth.users where id=${actor}::uuid`;
        return { data: { user }, error: null };
      },
    },
    from(table: string) {
      if (!tables.has(table)) throw new Error("Out-of-scope SQL adapter table");
      let projection = "*",
        update: Row | undefined;
      const conditions: [string, unknown][] = [];
      const query = {
        select(value: string) {
          if (value === "object_path,application:internship_application(applicant_id)")
            projection =
              "object_path,(select jsonb_build_object('applicant_id',a.applicant_id) from public.internship_application a where a.id=internship_attachment.application_id) application";
          else {
            if (!value.split(",").every((c) => columns.has(c)))
              throw new Error("Unknown SQL projection");
            projection = value;
          }
          return query;
        },
        eq(column: string, value: unknown) {
          if (!columns.has(column)) throw new Error("Unknown SQL predicate");
          conditions.push([column, value]);
          return query;
        },
        is(column: string, value: unknown) {
          if (value !== null || !columns.has(column))
            throw new Error("Only declared null predicate");
          conditions.push([column, null]);
          return query;
        },
        update(value: Row) {
          if (
            !Object.keys(value).every((c) =>
              ["attached_at", "cleanup_claimed_at", "cleaned_at"].includes(c),
            )
          )
            throw new Error("Unknown SQL update");
          update = value;
          return query;
        },
        async upsert(
          value: {
            storage_path: string;
            application_id: string;
            actor: string;
            expires_at: string;
          },
          options: { onConflict: string; ignoreDuplicates: boolean },
        ) {
          if (
            table !== "internship_attachment_upload_intent" ||
            options.onConflict !== "storage_path" ||
            !options.ignoreDuplicates
          )
            throw new Error("Only exact intent upsert contract");
          return execute(
            "insert into public.internship_attachment_upload_intent(storage_path,application_id,actor,expires_at) values($1,$2::uuid,$3::uuid,$4::timestamptz) on conflict(storage_path) do nothing",
            [value.storage_path, value.application_id, value.actor, value.expires_at],
          );
        },
        async result() {
          const path = conditions.find(([c]) => c === "storage_path" || c === "object_path")?.[1];
          if (typeof path === "string") {
            if (!update && table === "internship_attachment" && faults.reference?.has(path))
              return { data: null, error: failures };
            if (
              update &&
              ((update.attached_at && faults.preserve?.has(path)) ||
                (update.cleaned_at && faults.finish?.has(path)) ||
                (!update.attached_at && !update.cleaned_at && faults.release?.has(path)))
            )
              return { data: null, error: failures };
          }
          const values: unknown[] = [];
          const assignments = Object.entries(update ?? {}).map(([c, v]) => {
            values.push(v);
            return `${c}=$${values.length}`;
          });
          const where = conditions
            .map(([c, v]) => {
              if (v === null) return `${c} is null`;
              values.push(v);
              return `${c}=$${values.length}`;
            })
            .join(" and ");
          return execute(
            update
              ? `update public.${table} set ${assignments.join(",")} where ${where}`
              : `select ${projection} from public.${table} where ${where}`,
            values,
          );
        },
        async maybeSingle() {
          const response = await query.result();
          return { ...response, data: response.data?.[0] ?? null };
        },
        then(
          onfulfilled: (value: Awaited<ReturnType<typeof execute>>) => unknown,
          onrejected: (reason: unknown) => unknown,
        ) {
          return query.result().then(onfulfilled, onrejected);
        },
      };
      return query;
    },
    async rpc(name: string, args: Row) {
      if (name === "claim_expired_internship_attachment_uploads")
        return execute(
          "select * from public.claim_expired_internship_attachment_uploads($1::timestamptz,$2::integer)",
          [args.p_cutoff, args.p_limit],
        );
      if (name === "internship_command") {
        await faults.beforeCommand?.();
        const response = await execute(
          "select public.internship_command($1::uuid,$2::jsonb) result",
          [args.p_actor, JSON.stringify(args.p_command)],
        );
        return { ...response, data: response.data?.[0]?.result ?? null };
      }
      throw new Error("Out-of-scope RPC");
    },
    storage: {
      from(bucket: string) {
        if (bucket !== "internship-private") throw new Error("Only inert private bucket");
        return {
          async upload(path: string, bytes: Uint8Array) {
            const [intent] =
              await tx`select storage_path from public.internship_attachment_upload_intent where storage_path=${path}`;
            intentBeforeUpload = Boolean(intent);
            uploadCount++;
            if (objects.has(path)) return { error: { statusCode: "409" } };
            const response = await execute(
              "insert into storage.objects(bucket_id,name) values('internship-private',$1)",
              [path],
              "postgres",
            );
            if (!response.error) objects.set(path, bytes);
            return { error: response.error };
          },
          async download(path: string) {
            const bytes = objects.get(path);
            if (!bytes) throw new Error("Synthetic bytes absent");
            return { data: new Blob([new Uint8Array(bytes)]), error: null };
          },
          async remove(paths: string[]) {
            removalCount++;
            for (const path of paths) {
              objects.delete(path);
              if (faults.remove?.has(path)) return { error: failures };
            }
            return { error: null };
          },
          async createSignedUrl(path: string, seconds: number) {
            signedSeconds = seconds;
            return {
              data: { signedUrl: `https://synthetic.invalid/${encodeURIComponent(path)}` },
              error: null,
            };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
  return {
    client,
    objects,
    stats: () => ({ uploadCount, removalCount, signedSeconds, intentBeforeUpload }),
  };
}
