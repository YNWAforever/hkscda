import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseContentRepository } from "./repository.server";

function createFakeClient(
  createSignedUploadUrl: (path: string) => Promise<{
    data: { token: string; path: string } | null;
    error: { message: string } | null;
  }>,
) {
  const storageCalls: string[] = [];
  const client = {
    storage: {
      from(bucket: string) {
        return {
          createSignedUploadUrl(path: string) {
            storageCalls.push(`${bucket}:${path}`);
            return createSignedUploadUrl(path);
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  return { client, storageCalls };
}

describe("createSupabaseContentRepository createSignedUploadUrl", () => {
  test("resolves to the token and path Supabase's Storage API returns, against the content-media bucket", async () => {
    const fake = createFakeClient(async (path) => ({
      data: { token: "signed-token", path },
      error: null,
    }));
    const repository = createSupabaseContentRepository(fake.client);

    await expect(repository.createSignedUploadUrl("stories/siu-bak/checkup.jpg")).resolves.toEqual({
      token: "signed-token",
      path: "stories/siu-bak/checkup.jpg",
    });
    expect(fake.storageCalls).toEqual(["content-media:stories/siu-bak/checkup.jpg"]);
  });

  test("throws when Supabase Storage returns an error", async () => {
    const fake = createFakeClient(async () => ({
      data: null,
      error: { message: "bucket not found" },
    }));
    const repository = createSupabaseContentRepository(fake.client);

    await expect(repository.createSignedUploadUrl("stories/broken.jpg")).rejects.toEqual({
      message: "bucket not found",
    });
  });

  test("throws a descriptive error when Storage responds without a token or path", async () => {
    const fake = createFakeClient(async () => ({
      data: null,
      error: null,
    }));
    const repository = createSupabaseContentRepository(fake.client);

    await expect(repository.createSignedUploadUrl("stories/incomplete.jpg")).rejects.toThrow(
      "Storage did not return an upload target",
    );
  });
});

test("one or fifty private admin covers use one projection and one signing batch", async () => {
  for (const size of [1, 50]) {
    let rpcCalls = 0;
    let signingCalls = 0;
    const rows = Array.from({ length: size }, (_, index) => ({
      content: {
        id: `content-${index}`,
        title: "Synthetic",
        slug: `slug-${index}`,
        type: "event",
        summary: "Summary",
        status: "draft",
        cover_media_id: `media-${index}`,
        created_at: "2026-09-01",
        updated_at: "2026-09-01",
      },
      profile: null,
      updates: [],
      media: [
        {
          id: `media-${index}`,
          content_item_id: `content-${index}`,
          story_update_id: null,
          storage_bucket: "content-media-private",
          storage_path: `private/${index}.png`,
          alt_text: "Synthetic",
          is_cover: true,
        },
      ],
    }));
    const client = {
      rpc: async () => {
        rpcCalls++;
        return { data: { total: size, rows }, error: null };
      },
      storage: {
        from: () => ({
          createSignedUrls: async (paths: string[]) => {
            signingCalls++;
            return {
              data: paths.map((path) => ({ path, signedUrl: `https://example.test/${path}` })),
              error: null,
            };
          },
        }),
      },
    } as unknown as SupabaseClient;
    const result = await createSupabaseContentRepository(client).listAdminContent({
      page: 1,
      pageSize: size,
    });
    expect(result.items).toHaveLength(size);
    expect(rpcCalls).toBe(1);
    expect(signingCalls).toBe(1);
    expect(result.items[0].coverImageUrl).toContain("https://example.test/");
  }
});

test("detail pages stay bounded while cover and latest summary remain independent", async () => {
  const content = {
    id: "content",
    title: "Synthetic",
    slug: "synthetic",
    type: "event",
    summary: "Summary",
    status: "draft",
    cover_media_id: "cover",
  };
  const media = (id: string) => ({
    id,
    content_item_id: "content",
    story_update_id: null,
    storage_bucket: "content-media",
    storage_path: `${id}.jpg`,
    alt_text: id,
    is_cover: id === "cover",
  });
  const updates = Array.from({ length: 21 }, (_, index) => ({
    id: `update-${index}`,
    content_item_id: "content",
    title: "History",
    occurred_at: "2026-01-01",
    visibility: "public",
    kind: "general",
    body: "Should not be returned",
  }));
  const snapshot = {
    content,
    profile: null,
    cover: media("cover"),
    latest: { ...updates[0], id: "latest" },
    links: [],
    media: Array.from({ length: 21 }, (_, index) => media(`history-${index}`)),
    updates,
    socialCopies: [],
    notificationDrafts: [],
  };
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: content, error: null }),
  };
  const client = {
    from: () => query,
    rpc: async () => ({ data: snapshot, error: null }),
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.test/${path}` } }),
      }),
    },
  } as unknown as SupabaseClient;
  const detail = await createSupabaseContentRepository(client).getAdminContent("content", 2);
  expect(detail?.media).toHaveLength(20);
  expect(detail?.updates).toHaveLength(20);
  expect(detail?.history).toEqual({ page: 2, hasMore: true });
  expect(detail?.updates[0].body).toBeNull();
  expect(detail?.coverImageUrl).toBe("https://example.test/cover.jpg");
  expect(detail?.latestPublicUpdate?.id).toBe("latest");
});

test("detail page and its separate private cover share one signing batch", async () => {
  const content = {
    id: "content",
    title: "Synthetic",
    slug: "synthetic",
    type: "event",
    summary: "Summary",
    status: "draft",
    cover_media_id: "cover",
  };
  const media = (id: string) => ({
    id,
    content_item_id: "content",
    story_update_id: null,
    storage_bucket: "content-media-private",
    storage_path: `${id}.jpg`,
    alt_text: id,
    is_cover: id === "cover",
  });
  const snapshot = {
    content,
    profile: null,
    cover: media("cover"),
    latest: null,
    links: [],
    media: Array.from({ length: 21 }, (_, index) => media(`history-${index}`)),
    updates: [],
    socialCopies: [],
    notificationDrafts: [],
  };
  let batches = 0;
  let paths: string[] = [];
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: content, error: null }),
  };
  const client = {
    from: () => query,
    rpc: async () => ({ data: snapshot, error: null }),
    storage: {
      from: () => ({
        createSignedUrls: async (input: string[]) => {
          batches++;
          paths = input;
          return {
            data: input.map((path) => ({ path, signedUrl: `https://example.test/${path}` })),
            error: null,
          };
        },
      }),
    },
  } as unknown as SupabaseClient;
  const detail = await createSupabaseContentRepository(client).getAdminContent("content", 2);
  expect(batches).toBe(1);
  expect(paths).toHaveLength(21);
  expect(paths).not.toContain("history-20.jpg");
  expect(detail?.media).toHaveLength(20);
  expect(detail?.coverImageUrl).toBe("https://example.test/cover.jpg");
});

