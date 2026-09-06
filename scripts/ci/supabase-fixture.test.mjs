import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";

test("CI animal fixture serves membership-filtered public catalogues", async () => {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ["scripts/ci/supabase-fixture.mjs"], {
    env: { ...process.env, FIXTURE_PORT: String(port), FIXTURE_HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await once(child.stdout, "data");
    for (const [filter, expected] of [
      ["type=eq.cat&adoption_eligible=eq.true", 6],
      ["type=eq.dog&adoption_eligible=eq.true", 6],
      ["sponsorship_eligible=eq.true", 3],
    ]) {
      const response = await fetch(
        `http://127.0.0.1:${port}/rest/v1/animals?status=eq.available&retired_at=is.null&${filter}`,
      );
      assert.equal(response.status, 200);
      const rows = await response.json();
      assert.equal(rows.length, expected);
      assert.ok(rows.every((row) => row.retired_at === null));
      assert.ok(rows.some((row) => row.public_profile?.personality));
      assert.ok(rows.some((row) => row.public_profile?.neutered === null));
      assert.ok(rows.some((row) => row.image_url === null));
      assert.deepEqual(
        new Set(rows.map((row) => row.age)),
        new Set(["約 3 個月", "約 2 歲", "約 8 歲"]),
      );
    }
    const detail = await fetch(
      `http://127.0.0.1:${port}/rest/v1/animals?id=eq.00000000-0000-4000-8000-000000000001`,
      {
        headers: { accept: "application/vnd.pgrst.object+json" },
      },
    );
    assert.equal((await detail.json()).id, "00000000-0000-4000-8000-000000000001");
  } finally {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
});
