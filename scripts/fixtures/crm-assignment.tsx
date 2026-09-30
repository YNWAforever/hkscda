import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CrmAssignmentBulkPanel } from "../../src/components/admin/crm/CrmAssignmentBulkPanel";
import "../../src/styles.css";
const ids = Array.from(
  { length: 1000 },
  (_, i) => "22222222-2222-4222-8222-" + String(i + 1).padStart(12, "0"),
);
function Fixture() {
  const [shown, setShown] = useState(true);
  return (
    <main className="p-4">
      <h1>合成 CRM 分派驗收</h1>
      <button className="btn-secondary min-h-11" onClick={() => setShown(!shown)}>
        切換頁面
      </button>
      {shown && (
        <CrmAssignmentBulkPanel
          actorUserId={new URL(location.href).searchParams.get("actor") ?? "finance-A"}
          selectedIds={ids}
          query=""
          roleFilter="all"
          selectionDisabled={false}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
