import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";

import type { CoordinatorStatus, CoordinatorStatusCategory } from "../../../lib/adoptions/types";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Switch } from "../../ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import { fetchCoordinatorJson } from "./api";
import {
  buildStatusMutationPayload,
  createBlankStatusForm,
  getStatusFormErrors,
  statusToStatusForm,
} from "./statusAdminLogic";
import type { StatusFormState } from "./statusAdminLogic";

type StatusesResponse = {
  statuses: CoordinatorStatus[];
};

type StatusResponse = {
  status: CoordinatorStatus;
};

type DeleteResponse = {
  ok: boolean;
};

const STATUSES_QUERY_KEY = ["coordinator-statuses"] as const;

const CATEGORY_OPTIONS: Array<{
  value: CoordinatorStatusCategory;
  label: string;
  shortLabel: string;
}> = [
  { value: "adoption_case", label: "領養個案 Case", shortLabel: "個案" },
  { value: "animal_lifecycle", label: "動物流程 Animal", shortLabel: "動物" },
  { value: "match", label: "配對 Match", shortLabel: "配對" },
  { value: "followup", label: "跟進 Follow-up", shortLabel: "跟進" },
  { value: "final_outcome", label: "結果 Outcome", shortLabel: "結果" },
];

const COLOR_OPTIONS = [
  { value: "blue", label: "Blue", swatchClassName: "bg-[var(--color-panel)]" },
  { value: "amber", label: "Amber", swatchClassName: "bg-[var(--color-warning)]" },
  { value: "cyan", label: "Cyan", swatchClassName: "bg-[var(--color-lavender-deep)]" },
  { value: "purple", label: "Purple", swatchClassName: "bg-[var(--color-secondary)]" },
  { value: "indigo", label: "Indigo", swatchClassName: "bg-[var(--color-panel-2)]" },
  { value: "green", label: "Green", swatchClassName: "bg-[var(--color-success)]" },
  { value: "red", label: "Red", swatchClassName: "bg-[var(--color-error)]" },
  { value: "slate", label: "Slate", swatchClassName: "bg-[var(--color-text-muted)]" },
  { value: "coral", label: "Coral", swatchClassName: "bg-[var(--color-primary)]" },
] as const;

function getCategoryLabel(category: CoordinatorStatusCategory) {
  return CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? category;
}

function getColorOption(color: string) {
  return COLOR_OPTIONS.find((option) => option.value === color);
}

function getColorOptionsForValue(color: string) {
  if (!color || getColorOption(color)) return COLOR_OPTIONS;
  return [
    ...COLOR_OPTIONS,
    { value: color, label: color, swatchClassName: "bg-[var(--color-border)]" },
  ];
}

function FlagBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge
      variant="outline"
      className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
    >
      {children}
    </Badge>
  );
}

export function StatusLoadErrorRow({ message }: { message: string }) {
  return (
    <TableRow className="h-16">
      <TableCell colSpan={5} className="px-4 text-[var(--color-error)]">
        <span role="alert">{message}</span>
      </TableCell>
    </TableRow>
  );
}

export function StatusFieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;

  return (
    <p id={id} role="alert" className="text-xs text-[var(--color-error)]">
      {message}
    </p>
  );
}

