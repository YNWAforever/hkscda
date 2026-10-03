import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
export const rawSha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
export const gitBlob = (b: Buffer) => createHash("sha1").update("blob " + b.length + "\0").update(b).digest("hex");
export type Binding = { rawSha256: string; canonicalSha256: string; rawGitBlob: string; rawBytes: number; archive: string };
export async function freeze(root: string, out: string, paths: string[]) {
  const result: Record<string, Binding> = {};
  for (const [i, p] of [...new Set(paths)].entries()) {
    const b = await readFile(resolve(root, p)), archive = "s" + i + ".source";
    await writeFile(resolve(out, archive), b, { flag: "wx" });
    result[p] = { rawBytes: b.length, rawSha256: rawSha(b), canonicalSha256: rawSha(b.toString().replaceAll("\r\n", "\n")), rawGitBlob: gitBlob(b), archive };
  }
  return result;
}
export async function preserved(root: string, out: string, bindings: Record<string, Binding>) {
  for (const [p, entry] of Object.entries(bindings)) {
    const b = await readFile(resolve(root, p)), archive = await readFile(resolve(out, entry.archive));
    if (!b.equals(archive) || b.length !== entry.rawBytes || rawSha(b) !== entry.rawSha256 || gitBlob(b) !== entry.rawGitBlob || rawSha(b.toString().replaceAll("\r\n", "\n")) !== entry.canonicalSha256) return false;
  }
  return true;
}
