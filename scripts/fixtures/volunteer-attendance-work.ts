import { z } from "zod";
import { win32 } from "node:path";

const evidenceSchema = z.object({
  worktree: z.string(),
  runId: z.string().uuid(),
  project: z.string(),
  networkId: z.string().regex(/^[a-f0-9]{64}$/),
  apiOrigin: z.string().url(),
  database: z.object({ host: z.string(), port: z.number().int(), name: z.string() }),
  manifestPath: z.string(),
  containers: z.array(
    z.object({
      kind: z.enum(["db", "kong", "auth", "rest"]),
      id: z.string().regex(/^[a-f0-9]{64}$/),
      name: z.string(),
      project: z.string(),
      workdir: z.string(),
      networkId: z.string(),
      publishedPort: z.number().int().nullable(),
    }),
  ),
  upstreams: z.object({
    kongAuth: z.string(),
    kongRest: z.string(),
    authDatabase: z.string(),
    restDatabase: z.string(),
    authDatabaseName: z.string(),
    restDatabaseName: z.string(),
  }),
  ownership: z.object({
    mode: z.literal("new-run"),
    runId: z.string().uuid(),
    existingRecordIds: z.array(z.string().uuid()),
  }),
});
export type VolunteerAttendanceTargetEvidence = z.infer<typeof evidenceSchema>;
export type VerifiedVolunteerAttendanceTarget = Readonly<VolunteerAttendanceTargetEvidence>;
const verifiedTargets = new WeakSet<object>();
const ownerWorktree =
  "C:\\Users\\laich\\Documents\\HKCSDA\\HKCSDA\\hkscda\\.worktrees\\volunteer-admin-20261013";
const canonical = (value: string) => win32.resolve(value).toLowerCase();
function inside(parent: string, child: string) {
  const relative = win32.relative(canonical(parent), canonical(child));
  return relative !== "" && !relative.startsWith("..") && !win32.isAbsolute(relative);
}
function freezeEvidence(target: VolunteerAttendanceTargetEvidence) {
  Object.freeze(target.database);
  Object.freeze(target.upstreams);
  Object.freeze(target.ownership.existingRecordIds);
  Object.freeze(target.ownership);
  for (const container of target.containers) Object.freeze(container);
  Object.freeze(target.containers);
  return Object.freeze(target);
}

export function verifyVolunteerAttendanceTarget(
  evidence: unknown,
): VerifiedVolunteerAttendanceTarget {
  const target = evidenceSchema.parse(evidence);
  const refuse = () => {
    throw new Error("Verified owned volunteer attendance target required");
  };
  if (
    canonical(target.worktree) !== canonical(ownerWorktree) ||
    !/^hkscda-volunteer-(?:perf-20261015|daily-work-[a-f0-9-]{8,36})$/.test(target.project) ||
    !inside(
      win32.join(ownerWorktree, ".local-policy-test", "volunteer-daily-work-20261016"),
      target.manifestPath,
    ) ||
    target.ownership.runId !== target.runId ||
    target.ownership.existingRecordIds.length
  )
    refuse();
  const api = new URL(target.apiOrigin);
  if (
    api.origin !== target.apiOrigin ||
    api.protocol !== "http:" ||
    api.hostname !== "127.0.0.1" ||
    api.username ||
    api.password ||
    target.database.host !== "127.0.0.1" ||
    target.containers.length !== 4 ||
    new Set(target.containers.map((container) => container.kind)).size !== 4 ||
    new Set(target.containers.map((container) => container.id)).size !== 4
  )
    refuse();
  for (const container of target.containers) {
    if (
      container.project !== target.project ||
      container.networkId !== target.networkId ||
      !inside(ownerWorktree, container.workdir) ||
      container.name !== `supabase_${container.kind}_${target.project}` ||
      container.publishedPort !==
        (container.kind === "db"
          ? target.database.port
          : container.kind === "kong"
            ? Number(api.port)
            : null)
    )
      refuse();
  }
  const primary = target.project === "hkscda-volunteer-perf-20261015";
  if (
    (primary && (api.port !== "56321" || target.database.port !== 56322)) ||
    (!primary && (api.port !== "56561" || target.database.port !== 56562)) ||
    target.upstreams.kongAuth !== `http://supabase_auth_${target.project}:9999/` ||
    target.upstreams.kongRest !== `http://supabase_rest_${target.project}:3000/` ||
    target.upstreams.authDatabase !== `supabase_db_${target.project}` ||
    target.upstreams.restDatabase !== target.upstreams.authDatabase ||
    target.upstreams.authDatabaseName !== target.database.name ||
    target.upstreams.restDatabaseName !== target.database.name
  )
    refuse();
  const result = freezeEvidence(target);
  verifiedTargets.add(result);
  return result;
}

