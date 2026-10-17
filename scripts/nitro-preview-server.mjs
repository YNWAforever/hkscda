import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";

async function start() {
  const root = process.cwd();
  const shutdownTimeout = Number(process.env.NITRO_PREVIEW_SHUTDOWN_TIMEOUT_MS ?? 5000);
  if (!Number.isInteger(shutdownTimeout) || shutdownTimeout < 1 || shutdownTimeout > 30_000)
    throw new Error("Preview shutdown timeout must be an integer between 1 and 30000 milliseconds");
  const nitroPackage = await realpath(resolve(root, "node_modules/nitro/package.json"));
  const fromNitro = createRequire(nitroPackage);
  // Keep the locked Nitro preview's dotenv, static assets and entry loading.
  // Its beta CLI listens before awaiting this initializer; the fixture test
  // guards this private entry when the pinned dependency is updated.
  const initializer = resolve(dirname(nitroPackage), "dist/_chunks/nitro2.mjs");
  const [{ startPreview }, { serve }, { log }] = await Promise.all([
    import(pathToFileURL(initializer).href),
    import(pathToFileURL(fromNitro.resolve(process.versions.bun ? "srvx/bun" : "srvx/node")).href),
    import(pathToFileURL(fromNitro.resolve("srvx/log")).href),
  ]);
  if (typeof startPreview !== "function")
    throw new Error("The installed Nitro preview initializer is incompatible");
  let preview;
  const server = serve({
    manual: true,
    fetch(request) {
      return preview.fetch(request);
    },
    middleware: [log()],
    gracefulShutdown: false,
    port: Number(process.env.NITRO_PORT ?? process.env.PORT ?? 3000),
    hostname: process.env.NITRO_HOST ?? "127.0.0.1",
  });
  try {
    preview = await startPreview({ rootDir: root, loader: { srvxServer: server } });
    // TCP readiness now means the initialized handler is safe to receive a first
    // request. No HTTP probe or request retry is needed.
    await server.serve();
    if (preview.upgrade)
      server.node?.server?.on("upgrade", (request, socket, head) =>
        preview.upgrade(request, socket, head),
      );
  } catch (error) {
    await server.close(true).catch(() => {});
    await preview?.close();
    throw error;
  }
  let stopping;
  const stop = () => {
    stopping ??= (async () => {
      const deadline = setTimeout(() => {
        console.error("Local Nitro preview exceeded its graceful shutdown deadline");
        process.exit(1);
      }, shutdownTimeout);
      try {
        await server.close();
        await preview.close();
      } finally {
        clearTimeout(deadline);
      }
    })();
    return stopping;
  };
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      void stop().then(
        () => process.exit(0),
        (error) => {
          console.error(
            error instanceof Error ? error.message : "Local Nitro preview shutdown failed",
          );
          process.exit(1);
        },
      );
    });
}

start().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Local Nitro preview initialization failed",
  );
  process.exitCode = 1;
});
