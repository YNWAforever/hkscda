import { PAGE_CONTENT_SCHEMAS } from "./schemas";
import type { AboutPagesRepository } from "./repository.server";
import type { AboutPageSlug, AnyAboutPageContent } from "./types";

export function createAboutPagesService({
  repo,
}: {
  repo: Pick<AboutPagesRepository, "getContent" | "getPage" | "upsertContent">;
}) {
  return {
    async listPublic() {
      const [about, tnr, cccp] = await Promise.all([
        repo.getContent("about"),
        repo.getContent("tnr"),
        repo.getContent("cccp"),
      ]);
      return { about, tnr, cccp };
    },

    /**
     * The admin editor's read: the three pages plus the revision each one was loaded at, so the
     * next save can be fenced against it (the 2026-11-09 revision fence).
     */
    async listAdmin() {
      const [about, tnr, cccp] = await Promise.all([
        repo.getPage("about"),
        repo.getPage("tnr"),
        repo.getPage("cccp"),
      ]);
      return {
        about: about?.content ?? null,
        tnr: tnr?.content ?? null,
        cccp: cccp?.content ?? null,
        revisions: {
          about: about?.revision ?? null,
          tnr: tnr?.revision ?? null,
          cccp: cccp?.revision ?? null,
        },
      };
    },

    // No separate audit() call here — upsert_about_page_content_with_audit
    // already writes the audit_log row atomically inside the same
    // transaction as the content change, same documented pattern as
    // adoptionInformation's upsertRule/upsertCareTopic.
    async upsertAdmin({
      actorUserId,
      pageSlug,
      content,
      expectedRevision,
    }: {
      actorUserId: string;
      pageSlug: AboutPageSlug;
      content: unknown;
      expectedRevision?: number;
    }) {
      const schema = PAGE_CONTENT_SCHEMAS[pageSlug];
      const parsed = schema.parse(content) as AnyAboutPageContent;
      return expectedRevision === undefined
        ? repo.upsertContent(pageSlug, parsed, actorUserId)
        : repo.upsertContent(pageSlug, parsed, actorUserId, expectedRevision);
    },
  };
}
