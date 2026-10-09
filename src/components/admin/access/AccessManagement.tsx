import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus, RefreshCw } from "lucide-react";
import { useState } from "react";

import type { AdminRole, AdminStatus } from "../../../lib/admin/access";
import { fetchAdminJson } from "../../../lib/admin/http";
import { adminErrorMessage } from "../../../lib/admin/session";
import { ADMIN_IDENTITY_QUERY_KEY, adminIdentityQueryOptions } from "../../../lib/admin/pageAccess";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { DataTable, type DataTableColumn } from "../DataTable";
import { LoadFailure, StatFigure } from "../LoadFailure";
import { StatusPill, type StatusTone } from "../StatusBadge";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { accessCopy } from "./copy";

type AdminAccessUser = {
  id: string;
  authUserId: string;
  email: string;
  role: AdminRole;
  status: AdminStatus;
  invitedAt: string | null;
  inviteSentAt: string | null;
  inviteAcceptedAt: string | null;
  lastInvitedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type AccessUsersResponse = {
  users: AdminAccessUser[];
  summary: { active: number; pending: number; disabled: number };
};

type AccessAuditRow = {
  id: string;
  actorUserId: string | null;
  action: string;
  entityId: string;
  detail: Record<string, unknown>;
  timestamp: string;
};

type AccessAuditResponse = {
  audit: AccessAuditRow[];
  hasMore: boolean;
};

const roles: AdminRole[] = ["staff", "treasurer", "admin"];

function statusTone(status: AdminStatus): StatusTone {
  if (status === "active") return "success";
  if (status === "pending") return "warning";
  return "neutral";
}

function actionLabel(action: string, labels: Record<string, string>) {
  return labels[action] ?? action;
}

export function AccessManagement() {
  const { language } = useAdminLanguage();
  const t = pickAdminCopy(accessCopy, language);
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AdminRole>("staff");
  const [error, setError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["admin-access-users"],
    queryFn: () => fetchAdminJson<AccessUsersResponse>("/api/admin/access/users"),
  });
  const [auditPage, setAuditPage] = useState(1);
  const auditQuery = useQuery({
    queryKey: ["admin-access-audit", auditPage],
    queryFn: () => fetchAdminJson<AccessAuditResponse>(`/api/admin/access/audit?page=${auditPage}`),
  });
  const meQuery = useQuery(adminIdentityQueryOptions());

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-access-users"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-access-audit"] }),
      queryClient.invalidateQueries({ queryKey: ADMIN_IDENTITY_QUERY_KEY }),
    ]);
  };

  const inviteMutation = useMutation({
    mutationFn: () =>
      fetchAdminJson("/api/admin/access/invites", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      }),
    onSuccess: async () => {
      setInviteEmail("");
      setInviteRole("staff");
      setInviteOpen(false);
      setError(null);
      await invalidate();
    },
    onError: (mutationError) =>
      setError(adminErrorMessage(mutationError, language) ?? t.genericError),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<Pick<AdminAccessUser, "role" | "status">>;
    }) =>
      fetchAdminJson(`/api/admin/access/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
    onError: (mutationError) =>
      setError(adminErrorMessage(mutationError, language) ?? t.genericError),
  });

  const resendMutation = useMutation({
    mutationFn: (id: string) =>
      fetchAdminJson(`/api/admin/access/invites/${encodeURIComponent(id)}/resend`, {
        method: "POST",
      }),
    onSuccess: invalidate,
    onError: (mutationError) =>
      setError(adminErrorMessage(mutationError, language) ?? t.genericError),
  });

  const users = usersQuery.data?.users ?? [];
  const summary = usersQuery.data?.summary ?? { active: 0, pending: 0, disabled: 0 };
  const currentAuthUserId = meQuery.data?.admin.authUserId;

  const columns: DataTableColumn<AdminAccessUser>[] = [
    {
      id: "email",
      header: t.email,
      cell: (user) => (
        <div className="space-y-1">
          <div className="font-medium text-[var(--color-panel)]">{user.email}</div>
          {user.authUserId === currentAuthUserId && (
            <div className="text-xs text-[var(--color-text-muted)]">{t.currentUser}</div>
          )}
        </div>
      ),
    },
    {
      id: "role",
      header: t.role,
      cell: (user) => (
        <Select
          value={user.role}
          onValueChange={(role) =>
            updateMutation.mutate({ id: user.id, input: { role: role as AdminRole } })
          }
        >
          <SelectTrigger className="w-36" aria-label={`${t.role}: ${user.email}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((role) => (
              <SelectItem key={role} value={role}>
                {t.roles[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      id: "status",
      header: t.status,
      cell: (user) => (
        <StatusPill tone={statusTone(user.status)}>
          {user.status === "active" ? t.active : user.status === "pending" ? t.pending : t.disabled}
        </StatusPill>
      ),
    },
    {
      id: "invited",
      header: t.invited,
      cell: (user) => t.dateTime(user.inviteSentAt ?? user.invitedAt),
    },
    {
      id: "updated",
      header: t.updated,
      cell: (user) => t.dateTime(user.updatedAt),
    },
    {
      id: "actions",
      header: t.actions,
      cell: (user) => (
        <div className="flex flex-wrap justify-end gap-2">
          {user.status === "pending" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => resendMutation.mutate(user.id)}
            >
              <RefreshCw aria-hidden />
              {t.resend}
            </Button>
          )}
          {user.status === "disabled" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => updateMutation.mutate({ id: user.id, input: { status: "active" } })}
            >
              {t.reactivate}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={user.authUserId === currentAuthUserId}
              onClick={() => updateMutation.mutate({ id: user.id, input: { status: "disabled" } })}
            >
              {t.disable}
            </Button>
          )}
        </div>
      ),
      align: "right",
    },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-panel)]">{t.title}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t.subtitle}</p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button type="button">
              <MailPlus aria-hidden />
              {t.invite}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t.invite}</DialogTitle>
              <DialogDescription>{t.inviteDescription}</DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                inviteMutation.mutate();
              }}
            >
              <label className="block space-y-1 text-sm font-medium text-[var(--color-panel)]">
                <span>{t.email}</span>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1 text-sm font-medium text-[var(--color-panel)]">
                <span>{t.role}</span>
                <Select
                  value={inviteRole}
                  onValueChange={(role) => setInviteRole(role as AdminRole)}
                >
                  <SelectTrigger aria-label={t.role}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {t.roles[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <DialogFooter>
                <Button type="submit" disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? t.sending : t.submitInvite}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="rounded-md border border-[var(--color-error)] bg-white px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {[
          [t.activeAdmins, summary.active],
          [t.pendingInvites, summary.pending],
          [t.disabledUsers, summary.disabled],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-[var(--color-border)] bg-white p-4">
            <div className="text-sm text-[var(--color-text-muted)]">{label}</div>
            {/* An access page reporting "0 active admins, 0 pending invites"
                during an outage is a misleading answer to a security question,
                so a failed load shows the unavailable marker instead. */}
            <div className="mt-2 text-2xl font-bold text-[var(--color-panel)]">
              <StatFigure
                value={value}
                failed={usersQuery.isError}
                loading={usersQuery.isLoading}
              />
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-[var(--color-border)] bg-white">
        <DataTable
          columns={columns}
          rows={users}
          getRowKey={(user) => user.id}
          loading={usersQuery.isLoading}
          empty={t.noUsers}
          error={usersQuery.error}
          onRetry={() => void usersQuery.refetch()}
        />
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <h2 className="text-base font-semibold text-[var(--color-panel)]">{t.audit}</h2>
        {auditQuery.error && (
          <LoadFailure
            error={auditQuery.error}
            onRetry={() => void auditQuery.refetch()}
            title={t.auditLoadError}
          />
        )}
        <nav aria-label={t.auditPagerLabel} className="flex gap-3">
          <button
            disabled={auditPage === 1 || auditQuery.isFetching}
            onClick={() => setAuditPage((page) => page - 1)}
          >
            {t.previous}
          </button>
          <span>{t.auditPage(auditPage)}</span>
          <button
            disabled={!auditQuery.data?.hasMore || auditQuery.isFetching}
            onClick={() => setAuditPage((page) => page + 1)}
          >
            {t.next}
          </button>
        </nav>
        <div className="mt-3 space-y-2">
          {(auditQuery.data?.audit ?? []).length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t.noAudit}</p>
          ) : (
            auditQuery.data!.audit.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-1 rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium text-[var(--color-panel)]">
                  {actionLabel(row.action, t.actionLabels)}
                </span>
                <span className="text-[var(--color-text-muted)]">
                  {String(row.detail.targetEmail ?? row.entityId)} · {t.dateTime(row.timestamp)}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
