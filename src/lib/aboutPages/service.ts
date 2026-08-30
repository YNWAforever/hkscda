import { PAGE_CONTENT_SCHEMAS } from "./schemas";
import type { AboutPagesRepository } from "./repository.server";
import type { AboutPageSlug, AnyAboutPageContent } from "./types";

export function createAboutPagesService({
  repo,
}: {
  repo: Pick<AboutPagesRepository, "getContent" | "upsertContent">;
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

    // No separate audit() call here — upsert_about_page_content_with_audit
    // already writes the audit_log row atomically inside the same
    // transaction as the content change, same documented pattern as
    // adoptionInformation's upsertRule/upsertCareTopic.
    async upsertAdmin({
      actorUserId,
      pageSlug,
      content,
    }: {
      actorUserId: string;
      pageSlug: AboutPageSlug;
      content: unknown;
    }) {
      const schema = PAGE_CONTENT_SCHEMAS[pageSlug];
      const parsed = schema.parse(content) as AnyAboutPageContent;
      return repo.upsertContent(pageSlug, parsed, actorUserId);
    },
  };
}
