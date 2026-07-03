import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { AnimalsTable } from "../../components/admin/AnimalsTable";
import { useAdminLanguage } from "../../components/admin/adminI18n";
import { PaymentsReconcile } from "../../components/admin/donations/PaymentsReconcile";
import { PledgeReviewLane } from "../../components/admin/sponsorship/PledgeReviewLane";
import type { AdminSection } from "../../components/admin/adminNav";
import { getAdminAreaForLocation } from "../../lib/admin/access";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";
import { supabase } from "../../lib/supabase";

const searchSchema = z.object({
  section: z.enum(["cat", "dog", "sponsor", "applications", "payments"]).catch("cat"),
});

type DashboardSection = Exclude<AdminSection, "supporters" | "access">;

export const Route = createFileRoute("/admin/")({
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    await requireAdminPageAccess(
      getAdminAreaForLocation({ pathname: "/admin", section: search.section }),
    );
  },
  component: AdminDashboard,
});

function AdminDashboard() {
  const { section } = Route.useSearch();

  return (
    <AdminLayout activeSection={section}>
      <AdminDashboardContent section={section} />
    </AdminLayout>
  );
}

function AdminDashboardContent({ section }: { section: DashboardSection }) {
  const queryClient = useQueryClient();
  const { copy } = useAdminLanguage();
  const [sponsorView, setSponsorView] = useState<"animals" | "pledges">("animals");

  const showAnimalsTable =
    section !== "applications" &&
    section !== "payments" &&
    (section !== "sponsor" || sponsorView === "animals");

  const { data: animals = [], isLoading } = useQuery({
    queryKey: ["admin-animals", section],
    queryFn: async () => {
      if (section === "applications" || section === "payments") return [];
      const { data, error } = await supabase
        .from("animals")
        .select("*")
        .eq("type", section)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: showAnimalsTable,
  });

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{copy.dashboard.title[section]}</h1>
        {section === "payments" ? (
          <Link
            to="/admin/supporters"
            className="rounded border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-panel)] hover:bg-[var(--color-primary-highlight)]"
          >
            {copy.dashboard.supporters}
          </Link>
        ) : section === "sponsor" ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSponsorView("animals")}
              className={
                sponsorView === "animals"
                  ? "rounded border border-[var(--color-panel)] bg-[var(--color-panel)] px-3 py-2 text-sm font-medium text-white"
                  : "rounded border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-panel)] hover:bg-[var(--color-primary-highlight)]"
              }
            >
              {copy.dashboard.sponsorViewAnimals}
            </button>
            <button
              type="button"
              onClick={() => setSponsorView("pledges")}
              className={
                sponsorView === "pledges"
                  ? "rounded border border-[var(--color-panel)] bg-[var(--color-panel)] px-3 py-2 text-sm font-medium text-white"
                  : "rounded border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-panel)] hover:bg-[var(--color-primary-highlight)]"
              }
            >
              {copy.dashboard.sponsorViewPledges}
            </button>
          </div>
        ) : section !== "applications" ? (
          <Link
            to="/admin/animals/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
          >
            + {copy.dashboard.addNew}
          </Link>
        ) : null}
      </div>

      {section === "payments" ? (
        <PaymentsReconcile />
      ) : section === "applications" ? (
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="text-lg font-semibold text-[var(--color-panel)]">
            {copy.dashboard.applicationsMovedTitle}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">
            {copy.dashboard.applicationsMovedDescription}
          </p>
          <Link
            to="/admin/applications"
            className="mt-4 inline-flex items-center rounded border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-panel)] hover:bg-[var(--color-primary-highlight)]"
          >
            {copy.dashboard.openAdoptionCases}
          </Link>
        </section>
      ) : section === "sponsor" && sponsorView === "pledges" ? (
        <PledgeReviewLane />
      ) : isLoading ? (
        <div className="py-12 text-center text-gray-400">{copy.common.loading}</div>
      ) : (
        <AnimalsTable
          animals={animals}
          onDeleted={() => queryClient.invalidateQueries({ queryKey: ["admin-animals", section] })}
        />
      )}
    </div>
  );
}
