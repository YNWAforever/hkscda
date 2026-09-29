import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SupporterPortal } from "../../src/components/site/supporter/SupporterPortal";
import "../../src/styles.css";
const client = new QueryClient();
function Fixture() {
  const [token, setToken] = useState("synthetic-a");
  const [mounted, setMounted] = useState(true);
  return (
    <QueryClientProvider client={client}>
      <main className="mx-auto max-w-2xl px-5 py-12">
        <h1>合成支持者入口</h1>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setToken("synthetic-b")}>切換用戶 B</button>
          <button onClick={() => setMounted(false)}>卸載入口</button>
        </div>
        {mounted && <SupporterPortal accessToken={token} />}
      </main>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
