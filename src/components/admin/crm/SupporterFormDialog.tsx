import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, UserPlus } from "lucide-react";
import { useState } from "react";

import type { SupporterDetail, SupporterSummary } from "../../../lib/crm/types";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
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
  const queryClient = useQueryClient();
  const existing = props.mode === "edit" ? props.supporter : null;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [language, setLanguage] = useState<"zh-HK" | "en">(existing?.language ?? "zh-HK");
  const [tags, setTags] = useState(existing?.tags.join(", ") ?? "");

  function resetCreateForm() {
    if (props.mode === "edit") return;
    setName("");
    setEmail("");
    setPhone("");
    setLanguage("zh-HK");
    setTags("");
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
          {props.mode === "edit" ? "Edit supporter" : "New supporter"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.mode === "edit" ? "Edit supporter" : "New supporter"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="supporter-name">Name</Label>
            <Input
              id="supporter-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="supporter-email">Email</Label>
            <Input
              id="supporter-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={props.mode === "edit"}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="supporter-phone">Phone</Label>
            <Input
              id="supporter-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="supporter-language">Language</Label>
            <Select
              value={language}
              onValueChange={(value) => setLanguage(value as "zh-HK" | "en")}
            >
              <SelectTrigger id="supporter-language" aria-label="Language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh-HK">繁體中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="supporter-tags">Tags</Label>
            <Input
              id="supporter-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </div>
          {mutation.error && (
            <p className="text-sm text-[var(--color-destructive)]">{mutation.error.message}</p>
          )}
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending || !name.trim() || (props.mode === "create" && !email.trim())
            }
          >
            Save supporter
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
