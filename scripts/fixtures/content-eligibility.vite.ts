import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { execFileSync } from "node:child_process";
export default defineConfig({
  root: path.resolve(import.meta.dirname, "../.."),
  plugins: [
    {
      name: "reviewed-baseline-fixture",
      enforce: "pre",
      load(id) {
        if (
          process.env.CONTENT_FIXTURE_BASELINE === "1" &&
          id.replaceAll("\\", "/").endsWith("/src/components/site/stories/StoryContentGrid.tsx")
        )
          return execFileSync(
            "git",
            ["show", "0284de0:src/components/site/stories/StoryContentGrid.tsx"],
            { encoding: "utf8" },
          );
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../../src") } },
  server: { host: "127.0.0.1", port: 56550, strictPort: true },
});
