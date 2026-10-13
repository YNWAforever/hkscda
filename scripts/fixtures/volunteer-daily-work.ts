import { randomUUID, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SQL } from "bun";
const fixtureDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:56322/postgres";

const prefixSchema = z.string().regex(/^AUDIT-[A-Za-z0-9-]{8,64}$/);
const ids = z.array(z.string().uuid()).max(2000);
const manifestSchema = z
  .object({
    prefix: prefixSchema,
    fixtureId: z.string().uuid(),
    actorIds: ids,
    adminRowIds: ids.default([]),
    profileIds: ids,
    activityIds: ids,
    registrationIds: ids,
    userIds: ids,
    outboxIds: ids,
  })
  .strict();
export type VolunteerCleanupManifest = z.infer<typeof manifestSchema>;
export function assertVolunteerFixtureTarget(url: string, prefix: string): void {
  prefixSchema.parse(prefix);
  const target = new URL(url);
  if (
    target.origin !== "http://127.0.0.1:56321" ||
    target.username ||
    target.password ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  )
    throw new Error("Dedicated volunteer local stack required");
}
export function validateCleanupManifest(raw: unknown): VolunteerCleanupManifest {
  return manifestSchema.parse(raw);
}
function verifyClient(client: SupabaseClient, prefix: string) {
  const url: unknown = Reflect.get(client, "supabaseUrl");
  if (typeof url !== "string") throw new Error("Cannot verify fixture client destination");
  assertVolunteerFixtureTarget(url, prefix);
}

/** Synthetic fixture only. Notification rows are parked permanently; no sender is invoked. */
export async function createVolunteerDailyWorkFixture(
  client: SupabaseClient,
  { prefix, now }: { prefix: string; now: Date },
) {
  verifyClient(client, prefix);
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid fixture clock");
  const manifest: VolunteerCleanupManifest = {
    prefix,
    fixtureId: randomUUID(),
    actorIds: [],
    adminRowIds: [],
    profileIds: [],
    activityIds: [],
    registrationIds: [],
    userIds: [],
    outboxIds: [],
  };
  const tag = `${prefix}-${manifest.fixtureId}`;
  const privateActors: Array<{
    authUserId: string;
    email: string;
    password: string;
    role: string;
  }> = [];
  const db = new SQL(fixtureDatabaseUrl, { max: 1 });
  async function insert(table: string, row: Record<string, unknown>, list: string[]) {
    const id = randomUUID();
    // Save the identity before dispatch: an unknown POST outcome is never retried.
    list.push(id);
    if (
      ![
        "admin_user",
        "volunteer_profile",
        "volunteer_activity",
        "volunteer_registration",
        "volunteer_operation_outbox",
      ].includes(table)
    )
      throw new Error("Fixture table refused");
    const values = { ...row, id };
    const columns = Object.keys(values);
    if (columns.some((column) => !/^[a-z_]+$/.test(column)))
      throw new Error("Fixture columns refused");
    try {
      await db.unsafe(
        `insert into public.${table} (${columns.join(",")}) values (${columns.map((_, index) => "$" + (index + 1)).join(",")})`,
        Object.values(values).map((value) =>
          value && typeof value === "object" ? JSON.stringify(value) : value,
        ),
      );
    } catch (error) {
      throw new Error("Fixture insert failed", { cause: error });
    }
    return id;
  }
  try {
    for (let index = 0; index < 31; index++) {
      const password = randomBytes(32).toString("hex");
      const email = `${tag}-${index}@example.invalid`;
      const { data, error } = await client.auth.admin.createUser({
        email: `${tag}-${index}@example.invalid`,
        password,
        email_confirm: true,
        app_metadata: {
          volunteer_fixture_id: manifest.fixtureId,
          volunteer_fixture_prefix: prefix,
        },
      });
      if (error || !data.user)
        throw new Error("Fixture auth creation failed; reconcile uncertain identity before retry", {
          cause: error,
        });
      const id = data.user.id;
      manifest.userIds.push(id);
      if (index < 5) {
        const role = index === 0 || index === 4 ? "admin" : index === 3 ? "treasurer" : "staff";
        await insert(
          "admin_user",
          {
            auth_user_id: id,
            email: data.user.email,
            role,
            status: index === 4 ? "disabled" : "active",
          },
          manifest.adminRowIds,
        );
        manifest.actorIds.push(id);
        privateActors.push({
          authUserId: id,
          email,
          password,
          role: index === 4 ? "disabled" : role,
        });
      } else {
        await insert(
          "volunteer_profile",
          {
            auth_user_id: id,
            display_name: index < 8 ? `${tag} Same name` : `${tag} Profile ${index}`,
            status: "pending",
            tier: "newcomer",
          },
          manifest.profileIds,
        );
      }
    }
    for (const offset of [-1, 0, 1, 2]) {
      const starts = new Date(now.getTime() + offset * 86400000);
      const activityId = await insert(
        "volunteer_activity",
        {
          type: "volunteer_shift",
          title: `${tag} Day ${offset}`,
          location: tag,
          starts_at: starts.toISOString(),
          ends_at: new Date(starts.getTime() + 3600000).toISOString(),
          capacity: offset === 1 ? 1 : 10,
          status: "draft",
        },
        manifest.activityIds,
      );
      await insert(
        "volunteer_registration",
        {
          activity_id: activityId,
          registration_type: "individual",
          participant_count: 1,
          contact_name: tag,
          contact_email: `${tag}@example.invalid`,
          contact_phone: "00000000",
          status: offset === 2 ? "approved" : "pending",
          attendance_status: "not_marked",
          status_token_hash: randomBytes(32).toString("hex"),
          status_token_expires_at: new Date(now.getTime() + 86400000).toISOString(),
        },
        manifest.registrationIds,
      );
    }
    for (const status of ["failed", "provider_accepted", "delivered"])
      await insert(
        "volunteer_operation_outbox",
        {
          dedup_key: `${tag}-${status}`,
          kind: "volunteer_monthly_assessment_notification",
          status,
          payload: { fixture_id: manifest.fixtureId, profile_id: manifest.profileIds[0] },
          available_at: "9999-12-31T00:00:00Z",
        },
        manifest.outboxIds,
      );
    return {
      fixtureId: manifest.fixtureId,
      actorIds: manifest.actorIds,
      profileIds: manifest.profileIds,
      activityIds: manifest.activityIds,
      registrationIds: manifest.registrationIds,
      cleanupManifest: manifest,
      // Keep these only in ignored local fixture storage; never in a report or PR.
      privateActors,
    };
  } catch (error) {
    throw new Error("Fixture incomplete; retain cleanupManifest and reconcile before retry", {
      cause: { error, cleanupManifest: manifest },
    });
  } finally {
    await db.close();
  }
}

