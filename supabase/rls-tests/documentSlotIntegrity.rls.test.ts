import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:55321";
const serviceKey =
  process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const anonKey =
  process.env.SUPABASE_LOCAL_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZGVtbyIsInJvbGUiOiJhbm9uIiwiZXhwIjoxOTgzODEyOTk2fQ.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const reachable = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: anonKey },
  signal: AbortSignal.timeout(5000),
})
  .then((response) => response.ok)
  .catch(() => false);

const service = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

describe.skipIf(!reachable)("published document slot integrity", () => {
  test("cannot unpublish a PDF asset while a live slot references it", async () => {
    const id = crypto.randomUUID();
    const slotKey = `audit_document_${id.replaceAll("-", "")}`;
    const { error: assetError } = await service.from("document_assets").insert({
      id,
      kind: "adoption_guide",
      title: "Slot integrity fixture",
      language: "en",
      object_path: `audit/${id}.pdf`,
      byte_size: 1,
      is_published: true,
    });
    expect(assetError).toBeNull();

    try {
      const { error: slotError } = await service.from("site_document_slots").insert({
        slot_key: slotKey,
        language: "en",
        document_asset_id: id,
        is_published: true,
      });
      expect(slotError).toBeNull();

      const { error } = await service
        .from("document_assets")
        .update({ is_published: false })
        .eq("id", id);
      expect(error).not.toBeNull();
      const { data } = await service
        .from("document_assets")
        .select("is_published")
        .eq("id", id)
        .single();
      expect(data?.is_published).toBe(true);
    } finally {
      await service.from("site_document_slots").delete().eq("slot_key", slotKey);
      await service.from("document_assets").delete().eq("id", id);
    }
  });

  test("cannot unpublish a PDF asset used by a published knowledge post", async () => {
    const id = crypto.randomUUID();
    const { error: assetError } = await service.from("document_assets").insert({
      id,
      kind: "adoption_guide",
      title: "Knowledge integrity fixture",
      language: "en",
      object_path: `audit/${id}.pdf`,
      byte_size: 1,
      is_published: true,
    });
    expect(assetError).toBeNull();

    try {
      const { error: postError } = await service.from("knowledge_posts").insert({
        title: "Published knowledge fixture",
        topic: "adoption",
        short_intro: "Knowledge publication invariant",
        document_asset_id: id,
        is_published: true,
      });
      expect(postError).toBeNull();

      const { error } = await service
        .from("document_assets")
        .update({ is_published: false })
        .eq("id", id);
      expect(error).not.toBeNull();
    } finally {
      await service.from("knowledge_posts").delete().eq("document_asset_id", id);
      await service.from("document_assets").delete().eq("id", id);
    }
  });

  test("cannot publish a knowledge post referencing a draft PDF asset", async () => {
    const id = crypto.randomUUID();
    const { error: assetError } = await service.from("document_assets").insert({
      id,
      kind: "adoption_guide",
      title: "Draft knowledge fixture",
      language: "en",
      object_path: `audit/${id}.pdf`,
      byte_size: 1,
      is_published: false,
    });
    expect(assetError).toBeNull();

    try {
      const { error } = await service.from("knowledge_posts").insert({
        title: "Draft knowledge fixture",
        topic: "adoption",
        short_intro: "Draft PDF cannot be published",
        document_asset_id: id,
        is_published: true,
      });
      expect(error).not.toBeNull();
    } finally {
      await service.from("knowledge_posts").delete().eq("document_asset_id", id);
      await service.from("document_assets").delete().eq("id", id);
    }
  });

  test("cannot publish a slot referencing a draft PDF asset", async () => {
    const id = crypto.randomUUID();
    const slotKey = `audit_document_${id.replaceAll("-", "")}`;
    const { error: assetError } = await service.from("document_assets").insert({
      id,
      kind: "adoption_guide",
      title: "Draft slot fixture",
      language: "en",
      object_path: `audit/${id}.pdf`,
      byte_size: 1,
      is_published: false,
    });
    expect(assetError).toBeNull();

    try {
      const { error } = await service.from("site_document_slots").insert({
        slot_key: slotKey,
        language: "en",
        document_asset_id: id,
        is_published: true,
      });
      expect(error).not.toBeNull();
    } finally {
      await service.from("site_document_slots").delete().eq("slot_key", slotKey);
      await service.from("document_assets").delete().eq("id", id);
    }
  });
});
