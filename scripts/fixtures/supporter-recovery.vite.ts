import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { execFileSync } from "node:child_process";

export default defineConfig({
  root: path.resolve(import.meta.dirname, "../.."),
  plugins: [
    {
      name: "isolated-recovery-auth",
      enforce: "pre",
      load(id) {
        const normalized = id.replaceAll("\\", "/");
        if (normalized.endsWith("/src/lib/supabase.ts"))
          return `
        let listener = () => {};
        window.recoveryFixture = { verifies: [], resolve: null, emit: (event, session) => listener(event, session) };
        export const getSupabaseClient = () => ({ auth: {
          getSession: async () => ({ data: { session: null } }),
          onAuthStateChange: (cb) => { listener = cb; return { data: { subscription: { unsubscribe() {} } } }; },
          verifyOtp: async (input) => { window.recoveryFixture.verifies.push(input); return new Promise(resolve => { window.recoveryFixture.resolve = resolve; }); },
          signOut: async () => { listener('SIGNED_OUT', null); return { error: null }; },
        } });`;
        if (normalized.endsWith("/src/components/site/TurnstileWidget.tsx"))
          return `
        import { createElement, useState } from 'react';
        export const turnstileEnabled = true;
        let sequence = 0;
        export function TurnstileWidget({onVerify}) {
          const [done, setDone] = useState(false);
          return createElement('button', {type:'button', disabled:done, onClick:()=>{setDone(true);onVerify('synthetic-token-'+(++sequence));}}, '合成人機驗證');
        }`;
        if (
          process.env.RECOVERY_FIXTURE_BASELINE === "1" &&
          normalized.endsWith("/src/routes/supporter.tsx")
        ) {
          return execFileSync("git", ["show", "fe4ac26:src/routes/supporter.tsx"], {
            encoding: "utf8",
          });
        }
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../../src") } },
  server: { host: "127.0.0.1", port: 56553, strictPort: true },
});
