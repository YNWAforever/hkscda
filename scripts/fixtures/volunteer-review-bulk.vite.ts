import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { execFileSync } from "node:child_process";
export default defineConfig({
  root: path.resolve(import.meta.dirname, "../.."),
  plugins: [
    {
      name: "bulk-isolation",
      enforce: "pre",
      load(id) {
        const file = id.replaceAll("\\", "/");
        if (file.endsWith("/src/lib/supabase.ts"))
          return `export const supabase={auth:{getSession:async()=>({data:{session:{access_token:"synthetic-treasurer"}}})}};`;
        if (
          process.env.BULK_FIXTURE_BASELINE === "1" &&
          file.endsWith("/src/components/admin/volunteers/VolunteerReviewBulkPanel.tsx")
        )
          return execFileSync(
            "git",
            ["show", "2c3d1b12:src/components/admin/volunteers/VolunteerReviewBulkPanel.tsx"],
            { encoding: "utf8" },
          );
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../../src") } },
  server: { host: "127.0.0.1", port: 56559, strictPort: true },
});
