import { describe, expect, test } from "bun:test";

import { createSupabaseGroupEnquiryRepository } from "./repository.server";
import type { GroupEnquiryInsert } from "./types";

const insert: GroupEnquiryInsert = {
  organisationName: "Happy School",
  contactPerson: "Ms Chan",
  email: "lead@example.com",
  phone: "+85291234567",
  activityType: "school_talk",
  otherActivityDescription: null,
  participantCount: 30,
  participantAgeProfile: "P4-P6",
  preferredDateNotes: "Friday afternoons",
  message: "Please call before email.",
  idempotencyKey: "11111111-2222-4333-8444-555555555555",
};

const row = {
  id: "enquiry-1",
  organisation: "Happy School",
  contact_name: "Ms Chan",
  contact_email: "lead@example.com",
  contact_phone: "+85291234567",
  activity_type: "school_talk",
  other_activity_description: null,
  participant_count: 30,
  participant_age_profile: "P4-P6",
  preferred_date_notes: "Friday afternoons",
  message: "Please call before email.",
  status: "new",
  notification_status: "pending",
  notification_error: null,
  assigned_to: null,
  admin_notes: null,
  idempotency_key: insert.idempotencyKey,
  created_at: "2026-07-22T00:00:00.000Z",
  updated_at: "2026-07-22T00:00:00.000Z",
};

function createClient(options: { insertError?: unknown; selectRow?: unknown } = {}) {
  const calls: Array<{ name: string; payload?: unknown }> = [];
  const client = {
    from(table: string) {
      return {
        insert(payload: unknown) {
          calls.push({ name: "insert", payload: { table, payload } });
          return {
            select: () => ({
              single: async () => ({
                data: options.insertError ? null : row,
                error: options.insertError ?? null,
              }),
            }),
          };
        },
        select() {
          return {
            eq(column: string, value: unknown) {
              calls.push({ name: "select.eq", payload: { table, column, value } });
              return { maybeSingle: async () => ({ data: options.selectRow ?? row, error: null }) };
            },
          };
        },
        update(payload: unknown) {
          calls.push({ name: "update", payload: { table, payload } });
          return {
            eq: (column: string, value: unknown) => ({
              data: null,
              error: null,
              column,
              value,
              neq: async () => ({ data: null, error: null }),
            }),
          };
        },
      };
    },
  };
  return { client, calls };
}

