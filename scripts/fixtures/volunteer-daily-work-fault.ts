import { SQL } from "bun";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { verifyVolunteerAttendanceTarget } from "./volunteer-attendance-work";

// Local test faults are scoped to one owned actor/record and removed by exact name.
const [action, kind, token, actor, object] = process.argv.slice(2);
if (!["install", "remove"].includes(action) || !["audit", "receipt"].includes(kind))
  throw new Error("Invalid local fault command");
for (const value of [token, actor, object]) z.string().uuid().parse(value);
const target = verifyVolunteerAttendanceTarget(
  await Bun.file(".local-policy-test/volunteer-daily-work-20261016/target-proof.json").json(),
);
const fixture = await Bun.file(target.manifestPath).json();
if (fixture.fixtureId !== target.runId || !fixture.actorIds.includes(actor))
  throw new Error("Fault actor is not owned");
if (kind === "audit" && !fixture.registrationIds.includes(object))
  throw new Error("Fault registration is not owned");
const local = await Bun.file(
  ".local-policy-test/volunteer-performance-20261015-credentials.json",
).json();
const uri = new URL(local.DB_URL);
if (
  local.API_URL !== target.apiOrigin ||
  uri.hostname !== target.database.host ||
  Number(uri.port) !== target.database.port ||
  uri.pathname.slice(1) !== target.database.name
)
  throw new Error("Fault destination differs");
const containers = JSON.parse(
  execFileSync("docker", ["inspect", ...target.containers.map((c) => c.id)], { encoding: "utf8" }),
);
if (containers.some((c: { Id: string }) => !target.containers.some((t) => t.id === c.Id)))
  throw new Error("Fault container differs");
const name = "dw_fault_" + token.replaceAll("-", "");
const table = kind === "audit" ? "audit_log" : "volunteer_bulk_operation";
const db = new SQL(local.DB_URL, { max: 1 });
try {
  await db.begin(async (tx) => {
    const owned =
      kind === "audit"
        ? await tx`select id from public.volunteer_registration where id=${object}::uuid`
        : await tx`select id from public.volunteer_bulk_operation where id=${object}::uuid and actor_user_id=${actor}::uuid and action='roster_attendance'`;
    if (owned.length !== 1) throw new Error("Exact owned fault record not found");
    if (action === "install") {
      const predicate =
        kind === "audit"
          ? `new.entity_id='${object}' and new.actor_user_id='${actor}' and new.action='volunteer_registration.attendance_update'`
          : `new.id='${object}' and new.actor_user_id='${actor}' and jsonb_typeof(new.groups->0->'roster_results')='array'`;
      await tx.unsafe(
        `create function public.${name}() returns trigger language plpgsql set search_path=public,pg_temp as $$begin if ${predicate} then raise exception 'Synthetic owned daily-work ${kind} fault';end if;return new;end$$`,
      );
      await tx.unsafe(
        `revoke all on function public.${name}() from public,anon,authenticated,service_role`,
      );
      await tx.unsafe(
        `create trigger ${name} before ${kind === "audit" ? "insert" : "update"} on public.${table} for each row execute function public.${name}()`,
      );
    } else {
      await tx.unsafe(`drop trigger ${name} on public.${table}`);
      await tx.unsafe(`drop function public.${name}()`);
    }
  });
  console.log(JSON.stringify({ action, kind, token, actor, object, target: target.project }));
} finally {
  await db.close();
}
