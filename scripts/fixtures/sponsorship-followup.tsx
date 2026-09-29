import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PledgeDetailDrawer } from "../../src/components/admin/sponsorship/PledgeDetailDrawer";
import { AdminLanguageProvider } from "../../src/components/admin/adminI18n";
import "../../src/styles.css";
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
client.setQueryData(["admin-me"], { admin: { role: "staff" } });
window.addEventListener("fixture-refresh",()=>{void client.invalidateQueries({queryKey:["sponsorship-pledge"]});});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}><AdminLanguageProvider><main className="p-4"><h1>合成助養分派驗收</h1><PledgeDetailDrawer pledgeId="22222222-2222-4222-8222-222222222222" onClose={()=>{}} onChanged={()=>{}} /></main></AdminLanguageProvider></QueryClientProvider>,
);
