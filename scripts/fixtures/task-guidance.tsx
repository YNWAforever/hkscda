import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TaskOverview } from "../../src/components/admin/operations/TaskOverview";
import { ADMIN_IDENTITY_QUERY_KEY } from "../../src/lib/admin/identity";
import type { AdminRole, AdminStatus } from "../../src/lib/admin/access";
import "../../src/styles.css";
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function change(role: AdminRole, status: AdminStatus = "active") {
  const admin = { id: role, authUserId: role, email: role + "@example.invalid", role, status };
  Object.assign(window, { fixtureIdentity: admin });
  client.setQueryData(ADMIN_IDENTITY_QUERY_KEY, { admin });
}
const selectedRole = new URL(location.href).searchParams.get("role");
change(selectedRole === "staff" || selectedRole === "treasurer" ? selectedRole : "admin");
function Fixture() {
  return (
    <QueryClientProvider client={client}>
      <main className="mx-auto max-w-5xl space-y-5 p-5">
        <h1 className="text-2xl font-bold">合成待辦總覽</h1>
        <div className="flex gap-4">
          <button onClick={() => change("staff")}>切換職員</button>
          <button onClick={() => change("staff", "disabled")}>停權</button>
        </div>
        <TaskOverview />
      </main>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
