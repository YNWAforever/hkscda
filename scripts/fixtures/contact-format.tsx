import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CrmContactFormatPreviewPanel } from "../../src/components/admin/crm/CrmContactFormatPreviewPanel";
import "../../src/styles.css";
const ids = Array.from(
  { length: 1000 },
  (_, i) => "22222222-2222-4222-8222-" + String(i + 1).padStart(12, "0"),
);
function Fixture() {
  const [query, setQuery] = useState("A");
  const [shown, setShown] = useState(true);
  return (
    <main className="p-4">
      <h1>合成 CRM 格式驗收</h1>
      <button
        className="btn-secondary min-h-11"
        onClick={() => setQuery(query === "A" ? "B" : "A")}
      >
        切換範圍
      </button>
      <button className="btn-secondary min-h-11" onClick={() => setShown(!shown)}>
        切換頁面
      </button>
      {shown && (
        <CrmContactFormatPreviewPanel
          selectedIds={ids}
          query={query}
          roleFilter="all"
          selectionDisabled={false}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
