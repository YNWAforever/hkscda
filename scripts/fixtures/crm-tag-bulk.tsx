import { createRoot } from "react-dom/client";
import { useState } from "react";
import { CrmTagBulkPanel } from "../../src/components/admin/crm/CrmTagBulkPanel";
import "../../src/styles.css";
function Fixture() {
  const [count, setCount] = useState(25);
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">合成 CRM 批量驗收</h1>
      <button onClick={() => setCount(1000)}>選取 1000 筆</button>
      <CrmTagBulkPanel
        selectedIds={Array.from(
          { length: count },
          (_, i) => `11111111-1111-4111-8111-${String(i + 1).padStart(12, "0")}`,
        )}
        query="synthetic"
        roleFilter="all"
        selectionDisabled={false}
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
