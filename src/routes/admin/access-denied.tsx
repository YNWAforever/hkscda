import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { useAdminCopy } from "../../components/admin/i18n/copy";
import {
  adminIdentityQueryOptions,
  firstAllowedAdminRouteForIdentity,
  requireSignedInAdminIdentity,
} from "../../lib/admin/pageAccess";
import { accessDeniedCopy } from "./-accessDeniedCopy";

export const Route = createFileRoute("/admin/access-denied")({
  ssr: false,
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

export function AccessDeniedContent() {
  const t = useAdminCopy(accessDeniedCopy);
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
