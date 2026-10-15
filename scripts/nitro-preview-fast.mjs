import { brotliCompress, constants } from "node:zlib";
import { createServer, request as proxyRequest } from "node:http";
import { createConnection } from "node:net";
import { promisify } from "node:util";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

const brotliCompressAsync = promisify(brotliCompress);
const compressibleExtensions = new Set([".css", ".js", ".mjs"]);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript"],
  [".mjs", "text/javascript"],
]);

function acceptsBrotli(header = "") {
  for (const item of header.split(",")) {
    const [encoding, ...parameters] = item.trim().split(";");
    if (encoding.toLowerCase() !== "br") continue;
    const quality = parameters.find((parameter) => parameter.trim().startsWith("q="));
    return quality ? Number(quality.trim().slice(2)) > 0 : true;
  }
  return false;
}

async function precompressAssets(staticRoot, cacheRoot) {
  const sidecars = new Map();

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(filePath);
        continue;
      }
      if (!entry.isFile()) continue;

      const extension = extname(entry.name).toLowerCase();
      if (!compressibleExtensions.has(extension)) continue;
      const sourceStats = await stat(filePath);
      if (sourceStats.size < 1024 || sourceStats.size > 10 * 1024 * 1024) continue;

      const relativePath = relative(staticRoot, filePath).split(sep).join("/");
      const sidecarPath = resolve(cacheRoot, `${relativePath}.br`);
      const existingSidecar = await stat(sidecarPath).catch(() => null);
      if (existingSidecar?.size && existingSidecar.mtimeMs >= sourceStats.mtimeMs) {
        sidecars.set(relativePath, {
          contentType: contentTypes.get(extension),
          path: sidecarPath,
          size: existingSidecar.size,
        });
        continue;
      }

      const source = await readFile(filePath);
      const compressed = await brotliCompressAsync(source, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 4,
          [constants.BROTLI_PARAM_SIZE_HINT]: source.byteLength,
        },
      });
      await mkdir(dirname(sidecarPath), { recursive: true });
      await writeFile(sidecarPath, compressed);
      sidecars.set(relativePath, {
        contentType: contentTypes.get(extension),
        path: sidecarPath,
        size: compressed.byteLength,
      });
    }
  }

  await visit(staticRoot);
  return sidecars;
}

async function patchLocalVercelBunRequest(root) {
  const functionEntry = join(root, ".vercel/output/functions/__server.func/index.mjs");
  if (
    !(await access(functionEntry).then(
      () => true,
      () => false,
    ))
  )
    return;

  // Nitro's Vercel Bun output assigns Request properties Bun already exposes as read-only.
  const source = await readFile(functionEntry, "utf8");
  const unguarded = 'Object.defineProperty(req, "ip", { get() {';
  const guarded =
    'if (Object.getOwnPropertyDescriptor(req, "ip")?.configurable !== false) Object.defineProperty(req, "ip", { get() {';
  const waitUntilAssignment = "req.waitUntil = context?.waitUntil;";
  const guardedWaitUntil =
    "try { req.waitUntil = context?.waitUntil; } catch { /* Bun exposes this request property as read-only. */ }";
  let patched = source;
  if (!patched.includes(guarded) && patched.includes(unguarded))
    patched = patched.replace(unguarded, guarded);
  if (!patched.includes(guardedWaitUntil) && patched.includes(waitUntilAssignment))
    patched = patched.replace(waitUntilAssignment, guardedWaitUntil);
  if (patched !== source) await writeFile(functionEntry, patched);
}

function portIsOpen(host, port) {
  return new Promise((resolveResult) => {
    const socket = createConnection({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolveResult(false);
    }, 300);
    socket.once("connect", () => {
      clearTimeout(timeout);
      socket.destroy();
      resolveResult(true);
    });
    socket.once("error", () => {
      clearTimeout(timeout);
      resolveResult(false);
    });
  });
}

