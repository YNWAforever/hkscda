import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";

test("CI fixture serves public catalogues and paginated adoption fees", async () => {
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
    const listing = await fetch(
      "http://127.0.0.1:" + port + "/rest/v1/rpc/public_animal_listing_page",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ p_filters: {
          purpose: "adoption", species: "cat", ageBand: "all", gender: "all",
          sort: "newest", page: 2, pageSize: 2,
        } }),
      },
    );
    assert.equal(listing.status, 200);
    const listingPage = await listing.json();
    assert.equal(listingPage.total, 6);
    assert.equal(listingPage.page, 2);
    assert.equal(listingPage.items.length, 2);
    assert.ok(listingPage.items.every((item) => item.publication_state === "published"));
    assert.ok(listingPage.items.every((item) => !Object.hasOwn(item, "notes")));

    const detail = await fetch(
      `http://127.0.0.1:${port}/rest/v1/animals?id=eq.00000000-0000-4000-8000-000000000001`,
      {
        headers: { accept: "application/vnd.pgrst.object+json" },
      },
    );
    assert.equal((await detail.json()).id, "00000000-0000-4000-8000-000000000001");

    const feeUrl =
      "http://127.0.0.1:" + port + "/rest/v1/adoption_fees?is_published=eq.true&order=animal_type.asc,sort_order.asc,id.asc";
    const firstFeePage = await fetch(feeUrl + "&offset=0&limit=1", {
      headers: { prefer: "count=exact" },
    });
    assert.equal(firstFeePage.status, 206);
    assert.equal(firstFeePage.headers.get("content-range"), "0-0/13");
    const firstFeeRows = await firstFeePage.json();
    assert.equal(firstFeeRows.length, 1);

    const secondFeePage = await fetch(feeUrl + "&offset=1&limit=1", {
      headers: { prefer: "count=exact" },
    });
    assert.equal(secondFeePage.headers.get("content-range"), "1-1/13");
    const secondFeeRows = await secondFeePage.json();
    assert.equal(secondFeeRows.length, 1);
    assert.notEqual(firstFeeRows[0].id, secondFeeRows[0].id);

    const exhaustedFeePage = await fetch(feeUrl + "&offset=13&limit=1", {
      headers: { prefer: "count=exact" },
    });
    assert.equal(exhaustedFeePage.headers.get("content-range"), "*/13");
    assert.deepEqual(await exhaustedFeePage.json(), []);
  } finally {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
});
