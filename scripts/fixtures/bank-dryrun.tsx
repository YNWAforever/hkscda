import { createRoot } from "react-dom/client";
import { BankStatementDryRunPanel } from "../../src/components/admin/donations/BankStatementDryRunPanel";
import "../../src/styles.css";
createRoot(document.getElementById("root")!).render(
  <main className="p-4">
    <h1>合成財務驗收</h1>
    <h2>對帳檔</h2>
    <BankStatementDryRunPanel actorUserId="synthetic-finance" />
  </main>,
);
