import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { execFileSync } from "node:child_process";
export default defineConfig({
  root: path.resolve(import.meta.dirname, "../.."),
  plugins: [
    {
      name: "isolated-crm-assignment",
      enforce: "pre",
      load(id) {
        const file = id.replaceAll("\\", "/");
        if (
          process.env.CRM_ASSIGNMENT_FIXTURE_BEFORE === "1" &&
          file.endsWith("/src/components/admin/crm/CrmAssignmentBulkPanel.tsx")
        )
          return execFileSync(
            "git",
            ["show", "5f44bb9d:src/components/admin/crm/CrmAssignmentBulkPanel.tsx"],
            { encoding: "utf8" },
          );
        if (file.endsWith("/src/lib/supabase.ts"))
          return `export const supabase={auth:{getSession:async()=>({data:{session:{access_token:"synthetic-finance",user:{id:new URL(location.href).searchParams.get("actor")??"finance-A"}}}})}};`;
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../../src") } },
  server: { host: "127.0.0.1", port: 56575, strictPort: true },
});