test("resolveAdopterRecipients resolves a linked adoption case through its supporter", async () => {
  const tables: Record<string, unknown[]> = {
    content_link: [
      {
        id: "link-1",
        content_item_id: "content-1",
        linked_type: "adoption_case",
        linked_id: "case-1",
        relationship: "adopter",
        created_at: "2026-09-01",
        updated_at: "2026-09-01",
      },
    ],
    adoption_case: [
      {
        id: "case-1",
        supporter_id: "supporter-1",
        applicant_name: "申請人",
        applicant_email: "applicant@example.test",
        applicant_phone: null,
      },
    ],
    supporter: [
      {
        id: "supporter-1",
        name: "陳太",
        email: "adopter@example.test",
        phone: null,
      },
    ],
  };
  const client = {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => query,
        range: () =>
          Promise.resolve({
            data: tables[table] ?? [],
            count: (tables[table] ?? []).length,
            error: null,
          }),
      };
      return query;
    },
  } as unknown as SupabaseClient;

  const recipients =
    await createSupabaseContentRepository(client).resolveAdopterRecipients("content-1");

  expect(recipients).toHaveLength(1);
  expect(recipients[0]).toMatchObject({
    adoptionCaseId: "case-1",
    supporterId: "supporter-1",
    name: "陳太",
    email: "adopter@example.test",
  });
});

