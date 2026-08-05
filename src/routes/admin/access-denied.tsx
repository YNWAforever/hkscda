import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { useAdminLanguage } from "../../components/admin/adminI18n";
import {
  adminIdentityQueryOptions,
  firstAllowedAdminRouteForIdentity,
  requireSignedInAdminIdentity,
} from "../../lib/admin/pageAccess";

const deniedCopy = {
  zh: {
    title: "沒有權限",
    reason: "你的管理員角色未能開啟此頁面。",
    back: "返回可用管理頁面",
  },
  en: {
    title: "Access denied",
    reason: "Your admin role does not have access to this page.",
    back: "Back to an available admin area",
  },
} as const;

export const Route = createFileRoute("/admin/access-denied")({
  beforeLoad: async ({ context }) => {
    await requireSignedInAdminIdentity(context.queryClient);
  },
  component: AdminAccessDeniedPage,
});

function AdminAccessDeniedPage() {
  return (
    <AdminLayout activeSection="access">
      <AccessDeniedContent />
    </AdminLayout>
  );
}

function AccessDeniedContent() {
  const { language } = useAdminLanguage();
  const t = deniedCopy[language];
  const { data } = useQuery(adminIdentityQueryOptions());
  const backHref = firstAllowedAdminRouteForIdentity(data?.admin);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <section className="w-full max-w-lg rounded-lg border border-[var(--color-border)] bg-white p-6 text-center">
        <h1 className="text-xl font-bold text-[var(--color-panel)]">{t.title}</h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t.reason}</p>
        <a
          href={backHref}
          className="mt-5 inline-flex rounded-md bg-[var(--color-panel)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-panel-2)]"
        >
          {t.back}
        </a>
      </section>
    </div>
  );
}