export async function cleanupVolunteerDailyWorkFixture(
  client: SupabaseClient,
  raw: unknown,
): Promise<void> {
  const m = validateCleanupManifest(raw);
  verifyClient(client, m.prefix);
  const tag = `${m.prefix}-${m.fixtureId}`;
  const db = new SQL(fixtureDatabaseUrl, { max: 1 });
  try {
    // Fixed tables, exact IDs and independent row ownership checks. Immutable audit facts are retained.
    for (const [table, ownedIds, column] of [
      ["volunteer_operation_outbox", m.outboxIds, "dedup_key"],
      ["volunteer_registration", m.registrationIds, "contact_name"],
      ["volunteer_activity", m.activityIds, "title"],
      ["volunteer_profile", m.profileIds, "display_name"],
      ["admin_user", m.adminRowIds, "email"],
    ] as const) {
      if (!ownedIds.length) continue;
      await db.unsafe(
        `delete from public.${table} where id = any($1::uuid[]) and ${column} like $2`,
        ["{" + ownedIds.join(",") + "}", `${tag}%`],
      );
    }
    for (const id of m.userIds) {
      const { data, error } = await client.auth.admin.getUserById(id);
      if (error) throw new Error("Cannot verify fixture auth ownership", { cause: error });
      if (
        data.user?.app_metadata.volunteer_fixture_id !== m.fixtureId ||
        data.user?.app_metadata.volunteer_fixture_prefix !== m.prefix
      )
        throw new Error("Fixture auth ownership mismatch");
      const removed = await client.auth.admin.deleteUser(id);
      if (removed.error) throw new Error("Fixture auth cleanup blocked", { cause: removed.error });
    }
  } finally {
    await db.close();
  }
}