test("resolveAdopterRecipients includes linked adopters beyond capped responses", async () => {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    content_link: [
      ...[1, 2, 3].map((n) => ({
        id: "link-" + n,
        content_item_id: "content-1",
        linked_type: "adoption_case",
        linked_id: "case-" + n,
      })),
      {
        id: "link-4",
        content_item_id: "content-1",
        linked_type: "successful_adoption",
        linked_id: "success-4",
      },
    ],
    successful_adoption: [
      { id: "success-4", adoption_case_id: "case-4", supporter_id: "supporter-4" },
    ],
    adoption_case: [1, 2, 3, 4].map((n) => ({
      id: "case-" + n,
      supporter_id: "supporter-" + n,
      applicant_name: "Adopter " + n,
      applicant_email: null,
      applicant_phone: null,
    })),
    supporter: [1, 2, 3, 4].map((n) => ({
      id: "supporter-" + n,
      name: "Adopter " + n,
      email: "adopter" + n + "@example.test",
      phone: null,
    })),
  };
  const client = {
    from(table: string) {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      let from = 0;
      let to = Number.POSITIVE_INFINITY;
      const result = () => {
        const rows = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
        return {
          data: rows.slice(from, Math.min(to + 1, from + 2)),
          count: rows.length,
          error: null,
        };
      };
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return query;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]));
          return query;
        },
        order: () => query,
        range: (start: number, end: number) => {
          from = start;
          to = end;
          return Promise.resolve(result());
        },
        then: (resolve: (value: ReturnType<typeof result>) => void) => resolve(result()),
      };
      return query;
    },
  } as unknown as SupabaseClient;

  const recipients =
    await createSupabaseContentRepository(client).resolveAdopterRecipients("content-1");
  expect(recipients.map((recipient) => recipient.email)).toEqual([
    "adopter1@example.test",
    "adopter2@example.test",
    "adopter3@example.test",
    "adopter4@example.test",
  ]);
});

test("listAdminContent forwards the published, map, update and draft filters to the RPC", async () => {
  let receivedFilters: Record<string, unknown> | null = null;
  const client = {
    rpc: async (_fn: string, args: { p_filters: Record<string, unknown> }) => {
      receivedFilters = args.p_filters;
      return { data: { total: 0, rows: [] }, error: null };
    },
    storage: {
      from: () => ({
        createSignedUrls: async () => ({ data: [], error: null }),
      }),
    },
  } as unknown as SupabaseClient;

  await createSupabaseContentRepository(client).listAdminContent({
    publishedFrom: "2026-01-01",
    publishedTo: "2026-12-31",
    mapVisibility: "on",
    hasUpdate: "yes",
    draftState: "draft",
    page: 1,
    pageSize: 25,
  });

  expect(receivedFilters).toMatchObject({
    publishedFrom: "2026-01-01",
    publishedTo: "2026-12-31",
    mapVisibility: "on",
    hasUpdate: "yes",
    draftState: "draft",
  });
});

test("listNotificationDraftKeys selects only the channel and contact for one update", async () => {
  const rows = [
    { channel: "email", recipient_contact: "ada@example.test" },
    { channel: "whatsapp", recipient_contact: "91234567" },
  ];
  let selected = "";
  let filter = "";
  const client = {
    from(table: string) {
      expect(table).toBe("recipient_notification_draft");
      const query = {
        select(columns: string) {
          selected = columns;
          return query;
        },
        eq(column: string, value: string) {
          filter = `${column}:${value}`;
          return query;
        },
        order: () => query,
        range: () => Promise.resolve({ data: rows, count: rows.length, error: null }),
      };
      return query;
    },
  } as unknown as SupabaseClient;

  const keys = await createSupabaseContentRepository(client).listNotificationDraftKeys("update-1");

  expect(keys).toEqual([
    { channel: "email", recipientContact: "ada@example.test" },
    { channel: "whatsapp", recipientContact: "91234567" },
  ]);
  expect(selected).toBe("channel, recipient_contact");
  expect(filter).toBe("story_update_id:update-1");
});

