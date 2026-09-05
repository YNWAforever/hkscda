import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const control = "docs/evidence/frontend-wave2/fixture-mode.json";
createServer(async (req, res) => {
  const mode = JSON.parse(await readFile(control, "utf8").catch(() => "{}"));
  const path = new URL(req.url, "http://127.0.0.1:54330").pathname;
  res.setHeader("access-control-allow-origin", "*");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (
    (path.endsWith("/payment_public_config") && mode.payments === "error") ||
    (path.endsWith("/animals") && mode.animals === "error")
  ) {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ code: "FIXTURE_UNAVAILABLE", message: "Synthetic source unavailable" }),
    );
    return;
  }
  if (path.endsWith("/faq_entry") && mode.faq === "empty") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("[]");
    return;
  }
  if (path.endsWith("/faq_entry") && mode.faq === "slow")
    await new Promise((resolve) => setTimeout(resolve, 1200));
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const upstream = await fetch("http://127.0.0.1:54329" + req.url, {
    method: req.method,
    headers: {
      accept: req.headers.accept ?? "application/json",
      "content-type": "application/json",
    },
    ...(body.length ? { body } : {}),
  });
  res.writeHead(upstream.status, Object.fromEntries(upstream.headers));
  res.end(Buffer.from(await upstream.arrayBuffer()));
}).listen(54330, "127.0.0.1", () =>
  console.log("Synthetic failure proxy54330 -> synthetic fixture54329"),
);
