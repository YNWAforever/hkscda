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
          process.env.MEDIA_REPAIR_FIXTURE_BASELINE === "1" &&
          id.replaceAll("\\", "/").endsWith("/src/components/admin/MediaRepairQueue.tsx")
        )
          return execFileSync(
            "git",
            ["show", "f1b28fb:src/components/admin/MediaRepairQueue.tsx"],
            { encoding: "utf8" },
          );
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../../src") } },
  server: { host: "127.0.0.1", port: 56551, strictPort: true },
});
