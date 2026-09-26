import { describe, expect, mock, test } from "bun:test";

import { copyPublishedAnimalMedia } from "./publicationMedia.server";

const copy = {
  sourcePath: "11111111-2222-4333-8444-555555555555/private.jpg",
  publicPath: "11111111-2222-4333-8444-555555555555/versions/preview.jpg",
};

describe("animal publication media copy", () => {
  test("downloads private bytes, uploads them publicly, then marks the committed copy", async () => {
    const events: string[] = [];
    const rpc = mock(async () => {
      events.push("mark");
      return { data: true, error: null };
    });
    const client = {
      storage: {
        from(bucket: string) {
          if (bucket === "animal-draft-images")
            return {
              download: async () => {
                events.push("download");
                return { data: new Blob(["image"]), error: null };
              },
            };
          return {
            upload: async () => {
              events.push("upload");
              return { error: null };
            },
          };
        },
      },
      rpc,
    };
    await copyPublishedAnimalMedia(client as never, copy);
    expect(events).toEqual(["download", "upload", "mark"]);
    expect(rpc).toHaveBeenCalledWith("mark_animal_publication_media_copied", {
      p_public_path: copy.publicPath,
      p_claimed_at: null,
    });
  });

  test("accepts a duplicate object after an ambiguous earlier upload", async () => {
    const rpc = mock(async () => ({ data: true, error: null }));
    const client = {
      storage: {
        from(bucket: string) {
          return bucket === "animal-draft-images"
            ? { download: async () => ({ data: new Blob(["image"]), error: null }) }
            : { upload: async () => ({ error: { message: "The resource already exists" } }) };
        },
      },
      rpc,
    };
    await copyPublishedAnimalMedia(client as never, copy, "2026-09-26T00:00:00Z");
    expect(rpc).toHaveBeenCalledWith("mark_animal_publication_media_copied", {
      p_public_path: copy.publicPath,
      p_claimed_at: "2026-09-26T00:00:00Z",
    });
  });

  test("does not mark a copy when Storage fails", async () => {
    const rpc = mock(async () => ({ data: true, error: null }));
    const client = {
      storage: {
        from(bucket: string) {
          return bucket === "animal-draft-images"
            ? { download: async () => ({ data: new Blob(["image"]), error: null }) }
            : { upload: async () => ({ error: new Error("storage unavailable") }) };
        },
      },
      rpc,
    };
    await expect(copyPublishedAnimalMedia(client as never, copy)).rejects.toThrow(
      "storage unavailable",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});
