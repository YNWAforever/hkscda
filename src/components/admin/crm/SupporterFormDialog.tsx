import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

import {
  supporterRoles,
  type SupporterDetail,
  type SupporterRole,
  type SupporterSummary,
} from "../../../lib/crm/types";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { adminErrorMessage } from "../../../lib/admin/session";
import { useAdminPageCopy } from "../adminPageCopy";
import { useAdminCopy } from "../i18n/copy";
import { fetchAdminJson } from "./api";
import { supporterFormCopy } from "./formCopy";
import { supporterProfileCopy } from "./profileCopy";

type SupporterFormDialogProps =
  | { mode: "create" }
  | { mode: "edit"; supporter: SupporterDetail | SupporterSummary };

type Draft = {
  name: string;
  email: string;
  phone: string;
  language: "zh-HK" | "en";
  tags: string;
  roles: SupporterRole[];
};

function emptyDraft(): Draft {
  return { name: "", email: "", phone: "", language: "zh-HK", tags: "", roles: ["donor"] };
}

function fromSupporter(supporter: SupporterDetail): Draft {
  return {
    name: supporter.name,
    email: supporter.email,
    phone: supporter.phone ?? "",
    language: supporter.language,
    tags: supporter.tags.join(", "),
    roles: supporter.roles,
  };
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function SupporterFormDialog(props: SupporterFormDialogProps) {
  const { language, pageCopy } = useAdminPageCopy();
  const copy = pageCopy.supporters;
  const formCopy = useAdminCopy(supporterFormCopy);
  const languageNames = useAdminCopy(supporterProfileCopy).languages;
  const queryClient = useQueryClient();
  const supporterId = props.mode === "edit" ? props.supporter.id : null;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [baseline, setBaseline] = useState<Draft>(emptyDraft);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [editVersion, setEditVersion] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const ready = open && loadedId === (supporterId ?? "create") && !loading && !loadError;
  const dirty = ready && JSON.stringify(draft) !== JSON.stringify(baseline);
  const roleLabels = copy.roleLabels as Record<SupporterRole, string>;

  useEffect(() => {
    if (!open) return;
    if (!supporterId) {
      const blank = emptyDraft();
      setDraft(blank);
      setBaseline(blank);
      setEditVersion(null);
      setLoadedId("create");
      setLoading(false);
      setLoadError(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setLoadError(false);
    setLoadedId(null);
    void fetchAdminJson<{ supporter: SupporterDetail }>("/api/admin/supporters/" + supporterId, {
      signal: controller.signal,
    })
      .then(({ supporter }) => {
        if (!active) return;
        if (!Number.isSafeInteger(supporter.editVersion) || supporter.editVersion < 1)
          throw new Error("Supporter edit version is missing");
        const next = fromSupporter(supporter);
        setDraft(next);
        setBaseline(next);
        setEditVersion(supporter.editVersion);
        setLoadedId(supporterId);
      })
      .catch(() => {
        if (active) {
          setEditVersion(null);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [open, supporterId, reloadToken]);

  function toggleRole(role: SupporterRole, checked: boolean) {
    setDraft((current) => {
      if (checked)
        return {
          ...current,
          roles: current.roles.includes(role) ? current.roles : [...current.roles, role],
        };
      const next = current.roles.filter((currentRole) => currentRole !== role);
      return { ...current, roles: next.length > 0 ? next : current.roles };
    });
  }

  const mutation = useMutation({
    mutationFn: () => {
      if (props.mode === "create") {
        return fetchAdminJson("/api/admin/supporters", {
          method: "POST",
          body: JSON.stringify({
            name: draft.name,
            email: draft.email,
            phone: draft.phone,
            language: draft.language,
            tags: splitTags(draft.tags),
            roles: draft.roles,
            source: "admin_manual",
          }),
        });
      }
      if (editVersion === null) throw new Error("Supporter has not loaded");
      return fetchAdminJson("/api/admin/supporters/" + props.supporter.id, {
        method: "PATCH",
        body: JSON.stringify({
          name: draft.name,
          phone: draft.phone,
          language: draft.language,
          tags: splitTags(draft.tags),
          roles: draft.roles,
          expectedVersion: editVersion,
          deleted: false,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-supporters"] });
      if (props.mode === "edit") {
        queryClient.invalidateQueries({ queryKey: ["crm-supporter", props.supporter.id] });
      }
      setDiscardPrompt(false);
      setOpen(false);
    },
  });

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      mutation.reset();
      setDiscardPrompt(false);
      setLoadedId(null);
      setOpen(true);
      return;
    }
    if (mutation.isPending) return;
    if (dirty) {
      setDiscardPrompt(true);
      return;
    }
    mutation.reset();
    setOpen(false);
  }

  const conflict =
    mutation.error &&
    typeof mutation.error === "object" &&
    "status" in mutation.error &&
    mutation.error.status === 409;

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={props.mode === "edit" ? "outline" : "default"}>
          {props.mode === "edit" ? <Edit className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          {props.mode === "edit" ? copy.editSupporter : copy.newSupporter}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {props.mode === "edit" ? copy.editSupporter : copy.newSupporter}
          </DialogTitle>
        </DialogHeader>
        {loading || (open && !ready && !loadError) ? (
          <p role="status" className="text-sm text-[var(--color-text-muted)]">
            {formCopy.loadingLatest}
          </p>
        ) : null}
        {loadError ? (
          <div role="alert" className="space-y-2 text-sm text-[var(--color-destructive)]">
            <p>{copy.loadSupporterError}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReloadToken((value) => value + 1)}
            >
              {formCopy.retry}
            </Button>
          </div>
        ) : null}
        {ready ? (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="supporter-name">{copy.form.name}</Label>
              <Input
                id="supporter-name"
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supporter-email">{copy.form.email}</Label>
              <Input
                id="supporter-email"
                value={draft.email}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, email: event.target.value }))
                }
                disabled={props.mode === "edit"}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supporter-phone">{copy.form.phone}</Label>
              <Input
                id="supporter-phone"
                value={draft.phone}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, phone: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supporter-language">{copy.form.language}</Label>
              <Select
                value={draft.language}
                onValueChange={(value) =>
                  setDraft((current) => ({ ...current, language: value as "zh-HK" | "en" }))
                }
              >
                <SelectTrigger id="supporter-language" aria-label={copy.form.language}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh-HK">{languageNames["zh-HK"]}</SelectItem>
                  <SelectItem value="en">{languageNames.en}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supporter-tags">{copy.form.tags}</Label>
              <Input
                id="supporter-tags"
                value={draft.tags}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, tags: event.target.value }))
                }
              />
            </div>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium text-[var(--color-panel)]">
                {copy.form.roles}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {supporterRoles.map((role) => (
                  <label
                    key={role}
                    htmlFor={"supporter-role-" + props.mode + "-" + role}
                    className="flex min-h-11 items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
                  >
                    <Checkbox
                      id={"supporter-role-" + props.mode + "-" + role}
                      checked={draft.roles.includes(role)}
                      onCheckedChange={(checked) => toggleRole(role, checked === true)}
                    />
                    {roleLabels[role]}
                  </label>
                ))}
              </div>
            </fieldset>
            {mutation.error && (
              <div role="alert" className="space-y-2 text-sm text-[var(--color-destructive)]">
                <p>{conflict ? formCopy.conflict : adminErrorMessage(mutation.error, language)}</p>
                {conflict && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      mutation.reset();
                      setReloadToken((value) => value + 1);
                    }}
                  >
                    {formCopy.discardAndReload}
                  </Button>
                )}
              </div>
            )}
            {discardPrompt && (
              <div
                role="alert"
                className="space-y-2 rounded-md border border-[var(--color-border)] p-3 text-sm"
              >
                <p>{formCopy.discardPrompt}</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setDiscardPrompt(false)}>
                    {formCopy.keepEditing}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      mutation.reset();
                      setDiscardPrompt(false);
                      setOpen(false);
                    }}
                  >
                    {formCopy.discardChanges}
                  </Button>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
                {formCopy.cancel}
              </Button>
              <Button
                type="button"
                onClick={() => mutation.mutate()}
                disabled={
                  mutation.isPending ||
                  !draft.name.trim() ||
                  draft.roles.length === 0 ||
                  (props.mode === "create" && !draft.email.trim()) ||
                  (props.mode === "edit" && (!dirty || editVersion === null))
                }
              >
                {copy.saveSupporter}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
