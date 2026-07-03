import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, UserPlus } from "lucide-react";
import { useState } from "react";

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
import { useAdminPageCopy } from "../adminPageCopy";
import { fetchAdminJson } from "./api";

type SupporterFormDialogProps =
  | { mode: "create" }
  | { mode: "edit"; supporter: SupporterDetail | SupporterSummary };

function splitTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function SupporterFormDialog(props: SupporterFormDialogProps) {
  const { pageCopy } = useAdminPageCopy();
  const copy = pageCopy.supporters;
  const queryClient = useQueryClient();
  const existing = props.mode === "edit" ? props.supporter : null;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [language, setLanguage] = useState<"zh-HK" | "en">(existing?.language ?? "zh-HK");
  const [tags, setTags] = useState(existing?.tags.join(", ") ?? "");
  const [roles, setRoles] = useState<SupporterRole[]>(existing?.roles ?? ["donor"]);
  const roleLabels = copy.roleLabels as Record<SupporterRole, string>;

  function resetCreateForm() {
    if (props.mode === "edit") return;
    setName("");
    setEmail("");
    setPhone("");
    setLanguage("zh-HK");
    setTags("");
    setRoles(["donor"]);
  }

  function toggleRole(role: SupporterRole, checked: boolean) {
    setRoles((current) => {
      if (checked) return current.includes(role) ? current : [...current, role];
      const next = current.filter((currentRole) => currentRole !== role);
      return next.length > 0 ? next : current;
    });
  }

  const mutation = useMutation({
    mutationFn: () => {
      if (props.mode === "create") {
        return fetchAdminJson("/api/admin/supporters", {
          method: "POST",
          body: JSON.stringify({
            name,
            email,
            phone,
            language,
            tags: splitTags(tags),
            roles,
            source: "admin_manual",
          }),
        });
      }

      return fetchAdminJson(`/api/admin/supporters/${props.supporter.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          phone,
          language,
          tags: splitTags(tags),
          roles,
          deleted: false,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-supporters"] });
      if (props.mode === "edit") {
        queryClient.invalidateQueries({ queryKey: ["crm-supporter", props.supporter.id] });
      }
      resetCreateForm();
      setOpen(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) mutation.reset();
      }}
    >
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
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="supporter-name">{copy.form.name}</Label>
            <Input
              id="supporter-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="supporter-email">{copy.form.email}</Label>
            <Input
              id="supporter-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={props.mode === "edit"}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="supporter-phone">{copy.form.phone}</Label>
            <Input
              id="supporter-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="supporter-language">{copy.form.language}</Label>
            <Select
              value={language}
              onValueChange={(value) => setLanguage(value as "zh-HK" | "en")}
            >
              <SelectTrigger id="supporter-language" aria-label={copy.form.language}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh-HK">繁體中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="supporter-tags">{copy.form.tags}</Label>
            <Input
              id="supporter-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium text-[var(--color-panel)]">
              {copy.form.roles}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {supporterRoles.map((role) => {
                const id = `supporter-role-${props.mode}-${role}`;
                return (
                  <label
                    key={role}
                    htmlFor={id}
                    className="flex min-h-11 items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
                  >
                    <Checkbox
                      id={id}
                      checked={roles.includes(role)}
                      onCheckedChange={(checked) => toggleRole(role, checked === true)}
                    />
                    {roleLabels[role]}
                  </label>
                );
              })}
            </div>
          </fieldset>
          {mutation.error && (
            <p className="text-sm text-[var(--color-destructive)]">{mutation.error.message}</p>
          )}
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending ||
              !name.trim() ||
              roles.length === 0 ||
              (props.mode === "create" && !email.trim())
            }
          >
            {copy.saveSupporter}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
