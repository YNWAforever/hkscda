import { createFileRoute } from "@tanstack/react-router";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../../lib/donations/supabase.server";
export const Route = createFileRoute("/api/admin/animals/publication/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const c = createSupabaseServiceClient(),
          a = await requireAdmin(request, ["staff", "admin"], c),
          command = (await request.json()) as Record<string, unknown>;
        let promotedPath: string | null = null;
        let draftPath: string | null = null;
        const promotedPaths: string[] = [];
        const galleryDraftPaths: string[] = [];
        if (
          command.kind === "publish" &&
          typeof command.preview_id === "string" &&
          typeof command.animal_id === "string"
        ) {
          const { data: preview, error: previewError } = await c
            .from("animal_publication_preview")
            .select("body")
            .eq("id", command.preview_id)
            .eq("animal_id", command.animal_id)
            .maybeSingle();
          if (previewError) throw previewError;
          const body = preview?.body as
            | {
                draft_image_path?: unknown;
                gallery?: Array<Record<string, unknown>>;
              }
            | undefined;
          if (Array.isArray(body?.gallery)) {
            const publicationGallery = [];
            for (const item of body.gallery) {
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
                  String(item.id) +
                  "." +
                  ext;
                const downloaded = await c.storage
                  .from("animal-draft-images")
                  .download(item.draft_path);
                if (downloaded.error) throw downloaded.error;
                const uploaded = await c.storage
                  .from("animal-images")
                  .upload(path, downloaded.data, { upsert: false });
                if (uploaded.error && uploaded.error.message !== "The resource already exists")
                  throw uploaded.error;
                next.url = c.storage.from("animal-images").getPublicUrl(path).data.publicUrl;
                next.draft_path = null;
                promotedPaths.push(path);
                galleryDraftPaths.push(item.draft_path);
              }
              publicationGallery.push(next);
            }
            command.publication_gallery = publicationGallery;
            command.published_gallery = publicationGallery
              .filter((item) => item.review_status === "approved" && typeof item.url === "string")
              .sort((left, right) => Number(left.sort_order) - Number(right.sort_order));
          }
          if (typeof body?.draft_image_path === "string" && body.draft_image_path) {
            draftPath = body.draft_image_path;
            const ext =
              draftPath
                .split(".")
                .pop()
                ?.replace(/[^a-z0-9]/gi, "") || "jpg";
            promotedPath = `${command.animal_id}/versions/${command.preview_id}.${ext}`;
            const downloaded = await c.storage.from("animal-draft-images").download(draftPath);
            if (downloaded.error) throw downloaded.error;
            const uploaded = await c.storage
              .from("animal-images")
              .upload(promotedPath, downloaded.data, { upsert: false });
            if (uploaded.error && uploaded.error.message !== "The resource already exists")
              throw uploaded.error;
            command.published_image_url = c.storage
              .from("animal-images")
              .getPublicUrl(promotedPath).data.publicUrl;
          }
        }
        const { data, error } = await c.rpc("animal_publication_command", {
          p_actor: a.authUserId,
          p_command: command,
        });
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
          if (promotedPath || promotedPaths.length)
            await c.storage
              .from("animal-images")
              .remove([...(promotedPath ? [promotedPath] : []), ...promotedPaths]);
          const status = error.code === "42501" ? 403 : error.code === "22023" ? 422 : 500;
          return Response.json(
            { error: status === 422 ? "動物草稿資料無效" : "未能處理動物發布" },
            { status },
          );
        }
        if (data?.kind === "conflict" && (promotedPath || promotedPaths.length))
          await c.storage
            .from("animal-images")
            .remove([...(promotedPath ? [promotedPath] : []), ...promotedPaths]);
        if (data?.kind === "published" && (draftPath || galleryDraftPaths.length))
          await c.storage
            .from("animal-draft-images")
            .remove([...(draftPath ? [draftPath] : []), ...galleryDraftPaths]);
        return Response.json(data, {
          status: data?.kind === "conflict" ? 409 : data?.kind === "not_found" ? 404 : 200,
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
