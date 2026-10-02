import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { ADOPTION_INSTRUCTIONS_PAGE_KEY } from "./content";
import { adoptionInstructionContentSchema } from "./schemas";
import type {
  AdoptionInstructionContent,
  AdoptionInstructionPageState,
  AdoptionInstructionRevision,
  AdoptionInstructionRevisionSummary,
} from "./types";

const PAGE_COLUMNS =
  "page_key,published_revision_id,draft_revision_id,version,created_at,updated_at";
const REVISION_COLUMNS =
  "id,page_key,revision_number,state,content,source_revision_id,version,created_by,updated_by,published_by,published_at,created_at,updated_at";
const REVISION_SUMMARY_COLUMNS =
  "id,page_key,revision_number,state,source_revision_id,version,created_by,updated_by,published_by,published_at,created_at,updated_at";

export type AdoptionInstructionErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "internal";

const errorStatus: Record<AdoptionInstructionErrorCode, 401 | 403 | 404 | 409 | 422 | 500> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation: 422,
  internal: 500,
};

export class AdoptionInstructionError extends Error {
  name = "AdoptionInstructionError";

  constructor(
    public readonly code: AdoptionInstructionErrorCode,
    public readonly status: 401 | 403 | 404 | 409 | 422 | 500 = errorStatus[code],
  ) {
    super(code);
  }
}

export class AdoptionInstructionConflictError extends AdoptionInstructionError {
  name = "AdoptionInstructionConflictError";

  constructor() {
    super("conflict", 409);
  }
}

export class AdoptionInstructionSchemaUnavailableError extends AdoptionInstructionError {
  name = "AdoptionInstructionSchemaUnavailableError";

  constructor() {
    super("internal", 500);
  }
}

export type AdoptionInstructionAdminPage = {
  page: AdoptionInstructionPageState;
  published: AdoptionInstructionRevision | null;
  draft: AdoptionInstructionRevision | null;
  history: AdoptionInstructionRevisionSummary[];
  historyNextCursor?: string | null;
};

export type AdoptionInstructionHistoryPage = {
  items: AdoptionInstructionRevisionSummary[];
  nextCursor: string | null;
};

export type AdoptionInstructionPublishResult = {
  pageKey: string;
  revisionId: string;
  revisionVersion: number;
};

export type AdoptionInstructionRepository = {
  getAdminPage(): Promise<AdoptionInstructionAdminPage>;
  getPublished(): Promise<AdoptionInstructionRevision | null>;
  getRevision(id: string): Promise<AdoptionInstructionRevision | null>;
  ensureDraft(input: {
    actorUserId: string;
    expectedPageVersion: number;
    now: string;
  }): Promise<AdoptionInstructionRevision>;
  updateDraft(input: {
    actorUserId: string;
    expectedVersion: number;
    content: AdoptionInstructionContent;
    now: string;
  }): Promise<AdoptionInstructionRevision>;
  publish(input: {
    actorUserId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: string;
  }): Promise<AdoptionInstructionPublishResult>;
  archiveDraft(input: {
    actorUserId: string;
    expectedVersion: number;
    now: string;
  }): Promise<AdoptionInstructionRevision>;
  restore(input: {
    actorUserId: string;
    sourceRevisionId: string;
    expectedPageVersion: number;
    now: string;
  }): Promise<AdoptionInstructionRevision>;
  listHistory(input?: {
    cursor?: string | null;
    limit?: number;
  }): Promise<AdoptionInstructionHistoryPage>;
};

