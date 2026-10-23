import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = path.resolve(import.meta.dirname, "../..");
export default defineConfig({
  root,
  envDir: false,
  plugins: [
    {
      name: "offline-daily-read-boundary",
      enforce: "pre",
      load(id) {
        const file = id.replaceAll("\\", "/");
        if (file.endsWith("/src/lib/supabase.ts"))
          return `
            const id="90000000-0000-4000-8000-000000000001";
            export const supabase={auth:{
              getSession:async()=>({data:{session:{access_token:"offline-ui-only",user:{id}}}}),
              onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
            }};
          `;
        if (
          process.env.OFFLINE_DAILY_READ_BASELINE === "1" &&
          file.endsWith("/src/components/admin/volunteers/VolunteerRegistrationDetail.tsx")
        )
          return readFileSync(
            path.join(root, ".local-policy-test/volunteer-daily-read-20261020/baseline-detail.tsx"),
            "utf8",
          );
      },
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (request.url?.startsWith("/admin/volunteers")) {
            const query = request.url.includes("?")
              ? request.url.slice(request.url.indexOf("?"))
              : "";
            request.url = "/scripts/fixtures/volunteer-daily-read.html" + query;
          }
          next();
        });
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": path.join(root, "src") } },
  server: { host: "127.0.0.1", port: 56578, strictPort: true },
  build: {
    outDir: path.join(root, ".local-policy-test/volunteer-daily-read-20261020/ui-build"),
    rollupOptions: {
      input: path.join(root, "scripts/fixtures/volunteer-daily-read.html"),
    },
  },
});
