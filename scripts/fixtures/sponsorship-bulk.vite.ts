import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import {execFileSync} from "node:child_process";
export default defineConfig({
  root: path.resolve(import.meta.dirname, "../.."),
  plugins: [
    {
      name: "sponsorship-proof-isolation",
      enforce: "pre",
      load(id) {
        const file = id.replaceAll("\\", "/");
        if(process.env.SPONSORSHIP_BULK_BEFORE==="1"&&file.endsWith("/src/components/admin/sponsorship/SponsorshipFollowupBulkPanel.tsx")) return execFileSync("git",["show","03dd2c26:src/components/admin/sponsorship/SponsorshipFollowupBulkPanel.tsx"],{encoding:"utf8"});
        if (file.endsWith("/src/lib/supabase.ts"))
          return `export const supabase={auth:{getSession:async()=>({data:{session:{access_token:"synthetic-staff"}}})}};`;
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../../src") } },
  server: { host: "127.0.0.1", port: 56568, strictPort: true },
});
