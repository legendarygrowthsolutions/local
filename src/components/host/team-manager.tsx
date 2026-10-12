"use client";

import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import { Check, Minus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { PhoneSchema, type HostMember } from "@/contracts";
import { useInvite, useRemoveMember, useTeam } from "@/lib/api/host-hooks";
import { Button } from "@/components/ui/button";
import { maskPhone } from "./bits";
import { cn } from "@/lib/utils";

const PERMS: [string, boolean, boolean][] = [
  ["Create and edit listings, courts, slot rules", true, true],
  ["View bookings and attendee lists", true, true],
  ["Check-in scanner", true, true],
  ["Block and unblock slots", true, true],
  ["Revenue, payouts, bank and KYC", true, false],
  ["Invite or remove team members", true, false],
  ["Host profile and settings", true, false],
];

export function TeamManager({ initial }: { initial: HostMember[] }) {
  const { data = initial } = useTeam(initial);
  const invite = useInvite();
  const remove = useRemoveMember();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = PhoneSchema.safeParse(phone);
    if (!p.success) return setErr(p.error.issues[0].message);
    setErr(null);
    invite.mutate(
      { phone, name: name || undefined },
      {
        onSuccess: () => {
          toast.success("Invite saved. They join your team when they log in with that number.");
          setPhone("");
          setName("");
        },
        onError: (e) => setErr(e.message),
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[20px] border border-line bg-surface">
        <ul className="divide-y divide-line">
          <AnimatePresence initial={false}>
            {data.map((member) => (
              <m.li key={member.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 px-4 py-3.5 md:px-5">
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-full font-display font-bold", member.role === "owner" ? "bg-brand text-white" : "bg-tint text-brand-ink")}>{(member.name ?? "?")[0]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{member.name ?? "Invited"}</p>
                  <p className="truncate text-sm text-muted">{maskPhone(member.phone)}</p>
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
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="flex h-12 items-center rounded-xl border border-line-strong bg-surface focus-within:border-brand">
            <span className="border-r border-line px-3 text-sm font-semibold text-muted">+91</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="Mobile number" className="h-full min-w-0 flex-1 bg-transparent px-3 outline-none" aria-label="Mobile number" />
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className="h-12 rounded-xl border border-line-strong px-3 outline-none focus:border-brand" aria-label="Name" />
          <Button type="submit" size="lg" className="h-12" loading={invite.isPending}>
            <UserPlus className="size-4" /> Invite
          </Button>
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}
        <p className="text-xs text-muted">They log in with OTP on this number and land in your console as a manager.</p>
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
    </div>
  );
}
