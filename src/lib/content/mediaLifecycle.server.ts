import { z } from "zod";
import { ContentLifecycleError, type ContentLifecycleResult } from "./lifecycle";
import {
  contentMediaInputSchema,
  CONTENT_MEDIA_MIME_TYPES,
  MAX_CONTENT_MEDIA_BYTES,
} from "./schemas";
export type MediaSession = {
  id: string;
  contentId: string;
  expectedVersion: number;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
  storyUpdateId: string | null;
  expiresAt: string;
  result: ContentLifecycleResult | null;
};
export type PublicMediaAsset = {
  id: string;
  sourceBucket: string;
  sourcePath: string;
  publicBucket: string;
  publicPath: string;
  sha256: string;
  ready: boolean;
};
type Identity = { actorUserId: string; contentId: string };
type Publication = Identity & {
  expectedVersion: number;
  revisionId: string;
  idempotencyKey: string;
};
export type ContentMediaPorts = {
  createSession(
    input: Identity & {
      expectedVersion: number;
      mimeType: string;
      byteSize: number;
      storyUpdateId: string | null;
    },
  ): Promise<MediaSession>;
  getSession(input: Identity & { uploadSessionId: string }): Promise<MediaSession>;
  signUpload(bucket: string, path: string): Promise<{ token: string; path: string }>;
  download(bucket: string, path: string): Promise<Uint8Array>;
  finalize(
    input: Identity & {
      uploadSessionId: string;
      expectedVersion: number;
      values: Record<string, unknown>;
      sha256: string | null;
    },
  ): Promise<ContentLifecycleResult>;
  preview(input: Identity & { mediaId: string }): Promise<string>;
  preparePublication(input: Publication): Promise<PublicMediaAsset[]>;
  copyPublic(asset: PublicMediaAsset): Promise<unknown>;
  markPublicReady(input: Identity & { assetId: string }): Promise<unknown>;
  publish(input: Publication): Promise<ContentLifecycleResult>;
};
const identity = z.object({ actorUserId: z.string().uuid(), contentId: z.string().uuid() });
const version = z.object({ expectedVersion: z.number().int().nonnegative() });
type Command = { actorUserId: string | null; contentId: string; input: unknown };
export function matchesContentImage(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg")
    return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mimeType === "image/png")
    return (
      bytes.length >= 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
    );
  if (mimeType === "image/webp")
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  return false;
}
export async function contentMediaDigest(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}
export function createContentMediaLifecycle(ports: ContentMediaPorts, now = () => new Date()) {
  return {
    async allocate(command: Command) {
      const owner = identity.parse(command);
      const input = version
        .extend({
          mimeType: z.enum(CONTENT_MEDIA_MIME_TYPES),
          byteSize: z.number().int().min(1).max(MAX_CONTENT_MEDIA_BYTES),
          storyUpdateId: z.string().uuid().nullable().optional().default(null),
        })
        .parse(command.input);
      const session = await ports.createSession({ ...owner, ...input });
      if (
        session.storageBucket !== "content-media-private" ||
        session.contentId !== owner.contentId
      )
        throw new Error("Invalid private upload session");
      const target = await ports.signUpload(session.storageBucket, session.storagePath);
      return { ...target, bucket: session.storageBucket, uploadSessionId: session.id };
    },
    async finalize(command: Command) {
      const owner = identity.parse(command);
      const input = version.extend({ uploadSessionId: z.string().uuid() }).parse(command.input);
      const values = contentMediaInputSchema
        .omit({ storagePath: true, storyUpdateId: true })
        .parse(command.input);
      const session = await ports.getSession({ ...owner, uploadSessionId: input.uploadSessionId });
      if (
        session.contentId !== owner.contentId ||
        session.expectedVersion !== input.expectedVersion
      )
        throw new ContentLifecycleError(
          "not_found",
          "Upload session ownership or version mismatch",
        );
      if (session.result) return ports.finalize({ ...owner, ...input, values, sha256: null });
      if (
        !Number.isFinite(Date.parse(session.expiresAt)) ||
        Date.parse(session.expiresAt) <= now().getTime()
      )
        throw new ContentLifecycleError("invalid", "Upload session expired");
      const bytes = await ports.download(session.storageBucket, session.storagePath);
      if (
        bytes.byteLength !== session.byteSize ||
        bytes.byteLength > MAX_CONTENT_MEDIA_BYTES ||
        !matchesContentImage(bytes, session.mimeType)
      )
        throw new ContentLifecycleError("invalid", "Uploaded image bytes do not match the session");
      return ports.finalize({
        ...owner,
        ...input,
        values,
        sha256: await contentMediaDigest(bytes),
      });
    },
    async preview(command: Command) {
      return {
        url: await ports.preview({
          ...identity.parse(command),
          ...z.object({ mediaId: z.string().uuid() }).parse(command.input),
        }),
        expiresIn: 300,
      };
    },
    async publish(command: Command) {
      const input = {
        ...identity.parse(command),
        ...version
          .extend({ revisionId: z.string().uuid(), idempotencyKey: z.string().min(16).max(200) })
          .parse(command.input),
      };
      const assets = await ports.preparePublication(input);
      for (const asset of assets) {
        if (asset.ready) continue;
        await ports.copyPublic(asset);
        await ports.markPublicReady({ ...identity.parse(command), assetId: asset.id });
      }
      return ports.publish(input);
    },
  };
}
