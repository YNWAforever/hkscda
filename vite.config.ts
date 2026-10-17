// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { NitroConfig } from "nitro/types";

const nitroOptions = {
  preset: "vercel",
  handlers: [
    {
      route: "/api/admin/volunteers/tasks",
      method: "POST",
      handler: "./server/routes/api/admin/volunteers/tasks.post.ts",
      lazy: true,
    },
    {
      route: "/api/admin/volunteers/bulk",
      method: "POST",
      handler: "./server/routes/api/admin/volunteers/bulk.post.ts",
      lazy: true,
    },
  ],
} satisfies NitroConfig;

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // The Lovable wrapper forwards Nitro options, but its public type only
  // declares the deployment subset above.
  nitro: nitroOptions as unknown as { preset: "vercel" },
});
