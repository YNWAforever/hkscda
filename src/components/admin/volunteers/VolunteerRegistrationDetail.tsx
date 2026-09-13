import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { fetchAdminJson } from "../../../lib/admin/http";
import type { VolunteerRegistrationDetail as VolunteerRegistrationDetailType } from "../../../lib/volunteers/types";
import { LoadFailure } from "../LoadFailure";
import {
  attendanceStatusLabels,
  registrationStatusLabels,
  registrationTypeLabels,
} from "./volunteerAdminLogic";

type RegistrationResponse = {
  registration: VolunteerRegistrationDetailType;
};

export function RegistrationProfileLink({ profileId }: { profileId?: string | null }) {
  return (
    <a
      className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-primary)] underline"
      href={
        profileId
          ? `/admin/volunteers/people/${encodeURIComponent(profileId)}`
          : "/admin/volunteers/qualifications"
      }
    >
      {profileId ? "查看義工個人詳情" : "身份未連結：前往舊報名身份核對"}
    </a>
  );
}

export function VolunteerRegistrationDetail({ registrationId }: { registrationId: string }) {
  const queryClient = useQueryClient();
  const [correctionReason, setCorrectionReason] = useState("");
  const [isCorrection, setIsCorrection] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["volunteer-registration", registrationId],
    queryFn: () =>
      fetchAdminJson<RegistrationResponse>(`/api/admin/volunteers/registrations/${registrationId}`),
  });

  const updateStatus = useMutation({
    mutationFn: (status: string) =>
      fetchAdminJson(`/api/admin/volunteers/registrations/${registrationId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, expectedUpdatedAt: data?.registration.updatedAt }),
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["volunteer-registration"] });
      void queryClient.invalidateQueries({ queryKey: ["volunteer-activities"] });
      void queryClient.invalidateQueries({ queryKey: ["volunteer-directory"] });
      void queryClient.invalidateQueries({ queryKey: ["volunteer-overview"] });
    },
  });

  const updateAttendance = useMutation({
    mutationFn: (attendanceStatus: string) =>
      fetchAdminJson(`/api/admin/volunteers/registrations/${registrationId}/attendance`, {
        method: "PATCH",
        body: JSON.stringify({
          attendanceStatus,
          expectedUpdatedAt: data?.registration.updatedAt,
          command: isCorrection ? "correct" : "record",
          reason: isCorrection ? correctionReason : undefined,
        }),
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["volunteer-registration"] });
      void queryClient.invalidateQueries({ queryKey: ["volunteer-activities"] });
      void queryClient.invalidateQueries({ queryKey: ["volunteer-directory"] });
      void queryClient.invalidateQueries({ queryKey: ["volunteer-overview"] });
    },
  });

  if (isLoading) return <div className="p-6 text-sm text-[var(--color-text-muted)]">載入中...</div>;
  if (error) {
    return (
      <div className="p-6">
        <LoadFailure error={error} onRetry={() => void refetch()} />
      </div>
    );
  }
  if (!data?.registration) {
    return <div className="p-6 text-sm text-[var(--color-primary)]">找不到義工報名。</div>;
  }

  const registration = data.registration;

  return (
    <div className="space-y-5 p-6">
      <Link
        to="/admin/volunteers/activities"
        className="text-sm font-semibold text-[var(--color-primary)]"
      >
        返回義工管理
      </Link>
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-panel)]">
              {registration.contactName}
            </h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              {registration.contactEmail} · {registration.contactPhone}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-bold text-[var(--color-panel)]">
              {registrationStatusLabels[registration.status]}
            </p>
            <p className="text-[var(--color-text-muted)]">
              出席：{attendanceStatusLabels[registration.attendanceStatus]}
            </p>
          </div>
        </div>

        <RegistrationProfileLink profileId={registration.profileId} />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <DetailItem label="活動" value={registration.activity.title} />
          <DetailItem
            label="日期"
            value={new Date(registration.activity.startsAt).toLocaleString("zh-HK", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          />
          <DetailItem label="人數" value={String(registration.participantCount)} />
          <DetailItem label="類型" value={registrationTypeLabels[registration.registrationType]} />
          <DetailItem label="團體" value={registration.organizationName ?? "-"} />
          <DetailItem
            label="年齡"
            value={String(registration.declaredAge ?? registration.youngestAge ?? "-")}
          />
          <DetailItem label="負責成人" value={registration.guardianName ?? "-"} />
          <DetailItem label="義工時數" value={String(registration.volunteerHours ?? "-")} />
          <DetailItem label="備註" value={registration.notes ?? "-"} />
        </div>

        {updateStatus.error && (
          <p role="alert" className="mt-4 text-sm text-[var(--color-error)]">
            {updateStatus.error.message}
          </p>
        )}
        {updateAttendance.error && (
          <p role="alert" className="mt-4 text-sm text-[var(--color-error)]">
            {updateAttendance.error.message}
          </p>
        )}
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isCorrection}
            onChange={(event) => setIsCorrection(event.target.checked)}
          />
          更正出席事實（保留原紀錄）
        </label>
        {isCorrection && (
          <label className="mt-3 block text-sm">
            更正原因
            <textarea
              value={correctionReason}
              onChange={(event) => setCorrectionReason(event.target.value)}
              maxLength={2000}
              required
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] p-2"
            />
          </label>
        )}
        <DetailItem label="剩餘名額" value={String(registration.activity.remainingCapacity)} />
        <div className="mt-5 flex flex-wrap gap-2">
          {["approved", "waitlisted", "rejected", "cancelled"].map((status) => (
            <button
              key={status}
              type="button"
              disabled={updateStatus.isPending}
              onClick={() => updateStatus.mutate(status)}
              className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium"
            >
              {status}
            </button>
          ))}
          {(isCorrection
            ? ["not_marked", "attended", "completed", "no_show"]
            : ["attended", "completed", "no_show"]
          ).map((attendanceStatus) => (
            <button
              key={attendanceStatus}
              type="button"
              disabled={
                updateAttendance.isPending ||
                updateStatus.isPending ||
                (isCorrection && !correctionReason.trim())
              }
              onClick={() => updateAttendance.mutate(attendanceStatus)}
              className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium"
            >
              {attendanceStatus}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--color-panel)]">{value}</p>
    </div>
  );
}
