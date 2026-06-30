import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { AnimalsTable } from "../../components/admin/AnimalsTable";
import { PaymentsReconcile } from "../../components/admin/donations/PaymentsReconcile";

const searchSchema = z.object({
  section: z.enum(["cat", "dog", "sponsor", "applications", "payments"]).catch("cat"),
});

export const Route = createFileRoute("/admin/")({
  validateSearch: searchSchema,
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
  },
  component: AdminDashboard,
});

const sectionLabels: Record<string, string> = {
  cat: "貓貓",
  dog: "狗狗",
  sponsor: "助養動物",
  applications: "領養申請",
  payments: "收款紀錄",
};

function AdminDashboard() {
  const { section } = Route.useSearch();
  const queryClient = useQueryClient();

  const { data: animals = [], isLoading } = useQuery({
    queryKey: ["admin-animals", section],
    queryFn: async () => {
      if (section === "applications") return [];
      const { data, error } = await supabase
        .from("animals")
        .select("*")
        .eq("type", section)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: section !== "applications" && section !== "payments",
  });

  return (
    <AdminLayout activeSection={section as "cat" | "dog" | "sponsor" | "applications" | "payments"}>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">{sectionLabels[section]}</h1>
          {section === "payments" ? (
            <Link
              to="/admin/supporters"
              className="rounded border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-panel)] hover:bg-[var(--color-primary-highlight)]"
            >
              捐款人紀錄
            </Link>
          ) : section !== "applications" ? (
            <Link
              to="/admin/animals/new"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
            >
              + 新增
            </Link>
          ) : null}
        </div>

        {section === "payments" ? (
          <PaymentsReconcile />
        ) : section === "applications" ? (
          <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="text-lg font-semibold text-[var(--color-panel)]">
              領養申請已移至協調員工作流程
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">
              Use the coordinator case list for application review, status changes, animal matches,
              follow-ups, and finalization.
            </p>
            <Link
              to="/admin/applications"
              className="mt-4 inline-flex items-center rounded border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-panel)] hover:bg-[var(--color-primary-highlight)]"
            >
              Open adoption cases
            </Link>
          </section>
        ) : isLoading ? (
          <div className="text-center py-12 text-gray-400">載入中…</div>
        ) : (
          <AnimalsTable
            animals={animals}
            onDeleted={() =>
              queryClient.invalidateQueries({ queryKey: ["admin-animals", section] })
            }
          />
        )}
      </div>
    </AdminLayout>
  );
}
