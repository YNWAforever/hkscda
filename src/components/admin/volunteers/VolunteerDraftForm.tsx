import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import { volunteerAdminErrorMessage } from "../../../lib/volunteers/adminErrors";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { activityWorkspaceCopy } from "./activityWorkspaceCopy";
const input = "min-h-11 w-full rounded border border-[var(--color-border)] px-3 py-2";
export function VolunteerDraftForm() {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(activityWorkspaceCopy, language).draft;
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const cache = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      fetchAdminJson("/api/admin/volunteers/activities", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: key,
          type: "volunteer_shift",
          title,
          startsAt: new Date(start + ":00+08:00").toISOString(),
          endsAt: end ? new Date(end + ":00+08:00").toISOString() : null,
          location,
          capacity: Number(capacity),
          registrationModes: ["individual"],
          status: "draft",
          autoApprove: false,
          allowWaitlist: false,
        }),
      }),
    onSuccess: () => {
      setKey(crypto.randomUUID());
      setOpen(false);
      setTitle("");
      void cache.invalidateQueries({ queryKey: ["volunteer-workspace"] });
    },
  });
  return (
    <section>
      <button className={input + " w-auto"} onClick={() => setOpen((v) => !v)}>
        {copy.open}
      </button>
      {open && (
        <form
          className="grid gap-3 rounded border border-[var(--color-border)] p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <p className="sm:col-span-2">{copy.note}</p>
          <label>
            {copy.title}
            <input
              required
              className={input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            {copy.location}
            <input
              required
              className={input}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
          <label>
            {copy.startsAt}
            <input
              required
              type="datetime-local"
              className={input}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            {copy.endsAt}
            <input
              type="datetime-local"
              min={start}
              className={input}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <label>
            {copy.capacity}
            <input
              required
              type="number"
              min="1"
              max="500"
              className={input}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </label>
          <button disabled={save.isPending} className={input} type="submit">
            {copy.save}
          </button>
          {save.isError && <p role="alert">{volunteerAdminErrorMessage(save.error, language)}</p>}
        </form>
      )}
    </section>
  );
}
