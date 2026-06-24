import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";

import type { ConsentStatus } from "../../../lib/crm/types";
import { Button } from "../../ui/button";
import { Switch } from "../../ui/switch";
import { fetchAdminJson } from "./api";

type ConsentEditorProps = {
  supporterId: string;
  emailConsent: ConsentStatus | null;
  whatsappConsent: ConsentStatus | null;
};

export function ConsentEditor({ supporterId, emailConsent, whatsappConsent }: ConsentEditorProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(emailConsent === "opt_in");
  const [whatsapp, setWhatsapp] = useState(whatsappConsent === "opt_in");

  useEffect(() => {
    setEmail(emailConsent === "opt_in");
    setWhatsapp(whatsappConsent === "opt_in");
  }, [emailConsent, whatsappConsent]);

  const mutation = useMutation({
    mutationFn: () =>
      fetchAdminJson(`/api/admin/supporters/${supporterId}/consents`, {
        method: "POST",
        body: JSON.stringify({
          source: "admin_manual",
          email,
          whatsapp,
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
          <h2 className="text-lg font-semibold text-[var(--color-panel)]">Consent</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Update opt-in status for supporter communications.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          aria-label="Save consent preferences"
        >
          <Save className="h-4 w-4" />
          Save
        </Button>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-4 rounded-md border border-[var(--color-border)] p-3">
          <span>
            <span className="block text-sm font-medium text-[var(--color-panel)]">Email</span>
            <span className="block text-xs text-[var(--color-text-muted)]">Receipt updates</span>
          </span>
          <Switch checked={email} onCheckedChange={setEmail} aria-label="Email consent opt-in" />
        </label>
        <label className="flex items-center justify-between gap-4 rounded-md border border-[var(--color-border)] p-3">
          <span>
            <span className="block text-sm font-medium text-[var(--color-panel)]">WhatsApp</span>
            <span className="block text-xs text-[var(--color-text-muted)]">Payment updates</span>
          </span>
          <Switch
            checked={whatsapp}
            onCheckedChange={setWhatsapp}
            aria-label="WhatsApp consent opt-in"
          />
        </label>
      </div>
      {mutation.error && (
        <p className="mt-3 text-sm text-[var(--color-destructive)]">{mutation.error.message}</p>
      )}
    </div>
  );
}
