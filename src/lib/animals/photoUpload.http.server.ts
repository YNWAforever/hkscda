import { RequestBodyTooLargeError, readPublicJson } from "../http/publicJson.server";
import { ZodError } from "zod";

import {
  ANIMAL_IMAGE_BUCKET,
  animalPhotoDescriptorSchema,
  animalPhotoPath,
  type AnimalPhotoDescriptor,
} from "./photoUpload";

export type SignedAnimalPhotoUpload = {
  path: string;
  signedUrl: string;
  token: string;
};

export type AnimalPhotoUploadDeps = {
  bucket?: string;
  /** Rejects the request unless the caller is an authorised admin. */
  requireAnimalAdmin: (request: Request) => Promise<unknown>;
  /** Issues a signed upload URL for exactly this object path. */
  createSignedUpload: (bucket: string, path: string) => Promise<SignedAnimalPhotoUpload>;
  /**
   * Produces the unique version segment of the object path. Injected so tests
   * get a deterministic path; defaults to a random UUID in production.
   */
  newVersion?: () => string;
};

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createAnimalPhotoUploadHandlers(deps: AnimalPhotoUploadDeps) {
  const bucket = deps.bucket ?? ANIMAL_IMAGE_BUCKET;
  const newVersion = deps.newVersion ?? (() => crypto.randomUUID());

  return {
    async createUploadUrl({ request }: { request: Request }): Promise<Response> {
      try {
        await deps.requireAnimalAdmin(request);
      } catch (error) {
        // Deliberately opaque: a refused caller learns only that it was refused, not
        // whether the animal exists. But a wrong role is 403, not "sign in again", and a
        // failure to *check* (a database outage) is a 500, not a refusal (BUG-27).
        if (error instanceof Response && (error.status === 401 || error.status === 403)) {
          return jsonNoStore(
            { error: error.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: error.status },
          );
        }
        console.error(error);
        return jsonNoStore({ error: "Could not verify admin access" }, { status: 500 });
      }

      let body: unknown;
      try {
        body = await readPublicJson(request);
      } catch (error) {
        if (error instanceof RequestBodyTooLargeError)
          return jsonNoStore({ error: "Request body too large" }, { status: 413 });
        return jsonNoStore({ error: "Invalid JSON body" }, { status: 400 });
      }

      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return jsonNoStore({ error: "Invalid photo upload request" }, { status: 400 });
      }
      const payload = body as { animalId?: unknown; photo?: unknown };
      if (typeof payload.animalId !== "string" || !UUID_PATTERN.test(payload.animalId)) {
        // The animal id becomes the first path segment, so it is constrained to
        // a UUID rather than sanitised: anything else is a caller error, and
        // accepting it would let a request choose where the object lands.
        return jsonNoStore({ error: "A valid animalId is required" }, { status: 400 });
      }

      let descriptor: AnimalPhotoDescriptor;
      try {
        descriptor = animalPhotoDescriptorSchema.parse(payload.photo);
      } catch (error) {
        if (error instanceof ZodError) {
          return jsonNoStore(
            { error: "Unsupported photo. Use a JPEG, PNG or WebP image under 8 MB." },
            { status: 400 },
          );
        }
        throw error;
      }

      // A fresh version segment every time. Nothing is ever written over an
      // existing object, so the animal's previous photograph survives this
      // upload regardless of what happens to the database write that follows.
      const path = animalPhotoPath({
        animalId: payload.animalId,
        version: newVersion(),
        fileName: descriptor.fileName,
      });

      const upload = await deps.createSignedUpload(bucket, path);
      return jsonNoStore({
        bucket,
        path: upload.path,
        signedUrl: upload.signedUrl,
        token: upload.token,
      });
    },
  };
}
