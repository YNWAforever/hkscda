import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus, RefreshCw } from "lucide-react";
import { useState } from "react";

import type { AdminRole, AdminStatus } from "../../../lib/admin/access";
import { fetchAdminJson } from "../../../lib/admin/http";
import { ADMIN_IDENTITY_QUERY_KEY, adminIdentityQueryOptions } from "../../../lib/admin/pageAccess";
import { Badge } from "../../ui/badge";
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
import { useAdminLanguage } from "../adminI18n";

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
};

const copy = {
  zh: {
    title: "權限管理",
    subtitle: "管理後台使用者、邀請及最近權限變更紀錄。",
    invite: "邀請使用者",
    inviteDescription: "Supabase 會向此電郵發送管理後台邀請。",
    email: "電郵",
    role: "角色",
    status: "狀態",
    invited: "邀請時間",
    updated: "更新時間",
    actions: "操作",
    active: "啟用",
    pending: "待接受邀請",
    disabled: "已停用",
    activeAdmins: "啟用使用者",
    pendingInvites: "待接受邀請",
    disabledUsers: "已停用使用者",
    audit: "最近紀錄",
    noAudit: "未有權限管理紀錄。",
    noUsers: "沒有管理員紀錄",
    submitInvite: "發送邀請",
    sending: "發送中...",
    resend: "重發",
    disable: "停用",
    reactivate: "重新啟用",
    currentUser: "你",
    genericError: "操作失敗，請稍後再試。",
    roles: {
      staff: "職員",
      treasurer: "司庫",
      admin: "管理員",
    },
    actionLabels: {
      "admin_user.invite": "邀請",
      "admin_user.invite_resend": "重發邀請",
      "admin_user.role_update": "更新角色",
      "admin_user.disable": "停用",
      "admin_user.reactivate": "重新啟用",
      "admin_user.activate_from_invite": "接受邀請",
      "admin_user.update": "更新",
    },
  },
  en: {
    title: "Access Management",
    subtitle: "Manage admin users, invitations, and recent access changes.",
    invite: "Invite user",
    inviteDescription: "Supabase will send an admin-panel invitation to this email.",
    email: "Email",
    role: "Role",
    status: "Status",
    invited: "Invited",
    updated: "Updated",
    actions: "Actions",
    active: "Active",
    pending: "Pending invite",
    disabled: "Disabled",
    activeAdmins: "Active users",
    pendingInvites: "Pending invites",
    disabledUsers: "Disabled users",
    audit: "Recent history",
    noAudit: "No access-management history yet.",
    noUsers: "No admin users found",
    submitInvite: "Send invite",
    sending: "Sending...",
    resend: "Resend",
    disable: "Disable",
    reactivate: "Reactivate",
    currentUser: "You",
    genericError: "The action failed. Please try again.",
    roles: {
      staff: "Staff",
      treasurer: "Treasurer",
      admin: "Admin",
    },
    actionLabels: {
      "admin_user.invite": "Invited",
      "admin_user.invite_resend": "Resent invite",
      "admin_user.role_update": "Changed role",
      "admin_user.disable": "Disabled",
      "admin_user.reactivate": "Reactivated",
      "admin_user.activate_from_invite": "Accepted invite",
      "admin_user.update": "Updated",
    },
  },
} as const;

const roles: AdminRole[] = ["staff", "treasurer", "admin"];

function formatDateTime(value: string | null, locale: "zh" | "en") {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-HK" : "en-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(value));
}

function statusTone(status: AdminStatus) {
  if (status === "active") return "bg-[var(--color-success-highlight)] text-[var(--color-success)]";
  if (status === "pending")
    return "bg-[var(--color-primary-highlight)] text-[var(--color-primary)]";
  return "bg-[var(--color-surface-offset)] text-[var(--color-text-muted)]";
}

function actionLabel(action: string, labels: Record<string, string>) {
  return labels[action] ?? action;
}

export function AccessManagement() {
  const { language } = useAdminLanguage();
  const t = copy[language];
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AdminRole>("staff");
  const [error, setError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["admin-access-users"],
    queryFn: () => fetchAdminJson<AccessUsersResponse>("/api/admin/access/users"),
  });
  const auditQuery = useQuery({
    queryKey: ["admin-access-audit"],
    queryFn: () => fetchAdminJson<AccessAuditResponse>("/api/admin/access/audit"),
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
      setError(mutationError instanceof Error ? mutationError.message : t.genericError),
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
      setError(mutationError instanceof Error ? mutationError.message : t.genericError),
  });

  const resendMutation = useMutation({
    mutationFn: (id: string) =>
      fetchAdminJson(`/api/admin/access/invites/${encodeURIComponent(id)}/resend`, {
        method: "POST",
      }),
    onSuccess: invalidate,
    onError: (mutationError) =>
      setError(mutationError instanceof Error ? mutationError.message : t.genericError),
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
          <SelectTrigger className="w-36">
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
        <Badge className={statusTone(user.status)} variant="outline">
          {user.status === "active" ? t.active : user.status === "pending" ? t.pending : t.disabled}
        </Badge>
      ),
    },
    {
      id: "invited",
      header: t.invited,
      cell: (user) => formatDateTime(user.inviteSentAt ?? user.invitedAt, language),
    },
    {
      id: "updated",
      header: t.updated,
      cell: (user) => formatDateTime(user.updatedAt, language),
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
                  <SelectTrigger>
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
            <div className="mt-2 text-2xl font-bold text-[var(--color-panel)]">{value}</div>
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
        />
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <h2 className="text-base font-semibold text-[var(--color-panel)]">{t.audit}</h2>
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
                  {String(row.detail.targetEmail ?? row.entityId)} ·{" "}
                  {formatDateTime(row.timestamp, language)}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
