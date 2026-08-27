import { createServer } from "node:http";

/**
 * A PostgREST-shaped fixture for the brand verifier (plan WP-0f).
 *
 * The verifier fails on console errors and failed requests, so running it with no
 * reachable Supabase produced noise that had nothing to do with the brand: DNS
 * failures on every browser query. This answers the handful of shapes the public
 * pages actually issue, deterministically and read-only, so the verifier reports
 * on layout and tokens rather than on connectivity.
 *
 * Read-only, no PII, fixed ids and timestamps.
 *
 * Deviation worth knowing: image_url points at /brand/hkscda-logo-primary.jpg
 * rather than a file under src/assets. Those are bundled by Vite under hashed
 * names and are not addressable by a fixed URL, so pointing at them would make the
 * verifier report asset 404s - the opposite of the intent.
 */
const PORT = Number(process.env.FIXTURE_PORT ?? 54329);
const HOST = process.env.FIXTURE_HOST ?? "127.0.0.1";
const IMAGE = "/brand/hkscda-logo-primary.jpg";
const STAMP = "2026-08-01T00:00:00.000Z";

function animal(index, type, gender, age) {
  const n = String(index).padStart(2, "0");
  return {
    id: `00000000-0000-4000-8000-0000000000${n}`,
    type,
    name: type === "cat" ? `測試貓 ${n}` : type === "dog" ? `測試狗 ${n}` : `助養動物 ${n}`,
    name_en: null,
    gender,
    age,
    age_en: null,
    description: "此為 CI 佈景資料，不代表真實動物。",
    description_en: null,
    notes: null,
    notes_en: null,
    status: "available",
    image_url: IMAGE,
    created_at: STAMP,
    updated_at: STAMP,
  };
}

const AGES = ["約 3 個月", "約 2 歲", "約 8 歲"];
const ANIMALS = [
  ...Array.from({ length: 6 }, (_, i) => animal(i + 1, "cat", i % 2 ? "male" : "female", AGES[i % 3])),
  ...Array.from({ length: 6 }, (_, i) => animal(i + 11, "dog", i % 2 ? "male" : "female", AGES[i % 3])),
  ...Array.from({ length: 3 }, (_, i) => animal(i + 21, "sponsor", i % 2 ? "male" : "female", AGES[i % 3])),
];

/** PostgREST encodes filters as column=op.value, e.g. type=eq.cat */
function applyFilters(rows, params) {
  let out = rows;
  for (const [key, raw] of params.entries()) {
    if (["select", "order", "offset", "limit"].includes(key)) continue;
    const [op, ...rest] = raw.split(".");
    const value = rest.join(".");
    if (op === "eq") out = out.filter((row) => String(row[key]) === value);
    else if (op === "in") {
      const set = new Set(value.replace(/^(|)$/g, "").split(","));
      out = out.filter((row) => set.has(String(row[key])));
    }
  }
  return out;
}

function applyOrder(rows, order) {
  if (!order) return rows;
  const clauses = order.split(",").map((c) => {
    const [column, ...mods] = c.split(".");
    return { column, desc: mods.includes("desc") };
  });
  return [...rows].sort((a, b) => {
    for (const { column, desc } of clauses) {
      const av = a[column] ?? "";
      const bv = b[column] ?? "";
      if (av === bv) continue;
      return (av < bv ? -1 : 1) * (desc ? -1 : 1);
    }
    return 0;
  });
}

function cors(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "*");
  res.setHeader("access-control-expose-headers", "content-range");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS,HEAD");
}

function json(res, status, body, headers = {}) {
  cors(res);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  // The fixture is a different origin from the preview server, so the browser
  // preflights every Supabase call. Without this the queries never leave.
  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const path = url.pathname;

  if (path.startsWith("/auth/v1/")) {
    json(res, 401, { message: "unauthenticated fixture" });
    return;
  }

  if (req.method === "POST" && path.startsWith("/rest/v1/rpc/")) {
    json(res, 200, []);
    return;
  }

  if (path === "/rest/v1/animals") {
    const filtered = applyOrder(applyFilters(ANIMALS, url.searchParams), url.searchParams.get("order"));
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = url.searchParams.get("limit");

    let from = offset;
    let to = limit ? offset + Number(limit) - 1 : filtered.length - 1;
    const range = req.headers["range"];
    if (typeof range === "string" && range.includes("-")) {
      const [a, b] = range.split("-").map(Number);
      if (Number.isFinite(a)) from = a;
      if (Number.isFinite(b)) to = b;
    }

    const page = filtered.slice(from, to + 1);
    const wantsCount = String(req.headers["prefer"] ?? "").includes("count=exact");
    const headers = wantsCount
      ? { "content-range": `${from}-${from + Math.max(page.length - 1, 0)}/${filtered.length}` }
      : {};
    json(res, wantsCount ? 206 : 200, page, headers);
    return;
  }

  if (path.startsWith("/rest/v1/")) {
    json(res, 200, []);
    return;
  }

  json(res, 404, { message: "not found in fixture", path });
});

server.listen(PORT, HOST, () => {
  console.log(`supabase fixture listening on http://${HOST}:${PORT} (${ANIMALS.length} animals)`);
});
