import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { rawSha } from "./task-12-binding";
import { dependencies } from "./task-12-profile";

test("Task12 binds every current prerequisite SQL byte before composition", async () => {
  for (const [name, expected] of dependencies) {
    const bytes = await readFile(resolve(import.meta.dir, "../../../../supabase/migrations", name));
    expect({ name, sha256: rawSha(bytes) }).toEqual({ name, sha256: expected });
  }
});
