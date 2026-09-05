const result = await Bun.build({
  entrypoints: ["scripts/fixtures/protected-forms.tsx"],
  target: "browser",
  outdir: "docs/evidence/frontend-coverage/protected-forms",
  define: { "import.meta.env.VITE_TURNSTILE_SITE_KEY": JSON.stringify("synthetic-test-key") },
  plugins: [
    {
      name: "local-fixture-only",
      setup(build) {
        build.onResolve({ filter: /^@tanstack\/react-router$/ }, () => ({
          path: "router",
          namespace: "fixture",
        }));
        build.onResolve({ filter: /ShortlistContext$/ }, () => ({
          path: "shortlist",
          namespace: "fixture",
        }));
        build.onResolve({ filter: /\/lib\/supabase$/ }, () => ({
          path: "storage",
          namespace: "fixture",
        }));
        build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          loader: "tsx",
          contents:
            path === "router"
              ? `export const Link=({to,children,...props})=><a href={to} {...props}>{children}</a>;export const createFileRoute=()=>x=>x;export const useRouterState=({select})=>select({location:{pathname:'/volunteer'}});export const Outlet=()=>null;`
              : path === "shortlist"
                ? `const items=[{id:'77777777-8888-4333-8444-555555555555',name:'Synthetic Cat',animalType:'cat',intent:'adoption',rank:1},{id:'66666666-8888-4333-8444-555555555555',name:'Synthetic Sponsor',animalType:'sponsor',intent:'sponsorship',rank:1}];export const useShortlist=()=>({items,clearIntent:()=>{},reorderAdoptions:()=>{}});`
                : `export const getSupabaseClient=()=>({storage:{from:bucket=>({uploadToSignedUrl:(path,token,file)=>window.fixtureUpload(bucket,path,token,file)})}});`,
        }));
      },
    },
  ],
});
if (!result.success) throw new Error(result.logs.map(String).join("\n"));
console.log("Built isolated protected forms fixture");