describe("Supabase group enquiry repository", () => {
  test("admin enquiry pages have a stable id tie-breaker", async () => {
    const orders: string[] = [];
    const query = {
      select: () => query,
      order(column: string) {
        orders.push(column);
        return query;
      },
      range: async () => ({ data: [], error: null, count: 0 }),
    };
    const repo = createSupabaseGroupEnquiryRepository({ from: () => query } as never);

    await repo.list({ page: 1, pageSize: 25 });

    expect(orders).toEqual(["created_at", "id"]);
  });

  test("admin search quotes punctuation inside PostgREST LIKE operands", async () => {
    let filter = "";
    const query = {
      select: () => query,
      order: () => query,
      range: () => query,
      or(value: string) {
        filter = value;
        return query;
      },
      then(resolve: (value: { data: never[]; error: null; count: number }) => unknown) {
        return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
      },
    };
    const repo = createSupabaseGroupEnquiryRepository({ from: () => query } as never);

    await repo.list({ q: "School,(P4)", page: 1, pageSize: 25 });

    expect(filter).toBe(
      'organisation.ilike."%School,(P4)%",contact_name.ilike."%School,(P4)%",contact_email.ilike."%School,(P4)%"',
    );
  });

  test("inserts snake_case payloads and maps rows back to domain shape", async () => {
    const { client, calls } = createClient();
    const repo = createSupabaseGroupEnquiryRepository(client as never);

    await expect(repo.createOrGet(insert)).resolves.toMatchObject({
      created: true,
      enquiry: { id: "enquiry-1", organisationName: "Happy School", notificationStatus: "pending" },
    });
    expect(calls[0]).toMatchObject({
      name: "insert",
      payload: {
        table: "group_enquiries",
        payload: { organisation: "Happy School", idempotency_key: insert.idempotencyKey },
      },
    });
  });

  test("loads the existing row when the idempotency key already exists", async () => {
    const { client, calls } = createClient({
      insertError: { code: "23505", message: "duplicate key" },
    });
    const repo = createSupabaseGroupEnquiryRepository(client as never);

    await expect(repo.createOrGet(insert)).resolves.toMatchObject({
      created: false,
      enquiry: { id: "enquiry-1" },
    });
    expect(calls.map((call) => call.name)).toEqual(["insert", "select.eq"]);
  });

  test("rejects a changed payload that reuses an existing idempotency key", async () => {
    const { client } = createClient({
      insertError: { code: "23505", message: "duplicate key" },
    });
    const repo = createSupabaseGroupEnquiryRepository(client as never);

    await expect(repo.createOrGet({ ...insert, message: "Please email instead." })).rejects.toThrow(
      "Idempotency key reused with different enquiry",
    );
  });

  test("a late failed attempt cannot overwrite a sent notification", async () => {
    let status = "sent";
    const client = {
      from: () => ({
        update(payload: { notification_status: string }) {
          return {
            eq: () => ({
              neq: (_column: string, value: string) => {
                if (status !== value) status = payload.notification_status;
                return Promise.resolve({ error: null });
              },
              then: (resolve: (result: { error: null }) => unknown) => {
                status = payload.notification_status;
                return Promise.resolve({ error: null }).then(resolve);
              },
            }),
          };
        },
      }),
    };
    const repo = createSupabaseGroupEnquiryRepository(client as never);

    await repo.markNotificationFailed("enquiry-1", "late provider failure");

    expect(status).toBe("sent");
  });

  test("marks notification transitions without exposing raw errors", async () => {
    const { client, calls } = createClient();
    const repo = createSupabaseGroupEnquiryRepository(client as never);

    await repo.markNotificationSent("enquiry-1");
    await repo.markNotificationFailed("enquiry-1", "safe failure");

    expect(calls.map((call) => call.payload)).toContainEqual({
      table: "group_enquiries",
      payload: { notification_status: "sent", notification_error: null },
    });
    expect(calls.map((call) => call.payload)).toContainEqual({
      table: "group_enquiries",
      payload: { notification_status: "failed", notification_error: "safe failure" },
    });
  });

  test("admin update and audit use one version-checked RPC", async () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    const repo = createSupabaseGroupEnquiryRepository({
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args });
        return { data: { kind: "updated", enquiry: row }, error: null };
      },
    } as never);

    await expect(
      repo.updateWithAudit({
        id: row.id,
        input: { status: "resolved", adminNotes: "handled" },
        actorUserId: "99999999-9999-4999-8999-999999999999",
        expectedUpdatedAt: row.updated_at,
      }),
    ).resolves.toMatchObject({ id: row.id, status: "new" });
    expect(calls).toEqual([
      {
        name: "update_group_enquiry_with_audit",
        args: {
          p_enquiry_id: row.id,
          p_actor_user_id: "99999999-9999-4999-8999-999999999999",
          p_expected_updated_at: row.updated_at,
          p_patch: { status: "resolved", adminNotes: "handled" },
        },
      },
    ]);
  });

  test("stale admin update returns a conflict without another write", async () => {
    const calls: string[] = [];
    const repo = createSupabaseGroupEnquiryRepository({
      rpc: async (name: string) => {
        calls.push(name);
        return { data: { kind: "conflict" }, error: null };
      },
    } as never);

    await expect(
      repo.updateWithAudit({
        id: row.id,
        input: { status: "closed" },
        actorUserId: "99999999-9999-4999-8999-999999999999",
        expectedUpdatedAt: row.updated_at,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(calls).toEqual(["update_group_enquiry_with_audit"]);
  });
});
