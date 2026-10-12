"use client";

import type { FormField } from "@/contracts";
import type { Draft } from "@/stores/booking-draft";
import { cn } from "@/lib/utils";

const input =
  "h-14 w-full rounded-2xl border border-line-strong bg-surface px-4 text-base outline-none focus:border-brand focus:shadow-[0_0_0_4px_var(--color-tint)]";

export function detailsErrors(fields: FormField[], a: Draft["attendee"]) {
  const errs: Record<string, string> = {};
  if (!a?.name || a.name.trim().length < 2) errs.name = "Please enter a name";
  if (!a?.phone || !/^[6-9]\d{9}$/.test(a.phone)) errs.phone = "Enter a valid 10-digit mobile number";
  for (const f of fields) if (f.required && !a?.answers?.[f.id]) errs[f.id] = `${f.label} is required`;
  return errs;
}

export function DetailsForm({
  fields,
  attendee,
  onChange,
  team,
  showErrors,
}: {
  fields: FormField[];
  attendee: NonNullable<Draft["attendee"]>;
  onChange: (a: NonNullable<Draft["attendee"]>) => void;
  team?: boolean;
  showErrors?: boolean;
}) {
  const errs = showErrors ? detailsErrors(fields, attendee) : {};
  const set = (p: Partial<NonNullable<Draft["attendee"]>>) => onChange({ ...attendee, ...p });
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-xl font-bold">{team ? "Captain's details" : "Who's coming?"}</h2>
        <p className="text-sm text-muted">{team ? "We'll send fixtures and updates to the captain." : "Tickets will be sent to this number."}</p>
      </div>
      <Field label={team ? "Captain's name" : "Full name"} error={errs.name} id="att-name">
        <input id="att-name" className={cn(input, errs.name && "border-danger")} value={attendee.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" />
      </Field>
      <Field label="Mobile number" error={errs.phone} id="att-phone">
        <input
          id="att-phone"
          className={cn(input, errs.phone && "border-danger")}
          value={attendee.phone}
          inputMode="numeric"
          onChange={(e) => set({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
          autoComplete="tel-national"
        />
      </Field>
      {fields.length > 0 && (
        <div className="flex flex-col gap-5 border-t border-line pt-5">
          {!team && <p className="text-sm font-semibold text-muted">A few questions from the host</p>}
          {fields.map((f) => (
            <Field key={f.id} label={f.label + (f.required ? "" : "")} error={errs[f.id]} id={`f-${f.id}`}>
              {f.type === "select" ? (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={`f-${f.id}-label`}>
                  {f.options?.map((o) => {
                    const on = attendee.answers[f.id] === o;
                    return (
                      <button
                        key={o}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => set({ answers: { ...attendee.answers, [f.id]: o } })}
                        className={cn("h-11 rounded-xl border px-4 text-sm font-semibold", on ? "border-brand bg-tint text-brand-ink" : "border-line-strong bg-surface")}
                      >
                        {o}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  id={`f-${f.id}`}
                  className={cn(input, errs[f.id] && "border-danger")}
                  value={attendee.answers[f.id] ?? ""}
                  inputMode={f.type === "number" || f.type === "phone" ? "numeric" : undefined}
                  onChange={(e) => set({ answers: { ...attendee.answers, [f.id]: e.target.value } })}
                />
              )}
            </Field>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, error, id, children }: { label: string; error?: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} id={`${id}-label`} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