async function waitForPort(host, port, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Nitro preview exited before listening (${child.exitCode})`);
    if (await portIsOpen(host, port)) return;
    await new Promise((resolveResult) => setTimeout(resolveResult, 100));
  }
  throw new Error(`Nitro preview did not listen on ${host}:${port} within 30 seconds`);
}

function forwardToNitro(request, response, upstreamHost, upstreamPort) {
  const upstream = proxyRequest(
    {
      host: upstreamHost,
      port: upstreamPort,
      method: request.method,
      path: request.url ?? "/",
      headers: request.headers,
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );
  upstream.once("error", () => {
    if (!response.headersSent) {
      response.writeHead(502, {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      });
    }
    response.end("Local Nitro preview is unavailable");
  });
  request.pipe(upstream);
}

function servePrecompressed(request, response, sidecars) {
  if (
    !["GET", "HEAD"].includes(request.method ?? "") ||
    request.headers.range ||
    !acceptsBrotli(request.headers["accept-encoding"])
  ) {
    return false;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://preview.local").pathname);
  } catch {
    return false;
  }
  const relativePath = pathname.replace(/^\/+/, "");
  const sidecar = sidecars.get(relativePath);
  if (!sidecar) return false;

  response.writeHead(200, {
    "cache-control": "no-store",
    "content-encoding": "br",
    "content-length": String(sidecar.size),
    "content-type": sidecar.contentType,
    vary: "Accept-Encoding",
    "x-content-type-options": "nosniff",
  });
  if (request.method === "HEAD") {
    response.end();
    return true;
  }

  const stream = createReadStream(sidecar.path);
  stream.once("error", () => response.destroy());
  stream.pipe(response);
  return true;
}

async function startPreview() {
  const root = process.cwd();
  const staticRoot = resolve(process.env.NITRO_PREVIEW_STATIC_DIR ?? ".vercel/output/static");
  const cacheRoot = resolve(root, ".local-policy-test/nitro-preview-brotli-cache");
  const upstreamHost = "127.0.0.1";
  const publicHost = process.env.NITRO_PREVIEW_HOST ?? "127.0.0.1";
  const publicPort = Number(process.env.PORT ?? 3000);
  const upstreamPort = Number(process.env.NITRO_PREVIEW_UPSTREAM_PORT ?? publicPort + 1);
  const previewRuntime = process.env.NITRO_PREVIEW_RUNTIME ?? "bun";

  if (!(await stat(staticRoot).catch(() => null))?.isDirectory())
    throw new Error("Build the Vercel output before starting the local Nitro preview");
  if (
    !Number.isInteger(publicPort) ||
    publicPort < 1 ||
    publicPort > 65535 ||
    !Number.isInteger(upstreamPort) ||
    upstreamPort < 1 ||
    upstreamPort > 65535 ||
    publicPort === upstreamPort
  ) {
    throw new Error("Preview and Nitro upstream ports must be different valid TCP ports");
  }
  if (await portIsOpen(upstreamHost, upstreamPort))
    throw new Error(`Nitro upstream port ${upstreamPort} is already in use`);

  const sidecars = await precompressAssets(staticRoot, cacheRoot);
  if (previewRuntime === "bun") await patchLocalVercelBunRequest(root);
  const launcher = fileURLToPath(new URL("./nitro-preview-server.mjs", import.meta.url));
  const runtime =
    previewRuntime === "bun" ? (process.env.BUN_EXECUTABLE ?? "bun") : process.execPath;
  const child = spawn(runtime, [launcher], {
    cwd: root,
    env: {
      ...process.env,
      HOST: upstreamHost,
      NITRO_HOST: upstreamHost,
      NITRO_PORT: String(upstreamPort),
      PORT: String(upstreamPort),
    },
    stdio: "inherit",
    windowsHide: true,
  });

  let server;
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    if (server?.listening) server.close();
    child.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    await waitForPort(upstreamHost, upstreamPort, child);
    server = createServer((request, response) => {
      if (!servePrecompressed(request, response, sidecars))
        forwardToNitro(request, response, upstreamHost, upstreamPort);
    });
    await new Promise((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(publicPort, publicHost, resolveListen);
    });
    console.log(
      `Local Nitro preview: http://${publicHost}:${publicPort}; precompressed ${sidecars.size} JavaScript/CSS assets`,
    );
  } catch (error) {
    stop();
    throw error;
  }
}

startPreview().catch((error) => {
  console.error(error instanceof Error ? error.message : "Local Nitro preview failed");
  process.exitCode = 1;
});
