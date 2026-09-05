import { z } from "zod";
import type { ContentLifecycleRepository } from "./lifecycle.repository.server";
import {
  contentInputSchema,
  storyProfileInputSchema,
  storyUpdateInputSchema,
  contentMediaInputSchema,
  contentLinkInputSchema,
  CONTENT_MEDIA_BUCKET,
} from "./schemas";
const identity = z.object({ actorUserId: z.string().uuid(), contentId: z.string().uuid() });
const version = z.object({ expectedVersion: z.number().int().nonnegative() });
const selection = version.extend({ revisionId: z.string().uuid() });
type Command = { actorUserId: string | null; contentId: string; input: unknown };
const saveSchema = contentInputSchema.omit({ status: true, publishedAt: true }).partial();
export function createContentLifecycleService(repository: ContentLifecycleRepository) {
  async function mutate(
    command: Command,
    operation: "save_content" | "upsert_profile" | "create_update" | "create_media" | "create_link",
    values: Record<string, unknown>,
  ) {
    return repository.mutate({
      ...identity.parse(command),
      ...version.parse(command.input),
      operation,
      values,
    });
  }
  return {
    async create(command: { actorUserId: string | null; input: unknown }) {
      const values = contentInputSchema.parse(command.input);
      if (values.status !== "draft") throw new Error("Content items must be created as drafts");
      return repository.create({
        actorUserId: z.string().uuid().parse(command.actorUserId),
        values,
      });
    },
    archive(command: Command) {
      return repository.mutate({
        ...identity.parse(command),
        ...version.parse(command.input),
        operation: "archive",
        values: {},
      });
    },
    async save(command: Command) {
      const input = z
        .object({ status: z.never().optional(), publishedAt: z.never().optional() })
        .passthrough()
        .parse(command.input);
      return mutate(command, "save_content", saveSchema.parse(input));
    },
    profile(command: Command) {
      return mutate(command, "upsert_profile", storyProfileInputSchema.parse(command.input));
    },
    update(command: Command) {
      return mutate(command, "create_update", storyUpdateInputSchema.parse(command.input));
    },
    media(command: Command) {
      const parsed = contentMediaInputSchema.parse(command.input);
      if (!parsed.storagePath.startsWith(`${command.contentId}/`))
        throw new Error("Upload path does not belong to this content item");
      return mutate(command, "create_media", { ...parsed, storageBucket: CONTENT_MEDIA_BUCKET });
    },
    link(command: Command) {
      return mutate(command, "create_link", contentLinkInputSchema.parse(command.input));
    },
    publish(command: Command) {
      return repository.publish({
        ...identity.parse(command),
        ...selection.extend({ idempotencyKey: z.string().min(16).max(200) }).parse(command.input),
      });
    },
    restore(command: Command) {
      return repository.restore({ ...identity.parse(command), ...selection.parse(command.input) });
    },
    getRevision(contentId: string, revisionId: string) {
      return repository.getRevision(
        z.string().uuid().parse(contentId),
        z.string().uuid().parse(revisionId),
      );
    },
    listRevisions(contentId: string, beforeVersion?: number) {
      return repository.listRevisions(
        z.string().uuid().parse(contentId),
        z.number().int().nonnegative().optional().parse(beforeVersion),
      );
    },
  };
}
