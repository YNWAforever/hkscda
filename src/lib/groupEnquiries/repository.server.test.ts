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
            eq: async (column: string, value: unknown) => ({
              data: null,
              error: null,
              column,
              value,
            }),
          };
        },
      };
    },
  };
  return { client, calls };
}

describe("Supabase group enquiry repository", () => {
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
});
