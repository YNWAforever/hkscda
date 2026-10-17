import { expect, test } from "bun:test";
import { createServer, createConnection } from "node:net";
import { spawn, execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  access,
  symlink,
  rm,
  realpath,
  copyFile,
  chmod,
} from "node:fs/promises";
import { request as httpRequest, type ClientRequest } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
async function portOpen(port: number) {
  return new Promise<boolean>((done) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const timer = setTimeout(() => {
      socket.destroy();
      done(false);
    }, 300);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      done(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      done(false);
    });
  });
}
async function freePort() {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a local TCP port");
  await new Promise<void>((done) => server.close(() => done()));
  return address.port;
}

for (const [runtime, explicitNode] of [
  ["bun", false],
  ["node", false],
  ["node", true],
] as const)
  test(`${runtime}${explicitNode ? " explicit executable" : ""} preview does not listen until the handler has initialized, without an HTTP prewarm`, async () => {
    const tempRoot = await realpath(tmpdir());
    const directory = await mkdtemp(join(tempRoot, "hkscda-preview-startup-"));
    const publicPort = await freePort();
    let upstreamPort = await freePort();
    while (upstreamPort === publicPort) upstreamPort = await freePort();
    const entryDir = join(directory, ".vercel/output/functions/__server.func");
    const marker = join(directory, "entry-loading");
    const release = join(directory, "release-entry");
    const pendingMarker = join(directory, "request-pending");
    const nodeExecutable = explicitNode
      ? join(directory, process.platform === "win32" ? "pinned-node.exe" : "pinned-node")
      : undefined;
    if (nodeExecutable) {
      await copyFile(
        execFileSync("node", ["-p", "process.execPath"], { encoding: "utf8" }).trim(),
        nodeExecutable,
      );
      if (process.platform !== "win32") await chmod(nodeExecutable, 0o755);
    }
    await mkdir(entryDir, { recursive: true });
    await mkdir(join(directory, ".vercel/output/static"), { recursive: true });
    await writeFile(
      join(directory, ".vercel/output/nitro.json"),
      JSON.stringify({
        date: "2026-10-16T00:00:00Z",
        preset: "vercel",
        versions: { nitro: "3.0.260603-beta" },
        serverEntry: "functions/__server.func/index.mjs",
        publicDir: "static",
      }),
    );
    await writeFile(
      join(entryDir, "index.mjs"),
      `import {access,writeFile} from "node:fs/promises";
await writeFile(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,execPath:process.execPath}));
while(!await access(${JSON.stringify(release)}).then(()=>true,()=>false))
 await new Promise(done=>setTimeout(done,10));
let requests=0;
export default {async fetch(request){
 const path=new URL(request.url).pathname;
 if(path==="/__fixture_stall"){await writeFile(${JSON.stringify(pendingMarker)},"pending");return new Promise(()=>{});}
 if(path==="/__fixture_signal"){process.emit("SIGTERM");return Response.json({stopping:true});}
 return Response.json({ready:true,requests:++requests,runtime:process.versions.bun?"bun":"node"});
}};`,
    );
    const nodeModules = join(directory, "node_modules");
    await mkdir(join(nodeModules, ".nitro"), { recursive: true });
    await symlink(resolve("node_modules/nitro"), join(nodeModules, "nitro"), "junction");
    // The fixture owns its build pointer. Inheriting the repository's
    // node_modules/.nitro would pass locally when a previous build exists and
    // fail in a clean CI checkout before this test's listener assertions run.
    await writeFile(
      join(nodeModules, ".nitro/last-build.json"),
      JSON.stringify({ outputDir: "../../../.vercel/output" }),
    );
    let stderr = "";
    const child = spawn("node", [resolve("scripts/nitro-preview-fast.mjs")], {
      cwd: directory,
      env: {
        ...process.env,
        PORT: String(publicPort),
        NITRO_PREVIEW_UPSTREAM_PORT: String(upstreamPort),
        NITRO_PREVIEW_RUNTIME: runtime,
        NITRO_PREVIEW_HOST: "127.0.0.1",
        NITRO_PREVIEW_STATIC_DIR: join(directory, ".vercel/output/static"),
        NITRO_PREVIEW_SHUTDOWN_TIMEOUT_MS: "100",
        ...(nodeExecutable ? { NITRO_PREVIEW_NODE_EXECUTABLE: nodeExecutable } : {}),
      },
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const running = () =>
      expect(child.exitCode, `Preview child exited:\n${stderr.slice(-4000)}`).toBeNull();
    let stalled: ClientRequest | undefined;
    try {
      const deadline = Date.now() + 10_000;
      while (
        !(await access(marker).then(
          () => true,
          () => false,
        )) &&
        Date.now() < deadline
      ) {
        running();
        await delay(10);
      }
      expect(
        await access(marker).then(
          () => true,
          () => false,
        ),
      ).toBe(true);
      if (nodeExecutable)
        expect((JSON.parse(await readFile(marker, "utf8")) as { execPath: string }).execPath).toBe(
          nodeExecutable,
        );
      // The blocked loader is deterministic: a listening socket at this point
      // advertises readiness while the CLI's preview.fetch is still unassigned.
      expect(await portOpen(upstreamPort)).toBe(false);
      expect(await portOpen(publicPort)).toBe(false);
      await writeFile(release, "continue");
      while (!(await portOpen(publicPort)) && Date.now() < deadline) {
        running();
        await delay(10);
      }
      expect(await portOpen(publicPort)).toBe(true);
      const response = await fetch(`http://127.0.0.1:${publicPort}/api/admin/read`, {
        method: "POST",
        body: '{"action":"list"}',
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ready: true, requests: 1, runtime });
      const upstreamPid = (JSON.parse(await readFile(marker, "utf8")) as { pid: number }).pid;
      stalled = httpRequest(`http://127.0.0.1:${upstreamPort}/__fixture_stall`);
      stalled.on("error", () => {});
      stalled.end();
      while (
        !(await access(pendingMarker).then(
          () => true,
          () => false,
        )) &&
        Date.now() < deadline
      )
        await delay(10);
      expect(
        await access(pendingMarker).then(
          () => true,
          () => false,
        ),
      ).toBe(true);
      // Emit the same runtime signal event on Windows and POSIX. Windows'
      // external SIGTERM otherwise bypasses JS and hides an unbounded handler.
      await (await fetch(`http://127.0.0.1:${upstreamPort}/__fixture_signal`)).json();
      const processRunning = () => {
        try {
          process.kill(upstreamPid, 0);
          return true;
        } catch (error) {
          if (error && typeof error === "object" && "code" in error && error.code === "ESRCH")
            return false;
          throw error;
        }
      };
      const stopDeadline = Date.now() + 1000;
      while (processRunning() && Date.now() < stopDeadline) await delay(10);
      expect(processRunning()).toBe(false);
    } finally {
      stalled?.destroy();
      await writeFile(release, "continue");
      if (child.exitCode === null) {
        if (process.platform === "win32")
          execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        else child.kill("SIGTERM");
        await new Promise<void>((done) => {
          if (child.exitCode !== null) done();
          else child.once("exit", () => done());
        });
      }
      const target = await realpath(directory);
      if (dirname(target) !== tempRoot || !basename(target).startsWith("hkscda-preview-startup-"))
        // eslint-disable-next-line no-unsafe-finally -- Refuse cleanup before deleting an unowned path.
        throw new Error("Refuse cleanup outside the owned preview fixture");
      await rm(target, { recursive: true, force: true });
    }
  }, 15_000);