export type VolunteerAttendanceFixtureManifest = {
  fixtureId: string;
  prefix: string;
  state: "creating" | "ready" | "incomplete";
  apiOrigin: string;
  actorIds: string[];
  profileUserIds: string[];
  profileIds: string[];
  activityIds: string[];
  registrationIds: string[];
  operationIds: string[];
  pendingAuthEmails: string[];
  policyVersionId?: string;
  termsVersionId?: string;
  termsAcceptanceIds?: string[];
  cases: {
    rosterActivityId: string;
    futureActivityId: string;
    overdueActivityId: string;
    registrations: Array<{ id: string; activityId: string; status: string; attendance: string }>;
  };
};

/** Only new synthetic rows; no cleanup of another run and no provider/scheduler invocation. */
export async function createVolunteerAttendanceWorkFixture(
  target: VerifiedVolunteerAttendanceTarget,
  options: { runId: string; now: Date },
): Promise<VolunteerAttendanceFixtureManifest> {
  if (!verifiedTargets.has(target) || options.runId !== target.runId)
    throw new Error("Verified owned target instance required before client construction");
  if (!Number.isFinite(options.now.getTime())) throw new Error("Invalid fixture clock");
  const { readFile, writeFile, access } = await import("node:fs/promises");
  const { randomBytes, randomUUID } = await import("node:crypto");
  const { initialPolicyCatalogue } = await import("../../src/lib/volunteers/policy/catalogue");
  const resuming = await access(target.manifestPath).then(
    () => true,
    () => false,
  );
  const credentialPath = win32.join(
    target.worktree,
    ".local-policy-test",
    "volunteer-performance-20261015-credentials.json",
  );
  const credentials = z
    .object({ API_URL: z.string(), DB_URL: z.string(), SERVICE_ROLE_KEY: z.string() })
    .parse(JSON.parse(await readFile(credentialPath, "utf8")));
  const connection = new URL(credentials.DB_URL);
  if (
    credentials.API_URL !== target.apiOrigin ||
    connection.hostname !== target.database.host ||
    Number(connection.port) !== target.database.port ||
    connection.pathname.slice(1) !== target.database.name
  )
    throw new Error("Client credentials differ from verified target");
  const manifest: VolunteerAttendanceFixtureManifest = resuming
    ? JSON.parse(await readFile(target.manifestPath, "utf8"))
    : {
        fixtureId: target.runId,
        prefix: `AUDIT-DW-${target.runId}`,
        state: "creating",
        apiOrigin: target.apiOrigin,
        actorIds: [],
        profileUserIds: [],
        profileIds: [],
        activityIds: [],
        registrationIds: [],
        operationIds: [],
        pendingAuthEmails: [],
        cases: {
          rosterActivityId: "",
          futureActivityId: "",
          overdueActivityId: "",
          registrations: [],
        },
      };
  manifest.profileUserIds ??= [];
  if (
    manifest.fixtureId !== target.runId ||
    manifest.prefix !== `AUDIT-DW-${target.runId}` ||
    (resuming && manifest.state !== "incomplete")
  )
    throw new Error("Fixture identity/state differs; no setup writes allowed");
  const privateActors: Array<{ id: string; email: string; password: string; role: string }> =
    resuming
      ? JSON.parse(
          await readFile(
            win32.join(win32.dirname(target.manifestPath), "actors-private.json"),
            "utf8",
          ),
        )
      : [];
  const save = async () => {
    await writeFile(target.manifestPath, JSON.stringify(manifest, null, 2));
    await writeFile(
      win32.join(win32.dirname(target.manifestPath), "actors-private.json"),
      JSON.stringify(privateActors, null, 2),
      { mode: 0o600 },
    );
  };
  await save();
  // Imports and constructors are deliberately below the full target/ownership gate.
  const { createClient } = await import("@supabase/supabase-js");
  const { SQL } = await import("bun");
  const client = createClient(credentials.API_URL, credentials.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const db = new SQL(credentials.DB_URL, { max: 1, prepare: false });
  try {
    if (resuming) {
      const arrayLiteral = (ids: string[]) =>
        `{${z.array(z.string().uuid()).parse(ids).join(",")}}`;
      const persisted = (
        await db`select
        (select count(*)::int from public.volunteer_profile where id=any(${arrayLiteral(manifest.profileIds)}::uuid[])) profiles,
        (select count(*)::int from public.volunteer_activity where id=any(${arrayLiteral(manifest.activityIds)}::uuid[])) activities,
        (select count(*)::int from public.volunteer_registration where id=any(${arrayLiteral(manifest.registrationIds)}::uuid[])) registrations,
        (select count(*)::int from public.volunteer_policy_version where id=${manifest.policyVersionId ?? null}::uuid) policies,
        (select count(*)::int from public.volunteer_terms_version where id=${manifest.termsVersionId ?? null}::uuid) terms,
        (select count(*)::int from auth.users where id=any(${arrayLiteral([...manifest.actorIds, ...manifest.profileUserIds])}::uuid[])
          and raw_app_meta_data->>'volunteer_fixture_id'=${manifest.fixtureId}
          and raw_app_meta_data->>'volunteer_fixture_prefix'=${manifest.prefix}) owned_users`
      )[0];
      if (
        persisted.profiles ||
        persisted.activities ||
        persisted.registrations ||
        persisted.policies ||
        persisted.terms ||
        persisted.owned_users !== manifest.actorIds.length + manifest.profileUserIds.length ||
        manifest.pendingAuthEmails.some(
          (email) => !privateActors.some((actor) => actor.email === email),
        )
      )
        throw new Error("Cannot prove rollback and Auth ownership; reconcile without resending");
    }
    for (const [index, role] of ["admin", "staff", "staff", "treasurer", "disabled"].entries()) {
      if (manifest.actorIds[index]) continue;
      const email = `${manifest.prefix}-${index}@example.invalid`;
      manifest.pendingAuthEmails.push(email);
      await save();
      const password = randomBytes(24).toString("hex");
      const created = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: {
          volunteer_fixture_id: manifest.fixtureId,
          volunteer_fixture_prefix: manifest.prefix,
        },
      });
      if (created.error || !created.data.user)
        throw new Error("Auth setup uncertain; reconcile pendingAuthEmails without resending");
      const id = created.data.user.id;
      manifest.actorIds.push(id);
      privateActors.push({ id, email, password, role });
      await save();
      await db`insert into public.admin_user(auth_user_id,email,role,status)
        values(${id}::uuid,${email},${role === "disabled" ? "admin" : role},${role === "disabled" ? "disabled" : "active"})`;
    }
    for (let index = manifest.profileUserIds.length; index < 26; index++) {
      const email = `${manifest.prefix}-profile-${index}@example.invalid`;
      const password = randomBytes(24).toString("hex");
      manifest.pendingAuthEmails.push(email);
      await save();
      const created = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: {
          volunteer_fixture_id: manifest.fixtureId,
          volunteer_fixture_prefix: manifest.prefix,
        },
      });
      if (created.error || !created.data.user)
        throw new Error("Profile Auth setup uncertain; reconcile original email before retry");
      manifest.profileUserIds.push(created.data.user.id);
      privateActors.push({ id: created.data.user.id, email, password, role: "volunteer" });
      await save();
    }
    await db.begin(async (tx) => {
      manifest.cases.registrations = [];
      manifest.policyVersionId ??= randomUUID();
      manifest.termsVersionId ??= randomUUID();
      manifest.termsAcceptanceIds ??= Array.from({ length: 26 }, randomUUID);
      await save();
      const policy = structuredClone(initialPolicyCatalogue[0]);
      policy.template_key = `dw-${target.runId}`;
      policy.name = `${manifest.prefix} Synthetic only`;
      policy.source = "Synthetic local daily-work acceptance; not an operational rule approval";
      policy.capacity.volunteers = { state: "value", value: 100 };
      policy.terms.version_id = manifest.termsVersionId;
      await tx`insert into public.volunteer_terms_version(id,body,content_hash,published_at,published_by)
        values(${manifest.termsVersionId}::uuid,${manifest.prefix + " Synthetic test terms"},'synthetic-dw',now()-interval '1 day',${manifest.actorIds[0]}::uuid)`;
      await tx`insert into public.volunteer_policy_version(id,template_key,body,content_hash,effective_from,published_by,reason)
        values(${manifest.policyVersionId}::uuid,${policy.template_key},${JSON.stringify(policy)}::jsonb,'synthetic-dw',now()-interval '1 day',${manifest.actorIds[0]}::uuid,'Synthetic fixture only')`;
      for (let index = 0; index < 26; index++) {
        const id = manifest.profileIds[index] ?? randomUUID();
        if (!manifest.profileIds[index]) manifest.profileIds.push(id);
        await save();
        await tx`insert into public.volunteer_profile(id,auth_user_id,display_name,status,tier,birth_date,verified_by,verified_at)
          values(${id}::uuid,${manifest.profileUserIds[index]}::uuid,${`${manifest.prefix} ${index < 3 ? "Same name" : "Person " + index}`},'active','regular','1990-01-01',${manifest.actorIds[0]}::uuid,now())`;
        await tx`insert into public.volunteer_terms_acceptance(id,profile_id,version_id,source)
          values(${manifest.termsAcceptanceIds[index]}::uuid,${id}::uuid,${manifest.termsVersionId}::uuid,'synthetic_daily_work')`;
      }
      const offsets = [-2, 48, -24];
      for (const [index, hours] of offsets.entries()) {
        const id = manifest.activityIds[index] ?? randomUUID();
        if (!manifest.activityIds[index]) manifest.activityIds.push(id);
        await save();
        const start = new Date(options.now.getTime() + hours * 3600000).toISOString();
        const end = new Date(Date.parse(start) + 3600000).toISOString();
        await tx`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status,policy_version_id,template_key,shelter_key)
          values(${id}::uuid,'volunteer_shift',${`${manifest.prefix} Session ${index}`},${start}::timestamptz,${end}::timestamptz,${manifest.prefix + " Venue " + index},100,'published',${index === 1 ? manifest.policyVersionId : null}::uuid,${index === 1 ? policy.template_key : null},${index === 1 ? "cat" : null})`;
        for (let person = 0; person < 26; person++) {
          const registrationIndex = index * 26 + person;
          const registration = manifest.registrationIds[registrationIndex] ?? randomUUID();
          if (!manifest.registrationIds[registrationIndex])
            manifest.registrationIds.push(registration);
          await save();
          const status =
            index === 0
              ? person === 2
                ? "waitlisted"
                : person === 3
                  ? "cancelled"
                  : "approved"
              : "pending";
          const attendance = index === 0 && person === 1 ? "attended" : "not_marked";
          await tx`insert into public.volunteer_registration(id,activity_id,profile_id,registration_type,status,participant_count,contact_name,contact_email,contact_phone,status_token_hash,status_token_expires_at,booking_policy_version_id,terms_acceptance_id,duty_role)
            values(${registration}::uuid,${id}::uuid,${manifest.profileIds[person]}::uuid,${index !== 1 && person === 5 ? "group" : "individual"},${status},${index !== 1 && person === 5 ? 2 : 1},${`${manifest.prefix} ${person < 3 ? "Same name" : "Person " + person}`},${`${manifest.prefix}-${person}@example.invalid`},'00000000',${randomUUID()},${new Date(options.now.getTime() + 86400000).toISOString()}::timestamptz,${index === 1 ? manifest.policyVersionId : null}::uuid,${index === 1 ? manifest.termsAcceptanceIds[person] : null}::uuid,'volunteer')`;
          if (attendance === "attended") {
            const row = (
              await tx`select updated_at::text as version from public.volunteer_registration where id=${registration}::uuid`
            )[0];
            const changed = (
              await tx`select public.set_volunteer_attendance_with_audit(${registration}::uuid,${manifest.actorIds[0]}::uuid,${row.version}::timestamptz,'attended') as result`
            )[0].result;
            if (changed.kind !== "updated")
              throw new Error("Cannot seed owned historical attendance");
          }
          manifest.cases.registrations.push({
            id: registration,
            activityId: id,
            status,
            attendance,
          });
        }
      }
      [
        manifest.cases.rosterActivityId,
        manifest.cases.futureActivityId,
        manifest.cases.overdueActivityId,
      ] = manifest.activityIds;
    });
    manifest.state = "ready";
    await save();
    return manifest;
  } catch (error) {
    manifest.state = "incomplete";
    await save();
    throw new Error("Fixture incomplete; preserve manifest and reconcile original identities", {
      cause: error,
    });
  } finally {
    await db.close();
  }
}
