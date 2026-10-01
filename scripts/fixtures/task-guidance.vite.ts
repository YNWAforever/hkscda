import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { execFileSync } from "node:child_process";
export default defineConfig({
  root: path.resolve(import.meta.dirname, "../.."),
  plugins: [
    {
      name: "isolated-tasks",
      enforce: "pre",
      load(id) {
        const file = id.replaceAll("\\", "/");
        if (file.endsWith("/src/lib/supabase.ts"))
          return `export const supabase={auth:{getSession:async()=>({data:{session:{access_token:window.fixtureIdentity.role,user:{id:window.fixtureIdentity.authUserId}}}})}};`;
        if (
          process.env.TASK_FIXTURE_BASELINE === "1" &&
          file.endsWith("/src/components/admin/operations/TaskOverview.tsx")
        )
          return execFileSync(
            "git",
            ["show", "a4900e28:src/components/admin/operations/TaskOverview.tsx"],
            { encoding: "utf8" },
          );
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../../src") } },
  server: { host: "127.0.0.1", port: 56572, strictPort: true },
});
