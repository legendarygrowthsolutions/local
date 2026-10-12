"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useMe, useUpdateMe } from "@/lib/api/hooks";
import type { PublicUser } from "@/services/users";
import { cn } from "@/lib/utils";

const ROWS: { key: keyof PublicUser["notifications"]; label: string; sub: string }[] = [
  { key: "whatsapp", label: "WhatsApp updates", sub: "Tickets, reminders and changes to your bookings" },
  { key: "email", label: "Email tickets", sub: "A copy of each ticket to the email you add at checkout" },
  { key: "offers", label: "Offers and picks", sub: "Occasional recommendations for your city" },
];

export function NotificationSettings() {
  const { data: me } = useMe();
  const update = useUpdateMe();
  const prefs = me?.notifications;
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex h-11 items-center gap-1.5">
        <Link href="/me" aria-label="Back to profile" className="-ml-2.5 grid size-11 place-items-center">
          <ChevronLeft className="size-[22px]" strokeWidth={1.8} />
        </Link>
        <h1 className="font-display text-2xl font-extrabold">Notifications</h1>
      </div>
      <p className="text-sm text-muted">Booking confirmations and OTPs always come by SMS.</p>
      <ul className="overflow-hidden rounded-[20px] border border-line bg-surface">
        {ROWS.map((r) => {
          const on = !!prefs?.[r.key];
          return (
            <li key={r.key} className="flex min-h-[64px] items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{r.label}</span>
                <span className="block text-[13px] text-muted">{r.sub}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={r.label}
                disabled={!prefs || update.isPending}
                onClick={() => prefs && update.mutate({ notifications: { ...prefs, [r.key]: !on } })}
                className={cn("relative h-6 w-10 flex-none rounded-full transition-colors", on ? "bg-brand" : "bg-[#cfd8d6]")}
              >
                <span className={cn("absolute top-[3px] size-[18px] rounded-full bg-white transition-[left]", on ? "left-[19px]" : "left-[3px]")} />
              </button>
            </li>
          );
        })}
      </ul>
      {update.error && <p className="text-sm text-danger">{update.error.message}</p>}
    </div>
  );
}
