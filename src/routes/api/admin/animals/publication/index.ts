import { createFileRoute } from "@tanstack/react-router";
import { readAdminJsonObject } from "../../../../../lib/http/adminJson.server";
import {
  copyPublishedAnimalMedia,
  type AnimalPublicationMediaCopy,
} from "../../../../../lib/animals/publicationMedia.server";
import {
  InvalidRequestJsonError,
  RequestBodyTooLargeError,
} from "../../../../../lib/http/publicJson.server";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";
export const Route = createFileRoute("/api/admin/animals/publication/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const c = createSupabaseServiceClient();
        const a = await requireAdmin(request, ["staff", "admin"], c);
        let command: Record<string, unknown>;
        try {
          command = await readAdminJsonObject(request);
        } catch (error) {
          if (error instanceof RequestBodyTooLargeError)
            return Response.json(
              { error: "Request body too large" },
              { status: 413, headers: { "cache-control": "no-store" } },
            );
          if (error instanceof InvalidRequestJsonError)
            return Response.json(
              { error: "Invalid JSON body" },
              { status: 400, headers: { "cache-control": "no-store" } },
            );
          throw error;
        }
        if (command.kind === "publish") {
          delete command.published_image_url;
          delete command.publication_gallery;
          delete command.published_gallery;
        }
        const pendingCopies: AnimalPublicationMediaCopy[] = [];
        if (
          command.kind === "publish" &&
          typeof command.preview_id === "string" &&
          typeof command.animal_id === "string"
        ) {
          // Derive media URLs only from a preview owned by this actor and still
          // at the current draft revision. The publish RPC repeats these gates
          // while holding the draft row lock.
          const { data: preview, error: previewError } = await c
            .from("animal_publication_preview")
            .select("body,draft_revision")
            .eq("id", command.preview_id)
            .eq("animal_id", command.animal_id)
            .eq("created_by", a.authUserId)
            .gt("expires_at", new Date().toISOString())
            .maybeSingle();
          if (previewError) throw previewError;
          const { data: draft, error: draftError } = preview
            ? await c
                .from("animal_draft")
                .select("revision")
                .eq("id", command.animal_id)
                .maybeSingle()
            : { data: null, error: null };
          if (draftError) throw draftError;
          const candidateBody = (
            preview && draft && String(preview.draft_revision) === String(draft.revision)
              ? preview.body
              : undefined
          ) as
            | {
                publication_state?: unknown;
                draft_image_path?: unknown;
                gallery?: Array<Record<string, unknown>>;
              }
            | undefined;
          // Only a version with an approved editorial review may expose its
          // private drafts through the public image bucket.
          let body: typeof candidateBody;
          if (candidateBody?.publication_state === "published" && draft) {
            const { data: review, error: reviewError } = await c
              .from("editorial_content_review")
              .select("classification")
              .eq("entity_kind", "animal")
              .eq("entity_id", command.animal_id)
              .eq("revision_key", String(draft.revision))
              .maybeSingle();
            if (reviewError) throw reviewError;
            if (review?.classification !== "approved")
              return Response.json(
                { error: { code: "invalid_draft", message: "動物草稿資料無效" } },
                { status: 422, headers: { "cache-control": "no-store" } },
              );
            body = candidateBody;
          }
          if (Array.isArray(body?.gallery)) {
            const publicationGallery = [];
            for (const [galleryIndex, item] of body.gallery.entries()) {
              const next = { ...item };
              if (
                item.review_status === "approved" &&
                typeof item.draft_path === "string" &&
                item.draft_path
              ) {
                const ext =
                  item.draft_path
                    .split(".")
                    .pop()
                    ?.replace(/[^a-z0-9]/gi, "") || "jpg";
                const path =
                  String(command.animal_id) +
                  "/versions/" +
                  String(command.preview_id) +
                  "-" +
                  "gallery-" +
                  galleryIndex +
                  "." +
                  ext;
                // The publication transaction records the copy source. Public
                // Storage receives bytes only after that transaction commits.
                next.url = c.storage.from("animal-images").getPublicUrl(path).data.publicUrl;
                pendingCopies.push({ sourcePath: item.draft_path, publicPath: path });
              }
              publicationGallery.push(next);
            }
            command.publication_gallery = publicationGallery;
            command.published_gallery = publicationGallery
              .filter((item) => item.review_status === "approved" && typeof item.url === "string")
              .sort((left, right) => Number(left.sort_order) - Number(right.sort_order))
              .map((item) => ({ ...item, draft_path: null }));
          }
          if (typeof body?.draft_image_path === "string" && body.draft_image_path) {
            const draftPath = body.draft_image_path;
            const ext =
              draftPath
                .split(".")
                .pop()
                ?.replace(/[^a-z0-9]/gi, "") || "jpg";
            const publicPath = `${command.animal_id}/versions/${command.preview_id}.${ext}`;
            command.published_image_url = c.storage
              .from("animal-images")
              .getPublicUrl(publicPath).data.publicUrl;
            pendingCopies.push({ sourcePath: draftPath, publicPath });
          }
        }
        const { data, error } = await c.rpc(
          command.kind === "publish"
            ? "publish_animal_publication_once"
            : "animal_publication_command",
          {
            p_actor: a.authUserId,
            p_command: command,
          },
        );
        if (!error && command.kind === "preview" && data?.body) {
          const body = data.body as Record<string, unknown>;
          async function previewUrl(path: unknown, fallback: unknown) {
            if (typeof path !== "string" || !path) return fallback;
            const signed = await c.storage.from("animal-draft-images").createSignedUrl(path, 600);
            if (signed.error) throw signed.error;
            return signed.data.signedUrl;
          }
          body.preview_image_url = await previewUrl(body.draft_image_path, body.image_url);
          if (Array.isArray(body.gallery))
            body.gallery = await Promise.all(
              body.gallery.map(async (item: Record<string, unknown>) => ({
                ...item,
                preview_url: await previewUrl(item.draft_path, item.url),
              })),
            );
        }
        if (!error && command.kind === "read" && typeof command.animal_id === "string") {
          const canonical = await c
            .from("animals")
            .select("*")
            .eq("id", command.animal_id)
            .maybeSingle();
          if (canonical.error) throw canonical.error;
          if (data && typeof data === "object") data.animal = canonical.data;
        }
        if (error) {
          const status = error.code === "42501" ? 403 : error.code === "22023" ? 422 : 500;
          const message = status === 422 ? "動物草稿資料無效" : "未能處理動物發布";
          return Response.json(
            command.kind === "publish"
              ? {
                  error: { code: status === 422 ? "invalid_draft" : "publication_failed", message },
                }
              : { error: message },
            { status, headers: { "cache-control": "no-store" } },
          );
        }
        if (
          command.kind === "publish" &&
          (data?.kind === "conflict" || data?.kind === "not_found")
        ) {
          return Response.json(
            { error: { code: "stale_preview", message: "草稿已變更，請重新預覽。" } },
            {
              status: data.kind === "conflict" ? 409 : 404,
              headers: { "cache-control": "no-store" },
            },
          );
        }
        if (data?.kind === "published" && data.replayed === true) {
          if (typeof data.version_id !== "string")
            throw new Error("Replayed publication is missing its version ID");
          const { data: queued, error: queuedError } = await c
            .from("animal_publication_media_copy")
            .select("source_path,public_path")
            .eq("publication_version_id", data.version_id)
            .is("copied_at", null)
            .limit(50);
          if (queuedError) throw queuedError;
          pendingCopies.splice(
            0,
            pendingCopies.length,
            ...(queued ?? []).map((row) => ({
              sourcePath: row.source_path as string,
              publicPath: row.public_path as string,
            })),
          );
        }
        let mediaPending = false;
        if (data?.kind === "published") {
          for (const copy of pendingCopies) {
            try {
              await copyPublishedAnimalMedia(c, copy);
            } catch (copyError) {
              // The committed copy intent lets the cron repair a failed or
              // ambiguous Storage response without repeating the publish RPC.
              console.error("Animal publication media copy pending", {
                animalId: command.animal_id,
                publicPath: copy.publicPath,
                error: copyError,
              });
              mediaPending = true;
            }
          }
        }
        return Response.json(
          mediaPending && data && typeof data === "object"
            ? { ...data, media_pending: true }
            : data,
          {
            status:
              data?.kind === "conflict"
                ? 409
                : data?.kind === "not_found"
                  ? 404
                  : mediaPending
                    ? 202
                    : 200,
            headers: { "cache-control": "no-store" },
          },
        );
      },
    },
  },
});
