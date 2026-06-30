import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { AnimalsTable } from "../../components/admin/AnimalsTable";
import { useAdminLanguage } from "../../components/admin/adminI18n";

const searchSchema = z.object({
  section: z.enum(["cat", "dog", "sponsor", "applications"]).catch("cat"),
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

type ApplicationRow = {
  id: string;
  applicant_name: string;
  animal_name: string;
  phone: string;
  created_at: string;
  status: string;
};

type AdminSection = "cat" | "dog" | "sponsor" | "applications";

function AdminDashboard() {
  const { section } = Route.useSearch();

  return (
    <AdminLayout activeSection={section as AdminSection}>
      <AdminDashboardContent section={section as AdminSection} />
    </AdminLayout>
  );
}

function AdminDashboardContent({ section }: { section: AdminSection }) {
  const queryClient = useQueryClient();
  const { copy, language } = useAdminLanguage();

  const selectClassName =
    "rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] shadow-sm focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-highlight)]";
  const optionStyle = {
    backgroundColor: "var(--color-surface)",
    color: "var(--color-text)",
  };

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
    enabled: section !== "applications",
  });

  const { data: applications = [] } = useQuery<ApplicationRow[]>({
    queryKey: ["admin-applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("adoption_applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: section === "applications",
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{copy.dashboard.title[section]}</h1>
        {section !== "applications" && (
          <Link
            to="/admin/animals/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
          >
            + {copy.dashboard.addNew}
          </Link>
        )}
      </div>

      {section === "applications" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-xs uppercase">
                <th className="text-left p-3">{copy.dashboard.applicant}</th>
                <th className="text-left p-3">{copy.dashboard.animal}</th>
                <th className="text-left p-3">{copy.dashboard.phone}</th>
                <th className="text-left p-3">{copy.dashboard.date}</th>
                <th className="text-left p-3">{copy.dashboard.status}</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app.id} className="border-b border-gray-100">
                  <td className="p-3">{app.applicant_name}</td>
                  <td className="p-3">{app.animal_name}</td>
                  <td className="p-3">{app.phone}</td>
                  <td className="p-3">
                    {new Date(app.created_at).toLocaleDateString(
                      language === "zh" ? "zh-HK" : "en-HK",
                    )}
                  </td>
                  <td className="p-3">
                    <select
                      defaultValue={app.status}
                      onChange={async (e) => {
                        await supabase
                          .from("adoption_applications")
                          .update({ status: e.target.value })
                          .eq("id", app.id);
                        queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
                      }}
                      className={selectClassName}
                    >
                      <option value="pending" style={optionStyle}>
                        {copy.applicationStatus.pending}
                      </option>
                      <option value="approved" style={optionStyle}>
                        {copy.applicationStatus.approved}
                      </option>
                      <option value="rejected" style={optionStyle}>
                        {copy.applicationStatus.rejected}
                      </option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : isLoading ? (
        <div className="text-center py-12 text-gray-400">{copy.common.loading}</div>
      ) : (
        <AnimalsTable
          animals={animals}
          onDeleted={() => queryClient.invalidateQueries({ queryKey: ["admin-animals", section] })}
        />
      )}
    </div>
  );
}
