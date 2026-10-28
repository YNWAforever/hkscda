import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  root: path.resolve(import.meta.dirname, "../.."),
  plugins: [
    {
      name: "d1-local-fixture-isolation",
      enforce: "pre",
      load(id) {
        if (id.replaceAll("\\", "/").endsWith("/src/lib/supabase.ts"))
          return `
        const session={access_token:"d1-local-fixture",user:{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}};
        export const supabase={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},storage:{from:()=>({uploadToSignedUrl:async(path,token,file)=>{
          const response=await fetch('/fixture-storage',{method:'POST',headers:{'content-type':file.type,'x-fixture-path':path},body:file});
          return {error:response.ok?null:new Error('Fixture upload failed')};
        }})}};
        export const getSupabaseClient=()=>supabase;
      `;
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../../src") } },
  server: { host: "127.0.0.1", port: 56571, strictPort: true },
});
