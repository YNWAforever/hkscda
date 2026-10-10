import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";

import { adminErrorMessage } from "../../../lib/admin/session";
import type { ConsentStatus } from "../../../lib/crm/types";
import { Button } from "../../ui/button";
import { consentChanges } from "../../../lib/crm/consentChanges";
import { useAdminPageCopy } from "../adminPageCopy";
import { useAdminCopy } from "../i18n/copy";
import { fetchAdminJson } from "./api";
import { consentEditorCopy } from "./profileCopy";

type ConsentEditorProps = {
  supporterId: string;
  emailConsent: ConsentStatus | null;
  whatsappConsent: ConsentStatus | null;
};

export function ConsentEditor({ supporterId, emailConsent, whatsappConsent }: ConsentEditorProps) {
  const { language } = useAdminPageCopy();
  const copy = useAdminCopy(consentEditorCopy);
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<ConsentStatus | null>(emailConsent);
  const [whatsapp, setWhatsapp] = useState<ConsentStatus | null>(whatsappConsent);

  useEffect(() => {
    setEmail(emailConsent);
    setWhatsapp(whatsappConsent);
  }, [emailConsent, whatsappConsent]);

  const changes = consentChanges(
    { email: emailConsent, whatsapp: whatsappConsent },
    { email, whatsapp },
  );
  const mutation = useMutation({
    mutationFn: () =>
      fetchAdminJson(`/api/admin/supporters/${supporterId}/consents`, {
        method: "PATCH",
        body: JSON.stringify({
          source: "admin_manual",
          ...changes,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-supporter", supporterId] });
    },
  });

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-panel)]">{copy.title}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">{copy.subtitle}</p>
        </div>
        <Button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || Object.keys(changes).length === 0}
          aria-label={copy.saveAria}
        >
          <Save className="h-4 w-4" />
          {copy.save}
        </Button>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-4 rounded-md border border-[var(--color-border)] p-3">
          <span>
            <span className="block text-sm font-medium text-[var(--color-panel)]">
              {copy.email}
            </span>
            <span className="block text-xs text-[var(--color-text-muted)]">
              {copy.emailDescription}
            </span>
          </span>
          <select
            className="rounded border p-2"
            value={email ?? "unknown"}
            onChange={(e) =>
              setEmail(e.target.value === "unknown" ? null : (e.target.value as ConsentStatus))
            }
            aria-label={copy.emailAria}
          >
            <option value="unknown" disabled={emailConsent !== null}>
              {copy.notSet}
            </option>
            <option value="opt_in">{copy.optIn}</option>
            <option value="opt_out">{copy.optOut}</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-4 rounded-md border border-[var(--color-border)] p-3">
          <span>
            <span className="block text-sm font-medium text-[var(--color-panel)]">
              {copy.whatsapp}
            </span>
            <span className="block text-xs text-[var(--color-text-muted)]">
              {copy.whatsappDescription}
            </span>
          </span>
          <select
            className="rounded border p-2"
            value={whatsapp ?? "unknown"}
            onChange={(e) =>
              setWhatsapp(e.target.value === "unknown" ? null : (e.target.value as ConsentStatus))
            }
            aria-label={copy.whatsappAria}
          >
            <option value="unknown" disabled={whatsappConsent !== null}>
              {copy.notSet}
            </option>
            <option value="opt_in">{copy.optIn}</option>
            <option value="opt_out">{copy.optOut}</option>
          </select>
        </label>
      </div>
      {mutation.error && (
        <p role="alert" className="mt-3 text-sm text-[var(--color-destructive)]">
          {adminErrorMessage(mutation.error, language)}
        </p>
      )}
    </div>
  );
}
