import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { AnimalsTable } from "../../components/admin/AnimalsTable";

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

type ApplicationRow = {
  id: string;
  applicant_name: string;
  animal_name: string;
  phone: string;
  created_at: string;
  status: string;
};

type PaymentRow = {
  id: string;
  provider: string;
  provider_ref: string | null;
  amount_cents: number;
  status: string;
  received_at: string | null;
  bank_reference: string | null;
  created_at: string;
  donation: {
    id: string;
    purpose: string;
    receipt_requested: boolean;
    status: string;
    supporter: {
      name: string;
      email: string;
      phone: string | null;
    };
  };
};

async function fetchAdminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("未登入");

  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.access_token}`,
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error("API request failed");
  return response.json() as Promise<T>;
}

function formatHkd(amountCents: number) {
  return new Intl.NumberFormat("zh-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

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

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<PaymentRow[]>({
    queryKey: ["admin-payments"],
    queryFn: async () => {
      const data = await fetchAdminJson<{ payments: PaymentRow[] }>("/api/admin/payments");
      return data.payments;
    },
    enabled: section === "payments",
  });

  async function reconcilePayment(paymentId: string) {
    const bankReference = window.prompt("請輸入銀行 / PayMe / FPS 參考編號");
    if (!bankReference) return;
    await fetchAdminJson(`/api/admin/payments/${paymentId}/reconcile`, {
      method: "POST",
      body: JSON.stringify({ bankReference }),
    });
    queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
  }

  async function issueReceipt(donationId: string) {
    await fetchAdminJson("/api/admin/receipts", {
      method: "POST",
      body: JSON.stringify({ donationId }),
    });
    queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
  }

  return (
    <AdminLayout activeSection={section as "cat" | "dog" | "sponsor" | "applications" | "payments"}>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{sectionLabels[section]}</h1>
          {section !== "applications" && section !== "payments" && (
            <Link
              to="/admin/animals/new"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
            >
              + 新增
            </Link>
          )}
        </div>

        {section === "payments" ? (
          paymentsLoading ? (
            <div className="text-center py-12 text-gray-400">載入中…</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-600 text-xs uppercase">
                    <th className="text-left p-3">捐款人</th>
                    <th className="text-left p-3">方式</th>
                    <th className="text-left p-3">金額</th>
                    <th className="text-left p-3">用途</th>
                    <th className="text-left p-3">參考</th>
                    <th className="text-left p-3">狀態</th>
                    <th className="text-left p-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-gray-100">
                      <td className="p-3">
                        <div className="font-medium">{payment.donation.supporter.name}</div>
                        <div className="text-xs text-gray-500">
                          {payment.donation.supporter.email}
                        </div>
                      </td>
                      <td className="p-3 uppercase">{payment.provider}</td>
                      <td className="p-3 font-medium">{formatHkd(payment.amount_cents)}</td>
                      <td className="p-3">{payment.donation.purpose}</td>
                      <td className="p-3">
                        <div>{payment.provider_ref ?? "—"}</div>
                        {payment.bank_reference && (
                          <div className="text-xs text-gray-500">{payment.bank_reference}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-bold ${
                            payment.status === "succeeded"
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {payment.status === "succeeded" ? "已確認" : "待確認"}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          {payment.status !== "succeeded" &&
                            ["fps", "payme", "manual"].includes(payment.provider) && (
                              <button
                                onClick={() => reconcilePayment(payment.id)}
                                className="rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                              >
                                標記已收款
                              </button>
                            )}
                          {payment.status === "succeeded" && payment.donation.receipt_requested && (
                            <button
                              onClick={() => issueReceipt(payment.donation.id)}
                              className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
                            >
                              補發收條
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : section === "applications" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-gray-600 text-xs uppercase">
                  <th className="text-left p-3">申請人</th>
                  <th className="text-left p-3">動物</th>
                  <th className="text-left p-3">電話</th>
                  <th className="text-left p-3">日期</th>
                  <th className="text-left p-3">狀態</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr key={app.id} className="border-b border-gray-100">
                    <td className="p-3">{app.applicant_name}</td>
                    <td className="p-3">{app.animal_name}</td>
                    <td className="p-3">{app.phone}</td>
                    <td className="p-3">{new Date(app.created_at).toLocaleDateString("zh-HK")}</td>
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
                        className="border border-gray-300 rounded text-xs px-2 py-1"
                      >
                        <option value="pending">待處理</option>
                        <option value="approved">已批准</option>
                        <option value="rejected">已拒絕</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
