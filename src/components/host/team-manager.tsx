"use client";

import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import { Building2, Check, Minus, Ticket, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { PhoneSchema, type HostMember } from "@/contracts";
import type { TeamTarget } from "@/services/host";
import { useInvite, useRemoveMember, useSetMemberScope, useTeam, type Team } from "@/lib/api/host-hooks";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { maskPhone } from "./bits";
import { cn } from "@/lib/utils";

const PERMS: [string, boolean, boolean][] = [
  ["Create and edit listings, courts, slot rules", true, true],
  ["View bookings and attendee lists", true, true],
  ["Check-in scanner", true, true],
  ["Block and unblock slots", true, true],
  ["All venues and events, or only the ones they're given", true, true],
  ["Revenue, payouts, bank and KYC", true, false],
  ["Invite or remove team members", true, false],
  ["Host profile and settings", true, false],
];

function scopeLabel(member: HostMember, targets: TeamTarget[]) {
  if (member.role === "owner" || member.scope === null) return "All venues & events";
  const names = member.scope.map((id) => targets.find((t) => t.id === id)?.title).filter(Boolean) as string[];
  if (names.length === 0) return "No access yet";
  if (names.length <= 2) return names.join(", ");
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

/** Pick which of the host's venues and events a manager can run. `null` = everything. */
function ScopePicker({ targets, value, onChange }: { targets: TeamTarget[]; value: string[] | null; onChange: (v: string[] | null) => void }) {
  const all = value === null;
  const toggle = (id: string) => {
    const cur = value ?? [];
    onChange(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Access">
        {[
          { on: all, label: "Everything", sub: "All venues and events, including new ones", pick: () => onChange(null) },
          { on: !all, label: "Only some", sub: "Pick venues and events below", pick: () => onChange(value ?? []) },
        ].map((o) => (
          <button key={o.label} type="button" role="radio" aria-checked={o.on} onClick={o.pick} className={cn("flex flex-col items-start rounded-xl border px-3 py-2.5 text-left", o.on ? "border-brand bg-tint" : "border-line-strong bg-surface")}>
            <span className="text-sm font-semibold">{o.label}</span>
            <span className="text-xs text-muted">{o.sub}</span>
          </button>
        ))}
      </div>
      {!all && (
        <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {targets.length === 0 && <li className="px-3 py-3 text-sm text-muted">Nothing listed yet. Create a venue or event first.</li>}
          {targets.map((t) => {
            const on = (value ?? []).includes(t.id);
            return (
              <li key={t.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-field/50">
                  <input type="checkbox" checked={on} onChange={() => toggle(t.id)} className="size-4 accent-brand" />
                  {t.kind === "venue" ? <Building2 className="size-4 shrink-0 text-muted" aria-hidden /> : <Ticket className="size-4 shrink-0 text-muted" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                  <span className="shrink-0 text-xs text-muted">{t.kind === "venue" ? "Venue" : "Event"}{t.status !== "live" ? ` · ${t.status}` : ""}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function TeamManager({ initial }: { initial: Team }) {
  const { data = initial } = useTeam(initial);
  const invite = useInvite();
  const remove = useRemoveMember();
  const setScope = useSetMemberScope();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [scope, setScopeDraft] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ member: HostMember; scope: string[] | null } | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = PhoneSchema.safeParse(phone);
    if (!p.success) return setErr(p.error.issues[0].message);
    if (scope !== null && scope.length === 0) return setErr("Pick at least one venue or event, or give them everything");
    setErr(null);
    invite.mutate(
      { phone, name: name || undefined, scope },
      {
        onSuccess: () => {
          toast.success("Invite saved. They join your team when they log in with that number.");
          setPhone("");
          setName("");
          setScopeDraft(null);
        },
        onError: (e) => setErr(e.message),
      },
    );
  };

  const saveScope = () => {
    if (!editing) return;
    if (editing.scope !== null && editing.scope.length === 0) return toast.error("Pick at least one venue or event, or give them everything");
    setScope.mutate(
      { id: editing.member.id, scope: editing.scope },
      {
        onSuccess: () => {
          toast.success("Access updated");
          setEditing(null);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[20px] border border-line bg-surface">
        <ul className="divide-y divide-line">
          <AnimatePresence initial={false}>
            {data.items.map((member) => (
              <m.li key={member.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 px-4 py-3.5 md:px-5">
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-full font-display font-bold", member.role === "owner" ? "bg-brand text-white" : "bg-tint text-brand-ink")}>{(member.name ?? "?")[0]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{member.name ?? "Invited"}</p>
                  <p className="truncate text-sm text-muted">
                    {maskPhone(member.phone)} · {member.role === "owner" ? (
                      scopeLabel(member, data.targets)
                    ) : (
                      <button type="button" onClick={() => setEditing({ member, scope: member.scope })} className="font-semibold text-brand underline-offset-2 hover:underline">
                        {scopeLabel(member, data.targets)}
                      </button>
                    )}
                  </p>
                </div>
                {member.status === "invited" && <span className="rounded-full bg-warn-tint px-2.5 py-1 text-xs font-bold text-warn">Invite pending</span>}
                <span className="rounded-md bg-field px-2 py-1 text-xs font-bold uppercase tracking-wide text-muted">{member.role}</span>
                {member.role !== "owner" && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(member.id, { onSuccess: () => toast.success("Removed from team") })}
                    className="grid size-9 place-items-center rounded-full hover:bg-danger-tint hover:text-danger"
                    aria-label={`Remove ${member.name ?? member.phone}`}
                  >
                    <X className="size-4" />
                  </button>
                )}
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      </section>

      <form onSubmit={submit} className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4 md:p-5">
        <h2 className="font-display text-lg font-bold">Invite a manager</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex h-12 items-center rounded-xl border border-line-strong bg-surface focus-within:border-brand">
            <span className="border-r border-line px-3 text-sm font-semibold text-muted">+91</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="Mobile number" className="h-full min-w-0 flex-1 bg-transparent px-3 outline-none" aria-label="Mobile number" />
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className="h-12 rounded-xl border border-line-strong px-3 outline-none focus:border-brand" aria-label="Name" />
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold">What they can access</p>
          <ScopePicker targets={data.targets} value={scope} onChange={setScopeDraft} />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" size="lg" className="h-12" loading={invite.isPending}>
            <UserPlus className="size-4" /> Invite
          </Button>
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
        <p className="text-xs text-muted">They log in with OTP on this number and land in your console as a manager, seeing only what you&apos;ve given them.</p>
      </form>

      <section className="overflow-hidden rounded-[20px] border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-3 font-semibold md:px-5">What they can do</th>
              <th className="w-20 py-3 text-center font-semibold">Owner</th>
              <th className="w-20 py-3 text-center font-semibold">Manager</th>
            </tr>
          </thead>
          <tbody>
            {PERMS.map(([k, o, m]) => (
              <tr key={k} className="border-b border-line last:border-0">
                <td className="px-4 py-3 md:px-5">{k}</td>
                {[o, m].map((v, i) => (
                  <td key={i} className="text-center">
                    {v ? <Check className="mx-auto size-4 text-free" /> : <Minus className="mx-auto size-4 text-subtle" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Sheet
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Access"
        description={editing ? `${editing.member.name ?? maskPhone(editing.member.phone)} can see and run these.` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveScope} loading={setScope.isPending}>
              Save
            </Button>
          </div>
        }
      >
        {editing && <ScopePicker targets={data.targets} value={editing.scope} onChange={(scope) => setEditing({ ...editing, scope })} />}
      </Sheet>
    </div>
  );
}
