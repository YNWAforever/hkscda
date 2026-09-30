import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { execFileSync } from "node:child_process";
export default defineConfig({
  root: path.resolve(import.meta.dirname, "../.."),
  cacheDir: "node_modules/.cache/hkscda-supporter-portal",
  plugins: [
    {
      name: "isolated-portal",
      enforce: "pre",
      load(id) {
        const file = id.replaceAll("\\", "/");
        if (file.endsWith("/src/lib/supabase.ts"))
          return `export const signOutCurrentSession=()=>new Promise(resolve=>{window.finishSignOut=resolve;});`;
        if (
          process.env.PORTAL_FIXTURE_BASELINE === "1" &&
          file.endsWith("/src/components/site/supporter/SupporterPortal.tsx")
        )
          return execFileSync(
            "git",
            ["show", "390e5e1:src/components/site/supporter/SupporterPortal.tsx"],
            { encoding: "utf8" },
          );
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../../src") } },
  server: { host: "127.0.0.1", port: 56556, strictPort: true },
});
