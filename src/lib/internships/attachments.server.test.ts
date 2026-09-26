import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { internshipAttachment, readBoundedInternshipFormData } from "./attachments.server";

describe("internship attachment request size", () => {
  test("rejects an oversized multipart request without Content-Length", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array(11 * 1024 * 1024)], "oversized.pdf", { type: "application/pdf" }),
    );
    const request = new Request("http://localhost/api/internships/attachment", {
      method: "POST",
      body: form,
    });
    expect(request.headers.get("content-length")).toBeNull();

    expect(await readBoundedInternshipFormData(request)).toBeNull();
  });

  test("still parses a bounded multipart request", async () => {
    const form = new FormData();
    form.set("application_id", "test-application");
    form.set("file", new File(["%PDF-small"], "proof.pdf", { type: "application/pdf" }));
    const request = new Request("http://localhost/api/internships/attachment", {
      method: "POST",
      body: form,
    });

    const parsed = await readBoundedInternshipFormData(request);
    expect(parsed?.get("application_id")).toBe("test-application");
    expect((parsed?.get("file") as File).name).toBe("proof.pdf");
  });
});

test("tracks an upload before Storage and retains it when the command conflicts", async () => {
  const actor = "11111111-1111-4111-8111-111111111111";
  const applicationId = "22222222-2222-4222-8222-222222222222";
  const key = "33333333-3333-4333-8333-333333333333";
  const path = actor + "/" + applicationId + "/" + key;
  const calls: string[] = [];
  function query(data: unknown) {
    const selected = {
      eq(_column: string, _value: unknown) {
        return this;
      },
      async maybeSingle() {
        return { data, error: null };
      },
    };
    return { select: () => selected };
  }
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: actor, email_confirmed_at: "2026-01-01T00:00:00Z" } },
        error: null,
      }),
    },
    from(table: string) {
      if (table === "internship_application")
        return query({ id: applicationId, applicant_id: actor, status: "submitted", revision: 1 });
      if (table === "internship_command_result") return query(null);
      if (table === "internship_attachment_upload_intent")
        return {
          ...query({ cleanup_claimed_at: null }),
          upsert: async (value: { storage_path: string; expires_at: string }) => {
            calls.push("intent");
            expect(value.storage_path).toBe(path);
            expect(value.expires_at).toBe("2026-09-27T12:00:00.000Z");
            return { error: null };
          },
        };
      throw new Error("Unexpected table: " + table);
    },
    storage: {
      from: () => ({
        upload: async () => {
          calls.push("upload");
          return { error: null };
        },
      }),
    },
    rpc: async () => {
      calls.push("command");
      return { data: { kind: "conflict", current_revision: 2 }, error: null };
    },
  } as unknown as SupabaseClient;
  const form = new FormData();
  form.set("application_id", applicationId);
  form.set("expected_revision", "1");
  form.set("idempotency_key", key);
  form.set("file", new File(["%PDF-test"], "proof.pdf", { type: "application/pdf" }));
  const request = new Request("https://unit-test.invalid/api/internships/attachment", {
    method: "POST",
    headers: { authorization: "Bearer existing-token" },
    body: form,
  });

  const response = await internshipAttachment(
    request,
    () => client,
    () => new Date("2026-09-26T12:00:00.000Z"),
  );

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ kind: "conflict", current_revision: 2 });
  expect(calls).toEqual(["intent", "upload", "command"]);
});
