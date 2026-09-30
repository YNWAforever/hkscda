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
          file.endsWith("/src/components/admin/crm/CrmTagBulkPanel.tsx")
        )
          return execFileSync(
            "git",
            ["show", "3f9b1e32:src/components/admin/crm/CrmTagBulkPanel.tsx"],
            { encoding: "utf8" },
          );
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../../src") } },
  server: { host: "127.0.0.1", port: 56558, strictPort: true },
});