export function StatusAdmin() {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] =
    useState<CoordinatorStatusCategory>("adoption_case");
  const [form, setForm] = useState<StatusFormState>(() => createBlankStatusForm("adoption_case"));
  const [originalForm, setOriginalForm] = useState<StatusFormState | null>(null);

  const { data, error, isLoading } = useQuery<StatusesResponse, Error>({
    queryKey: STATUSES_QUERY_KEY,
    queryFn: () => fetchCoordinatorJson<StatusesResponse>("/api/admin/adoptions/statuses"),
  });

  const statuses = useMemo(() => data?.statuses ?? [], [data?.statuses]);
  const visibleStatuses = useMemo(
    () =>
      statuses
        .filter((status) => status.category === selectedCategory)
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder || left.labelZh.localeCompare(right.labelZh),
        ),
    [selectedCategory, statuses],
  );

  const saveMutation = useMutation<StatusResponse, Error, void>({
    mutationFn: () => {
      const payload = buildStatusMutationPayload(form, originalForm);
      if (!payload) {
        throw new Error("No changes to save.");
      }

      if (form.id) {
        return fetchCoordinatorJson<StatusResponse>(
          `/api/admin/adoptions/statuses/${encodeURIComponent(form.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        );
      }

      return fetchCoordinatorJson<StatusResponse>("/api/admin/adoptions/statuses", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async ({ status }) => {
      await queryClient.invalidateQueries({ queryKey: STATUSES_QUERY_KEY });
      setSelectedCategory(status.category);
      setForm(createBlankStatusForm(status.category));
      setOriginalForm(null);
    },
  });

  const deleteMutation = useMutation<DeleteResponse, Error, CoordinatorStatus>({
    mutationFn: (status) =>
      fetchCoordinatorJson<DeleteResponse>(
        `/api/admin/adoptions/statuses/${encodeURIComponent(status.id)}`,
        { method: "DELETE" },
      ),
    onSuccess: async (_response, status) => {
      await queryClient.invalidateQueries({ queryKey: STATUSES_QUERY_KEY });
      setForm(createBlankStatusForm(status.category));
      setOriginalForm(null);
    },
  });

  const isEditing = form.id !== null;
  const formErrors = getStatusFormErrors(form);
  const hasFormErrors = Object.keys(formErrors).length > 0;
  const mutationPayload = hasFormErrors ? null : buildStatusMutationPayload(form, originalForm);
  const canSave = mutationPayload !== null && !saveMutation.isPending;
  const selectedCategoryLabel = getCategoryLabel(selectedCategory);
  const colorOptions = getColorOptionsForValue(form.color);
  const visibleKeyError = formErrors.key;
  const visibleLabelZhError = formErrors.labelZh;
  const visibleLabelEnError = formErrors.labelEn;
  const visibleSortOrderError = formErrors.sortOrder;

  function resetForm(category = selectedCategory) {
    saveMutation.reset();
    setForm(createBlankStatusForm(category));
    setOriginalForm(null);
  }

  function handleCategoryChange(value: string) {
    const category = value as CoordinatorStatusCategory;
    setSelectedCategory(category);
    resetForm(category);
  }

  function handleEdit(status: CoordinatorStatus) {
    saveMutation.reset();
    const nextForm = statusToStatusForm(status);
    setSelectedCategory(status.category);
    setForm(nextForm);
    setOriginalForm(nextForm);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    saveMutation.mutate();
  }

  function handleDelete(status: CoordinatorStatus) {
    if (status.isSystem || deleteMutation.isPending) return;
    if (!window.confirm(`Delete ${status.labelZh} / ${status.labelEn}?`)) return;
    deleteMutation.mutate(status);
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-panel)]">Coordinator statuses</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {statuses.length} statuses across {CATEGORY_OPTIONS.length} categories
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => resetForm()}>
          <Plus className="h-4 w-4" />
          New status
        </Button>
      </div>

      <Tabs value={selectedCategory} onValueChange={handleCategoryChange}>
        <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-lg bg-[var(--color-lavender)] p-1">
          {CATEGORY_OPTIONS.map((category) => (
            <TabsTrigger
              key={category.value}
              value={category.value}
              className="data-[state=active]:bg-[var(--color-surface)] data-[state=active]:text-[var(--color-panel)]"
            >
              {category.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--color-panel)]">
                {selectedCategoryLabel}
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                {visibleStatuses.length} rows
              </p>
            </div>
          </div>

          <Table aria-busy={isLoading}>
            <TableHeader>
              <TableRow className="h-11 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-2)]">
                <TableHead className="w-[34%] px-4 text-[var(--color-text-muted)]">Label</TableHead>
                <TableHead className="text-[var(--color-text-muted)]">Order</TableHead>
                <TableHead className="text-[var(--color-text-muted)]">Flags</TableHead>
                <TableHead className="text-[var(--color-text-muted)]">Category</TableHead>
                <TableHead className="w-40 text-right text-[var(--color-text-muted)]">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 5 }, (_, index) => (
                  <TableRow key={index} className="h-16">
                    <TableCell className="px-4">
                      <div className="h-3 w-36 rounded bg-[var(--color-lavender)]" />
                    </TableCell>
                    <TableCell>
                      <div className="h-3 w-10 rounded bg-[var(--color-lavender)]" />
                    </TableCell>
                    <TableCell>
                      <div className="h-3 w-28 rounded bg-[var(--color-lavender)]" />
                    </TableCell>
                    <TableCell>
                      <div className="h-3 w-24 rounded bg-[var(--color-lavender)]" />
                    </TableCell>
                    <TableCell>
                      <div className="ml-auto h-8 w-32 rounded bg-[var(--color-lavender)]" />
                    </TableCell>
                  </TableRow>
                ))}

              {error && !isLoading && <StatusLoadErrorRow message={error.message} />}

              {!isLoading && !error && visibleStatuses.length === 0 && (
                <TableRow className="h-16">
                  <TableCell colSpan={5} className="px-4 text-[var(--color-text-muted)]">
                    No statuses
                  </TableCell>
                </TableRow>
              )}

              {visibleStatuses.map((status) => {
                const color = getColorOption(status.color);
                const isDeletingCurrent =
                  deleteMutation.isPending && deleteMutation.variables?.id === status.id;

                return (
                  <TableRow
                    key={status.id}
                    data-state={form.id === status.id ? "selected" : undefined}
                    className="h-16"
                  >
                    <TableCell className="px-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-3 w-3 shrink-0 rounded-full ${
                            color?.swatchClassName ?? "bg-[var(--color-border)]"
                          }`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-[var(--color-panel)]">
                            {status.labelZh}
                          </div>
                          <div className="truncate text-xs text-[var(--color-text-muted)]">
                            {status.labelEn} · {status.key}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[var(--color-text-muted)]">
                      {status.sortOrder}
                    </TableCell>
                    <TableCell>
                      <div className="flex min-h-7 flex-wrap items-center gap-1.5">
                        <FlagBadge>{status.isActive ? "Active" : "Inactive"}</FlagBadge>
                        {status.isClosing && <FlagBadge>Closing</FlagBadge>}
                        {status.isFinal && <FlagBadge>Final</FlagBadge>}
                        {status.isSystem && (
                          <FlagBadge>
                            <Lock className="mr-1 h-3 w-3" />
                            System
                          </FlagBadge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-[var(--color-text-muted)]">
                      {CATEGORY_OPTIONS.find((category) => category.value === status.category)
                        ?.shortLabel ?? status.category}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="min-w-16"
                          onClick={() => handleEdit(status)}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="min-w-20"
                          disabled={status.isSystem || deleteMutation.isPending}
                          onClick={() => handleDelete(status)}
                        >
                          {status.isSystem ? (
                            <Lock className="h-4 w-4" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          {isDeletingCurrent ? "Deleting" : "Delete"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>

        <form
          className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          onSubmit={handleSubmit}
        >
          <div className="flex min-h-9 items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[var(--color-panel)]">
                {isEditing ? "Edit status" : "New status"}
              </h2>
              {form.isSystem && (
                <p className="text-xs text-[var(--color-text-muted)]">System key locked</p>
              )}
            </div>
            {isEditing && (
              <Button type="button" size="sm" variant="ghost" onClick={() => resetForm()}>
                <X className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="status-category">Category</Label>
            <Select
              value={form.category}
              disabled={form.isSystem}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  category: value as CoordinatorStatusCategory,
                }))
              }
            >
              <SelectTrigger id="status-category" aria-label="Status category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((category) => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="status-key">Key</Label>
            <Input
              id="status-key"
              value={form.key}
              disabled={form.isSystem}
              aria-invalid={Boolean(visibleKeyError)}
              aria-describedby={visibleKeyError ? "status-key-error" : undefined}
              onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
              placeholder="screening"
            />
            <StatusFieldError id="status-key-error" message={visibleKeyError} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="grid gap-2">
              <Label htmlFor="status-label-zh">Chinese label</Label>
              <Input
                id="status-label-zh"
                value={form.labelZh}
                aria-invalid={Boolean(visibleLabelZhError)}
                aria-describedby={visibleLabelZhError ? "status-label-zh-error" : undefined}
                onChange={(event) =>
                  setForm((current) => ({ ...current, labelZh: event.target.value }))
                }
              />
              <StatusFieldError id="status-label-zh-error" message={visibleLabelZhError} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status-label-en">English label</Label>
              <Input
                id="status-label-en"
                value={form.labelEn}
                aria-invalid={Boolean(visibleLabelEnError)}
                aria-describedby={visibleLabelEnError ? "status-label-en-error" : undefined}
                onChange={(event) =>
                  setForm((current) => ({ ...current, labelEn: event.target.value }))
                }
              />
              <StatusFieldError id="status-label-en-error" message={visibleLabelEnError} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="grid gap-2">
              <Label htmlFor="status-order">Sort order</Label>
              <Input
                id="status-order"
                type="number"
                min={0}
                step={1}
                value={form.sortOrder}
                aria-invalid={Boolean(visibleSortOrderError)}
                aria-describedby={visibleSortOrderError ? "status-order-error" : undefined}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sortOrder: event.target.value }))
                }
              />
              <StatusFieldError id="status-order-error" message={visibleSortOrderError} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status-color">Color</Label>
              <Select
                value={form.color}
                onValueChange={(value) => setForm((current) => ({ ...current, color: value }))}
              >
                <SelectTrigger id="status-color" aria-label="Status color">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {colorOptions.map((color) => (
                    <SelectItem key={color.value} value={color.value}>
                      <span className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${color.swatchClassName}`}
                          aria-hidden="true"
                        />
                        {color.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <label className="flex min-h-11 items-center justify-between gap-4 rounded-md border border-[var(--color-border)] px-3">
              <span className="text-sm font-medium text-[var(--color-panel)]">Active</span>
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, isActive: checked }))
                }
                aria-label="Active status"
              />
            </label>
            <label className="flex min-h-11 items-center justify-between gap-4 rounded-md border border-[var(--color-border)] px-3">
              <span className="text-sm font-medium text-[var(--color-panel)]">Closing</span>
              <Switch
                checked={form.isClosing}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, isClosing: checked }))
                }
                aria-label="Closing status"
              />
            </label>
            <label className="flex min-h-11 items-center justify-between gap-4 rounded-md border border-[var(--color-border)] px-3">
              <span className="text-sm font-medium text-[var(--color-panel)]">Final</span>
              <Switch
                checked={form.isFinal}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, isFinal: checked }))
                }
                aria-label="Final status"
              />
            </label>
          </div>

          {saveMutation.error && (
            <p role="alert" className="text-sm text-[var(--color-error)]">
              {saveMutation.error.message}
            </p>
          )}
          {deleteMutation.error && (
            <p role="alert" className="text-sm text-[var(--color-error)]">
              {deleteMutation.error.message}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={!canSave}>
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? "Saving" : "Save status"}
          </Button>
        </form>
      </div>
    </div>
  );
}