test("listNotificationDraftKeys includes existing drafts beyond a capped response", async () => {
  const rows = [
    { id: "a", channel: "email", recipient_contact: "a@example.test" },
    { id: "b", channel: "email", recipient_contact: "b@example.test" },
    { id: "c", channel: "email", recipient_contact: "c@example.test" },
  ];
  const client = {
    from(table: string) {
      expect(table).toBe("recipient_notification_draft");
      let from = 0;
      let to = Number.POSITIVE_INFINITY;
      const result = () => ({
        data: rows.slice(from, Math.min(to + 1, from + 2)),
        count: rows.length,
        error: null,
      });
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        range: (start: number, end: number) => {
          from = start;
          to = end;
          return Promise.resolve(result());
        },
        then: (resolve: (value: ReturnType<typeof result>) => void) => resolve(result()),
      };
      return query;
    },
  } as unknown as SupabaseClient;

  const keys = await createSupabaseContentRepository(client).listNotificationDraftKeys("update-1");
  expect(keys.map((key) => key.recipientContact)).toEqual([
    "a@example.test",
    "b@example.test",
    "c@example.test",
  ]);
});

test("promotion writes use one audited RPC and surface its returned count", async () => {
  const commands: unknown[] = [];
  const client = {
    rpc: async (name: string, args: { p_command: unknown }) => {
      expect(name).toBe("cms_promotion_command");
      commands.push(args.p_command);
      return { data: { count: 1 }, error: null };
    },
  } as unknown as SupabaseClient;
  const repo = createSupabaseContentRepository(client);

  const socialCount = await repo.generateSocialCopiesWithAudit?.(
    [
      {
        contentItemId: "content-1",
        storyUpdateId: "update-1",
        platform: "facebook",
        language: "zh-HK",
        copyText: "Copy",
        hashtags: ["test"],
        status: "draft",
      },
    ],
    "admin-1",
    "content-1",
    "update-1",
    "facebook",
  );
  const draftCount = await repo.generateNotificationDraftsWithAudit?.(
    [
      {
        storyUpdateId: "update-1",
        contentItemId: "content-1",
        adoptionCaseId: null,
        supporterId: null,
        channel: "email",
        recipientName: "Reader",
        recipientContact: "reader@example.test",
        subject: null,
        body: "Draft",
        status: "draft",
      },
    ],
    "admin-1",
    "update-1",
  );
  await repo.updateSocialCopyStatusWithAudit?.("copy-1", "copied", "admin-1");
  await repo.updateNotificationDraftStatusWithAudit?.("draft-1", "sent_manually", "admin-1");

  expect(socialCount).toBe(1);
  expect(draftCount).toBe(1);
  expect(commands).toEqual([
    expect.objectContaining({
      kind: "social_generate",
      rows: [expect.objectContaining({ copy_text: "Copy" })],
    }),
    expect.objectContaining({
      kind: "draft_generate",
      rows: [expect.objectContaining({ recipient_contact: "reader@example.test" })],
    }),
    { kind: "social_status", id: "copy-1", status: "copied" },
    { kind: "draft_status", id: "draft-1", status: "sent_manually" },
  ]);
});

test("notification generation batches rows within the RPC's 500-row limit", async () => {
  const batchSizes: number[] = [];
  const client = {
    rpc: async (_name: string, args: { p_command: { rows: unknown[] } }) => {
      const size = args.p_command.rows.length;
      batchSizes.push(size);
      if (size > 500) return { data: null, error: new Error("too many notification drafts") };
      return { data: { count: size }, error: null };
    },
  } as unknown as SupabaseClient;
  const rows = Array.from({ length: 501 }, (_, index) => ({
    storyUpdateId: "update-1",
    contentItemId: "content-1",
    adoptionCaseId: null,
    supporterId: null,
    channel: "email" as const,
    recipientName: "Reader",
    recipientContact: "reader-" + index + "@example.test",
    subject: null,
    body: "Draft",
    status: "draft" as const,
  }));

  const count = await createSupabaseContentRepository(client).generateNotificationDraftsWithAudit?.(
    rows,
    "admin-1",
    "update-1",
  );

  expect(count).toBe(501);
  expect(batchSizes).toEqual([500, 1]);
});

test("promotion RPC errors are not acknowledged as successful writes", async () => {
  const failure = new Error("audit insert failed");
  const client = {
    rpc: async () => ({ data: null, error: failure }),
  } as unknown as SupabaseClient;
  const repo = createSupabaseContentRepository(client);

  await expect(
    repo.updateNotificationDraftStatusWithAudit?.("draft-1", "sent_manually", "admin-1"),
  ).rejects.toBe(failure);
});
