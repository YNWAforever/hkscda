import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { useAdminLanguage } from "../../components/admin/adminI18n";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/content")({
  beforeLoad: async () => {
    await requireAdminPageAccess("contentManagement");
  },
  component: AdminContentPage,
});

function AdminContentPage() {
  const { language } = useAdminLanguage();
  const isChinese = language === "zh";

  return (
    <AdminLayout activeSection="content">
      <main className="space-y-4 p-6">
        <div>
          <p className="text-sm font-semibold text-[var(--color-primary)]">
            {isChinese ? "宣傳" : "Promotion"}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">
            {isChinese ? "宣傳內容" : "Content Management"}
          </h1>
        </div>
        <section className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <p className="text-sm text-[var(--color-text-muted)]">
            {isChinese ? "宣傳內容管理頁面準備中。" : "Content management is being prepared."}
          </p>
        </section>
      </main>
    </AdminLayout>
  );
}