const pageRowSchema = z.object({
  page_key: z.literal(ADOPTION_INSTRUCTIONS_PAGE_KEY),
  published_revision_id: z.string().uuid().nullable(),
  draft_revision_id: z.string().uuid().nullable(),
  version: z.number().int().positive(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

const revisionRowSchema = z.object({
  id: z.string().uuid(),
  page_key: z.literal(ADOPTION_INSTRUCTIONS_PAGE_KEY),
  revision_number: z.number().int().positive(),
  state: z.enum(["draft", "published", "archived"]),
  content: adoptionInstructionContentSchema,
  source_revision_id: z.string().uuid().nullable(),
  version: z.number().int().positive(),
  created_by: z.string().uuid().nullable(),
  updated_by: z.string().uuid().nullable(),
  published_by: z.string().uuid().nullable(),
  published_at: z.string().datetime({ offset: true }).nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

const revisionSummaryRowSchema = revisionRowSchema.omit({ content: true });

const publishResultSchema = z.object({
  page_key: z.literal(ADOPTION_INSTRUCTIONS_PAGE_KEY),
  revision_id: z.string().uuid(),
  revision_version: z.number().int().positive(),
});

function mapPage(value: unknown): AdoptionInstructionPageState | null {
  const result = pageRowSchema.safeParse(value);
  if (!result.success) return null;
  const row = result.data;
  return {
    pageKey: row.page_key,
    publishedRevisionId: row.published_revision_id,
    draftRevisionId: row.draft_revision_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRevision(value: unknown): AdoptionInstructionRevision | null {
  const result = revisionRowSchema.safeParse(value);
  if (!result.success) return null;
  const row = result.data;
  return {
    id: row.id,
    pageKey: row.page_key,
    revisionNumber: row.revision_number,
    state: row.state,
    content: row.content,
    sourceRevisionId: row.source_revision_id,
    version: row.version,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    publishedBy: row.published_by,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireRevisionSummary(value: unknown): AdoptionInstructionRevisionSummary {
  const result = revisionSummaryRowSchema.safeParse(value);
  if (!result.success) throw new AdoptionInstructionError("internal", 500);
  const row = result.data;
  return {
    id: row.id,
    pageKey: row.page_key,
    revisionNumber: row.revision_number,
    state: row.state,
    sourceRevisionId: row.source_revision_id,
    version: row.version,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    publishedBy: row.published_by,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function encodeRevisionCursor(summary: AdoptionInstructionRevisionSummary): string {
  return summary.revisionNumber + ":" + summary.id;
}

export function parseRevisionCursor(cursor: string | null | undefined) {
  if (cursor == null) return null;
  const match = /^(\d{1,10}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
    cursor,
  );
  if (!match) throw new AdoptionInstructionError("validation", 422);
  const revisionNumber = Number(match[1]);
  if (!Number.isSafeInteger(revisionNumber) || revisionNumber < 1)
    throw new AdoptionInstructionError("validation", 422);
  return { revisionNumber, id: match[2].toLowerCase() };
}

function requirePage(value: unknown) {
  const page = mapPage(value);
  if (!page) throw new AdoptionInstructionError("internal", 500);
  return page;
}

function requireRevision(value: unknown) {
  const revision = mapRevision(value);
  if (!revision) throw new AdoptionInstructionError("internal", 500);
  return revision;
}

function providerError(error: unknown) {
  return error && typeof error === "object" ? (error as { code?: unknown }) : {};
}

function throwRepositoryError(error: unknown): never {
  switch (String(providerError(error).code ?? "")) {
    case "40001":
      throw new AdoptionInstructionConflictError();
    case "23514":
      throw new AdoptionInstructionError("validation", 422);
    case "42501":
      throw new AdoptionInstructionError("forbidden", 403);
    case "P0002":
      throw new AdoptionInstructionError("not_found", 404);
    default:
      throw new AdoptionInstructionError("internal", 500);
  }
}

export function createSupabaseAdoptionInstructionRepository(
  client: SupabaseClient,
): AdoptionInstructionRepository {
  async function getRevision(id: string) {
    const { data, error } = await client
      .from("adoption_instruction_revisions")
      .select(REVISION_COLUMNS)
      .eq("page_key", ADOPTION_INSTRUCTIONS_PAGE_KEY)
      .eq("id", id)
      .maybeSingle();
    if (error) throwRepositoryError(error);
    return data ? requireRevision(data) : null;
  }

  async function listHistory(input: { cursor?: string | null; limit?: number } = {}) {
    const limit = input.limit ?? 25;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new AdoptionInstructionError("validation", 422);
    const cursor = parseRevisionCursor(input.cursor);
    let query = client
      .from("adoption_instruction_revisions")
      .select(REVISION_SUMMARY_COLUMNS)
      .eq("page_key", ADOPTION_INSTRUCTIONS_PAGE_KEY);
    if (cursor)
      query = query.or(
        "revision_number.lt." +
          cursor.revisionNumber +
          ",and(revision_number.eq." +
          cursor.revisionNumber +
          ",id.lt." +
          cursor.id +
          ")",
      );
    const { data, error } = await query
      .order("revision_number", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (error) throwRepositoryError(error);
    const rows = (data ?? []).map(requireRevisionSummary);
    const items = rows.slice(0, limit);
    return {
      items,
      nextCursor: rows.length > limit ? encodeRevisionCursor(items[items.length - 1]) : null,
    };
  }

  return {
    async getAdminPage() {
      const { data: pageData, error: pageError } = await client
        .from("adoption_instruction_pages")
        .select(PAGE_COLUMNS)
        .eq("page_key", ADOPTION_INSTRUCTIONS_PAGE_KEY)
        .maybeSingle();
      if (pageError) throwRepositoryError(pageError);
      if (!pageData) throw new AdoptionInstructionError("not_found", 404);
      const page = requirePage(pageData);
      const [published, draft, historyPage] = await Promise.all([
        page.publishedRevisionId ? getRevision(page.publishedRevisionId) : Promise.resolve(null),
        page.draftRevisionId ? getRevision(page.draftRevisionId) : Promise.resolve(null),
        listHistory(),
      ]);
      if ((page.publishedRevisionId && !published) || (page.draftRevisionId && !draft))
        throw new AdoptionInstructionError("internal", 500);
      return {
        page,
        published,
        draft,
        history: historyPage.items,
        historyNextCursor: historyPage.nextCursor,
      };
    },

    getRevision,

    async getPublished() {
      const { data, error } = await client
        .from("adoption_instruction_revisions")
        .select(REVISION_COLUMNS)
        .eq("page_key", ADOPTION_INSTRUCTIONS_PAGE_KEY)
        .eq("state", "published")
        .maybeSingle();
      if (error) {
        if (["PGRST205", "42P01"].includes(error.code)) {
          throw new AdoptionInstructionSchemaUnavailableError();
        }
        throwRepositoryError(error);
      }
      return data ? requireRevision(data) : null;
    },

    async ensureDraft(input) {
      const { data, error } = await client.rpc("ensure_adoption_instruction_draft", {
        p_actor_user_id: input.actorUserId,
        p_expected_page_version: input.expectedPageVersion,
      });
      if (error) throwRepositoryError(error);
      return requireRevision(data);
    },

    async updateDraft(input) {
      const { data, error } = await client.rpc("update_adoption_instruction_draft", {
        p_actor_user_id: input.actorUserId,
        p_expected_version: input.expectedVersion,
        p_content: input.content,
      });
      if (error) throwRepositoryError(error);
      return requireRevision(data);
    },

    async publish(input) {
      const { data, error } = await client.rpc("publish_adoption_instruction_page", {
        p_actor_user_id: input.actorUserId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throwRepositoryError(error);
      const parsed = publishResultSchema.safeParse(data);
      if (!parsed.success) throw new AdoptionInstructionError("internal", 500);
      return {
        pageKey: parsed.data.page_key,
        revisionId: parsed.data.revision_id,
        revisionVersion: parsed.data.revision_version,
      };
    },

    async archiveDraft(input) {
      const { data, error } = await client.rpc("archive_adoption_instruction_draft", {
        p_actor_user_id: input.actorUserId,
        p_expected_version: input.expectedVersion,
      });
      if (error) throwRepositoryError(error);
      return requireRevision(data);
    },

    async restore(input) {
      const { data, error } = await client.rpc("restore_adoption_instruction_revision", {
        p_actor_user_id: input.actorUserId,
        p_expected_page_version: input.expectedPageVersion,
        p_source_revision_id: input.sourceRevisionId,
      });
      if (error) throwRepositoryError(error);
      return requireRevision(data);
    },

    listHistory,
  };
}
